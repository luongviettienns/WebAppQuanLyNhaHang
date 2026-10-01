import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import { businessDateAt } from '../employee-attendance/attendance-domain';
import { allocateDiscountLargestRemainder, calculateCommissionSnapshot, prorateSnapshot, resolveCurrentOwner } from './employee-commission.domain';
import type { CommissionReassignInput } from './employee-commission.schemas';
import { assertCommissionEmployeeEligible } from './employee-commission.eligibility';

type Actor = { id?: number; name?: string | null };
type RuleCandidate = {
  planId: number;
  planCode: string;
  planName: string;
  planRevision: number;
  rules: Array<{
    id: number;
    revision: number;
    type: 'FIXED_PER_UNIT' | 'PERCENT_NET_REVENUE' | 'PERCENT_GROSS_PROFIT';
    fixedAmount: number | null;
    rateBps: number | null;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
};

function dateOnly(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
function isoDate(value: Date | null): string | null { return value?.toISOString().slice(0, 10) ?? null; }
function asCandidates(value: Prisma.JsonValue): RuleCandidate[] { return value as unknown as RuleCandidate[]; }
function inputJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
  if (value === null) throw new Error('Commission snapshot must not be null');
  return value as Prisma.InputJsonValue;
}

async function writeIssue(
  tx: Prisma.TransactionClient,
  basis: { id: number; orderItemId: number },
  type: 'UNASSIGNED_EMPLOYEE' | 'PLAN_MISSING' | 'PLAN_CONFLICT' | 'RULE_MISSING' | 'RULE_CONFLICT' | 'COST_MISSING' | 'LEDGER_CONFLICT',
  diagnostic: Prisma.InputJsonValue = {}
) {
  return tx.commissionRecognitionIssue.upsert({
    where: { orderItemId: basis.orderItemId },
    create: { orderItemId: basis.orderItemId, saleBasisId: basis.id, type, diagnostic },
    update: { type, status: 'OPEN', diagnostic, lastDetectedAt: new Date(), resolvedAt: null, resolvedByUserId: null, resolutionCode: null }
  });
}

async function resolveIssue(tx: Prisma.TransactionClient, orderItemId: number, actor?: Actor) {
  const issue = await tx.commissionRecognitionIssue.findUnique({ where: { orderItemId } });
  if (issue?.status === 'OPEN') await tx.commissionRecognitionIssue.update({
    where: { id: issue.id }, data: { status: 'RESOLVED', resolutionCode: 'RECOGNIZED', resolvedAt: new Date(), resolvedByUserId: actor?.id ?? null }
  });
}

async function returnedQuantity(tx: Prisma.TransactionClient, orderItemId: number) {
  const result = await tx.orderReturnLine.aggregate({
    where: { orderItemId, orderReturn: { status: 'COMPLETED' } }, _sum: { quantity: true }
  });
  return result._sum.quantity ?? 0;
}

function remainingAmount(total: number, returned: number, sold: number) {
  return total - prorateSnapshot(total, returned, sold, 0, 0);
}

async function recognizeBasis(tx: Prisma.TransactionClient, basisId: number, actor?: Actor) {
  const basis = await tx.commissionSaleBasis.findUnique({
    where: { id: basisId }, include: { orderItem: true, menuItem: true }
  });
  if (!basis) throw ApiError.notFound('Không tìm thấy căn cứ bán hàng.', 'COMMISSION_SALE_BASIS_NOT_FOUND');
  const existing = await tx.commissionEntry.findUnique({ where: { eventKey: `ORDER_PAID_EARNING:${basis.orderId}:${basis.orderItemId}` } });
  if (existing) return existing;

  const returned = await returnedQuantity(tx, basis.orderItemId);
  const quantity = Math.max(0, basis.soldQuantity - returned);
  if (quantity === 0) {
    await resolveIssue(tx, basis.orderItemId, actor);
    return null;
  }
  const employeeId = basis.orderItem.commissionEmployeeId;
  if (!employeeId) {
    await writeIssue(tx, basis, 'UNASSIGNED_EMPLOYEE');
    return null;
  }
  const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { id: true, code: true, name: true, status: true } });
  if (!employee || employee.status !== 'WORKING') {
    await writeIssue(tx, basis, 'UNASSIGNED_EMPLOYEE', { employeeId });
    return null;
  }

  const resolutions = await tx.commissionBasisResolution.findMany({ where: { saleBasisId: basis.id }, orderBy: { id: 'asc' } });
  const costOverride = [...resolutions].reverse().find(item => item.type === 'COST_OVERRIDE')?.resolution as { unitCost?: number } | undefined;
  const ruleOverride = [...resolutions].reverse().find(item => item.type === 'RULE_OVERRIDE')?.resolution as {
    planId?: number; planCode?: string; planName?: string; planRevision?: number;
    type?: 'FIXED_PER_UNIT' | 'PERCENT_NET_REVENUE' | 'PERCENT_GROSS_PROFIT'; fixedAmount?: number | null; rateBps?: number | null;
  } | undefined;
  const candidates = asCandidates(basis.ruleCandidatesSnapshot);
  const candidatePlanIds = [...new Set([...candidates.map(item => item.planId), ...(ruleOverride?.planId ? [ruleOverride.planId] : [])])];
  const assignments = await tx.commissionPlanEmployee.findMany({
    where: {
      employeeId, planId: { in: candidatePlanIds }, effectiveFrom: { lte: basis.saleBusinessDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: basis.saleBusinessDate } }]
    }
  });
  if (assignments.length === 0) { await writeIssue(tx, basis, 'PLAN_MISSING', { employeeId }); return null; }
  if (assignments.length !== 1) { await writeIssue(tx, basis, 'PLAN_CONFLICT', { employeeId, assignmentIds: assignments.map(item => item.id) }); return null; }
  const snapshotCandidate = candidates.find(item => item.planId === assignments[0].planId);
  const overrideApplies = ruleOverride?.planId === assignments[0].planId && ruleOverride.type;
  if (!overrideApplies && (!snapshotCandidate || snapshotCandidate.rules.length === 0)) { await writeIssue(tx, basis, 'RULE_MISSING', { planId: assignments[0].planId }); return null; }
  if (!overrideApplies && snapshotCandidate!.rules.length !== 1) { await writeIssue(tx, basis, 'RULE_CONFLICT', { ruleIds: snapshotCandidate!.rules.map(item => item.id) }); return null; }
  const candidate = overrideApplies ? {
    planId: assignments[0].planId, planCode: ruleOverride.planCode ?? `PLAN-${assignments[0].planId}`,
    planName: ruleOverride.planName ?? 'Override lịch sử', planRevision: ruleOverride.planRevision ?? 0, rules: []
  } : snapshotCandidate!;
  const rule = overrideApplies ? {
    id: 0, revision: 0, type: ruleOverride.type!, fixedAmount: ruleOverride.fixedAmount ?? null, rateBps: ruleOverride.rateBps ?? null,
    effectiveFrom: isoDate(basis.saleBusinessDate)!, effectiveTo: null
  } : candidate.rules[0];
  const effectiveUnitCost = Number.isSafeInteger(costOverride?.unitCost) && (costOverride?.unitCost ?? -1) >= 0 ? costOverride!.unitCost! : basis.unitCost;
  if (rule.type === 'PERCENT_GROSS_PROFIT' && effectiveUnitCost == null) {
    await writeIssue(tx, basis, 'COST_MISSING', { ruleId: rule.id });
    return null;
  }

  const grossRevenue = remainingAmount(basis.grossRevenue, returned, basis.soldQuantity);
  const allocatedDiscount = remainingAmount(basis.allocatedDiscount, returned, basis.soldQuantity);
  const snapshotTotalCost = effectiveUnitCost == null ? 0 : effectiveUnitCost * basis.soldQuantity;
  const totalCost = remainingAmount(snapshotTotalCost, returned, basis.soldQuantity);
  const calculation = calculateCommissionSnapshot({
    type: rule.type, quantity, grossRevenue, allocatedDiscount,
    unitCost: effectiveUnitCost, fixedAmount: rule.fixedAmount ?? undefined, rateBps: rule.rateBps ?? undefined
  });
  if (!calculation.ok) { await writeIssue(tx, basis, calculation.issue!); return null; }
  const entry = await tx.commissionEntry.create({ data: {
    eventKey: `ORDER_PAID_EARNING:${basis.orderId}:${basis.orderItemId}`, type: 'EARNING',
    saleBasisId: basis.id, orderId: basis.orderId, orderItemId: basis.orderItemId, employeeId,
    commissionPlanId: candidate.planId, commissionRuleId: rule.id || null,
    saleBusinessDate: basis.saleBusinessDate, accountingDate: basis.saleBusinessDate, occurredAt: basis.paidAt,
    quantityDelta: quantity, grossRevenueDelta: grossRevenue, allocatedDiscountDelta: allocatedDiscount,
    netRevenueDelta: grossRevenue - allocatedDiscount, costAmountDelta: totalCost,
    grossProfitDelta: Math.max(0, grossRevenue - allocatedDiscount - totalCost),
    commissionAmountDelta: calculation.commissionAmount!,
    employeeSnapshot: { id: employee.id, code: employee.code, name: employee.name },
    itemSnapshot: { id: basis.menuItemId, sku: basis.itemSku, name: basis.itemName, unitPrice: basis.unitPrice },
    ruleSnapshot: { planId: candidate.planId, planCode: candidate.planCode, planName: candidate.planName, planRevision: candidate.planRevision, ...rule, costOverride: costOverride ?? null, ruleOverride: overrideApplies ? ruleOverride : null },
    createdByUserId: actor?.id ?? null, createdByName: actor?.name ?? null
  } });
  await AuditService.logInTransaction(tx, {
    action: 'EMPLOYEE_COMMISSION_ENTRY_CREATED', targetType: 'CommissionEntry', targetId: entry.id,
    actorId: actor?.id, actorName: actor?.name ?? null,
    metadata: { eventKey: entry.eventKey, orderId: entry.orderId, orderItemId: entry.orderItemId, employeeId: entry.employeeId, amount: entry.commissionAmountDelta }
  });
  await resolveIssue(tx, basis.orderItemId, actor);
  return entry;
}

