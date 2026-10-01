import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import type {
  CommissionAssignmentCreateInput,
  CommissionPlanCreateInput,
  CommissionPlanUpdateInput,
  CommissionReassignInput,
  CommissionResolutionInput,
  CommissionRuleCreateInput
} from './employee-commission.schemas';

export interface CommissionActor { id: number; name?: string | null }
type ChangeReason = 'PLAN_CHANGED' | 'RULE_CHANGED' | 'ASSIGNMENT_CHANGED' | 'ISSUE_CHANGED' | 'LEDGER_CHANGED';

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function previousDate(value: string): Date {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function notify(branchId: number, reason: ChangeReason, details: Record<string, unknown>) {
  emitToAll('employee-commission:changed', {
    revision: Date.now(), branchId, reason, updatedAt: new Date().toISOString(), ...details
  });
}

function rangesOverlap(leftFrom: Date, leftTo: Date | null, rightFrom: Date, rightTo: Date | null) {
  return leftFrom <= (rightTo ?? new Date('9999-12-31T00:00:00.000Z'))
    && rightFrom <= (leftTo ?? new Date('9999-12-31T00:00:00.000Z'));
}

function mapError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw ApiError.conflict('Dữ liệu hoa hồng đã tồn tại.', 'COMMISSION_DUPLICATE');
    if (error.code === 'P2034') throw ApiError.conflict('Dữ liệu hoa hồng vừa được thay đổi. Vui lòng thử lại.', 'COMMISSION_CONCURRENCY_CONFLICT');
  }
  throw error;
}

async function getPlan(tx: Prisma.TransactionClient, planId: number) {
  await tx.$queryRaw`SELECT id FROM CommissionPlan WHERE id = ${planId} FOR UPDATE`;
  const plan = await tx.commissionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw ApiError.notFound('Không tìm thấy bảng hoa hồng.', 'COMMISSION_PLAN_NOT_FOUND');
  return plan;
}

async function audit(tx: Prisma.TransactionClient, input: {
  action: string; targetType: string; targetId: number; actor: CommissionActor; metadata?: Record<string, unknown>;
}) {
  await AuditService.logInTransaction(tx, {
    action: input.action, targetType: input.targetType, targetId: input.targetId,
    actorId: input.actor.id, actorName: input.actor.name ?? null, metadata: input.metadata
  });
}

