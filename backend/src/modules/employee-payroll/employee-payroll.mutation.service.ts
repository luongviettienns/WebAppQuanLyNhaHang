import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { businessDateAt } from '../employee-attendance/attendance-domain';
import { calculatePayrollLine, getPayrollMonthBounds } from './employee-payroll.calculation';
import type { PayrollCreateInput } from './employee-payroll.schemas';

export interface PayrollActor { id: number; name: string }
export interface PayrollMutationResult {
  id: number;
  code: string;
  name: string;
  status: 'DRAFT' | 'CALCULATED';
  periodStart: string;
  periodEnd: string;
  employeeCount: number;
  totalGrossAmount: number;
  totalNetAmount: number;
  totalRemainingAmount: number;
  version: number;
}

type PayrollEmitter = (event: string, payload: Record<string, unknown>) => void;

const dateAtUtc = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const businessMonthStart = (value: string) => new Date(`${value}T00:00:00.000+07:00`);
const businessMonthEndExclusive = (periodEnd: string) => {
  const next = dateAtUtc(periodEnd);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(`${next.toISOString().slice(0, 10)}T00:00:00.000+07:00`);
};
const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function requestDigest(operation: string, payload: unknown) {
  return createHash('sha256').update(JSON.stringify({ operation, payload }), 'utf8').digest('hex');
}

function isDateWithin(value: string, start: string, end: string) {
  return value >= start && value <= end;
}

function scheduleOccurrenceCount(
  rules: Array<{
    recurrenceType: 'ONCE' | 'WEEKLY'; startDate: Date; endDate: Date | null; dayOfWeek: number | null;
    cancelledAt: Date | null; exceptions: Array<{ workDate: Date; type: 'CANCELLED' }>;
  }>,
  periodStart: string,
  periodEnd: string
) {
  let count = 0;
  for (const rule of rules) {
    if (rule.cancelledAt) continue;
    const start = isoDate(rule.startDate)!;
    const end = isoDate(rule.endDate) ?? periodEnd;
    const cancelledDates = new Set(rule.exceptions.map(item => isoDate(item.workDate)!));
    if (rule.recurrenceType === 'ONCE') {
      if (isDateWithin(start, periodStart, periodEnd) && !cancelledDates.has(start)) count += 1;
      continue;
    }
    const lower = start > periodStart ? start : periodStart;
    const upper = end < periodEnd ? end : periodEnd;
    if (lower > upper) continue;
    const cursor = dateAtUtc(lower);
    const targetWeekday = rule.dayOfWeek ?? (((dateAtUtc(start).getUTCDay() + 6) % 7) + 1);
    while ((((cursor.getUTCDay() + 6) % 7) + 1) !== targetWeekday) cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (cursor.toISOString().slice(0, 10) <= upper) {
      if (!cancelledDates.has(cursor.toISOString().slice(0, 10))) count += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }
  return count;
}

type PayrollEmployee = Prisma.EmployeeGetPayload<{
  include: { department: { select: { name: true } }; jobTitle: { select: { name: true } } };
}>;

async function calculateLineDrafts(
  tx: Prisma.TransactionClient,
  employees: PayrollEmployee[],
  branchId: number,
  month: string,
  bounds: { periodStart: string; periodEnd: string }
) {
  const employeeIds = employees.map(employee => employee.id);
  const periodStart = dateAtUtc(bounds.periodStart);
  const periodEnd = dateAtUtc(bounds.periodEnd);
  const [compensations, sessions, scheduleRules, dispositions] = await Promise.all([
    tx.employeeCompensation.findMany({
      where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: periodEnd } },
      orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'asc' }, { id: 'asc' }]
    }),
    tx.employeeAttendanceSession.findMany({
      where: {
        employeeId: { in: employeeIds }, branchId,
        checkInAt: { gte: businessMonthStart(bounds.periodStart), lt: businessMonthEndExclusive(bounds.periodEnd) }
      },
      orderBy: [{ employeeId: 'asc' }, { checkInAt: 'asc' }, { id: 'asc' }]
    }),
    tx.employeeScheduleRule.findMany({
      where: {
        employeeId: { in: employeeIds }, branchId,
        startDate: { lte: periodEnd }, OR: [{ endDate: null }, { endDate: { gte: periodStart } }]
      },
      include: { exceptions: { where: { workDate: { gte: periodStart, lte: periodEnd } }, select: { workDate: true, type: true } } }
    }),
    tx.employeeAttendanceDisposition.findMany({
      where: {
        employeeId: { in: employeeIds }, branchId,
        workDate: { gte: periodStart, lte: periodEnd }, type: 'ABSENT', revokedAt: null
      },
      select: { id: true, employeeId: true, scheduleRuleId: true, workDate: true }
    })
  ]);

  return employees.map(employee => {
    const employeeRules = scheduleRules.filter(rule => rule.employeeId === employee.id);
    const employeeDispositions = dispositions.filter(item => item.employeeId === employee.id);
    const calculation = calculatePayrollLine({
      month,
      employmentStartDate: isoDate(employee.startDate),
      employmentEndDate: isoDate(employee.endDate),
      compensationTerms: compensations.filter(term => term.employeeId === employee.id).map(term => ({
        id: term.id, payBasis: term.payBasis, baseRate: term.baseRate, effectiveFrom: isoDate(term.effectiveFrom)!
      })),
      attendanceSessions: sessions.filter(session => session.employeeId === employee.id).map(session => ({
        id: session.id,
        checkInAt: session.checkInAt,
        checkOutAt: session.checkOutAt,
        scheduleLinkStatus: session.scheduleLinkStatus,
        scheduleRuleId: session.scheduleRuleId,
        scheduleDate: isoDate(session.scheduleDate),
        plannedShiftName: session.plannedShiftName,
        plannedStartMinute: session.plannedStartMinute,
        plannedEndMinute: session.plannedEndMinute
      })),
      scheduledShiftCount: scheduleOccurrenceCount(employeeRules, bounds.periodStart, bounds.periodEnd),
      confirmedAbsenceCount: employeeDispositions.length
    });
    return { employee, calculation, employeeDispositions, employeeRules };
  });
}

