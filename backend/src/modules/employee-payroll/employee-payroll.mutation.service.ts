import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { calculatePayrollLine, getPayrollMonthBounds } from './employee-payroll.calculation';
import { finalizeCommissionAllocations, releaseCommissionAllocations, reserveCommissionForPayroll } from '../employee-commissions/employee-commission.payroll';
import { buildPayrollSettingsProjection } from './employee-payroll.settings-projection';
import type { PayrollAdjustmentInput, PayrollCancelInput, PayrollCreateInput, PayrollReasonInput } from './employee-payroll.schemas';

export interface PayrollActor { id: number; name: string }
export interface PayrollMutationResult {
  id: number;
  code: string;
  name: string;
  status: 'DRAFT' | 'CALCULATED' | 'FINALIZED' | 'CANCELLED';
  periodStart: string;
  periodEnd: string;
  employeeCount: number;
  totalGrossAmount: number;
  totalNetAmount: number;
  totalRemainingAmount: number;
  version: number;
  cancelReason?: string | null;
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
  const settingsSnapshot = await buildPayrollSettingsProjection(
    tx,
    branchId,
    bounds.periodStart,
    bounds.periodEnd,
    sessions.map(session => ({ attendancePolicyVersionId: session.attendancePolicyVersionId }))
  );

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
      confirmedAbsenceCount: employeeDispositions.length,
      settingsSnapshot
    });
    return { employee, calculation, employeeDispositions, employeeRules };
  });
}

async function recomputeFinancialTotals(tx: Prisma.TransactionClient, batchId: number) {
  const lines = await tx.employeePayrollLine.findMany({
    where: { payrollBatchId: batchId },
    include: { adjustments: { where: { reversedAt: null }, select: { type: true, amount: true } } },
    orderBy: { id: 'asc' }
  });
  let totalGrossAmount = 0;
  let totalAdjustmentAmount = 0;
  let totalNetAmount = 0;
  let totalPaidAmount = 0;
  let totalRemainingAmount = 0;
  for (const line of lines) {
    const bonusAmount = line.adjustments.filter(item => item.type === 'BONUS').reduce((sum, item) => sum + item.amount, 0);
    const deductionAmount = line.adjustments.filter(item => item.type === 'DEDUCTION').reduce((sum, item) => sum + item.amount, 0);
    const netAmount = line.grossAmount + line.commissionAmount + bonusAmount - deductionAmount;
    if (netAmount < 0) throw ApiError.conflict('Khấu trừ vượt số tiền phải trả của nhân viên', 'PAYROLL_STATE_INVALID');
    const remainingAmount = Math.max(0, netAmount - line.paidAmount);
    await tx.employeePayrollLine.update({
      where: { id: line.id }, data: { bonusAmount, deductionAmount, netAmount, remainingAmount }
    });
    totalGrossAmount += line.grossAmount;
    totalAdjustmentAmount += bonusAmount - deductionAmount;
    totalNetAmount += netAmount;
    totalPaidAmount += line.paidAmount;
    totalRemainingAmount += remainingAmount;
  }
  const totalCommissionAmount = lines.reduce((sum, line) => sum + line.commissionAmount, 0);
  const totalCommissionDeferredDebitAmount = lines.reduce((sum, line) => sum + line.commissionDeferredDebitAmount, 0);
  return { lines, totalGrossAmount, totalAdjustmentAmount, totalNetAmount, totalPaidAmount, totalRemainingAmount, totalCommissionAmount, totalCommissionDeferredDebitAmount };
}