async function directConsumed(tx: Prisma.TransactionClient, sourceEntryId: number) {
  const children = await tx.commissionEntry.findMany({ where: { sourceEntryId, quantityDelta: { lt: 0 } } });
  return {
    quantity: -children.reduce((sum, item) => sum + item.quantityDelta, 0),
    gross: -children.reduce((sum, item) => sum + item.grossRevenueDelta, 0),
    discount: -children.reduce((sum, item) => sum + item.allocatedDiscountDelta, 0),
    net: -children.reduce((sum, item) => sum + item.netRevenueDelta, 0),
    cost: -children.reduce((sum, item) => sum + item.costAmountDelta, 0),
    profit: -children.reduce((sum, item) => sum + item.grossProfitDelta, 0),
    commission: -children.reduce((sum, item) => sum + item.commissionAmountDelta, 0)
  };
}

function prorated(total: number, quantity: number, totalQuantity: number, consumedQuantity: number, consumedAmount: number) {
  return prorateSnapshot(total, quantity, totalQuantity, consumedQuantity, consumedAmount);
}

export class EmployeeCommissionRecognitionService {
  static async recognizePaidOrder(tx: Prisma.TransactionClient, orderId: number, occurredAt: Date, actor?: Actor) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { id: 'asc' }, include: { menuItem: { include: { menuItemIngredients: { include: { ingredient: true } } } }, commissionEmployee: true } } }
    });
    if (!order || order.paymentStatus !== 'PAID' || !order.paidAt) return { changed: false, orderItemIds: [] as number[] };
    const saleBusinessDateText = businessDateAt(order.paidAt);
    const saleBusinessDate = dateOnly(saleBusinessDateText);
    const discounts = allocateDiscountLargestRemainder(order.items.map(item => ({ orderItemId: item.id, grossRevenue: item.subtotal })), order.discountAmount);
    const itemIds: number[] = [];

    for (const item of order.items) {
      const existingBasis = await tx.commissionSaleBasis.findUnique({ where: { orderItemId: item.id } });
      let basis = existingBasis;
      if (!basis) {
        const plans = await tx.commissionPlan.findMany({
          where: { branchId: 1, status: 'ACTIVE', effectiveFrom: { lte: saleBusinessDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: saleBusinessDate } }] },
          include: { rules: { where: { menuItemId: item.menuItemId, effectiveFrom: { lte: saleBusinessDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: saleBusinessDate } }] }, orderBy: [{ revision: 'asc' }, { id: 'asc' }] } },
          orderBy: { id: 'asc' }
        });
        const unitCostRaw = item.menuItem.menuItemIngredients.reduce((sum, bom) => sum + bom.quantityRequired * bom.ingredient.costPerUnit, 0);
        const hasCost = item.menuItem.menuItemIngredients.length > 0;
        const unitCost = hasCost ? Math.round(unitCostRaw) : null;
        const allocatedDiscount = discounts.get(item.id) ?? 0;
        const candidates: RuleCandidate[] = plans.map(plan => ({
          planId: plan.id, planCode: plan.code, planName: plan.name, planRevision: plan.revision,
          rules: plan.rules.map(rule => ({
            id: rule.id, revision: rule.revision, type: rule.type, fixedAmount: rule.fixedAmount, rateBps: rule.rateBps,
            effectiveFrom: isoDate(rule.effectiveFrom)!, effectiveTo: isoDate(rule.effectiveTo)
          }))
        }));
        basis = await tx.commissionSaleBasis.create({ data: {
          eventKey: `ORDER_PAID_BASIS:${order.id}:${item.id}`, orderId: order.id, orderItemId: item.id, menuItemId: item.menuItemId,
          commissionEmployeeIdAtPayment: item.commissionEmployeeId,
          employeeCodeAtPayment: item.commissionEmployee?.code ?? null, employeeNameAtPayment: item.commissionEmployee?.name ?? null,
          soldQuantity: item.quantity, saleBusinessDate, paidAt: order.paidAt, itemSku: item.menuItem.sku, itemName: item.menuItem.name,
          unitPrice: item.unitPrice, modifierSnapshot: item.selectedModifiersJson ?? undefined,
          grossRevenue: item.subtotal, allocatedDiscount, netRevenue: Math.max(0, item.subtotal - allocatedDiscount),
          costStatus: hasCost ? 'CAPTURED' : 'MISSING', unitCost, totalCost: unitCost == null ? null : unitCost * item.quantity,
          bomSnapshot: item.menuItem.menuItemIngredients.map(bom => ({ ingredientId: bom.ingredientId, quantityRequired: bom.quantityRequired, costPerUnit: bom.ingredient.costPerUnit })),
          ruleCandidatesSnapshot: candidates as unknown as Prisma.InputJsonValue
        } });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_COMMISSION_SALE_BASIS_CREATED', targetType: 'CommissionSaleBasis', targetId: basis.id,
          actorId: actor?.id, actorName: actor?.name ?? null,
          metadata: { eventKey: basis.eventKey, orderId: basis.orderId, orderItemId: basis.orderItemId, soldQuantity: basis.soldQuantity }
        });
      }
      await recognizeBasis(tx, basis.id, actor);
      itemIds.push(item.id);
    }
    return { changed: true, orderItemIds: itemIds };
  }

  static retrySaleBasis(tx: Prisma.TransactionClient, saleBasisId: number, actor?: Actor) {
    return recognizeBasis(tx, saleBasisId, actor);
  }

  static async reverseReturn(tx: Prisma.TransactionClient, orderReturnId: number, actor?: Actor) {
    const orderReturn = await tx.orderReturn.findUnique({ where: { id: orderReturnId }, include: { lines: { orderBy: { id: 'asc' } } } });
    if (!orderReturn || orderReturn.status !== 'COMPLETED') return { changed: false, orderItemIds: [] as number[] };
    const affected: number[] = [];
    for (const line of orderReturn.lines) {
      const eventKey = `ORDER_RETURN:${line.id}`;
      if (await tx.commissionEntry.findUnique({ where: { eventKey } })) continue;
      const basis = await tx.commissionSaleBasis.findUnique({ where: { orderItemId: line.orderItemId } });
      if (!basis) continue;
      const entries = await tx.commissionEntry.findMany({ where: { orderItemId: line.orderItemId }, orderBy: { id: 'asc' } });
      if (!entries.length) continue;
      const owner = resolveCurrentOwner(entries.map(item => ({ id: item.id, type: item.type, employeeId: item.employeeId, quantityDelta: item.quantityDelta, sourceEntryId: item.sourceEntryId })));
      if (!owner.ok || line.quantity > owner.remainingQuantity) { await writeIssue(tx, basis, 'LEDGER_CONFLICT', { returnLineId: line.id }); continue; }
      const source = entries.find(item => item.id === owner.entryId)!;
      const consumed = await directConsumed(tx, source.id);
      const amount = (field: 'grossRevenueDelta' | 'allocatedDiscountDelta' | 'netRevenueDelta' | 'costAmountDelta' | 'grossProfitDelta' | 'commissionAmountDelta', consumedAmount: number) =>
        prorated(Math.abs(source[field]), line.quantity, source.quantityDelta, consumed.quantity, consumedAmount);
      const originalEntryId = source.originalEntryId ?? source.id;
      await tx.commissionEntry.create({ data: {
        eventKey, type: 'RETURN_REVERSAL', originalEntryId, sourceEntryId: source.id,
        saleBasisId: source.saleBasisId, orderId: source.orderId, orderItemId: source.orderItemId,
        orderReturnId, orderReturnLineId: line.id, employeeId: source.employeeId,
        commissionPlanId: source.commissionPlanId, commissionRuleId: source.commissionRuleId,
        saleBusinessDate: source.saleBusinessDate, accountingDate: dateOnly(businessDateAt(orderReturn.completedAt ?? orderReturn.returnedAt)), occurredAt: orderReturn.completedAt ?? orderReturn.returnedAt,
        quantityDelta: -line.quantity,
        grossRevenueDelta: -amount('grossRevenueDelta', consumed.gross), allocatedDiscountDelta: -amount('allocatedDiscountDelta', consumed.discount),
        netRevenueDelta: -amount('netRevenueDelta', consumed.net), costAmountDelta: -amount('costAmountDelta', consumed.cost),
        grossProfitDelta: -amount('grossProfitDelta', consumed.profit), commissionAmountDelta: -amount('commissionAmountDelta', consumed.commission),
        employeeSnapshot: inputJson(source.employeeSnapshot), itemSnapshot: inputJson(source.itemSnapshot), ruleSnapshot: inputJson(source.ruleSnapshot),
        reason: orderReturn.note ?? 'Trả hàng', createdByUserId: actor?.id ?? null, createdByName: actor?.name ?? null
      } });
      affected.push(line.orderItemId);
    }
    return { changed: affected.length > 0, orderItemIds: affected };
  }

  static async reassignOrderItem(orderItemId: number, input: CommissionReassignInput, actor: { id: number; name?: string | null }) {
    const committed = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM OrderItem WHERE id = ${orderItemId} FOR UPDATE`;
      const replay = await tx.commissionEntry.findUnique({ where: { eventKey: `REASSIGN_EARNING:${orderItemId}:${input.idempotencyKey}` } });
      if (replay) {
        if (replay.employeeId !== input.employeeId || replay.reason !== input.reason) {
          throw ApiError.conflict('Idempotency key đã được dùng với nội dung khác.', 'IDEMPOTENCY_KEY_REUSED');
        }
        return { earning: replay, changed: false };
      }
      const employee = await assertCommissionEmployeeEligible(tx, input.employeeId);
      const entries = await tx.commissionEntry.findMany({ where: { orderItemId }, orderBy: { id: 'asc' } });
      const owner = resolveCurrentOwner(entries.map(item => ({ id: item.id, type: item.type, employeeId: item.employeeId, quantityDelta: item.quantityDelta, sourceEntryId: item.sourceEntryId })));
      if (!owner.ok) throw ApiError.conflict('Không xác định được người đang hưởng hoa hồng.', 'COMMISSION_ENTRY_NOT_FOUND');
      const source = entries.find(item => item.id === owner.entryId)!;
      if (source.employeeId === input.employeeId) throw ApiError.conflict('Nhân viên mới đang là người hưởng hoa hồng.', 'COMMISSION_ASSIGNMENT_OVERLAP');
      const consumed = await directConsumed(tx, source.id);
      const remaining = (field: 'grossRevenueDelta' | 'allocatedDiscountDelta' | 'netRevenueDelta' | 'costAmountDelta' | 'grossProfitDelta' | 'commissionAmountDelta', used: number) => Math.abs(source[field]) - used;
      const rootId = source.originalEntryId ?? source.id;
      const correlationKey = `REASSIGN:${orderItemId}:${input.idempotencyKey}`;
      const common = {
        correlationKey, originalEntryId: rootId, sourceEntryId: source.id, saleBasisId: source.saleBasisId, orderId: source.orderId, orderItemId,
        commissionPlanId: source.commissionPlanId, commissionRuleId: source.commissionRuleId,
        saleBusinessDate: source.saleBusinessDate, accountingDate: dateOnly(businessDateAt(new Date())), occurredAt: new Date(),
        itemSnapshot: inputJson(source.itemSnapshot), ruleSnapshot: inputJson(source.ruleSnapshot), reason: input.reason,
        createdByUserId: actor.id, createdByName: actor.name ?? null
      };
      const values = {
        quantity: owner.remainingQuantity, gross: remaining('grossRevenueDelta', consumed.gross), discount: remaining('allocatedDiscountDelta', consumed.discount),
        net: remaining('netRevenueDelta', consumed.net), cost: remaining('costAmountDelta', consumed.cost),
        profit: remaining('grossProfitDelta', consumed.profit), commission: remaining('commissionAmountDelta', consumed.commission)
      };
      await tx.commissionEntry.create({ data: {
        ...common, eventKey: `REASSIGN_REVERSAL:${orderItemId}:${input.idempotencyKey}`, type: 'REASSIGNMENT_REVERSAL', employeeId: source.employeeId,
        quantityDelta: -values.quantity, grossRevenueDelta: -values.gross, allocatedDiscountDelta: -values.discount,
        netRevenueDelta: -values.net, costAmountDelta: -values.cost, grossProfitDelta: -values.profit, commissionAmountDelta: -values.commission,
        employeeSnapshot: inputJson(source.employeeSnapshot)
      } });
      const earning = await tx.commissionEntry.create({ data: {
        ...common, eventKey: `REASSIGN_EARNING:${orderItemId}:${input.idempotencyKey}`, type: 'REASSIGNMENT_EARNING', employeeId: employee.id,
        quantityDelta: values.quantity, grossRevenueDelta: values.gross, allocatedDiscountDelta: values.discount,
        netRevenueDelta: values.net, costAmountDelta: values.cost, grossProfitDelta: values.profit, commissionAmountDelta: values.commission,
        employeeSnapshot: { id: employee.id, code: employee.code, name: employee.name }
      } });
      await tx.orderItem.update({ where: { id: orderItemId }, data: { commissionEmployeeId: employee.id } });
      await AuditService.logInTransaction(tx, {
        action: 'EMPLOYEE_COMMISSION_REASSIGNED', targetType: 'OrderItem', targetId: orderItemId,
        actorId: actor.id, actorName: actor.name ?? null, metadata: { fromEmployeeId: source.employeeId, toEmployeeId: employee.id, reason: input.reason, rootEntryId: rootId }
      });
      return { earning, changed: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    if (committed.changed) emitToAll('employee-commission:changed', {
      revision: Date.now(), branchId: 1, reason: 'LEDGER_CHANGED', affectedPlanIds: [], affectedEmployeeIds: [committed.earning.employeeId], affectedOrderItemIds: [orderItemId], updatedAt: new Date().toISOString()
    });
    return committed.earning;
  }
}