export class EmployeePayrollMutationService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly emit: PayrollEmitter = emitToAll
  ) {}

  async create(input: PayrollCreateInput, actor: PayrollActor, idempotencyKey: string): Promise<PayrollMutationResult> {
    const normalizedInput = {
      ...input,
      employeeIds: [...input.employeeIds].sort((left, right) => left - right)
    };
    const digest = requestDigest('CREATE', normalizedInput);
    const outcome = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Branch WHERE id = ${input.branchId} FOR UPDATE`;
      const replay = await tx.employeePayrollIdempotency.findUnique({
        where: {
          actorId_operation_idempotencyKey: {
            actorId: actor.id,
            operation: 'CREATE',
            idempotencyKey
          }
        }
      });
      if (replay) {
        if (replay.requestDigest !== digest) {
          throw ApiError.conflict('Idempotency-Key đã được dùng cho yêu cầu khác', 'PAYROLL_IDEMPOTENCY_KEY_REUSED');
        }
        return { result: replay.response as unknown as PayrollMutationResult, replayed: true, employeeIds: [] as number[] };
      }

      const branch = await tx.branch.findUnique({ where: { id: input.branchId }, select: { id: true, isActive: true } });
      if (!branch || !branch.isActive) throw ApiError.notFound('Không tìm thấy chi nhánh đang hoạt động');
      const bounds = getPayrollMonthBounds(input.month);
      const periodStart = dateAtUtc(bounds.periodStart);
      const periodEnd = dateAtUtc(bounds.periodEnd);
      const employmentWhere: Prisma.EmployeeWhereInput = {
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: periodEnd } }] },
          { OR: [{ endDate: null }, { endDate: { gte: periodStart } }] }
        ]
      };
      const employees = await tx.employee.findMany({
        where: input.scope === 'ALL'
          ? employmentWhere
          : { id: { in: normalizedInput.employeeIds }, ...employmentWhere },
        include: { department: { select: { name: true } }, jobTitle: { select: { name: true } } },
        orderBy: { id: 'asc' }
      });
      if (input.scope === 'CUSTOM') {
        const found = new Set(employees.map(employee => employee.id));
        const missingId = normalizedInput.employeeIds.find(id => !found.has(id));
        if (missingId) throw ApiError.notFound('Không tìm thấy nhân viên hợp lệ trong kỳ lương', 'EMPLOYEE_NOT_FOUND', { employeeId: String(missingId) });
      }
      if (employees.length === 0) throw ApiError.badRequest('Không có nhân viên hợp lệ trong kỳ lương');

      const employeeIds = employees.map(employee => employee.id);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM Employee WHERE id IN (${Prisma.join(employeeIds)}) ORDER BY id FOR UPDATE`);
      const overlap = await tx.employeePayrollLine.findFirst({
        where: {
          employeeId: { in: employeeIds },
          payrollBatch: {
            branchId: input.branchId,
            status: { not: 'CANCELLED' },
            periodStart: { lte: periodEnd },
            periodEnd: { gte: periodStart }
          }
        },
        select: { employeeId: true, payrollBatch: { select: { id: true, code: true } } }
      });
      if (overlap) {
        throw ApiError.conflict('Nhân viên đã thuộc một bảng lương chồng kỳ', 'PAYROLL_OVERLAP', {
          employeeId: String(overlap.employeeId), payrollCode: overlap.payrollBatch.code
        });
      }

      const calculatedAt = new Date();
      const lineDrafts = await calculateLineDrafts(tx, employees, input.branchId, input.month, bounds);
      const hasBlocker = lineDrafts.some(draft => draft.calculation.calculationStatus === 'REVIEW_REQUIRED');
      const totalGrossAmount = lineDrafts.reduce((sum, draft) => sum + draft.calculation.grossAmount, 0);
      const prefix = `BL${input.month.replace('-', '')}`;
      const last = await tx.employeePayrollBatch.findFirst({
        where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true }
      });
      const nextSequence = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
      const code = `${prefix}${String(nextSequence).padStart(3, '0')}`;
      const monthNumber = Number(input.month.slice(5, 7));
      const year = Number(input.month.slice(0, 4));
      const created = await tx.employeePayrollBatch.create({
        data: {
          code,
          name: `Bảng lương tháng ${monthNumber}/${year}`,
          branchId: input.branchId,
          periodStart,
          periodEnd,
          status: hasBlocker ? 'DRAFT' : 'CALCULATED',
          totalGrossAmount,
          totalNetAmount: totalGrossAmount,
          totalRemainingAmount: totalGrossAmount,
          createdByUserId: actor.id,
          calculatedByUserId: actor.id,
          calculatedAt,
          lines: {
            create: lineDrafts.map(({ employee, calculation, employeeDispositions, employeeRules }) => ({
              employeeId: employee.id,
              employeeCode: employee.code,
              employeeName: employee.name,
              departmentName: employee.department?.name ?? null,
              jobTitleName: employee.jobTitle?.name ?? null,
              bankName: employee.bankName,
              bankAccountNumber: employee.bankAccountNumber,
              bankAccountName: employee.bankAccountName,
              employmentStartDate: employee.startDate,
              employmentEndDate: employee.endDate,
              activeCalendarDays: calculation.activeDays,
              periodCalendarDays: calculation.periodCalendarDays,
              scheduledShifts: calculation.scheduledShifts,
              completedSessions: calculation.completedSessions,
              actualMinutes: calculation.actualMinutes,
              confirmedAbsences: calculation.confirmedAbsences,
              missingCheckouts: calculation.missingCheckouts,
              reviewRequiredCount: calculation.reviewRequiredCount,
              grossAmount: calculation.grossAmount,
              netAmount: calculation.grossAmount,
              remainingAmount: calculation.grossAmount,
              calculationStatus: calculation.calculationStatus,
              warningCodes: jsonValue(calculation.warningCodes),
              sourceSnapshot: jsonValue({
                ...calculation.sourceSnapshot,
                scheduleRuleIds: employeeRules.map(rule => rule.id),
                absenceDispositionIds: employeeDispositions.map(item => item.id)
              }),
              calculatedAt
            }))
          }
        }
      });
      const result: PayrollMutationResult = {
        id: created.id,
        code: created.code,
        name: created.name,
        status: created.status as 'DRAFT' | 'CALCULATED',
        periodStart: bounds.periodStart,
        periodEnd: bounds.periodEnd,
        employeeCount: employees.length,
        totalGrossAmount: created.totalGrossAmount,
        totalNetAmount: created.totalNetAmount,
        totalRemainingAmount: created.totalRemainingAmount,
        version: created.version
      };
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_PAYROLL_CREATED', targetType: 'EmployeePayrollBatch', targetId: created.id,
          actorId: actor.id, actorName: actor.name,
          metadata: jsonValue({ scope: input.scope, employeeIds, periodStart: bounds.periodStart, periodEnd: bounds.periodEnd, status: result.status })
        }
      });
      await tx.employeePayrollIdempotency.create({
        data: {
          actorId: actor.id, operation: 'CREATE', idempotencyKey, requestDigest: digest,
          response: jsonValue(result), payrollBatchId: created.id
        }
      });
      return { result, replayed: false, employeeIds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });

    if (!outcome.replayed) {
      this.emit('employee-payroll:changed', {
        batchId: outcome.result.id,
        branchId: input.branchId,
        employeeIds: outcome.employeeIds,
        periodStart: outcome.result.periodStart,
        periodEnd: outcome.result.periodEnd,
        revision: outcome.result.version
      });
    }
    return outcome.result;
  }

  async recalculate(batchId: number, actor: PayrollActor, idempotencyKey: string): Promise<PayrollMutationResult> {
    const digest = requestDigest('RECALCULATE', { batchId });
    const operation = `RECALCULATE:${batchId}`;
    const outcome = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM EmployeePayrollBatch WHERE id = ${batchId} FOR UPDATE`;
      const replay = await tx.employeePayrollIdempotency.findUnique({
        where: { actorId_operation_idempotencyKey: { actorId: actor.id, operation, idempotencyKey } }
      });
      if (replay) {
        if (replay.requestDigest !== digest) {
          throw ApiError.conflict('Idempotency-Key đã được dùng cho yêu cầu khác', 'PAYROLL_IDEMPOTENCY_KEY_REUSED');
        }
        return { result: replay.response as unknown as PayrollMutationResult, replayed: true, branchId: 0, employeeIds: [] as number[] };
      }
      const batch = await tx.employeePayrollBatch.findUnique({
        where: { id: batchId },
        include: {
          lines: {
            include: { adjustments: { where: { reversedAt: null }, select: { type: true, amount: true } } },
            orderBy: { employeeId: 'asc' }
          }
        }
      });
      if (!batch) throw ApiError.notFound('Không tìm thấy bảng lương');
      if (batch.status !== 'DRAFT' && batch.status !== 'CALCULATED') {
        throw ApiError.conflict('Chỉ được tính lại bảng lương nháp hoặc tạm tính', 'PAYROLL_STATE_INVALID');
      }
      const employeeIds = batch.lines.map(line => line.employeeId);
      if (employeeIds.length === 0) throw ApiError.conflict('Bảng lương không có nhân viên để tính lại', 'PAYROLL_STATE_INVALID');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM Employee WHERE id IN (${Prisma.join(employeeIds)}) ORDER BY id FOR UPDATE`);
      const employees = await tx.employee.findMany({
        where: { id: { in: employeeIds } },
        include: { department: { select: { name: true } }, jobTitle: { select: { name: true } } },
        orderBy: { id: 'asc' }
      });
      if (employees.length !== employeeIds.length) throw ApiError.conflict('Nguồn nhân viên của bảng lương không còn đầy đủ', 'PAYROLL_STATE_INVALID');
      const month = batch.periodStart.toISOString().slice(0, 7);
      const bounds = getPayrollMonthBounds(month);
      const lineDrafts = await calculateLineDrafts(tx, employees, batch.branchId, month, bounds);
      const calculatedAt = new Date();
      let totalGrossAmount = 0;
      let totalAdjustmentAmount = 0;
      let totalNetAmount = 0;
      let totalPaidAmount = 0;
      let totalRemainingAmount = 0;
      let hasBlocker = false;

      for (const draft of lineDrafts) {
        const existing = batch.lines.find(line => line.employeeId === draft.employee.id)!;
        const bonusAmount = existing.adjustments
          .filter(adjustment => adjustment.type === 'BONUS')
          .reduce((sum, adjustment) => sum + adjustment.amount, 0);
        const deductionAmount = existing.adjustments
          .filter(adjustment => adjustment.type === 'DEDUCTION')
          .reduce((sum, adjustment) => sum + adjustment.amount, 0);
        const netAmount = Math.max(0, draft.calculation.grossAmount + bonusAmount - deductionAmount);
        const remainingAmount = Math.max(0, netAmount - existing.paidAmount);
        hasBlocker ||= draft.calculation.calculationStatus === 'REVIEW_REQUIRED';
        totalGrossAmount += draft.calculation.grossAmount;
        totalAdjustmentAmount += bonusAmount - deductionAmount;
        totalNetAmount += netAmount;
        totalPaidAmount += existing.paidAmount;
        totalRemainingAmount += remainingAmount;
        await tx.employeePayrollLine.update({
          where: { id: existing.id },
          data: {
            employeeCode: draft.employee.code,
            employeeName: draft.employee.name,
            departmentName: draft.employee.department?.name ?? null,
            jobTitleName: draft.employee.jobTitle?.name ?? null,
            bankName: draft.employee.bankName,
            bankAccountNumber: draft.employee.bankAccountNumber,
            bankAccountName: draft.employee.bankAccountName,
            employmentStartDate: draft.employee.startDate,
            employmentEndDate: draft.employee.endDate,
            activeCalendarDays: draft.calculation.activeDays,
            periodCalendarDays: draft.calculation.periodCalendarDays,
            scheduledShifts: draft.calculation.scheduledShifts,
            completedSessions: draft.calculation.completedSessions,
            actualMinutes: draft.calculation.actualMinutes,
            confirmedAbsences: draft.calculation.confirmedAbsences,
            missingCheckouts: draft.calculation.missingCheckouts,
            reviewRequiredCount: draft.calculation.reviewRequiredCount,
            grossAmount: draft.calculation.grossAmount,
            bonusAmount,
            deductionAmount,
            netAmount,
            remainingAmount,
            calculationStatus: draft.calculation.calculationStatus,
            warningCodes: jsonValue(draft.calculation.warningCodes),
            sourceSnapshot: jsonValue({
              ...draft.calculation.sourceSnapshot,
              scheduleRuleIds: draft.employeeRules.map(rule => rule.id),
              absenceDispositionIds: draft.employeeDispositions.map(item => item.id)
            }),
            calculatedAt
          }
        });
      }

      const updated = await tx.employeePayrollBatch.update({
        where: { id: batch.id },
        data: {
          status: hasBlocker ? 'DRAFT' : 'CALCULATED',
          totalGrossAmount,
          totalAdjustmentAmount,
          totalNetAmount,
          totalPaidAmount,
          totalRemainingAmount,
          calculatedByUserId: actor.id,
          calculatedAt,
          version: { increment: 1 }
        }
      });
      const result: PayrollMutationResult = {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        status: updated.status as 'DRAFT' | 'CALCULATED',
        periodStart: bounds.periodStart,
        periodEnd: bounds.periodEnd,
        employeeCount: employees.length,
        totalGrossAmount: updated.totalGrossAmount,
        totalNetAmount: updated.totalNetAmount,
        totalRemainingAmount: updated.totalRemainingAmount,
        version: updated.version
      };
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_PAYROLL_RECALCULATED', targetType: 'EmployeePayrollBatch', targetId: batch.id,
          actorId: actor.id, actorName: actor.name,
          metadata: jsonValue({ beforeVersion: batch.version, afterVersion: updated.version, status: updated.status, employeeIds })
        }
      });
      await tx.employeePayrollIdempotency.create({
        data: {
          actorId: actor.id, operation, idempotencyKey, requestDigest: digest,
          response: jsonValue(result), payrollBatchId: batch.id
        }
      });
      return { result, replayed: false, branchId: batch.branchId, employeeIds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });

    if (!outcome.replayed) {
      this.emit('employee-payroll:changed', {
        batchId: outcome.result.id,
        branchId: outcome.branchId,
        employeeIds: outcome.employeeIds,
        periodStart: outcome.result.periodStart,
        periodEnd: outcome.result.periodEnd,
        revision: outcome.result.version
      });
    }
    return outcome.result;
  }
}