export class EmployeeCommissionMutationService {
  static async createPlan(input: CommissionPlanCreateInput, actor: CommissionActor) {
    try {
      const plan = await prisma.$transaction(async tx => {
        const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
        if (!branch) throw ApiError.notFound('Không tìm thấy chi nhánh.', 'NOT_FOUND');
        if (branch.code !== 'MAIN') throw ApiError.forbidden('Chi nhánh này chưa được bật quản lý hoa hồng.', 'BRANCH_ACCESS_DENIED');
        const created = await tx.commissionPlan.create({ data: {
          branchId: input.branchId, code: input.code, name: input.name,
          effectiveFrom: dateOnly(input.effectiveFrom), effectiveTo: input.effectiveTo ? dateOnly(input.effectiveTo) : null,
          createdByUserId: actor.id
        } });
        await audit(tx, { action: 'EMPLOYEE_COMMISSION_PLAN_CREATED', targetType: 'CommissionPlan', targetId: created.id, actor, metadata: { after: created } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      notify(plan.branchId, 'PLAN_CHANGED', { affectedPlanIds: [plan.id], affectedEmployeeIds: [], affectedOrderItemIds: [] });
      return plan;
    } catch (error) { mapError(error); }
  }

  static async updatePlan(planId: number, input: CommissionPlanUpdateInput, actor: CommissionActor) {
    try {
      const plan = await prisma.$transaction(async tx => {
        const current = await getPlan(tx, planId);
        if (current.status === 'ARCHIVED') throw ApiError.conflict('Bảng hoa hồng đã lưu trữ.', 'COMMISSION_PLAN_STATE_INVALID');
        const updated = await tx.commissionPlan.update({ where: { id: planId }, data: { name: input.name, revision: { increment: 1 } } });
        await audit(tx, { action: 'EMPLOYEE_COMMISSION_PLAN_UPDATED', targetType: 'CommissionPlan', targetId: planId, actor, metadata: { before: current, after: updated } });
        return updated;
      });
      notify(plan.branchId, 'PLAN_CHANGED', { affectedPlanIds: [plan.id], affectedEmployeeIds: [], affectedOrderItemIds: [] });
      return plan;
    } catch (error) { mapError(error); }
  }

  static async activatePlan(planId: number, actor: CommissionActor) {
    try {
      const plan = await prisma.$transaction(async tx => {
        const current = await getPlan(tx, planId);
        if (current.status !== 'DRAFT') throw ApiError.conflict('Chỉ bảng nháp mới được kích hoạt.', 'COMMISSION_PLAN_STATE_INVALID');
        const [ruleCount, employeeCount] = await Promise.all([
          tx.commissionRule.count({ where: { planId } }), tx.commissionPlanEmployee.count({ where: { planId } })
        ]);
        if (!ruleCount || !employeeCount) throw ApiError.conflict('Bảng hoa hồng phải có ít nhất một rule và một nhân viên.', 'COMMISSION_PLAN_INCOMPLETE');
        const updated = await tx.commissionPlan.update({ where: { id: planId }, data: { status: 'ACTIVE', activatedByUserId: actor.id, activatedAt: new Date(), revision: { increment: 1 } } });
        await audit(tx, { action: 'EMPLOYEE_COMMISSION_PLAN_ACTIVATED', targetType: 'CommissionPlan', targetId: planId, actor });
        return updated;
      });
      notify(plan.branchId, 'PLAN_CHANGED', { affectedPlanIds: [plan.id], affectedEmployeeIds: [], affectedOrderItemIds: [] });
      return plan;
    } catch (error) { mapError(error); }
  }

  static async archivePlan(planId: number, reason: string, actor: CommissionActor) {
    try {
      const plan = await prisma.$transaction(async tx => {
        const current = await getPlan(tx, planId);
        if (current.status === 'ARCHIVED') throw ApiError.conflict('Bảng hoa hồng đã lưu trữ.', 'COMMISSION_PLAN_STATE_INVALID');
        const updated = await tx.commissionPlan.update({ where: { id: planId }, data: {
          status: 'ARCHIVED', archivedByUserId: actor.id, archivedAt: new Date(), archiveReason: reason, revision: { increment: 1 }
        } });
        await audit(tx, { action: 'EMPLOYEE_COMMISSION_PLAN_ARCHIVED', targetType: 'CommissionPlan', targetId: planId, actor, metadata: { reason } });
        return updated;
      });
      notify(plan.branchId, 'PLAN_CHANGED', { affectedPlanIds: [plan.id], affectedEmployeeIds: [], affectedOrderItemIds: [] });
      return plan;
    } catch (error) { mapError(error); }
  }

  static async createRule(planId: number, input: CommissionRuleCreateInput, actor: CommissionActor) {
    try {
      const committed = await prisma.$transaction(async tx => {
        const plan = await getPlan(tx, planId);
        if (plan.status === 'ARCHIVED') throw ApiError.conflict('Không thể thêm rule vào bảng đã lưu trữ.', 'COMMISSION_PLAN_STATE_INVALID');
        if (!await tx.menuItem.findUnique({ where: { id: input.menuItemId }, select: { id: true } })) {
          throw ApiError.notFound('Không tìm thấy món.', 'NOT_FOUND');
        }
        const rules = await tx.commissionRule.findMany({ where: { planId, menuItemId: input.menuItemId }, orderBy: [{ effectiveFrom: 'asc' }, { revision: 'asc' }] });
        const effectiveFrom = dateOnly(input.effectiveFrom);
        const latest = rules.at(-1);
        if (latest && effectiveFrom <= latest.effectiveFrom) {
          throw ApiError.conflict('Ngày hiệu lực mới phải sau phiên bản rule gần nhất.', 'COMMISSION_RULE_OVERLAP');
        }
        if (latest) await tx.commissionRule.update({ where: { id: latest.id }, data: { effectiveTo: previousDate(input.effectiveFrom), endedByUserId: actor.id, endedAt: new Date(), endReason: 'Tạo phiên bản mới' } });
        const created = await tx.commissionRule.create({ data: {
          planId, menuItemId: input.menuItemId, revision: (latest?.revision ?? 0) + 1, type: input.type,
          fixedAmount: input.fixedAmount ?? null, rateBps: input.rateBps ?? null, effectiveFrom, createdByUserId: actor.id
        } });
        await tx.commissionPlan.update({ where: { id: planId }, data: { revision: { increment: 1 } } });
        await audit(tx, { action: 'EMPLOYEE_COMMISSION_RULE_VERSION_CREATED', targetType: 'CommissionRule', targetId: created.id, actor, metadata: { planId, menuItemId: input.menuItemId, after: created } });
        return { rule: created, branchId: plan.branchId };
      });
      notify(committed.branchId, 'RULE_CHANGED', { affectedPlanIds: [planId], affectedEmployeeIds: [], affectedOrderItemIds: [] });
      return committed.rule;
    } catch (error) { mapError(error); }
  }

  static async createAssignment(planId: number, input: CommissionAssignmentCreateInput, actor: CommissionActor) {
    try {
      const committed = await prisma.$transaction(async tx => {
        const plan = await getPlan(tx, planId);
        if (plan.status === 'ARCHIVED') throw ApiError.conflict('Không thể gán nhân viên vào bảng đã lưu trữ.', 'COMMISSION_PLAN_STATE_INVALID');
        await tx.$queryRaw`SELECT id FROM Employee WHERE id = ${input.employeeId} FOR UPDATE`;
        const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
        if (!employee) throw ApiError.notFound('Không tìm thấy nhân viên.', 'EMPLOYEE_NOT_FOUND');
        if (employee.status !== 'WORKING') throw ApiError.conflict('Nhân viên không còn làm việc.', 'EMPLOYEE_NOT_WORKING');
        const from = dateOnly(input.effectiveFrom);
        const to = input.effectiveTo ? dateOnly(input.effectiveTo) : null;
        const assignments = await tx.commissionPlanEmployee.findMany({
          where: { employeeId: input.employeeId, plan: { branchId: plan.branchId } }, include: { plan: { select: { code: true } } }
        });
        if (assignments.some(item => rangesOverlap(from, to, item.effectiveFrom, item.effectiveTo))) {
          throw ApiError.conflict('Nhân viên đã thuộc một bảng hoa hồng trong khoảng ngày này.', 'COMMISSION_ASSIGNMENT_OVERLAP');
        }
        const created = await tx.commissionPlanEmployee.create({ data: {
          planId, employeeId: input.employeeId, effectiveFrom: from, effectiveTo: to,
          autoAssignOwnPos: input.autoAssignOwnPos, createdByUserId: actor.id
        } });
        await tx.commissionPlan.update({ where: { id: planId }, data: { revision: { increment: 1 } } });
        await audit(tx, { action: 'EMPLOYEE_COMMISSION_ASSIGNMENT_CREATED', targetType: 'CommissionPlanEmployee', targetId: created.id, actor, metadata: { planId, employeeId: input.employeeId, after: created } });
        return { assignment: created, branchId: plan.branchId };
      });
      notify(committed.branchId, 'ASSIGNMENT_CHANGED', { affectedPlanIds: [planId], affectedEmployeeIds: [input.employeeId], affectedOrderItemIds: [] });
      return committed.assignment;
    } catch (error) { mapError(error); }
  }

  static async assignOrderItem(orderItemId: number, commissionEmployeeId: number | null, actor: CommissionActor) {
    try {
      const item = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM OrderItem WHERE id = ${orderItemId} FOR UPDATE`;
        const current = await tx.orderItem.findUnique({ where: { id: orderItemId }, include: { order: { select: { paymentStatus: true } } } });
        if (!current) throw ApiError.notFound('Không tìm thấy dòng món.', 'NOT_FOUND');
        if (await tx.commissionEntry.count({ where: { orderItemId } })) {
          throw ApiError.conflict('Dòng món đã ghi nhận hoa hồng; hãy dùng thao tác đổi người có lý do.', 'COMMISSION_HISTORY_LOCKED');
        }
        if (commissionEmployeeId != null) {
          const employee = await tx.employee.findUnique({ where: { id: commissionEmployeeId } });
          if (!employee) throw ApiError.notFound('Không tìm thấy nhân viên.', 'EMPLOYEE_NOT_FOUND');
          if (employee.status !== 'WORKING') throw ApiError.conflict('Nhân viên không còn làm việc.', 'EMPLOYEE_NOT_WORKING');
        }
        const updated = await tx.orderItem.update({ where: { id: orderItemId }, data: { commissionEmployeeId } });
        await audit(tx, { action: 'EMPLOYEE_COMMISSION_ORDER_ITEM_ASSIGNED', targetType: 'OrderItem', targetId: orderItemId, actor, metadata: { beforeEmployeeId: current.commissionEmployeeId, afterEmployeeId: commissionEmployeeId } });
        return updated;
      });
      notify(1, 'ASSIGNMENT_CHANGED', { affectedPlanIds: [], affectedEmployeeIds: commissionEmployeeId ? [commissionEmployeeId] : [], affectedOrderItemIds: [orderItemId] });
      return item;
    } catch (error) { mapError(error); }
  }

  static async createResolution(saleBasisId: number, input: CommissionResolutionInput, actor: CommissionActor) {
    const digest = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
    try {
      const committed = await prisma.$transaction(async tx => {
        const basis = await tx.commissionSaleBasis.findUnique({ where: { id: saleBasisId } });
        if (!basis) throw ApiError.notFound('Không tìm thấy căn cứ bán hàng.', 'COMMISSION_SALE_BASIS_NOT_FOUND');
        const resolution = await tx.commissionBasisResolution.create({ data: {
          eventKey: `COMMISSION_BASIS_RESOLUTION:${saleBasisId}:${input.idempotencyKey}`, saleBasisId,
          type: input.type, resolution: input.resolution as Prisma.InputJsonValue, reason: input.reason,
          createdByUserId: actor.id, createdByName: actor.name ?? `User #${actor.id}`, requestDigest: digest
        } });
        await audit(tx, { action: 'EMPLOYEE_COMMISSION_BASIS_RESOLUTION_CREATED', targetType: 'CommissionBasisResolution', targetId: resolution.id, actor, metadata: { saleBasisId, type: input.type, reason: input.reason } });
        return resolution;
      });
      notify(1, 'ISSUE_CHANGED', { affectedPlanIds: [], affectedEmployeeIds: [], affectedOrderItemIds: [] });
      return committed;
    } catch (error) { mapError(error); }
  }

  static async retryIssue(issueId: number, _idempotencyKey: string, _actor: CommissionActor) {
    const issue = await prisma.commissionRecognitionIssue.findUnique({ where: { id: issueId } });
    if (!issue) throw ApiError.notFound('Không tìm thấy vấn đề ghi nhận.', 'COMMISSION_ISSUE_NOT_FOUND');
    throw ApiError.conflict('Dịch vụ ghi nhận hoa hồng chưa xử lý lại vấn đề này.', 'COMMISSION_RECOGNITION_PENDING');
  }

  static async reassignOrderItem(orderItemId: number, _input: CommissionReassignInput, _actor: CommissionActor) {
    if (!await prisma.orderItem.findUnique({ where: { id: orderItemId }, select: { id: true } })) {
      throw ApiError.notFound('Không tìm thấy dòng món.', 'NOT_FOUND');
    }
    throw ApiError.conflict('Dòng món chưa có lịch sử hoa hồng để đổi người.', 'COMMISSION_ENTRY_NOT_FOUND');
  }
}