const lifecycleResult = (batch: {
  id: number; code: string; name: string; status: string; periodStart: Date; periodEnd: Date;
  totalGrossAmount: number; totalNetAmount: number; totalRemainingAmount: number; version: number; cancelReason: string | null;
}, employeeCount: number): PayrollMutationResult => ({
  id: batch.id,
  code: batch.code,
  name: batch.name,
  status: batch.status as PayrollMutationResult['status'],
  periodStart: isoDate(batch.periodStart)!,
  periodEnd: isoDate(batch.periodEnd)!,
  employeeCount,
  totalGrossAmount: batch.totalGrossAmount,
  totalNetAmount: batch.totalNetAmount,
  totalRemainingAmount: batch.totalRemainingAmount,
  version: batch.version,
  cancelReason: batch.cancelReason
});

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
      const createdLines = await tx.employeePayrollLine.findMany({ where: { payrollBatchId: created.id }, orderBy: { employeeId: 'asc' } });
      const commission = await reserveCommissionForPayroll(tx, {
        id: created.id, periodEnd: created.periodEnd, version: created.version
      }, createdLines, actor.id);
      const createdWithCommission = await tx.employeePayrollBatch.update({
        where: { id: created.id },
        data: {
          totalCommissionAmount: commission.totalCommissionAmount,
          totalCommissionDeferredDebitAmount: commission.totalDeferredDebitAmount,
          totalNetAmount: totalGrossAmount + commission.totalCommissionAmount,
          totalRemainingAmount: totalGrossAmount + commission.totalCommissionAmount
        }
      });
      const result: PayrollMutationResult = {
        id: createdWithCommission.id,
        code: createdWithCommission.code,
        name: createdWithCommission.name,
        status: createdWithCommission.status as 'DRAFT' | 'CALCULATED',
        periodStart: bounds.periodStart,
        periodEnd: bounds.periodEnd,
        employeeCount: employees.length,
        totalGrossAmount: createdWithCommission.totalGrossAmount,
        totalNetAmount: createdWithCommission.totalNetAmount,
        totalRemainingAmount: createdWithCommission.totalRemainingAmount,
        version: createdWithCommission.version
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
      await releaseCommissionAllocations(tx, batch.id, actor.id, 'Tính lại bảng lương');
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
        const netAmount = draft.calculation.grossAmount + bonusAmount - deductionAmount;
        if (netAmount < 0) throw ApiError.conflict('Khấu trừ vượt số tiền phải trả của nhân viên', 'PAYROLL_STATE_INVALID');
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

      const refreshedLines = await tx.employeePayrollLine.findMany({ where: { payrollBatchId: batch.id }, orderBy: { employeeId: 'asc' } });
      const commission = await reserveCommissionForPayroll(tx, {
        id: batch.id, periodEnd: batch.periodEnd, version: batch.version + 1
      }, refreshedLines, actor.id);
      totalNetAmount += commission.totalCommissionAmount;
      totalRemainingAmount += commission.totalCommissionAmount;
      const updated = await tx.employeePayrollBatch.update({
        where: { id: batch.id },
        data: {
          status: hasBlocker ? 'DRAFT' : 'CALCULATED',
          totalGrossAmount,
          totalAdjustmentAmount,
          totalNetAmount,
          totalPaidAmount,
          totalRemainingAmount,
          totalCommissionAmount: commission.totalCommissionAmount,
          totalCommissionDeferredDebitAmount: commission.totalDeferredDebitAmount,
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

  async addAdjustment(batchId: number, lineId: number, input: PayrollAdjustmentInput, actor: PayrollActor) {
    const outcome = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM EmployeePayrollBatch WHERE id = ${batchId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM EmployeePayrollLine WHERE id = ${lineId} FOR UPDATE`;
      const batch = await tx.employeePayrollBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw ApiError.notFound('Không tìm thấy bảng lương');
      if (batch.status !== 'DRAFT' && batch.status !== 'CALCULATED') {
        throw ApiError.conflict('Không thể điều chỉnh bảng lương đã khóa', 'PAYROLL_STATE_INVALID');
      }
      const line = await tx.employeePayrollLine.findFirst({ where: { id: lineId, payrollBatchId: batchId } });
      if (!line) throw ApiError.notFound('Không tìm thấy dòng lương');
      const adjustment = await tx.employeePayrollAdjustment.create({
        data: { payrollLineId: line.id, type: input.type, amount: input.amount, reason: input.reason, createdByUserId: actor.id }
      });
      const totals = await recomputeFinancialTotals(tx, batch.id);
      const financialTotals = {
        totalGrossAmount: totals.totalGrossAmount,
        totalAdjustmentAmount: totals.totalAdjustmentAmount,
        totalNetAmount: totals.totalNetAmount,
        totalPaidAmount: totals.totalPaidAmount,
        totalRemainingAmount: totals.totalRemainingAmount,
        totalCommissionAmount: totals.totalCommissionAmount,
        totalCommissionDeferredDebitAmount: totals.totalCommissionDeferredDebitAmount
      };
      const updated = await tx.employeePayrollBatch.update({
        where: { id: batch.id },
        data: { ...financialTotals, version: { increment: 1 } }
      });
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_PAYROLL_ADJUSTMENT_ADDED', targetType: 'EmployeePayrollAdjustment', targetId: adjustment.id,
          actorId: actor.id, actorName: actor.name,
          metadata: jsonValue({ batchId, lineId, type: input.type, amount: input.amount, reason: input.reason, beforeVersion: batch.version, afterVersion: updated.version })
        }
      });
      return { adjustment, batch: updated, employeeId: line.employeeId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });
    this.emit('employee-payroll:changed', {
      batchId, branchId: outcome.batch.branchId, employeeIds: [outcome.employeeId],
      periodStart: isoDate(outcome.batch.periodStart), periodEnd: isoDate(outcome.batch.periodEnd), revision: outcome.batch.version
    });
    return outcome.adjustment;
  }

  async reverseAdjustment(batchId: number, lineId: number, adjustmentId: number, input: PayrollReasonInput, actor: PayrollActor) {
    const outcome = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM EmployeePayrollBatch WHERE id = ${batchId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM EmployeePayrollAdjustment WHERE id = ${adjustmentId} FOR UPDATE`;
      const batch = await tx.employeePayrollBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw ApiError.notFound('Không tìm thấy bảng lương');
      if (batch.status !== 'DRAFT' && batch.status !== 'CALCULATED') {
        throw ApiError.conflict('Không thể đảo điều chỉnh của bảng lương đã khóa', 'PAYROLL_STATE_INVALID');
      }
      const adjustment = await tx.employeePayrollAdjustment.findFirst({
        where: { id: adjustmentId, payrollLineId: lineId, payrollLine: { payrollBatchId: batchId } },
        include: { payrollLine: { select: { employeeId: true } } }
      });
      if (!adjustment) throw ApiError.notFound('Không tìm thấy điều chỉnh lương');
      if (adjustment.reversedAt) throw ApiError.conflict('Điều chỉnh đã được đảo trước đó', 'PAYROLL_STATE_INVALID');
      const reversed = await tx.employeePayrollAdjustment.update({
        where: { id: adjustment.id },
        data: { reversedAt: new Date(), reversedByUserId: actor.id, reverseReason: input.reason }
      });
      const totals = await recomputeFinancialTotals(tx, batch.id);
      const financialTotals = {
        totalGrossAmount: totals.totalGrossAmount,
        totalAdjustmentAmount: totals.totalAdjustmentAmount,
        totalNetAmount: totals.totalNetAmount,
        totalPaidAmount: totals.totalPaidAmount,
        totalRemainingAmount: totals.totalRemainingAmount,
        totalCommissionAmount: totals.totalCommissionAmount,
        totalCommissionDeferredDebitAmount: totals.totalCommissionDeferredDebitAmount
      };
      const updated = await tx.employeePayrollBatch.update({
        where: { id: batch.id }, data: { ...financialTotals, version: { increment: 1 } }
      });
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_PAYROLL_ADJUSTMENT_REVERSED', targetType: 'EmployeePayrollAdjustment', targetId: adjustment.id,
          actorId: actor.id, actorName: actor.name,
          metadata: jsonValue({ batchId, lineId, adjustmentId, reason: input.reason, amount: adjustment.amount, beforeVersion: batch.version, afterVersion: updated.version })
        }
      });
      return { adjustment: reversed, batch: updated, employeeId: adjustment.payrollLine.employeeId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });
    this.emit('employee-payroll:changed', {
      batchId, branchId: outcome.batch.branchId, employeeIds: [outcome.employeeId],
      periodStart: isoDate(outcome.batch.periodStart), periodEnd: isoDate(outcome.batch.periodEnd), revision: outcome.batch.version
    });
    return outcome.adjustment;
  }

  async finalize(batchId: number, actor: PayrollActor, idempotencyKey: string): Promise<PayrollMutationResult> {
    const operation = `FINALIZE:${batchId}`;
    const digest = requestDigest('FINALIZE', { batchId });
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
      const batch = await tx.employeePayrollBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw ApiError.notFound('Không tìm thấy bảng lương');
      const totals = await recomputeFinancialTotals(tx, batch.id);
      const blocked = totals.lines.some(line => line.calculationStatus === 'REVIEW_REQUIRED');
      if (blocked) {
        throw ApiError.conflict('Bảng lương còn dữ liệu nguồn cần xử lý', 'PAYROLL_ATTENDANCE_UNRESOLVED');
      }
      if (batch.status !== 'CALCULATED') {
        throw ApiError.conflict('Chỉ được chốt bảng lương đã tính xong', 'PAYROLL_STATE_INVALID');
      }
      await finalizeCommissionAllocations(tx, batch.id, actor.id);
      const updated = await tx.employeePayrollBatch.update({
        where: { id: batch.id },
        data: {
          totalGrossAmount: totals.totalGrossAmount,
          totalAdjustmentAmount: totals.totalAdjustmentAmount,
          totalNetAmount: totals.totalNetAmount,
          totalPaidAmount: totals.totalPaidAmount,
          totalRemainingAmount: totals.totalRemainingAmount,
          totalCommissionAmount: totals.totalCommissionAmount,
          totalCommissionDeferredDebitAmount: totals.totalCommissionDeferredDebitAmount,
          status: 'FINALIZED', finalizedAt: new Date(), finalizedByUserId: actor.id, version: { increment: 1 }
        }
      });
      const employeeIds = totals.lines.map(line => line.employeeId);
      const result = lifecycleResult(updated, totals.lines.length);
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_PAYROLL_FINALIZED', targetType: 'EmployeePayrollBatch', targetId: batch.id,
          actorId: actor.id, actorName: actor.name,
          metadata: jsonValue({ beforeVersion: batch.version, afterVersion: updated.version, totalNetAmount: updated.totalNetAmount, employeeIds })
        }
      });
      await tx.employeePayrollIdempotency.create({
        data: { actorId: actor.id, operation, idempotencyKey, requestDigest: digest, response: jsonValue(result), payrollBatchId: batch.id }
      });
      return { result, replayed: false, branchId: batch.branchId, employeeIds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });
    if (!outcome.replayed) {
      this.emit('employee-payroll:changed', {
        batchId, branchId: outcome.branchId, employeeIds: outcome.employeeIds,
        periodStart: outcome.result.periodStart, periodEnd: outcome.result.periodEnd, revision: outcome.result.version
      });
    }
    return outcome.result;
  }

  async cancel(batchId: number, input: PayrollCancelInput, actor: PayrollActor): Promise<PayrollMutationResult> {
    const outcome = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM EmployeePayrollBatch WHERE id = ${batchId} FOR UPDATE`;
      const batch = await tx.employeePayrollBatch.findUnique({
        where: { id: batchId }, include: { lines: { select: { employeeId: true } } }
      });
      if (!batch) throw ApiError.notFound('Không tìm thấy bảng lương');
      if (batch.status === 'CANCELLED') throw ApiError.conflict('Bảng lương đã bị hủy', 'PAYROLL_STATE_INVALID');
      const successfulPayments = await tx.employeePayrollPayment.count({
        where: { payrollBatchId: batch.id, status: 'SUCCESS' }
      });
      if (successfulPayments > 0) throw ApiError.conflict('Không thể hủy bảng lương đã phát sinh chi trả', 'PAYROLL_STATE_INVALID');
      await releaseCommissionAllocations(tx, batch.id, actor.id, input.reason);
      const updated = await tx.employeePayrollBatch.update({
        where: { id: batch.id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: actor.id, cancelReason: input.reason, version: { increment: 1 } }
      });
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_PAYROLL_CANCELLED', targetType: 'EmployeePayrollBatch', targetId: batch.id,
          actorId: actor.id, actorName: actor.name,
          metadata: jsonValue({ reason: input.reason, previousStatus: batch.status, beforeVersion: batch.version, afterVersion: updated.version })
        }
      });
      return { result: lifecycleResult(updated, batch.lines.length), branchId: batch.branchId, employeeIds: batch.lines.map(line => line.employeeId) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 });
    this.emit('employee-payroll:changed', {
      batchId, branchId: outcome.branchId, employeeIds: outcome.employeeIds,
      periodStart: outcome.result.periodStart, periodEnd: outcome.result.periodEnd, revision: outcome.result.version
    });
    return outcome.result;
  }
}
