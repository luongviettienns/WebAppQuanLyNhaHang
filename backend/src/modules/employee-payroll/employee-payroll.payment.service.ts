import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { CashVoucherSourceType } from '@prisma/client';
import { CashbookPostingService, normalizeCashbookPersistenceError, resolveCashbookAccountForPayment } from '../cashbook/cashbook-posting.service';
import { cashbookChangedEvent } from '../cashbook/cashbook.events';
import type { PayrollPaymentInput, PayrollReasonInput } from './employee-payroll.schemas';
import type { PayrollActor } from './employee-payroll.mutation.service';

type PayrollEmitter = (event: string, payload: Record<string, unknown>) => void;

export interface PayrollPaymentResult {
  id: number;
  batchId: number;
  lineId: number;
  employeeId: number;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER' | 'OTHER';
  financialAccountId: number | null;
  status: 'SUCCESS' | 'REVERSED';
  externalReference: string | null;
  note: string | null;
  paidAt: string;
  reversedAt: string | null;
  reverseReason: string | null;
  linePaidAmount: number;
  lineRemainingAmount: number;
  batchPaidAmount: number;
  batchRemainingAmount: number;
  revision: number;
}

const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const digestFor = (operation: string, payload: unknown) => createHash('sha256')
  .update(JSON.stringify({ operation, payload }), 'utf8').digest('hex');

async function updateDerivedPaymentTotals(tx: Prisma.TransactionClient, batchId: number, lineId: number) {
  const line = await tx.employeePayrollLine.findUniqueOrThrow({ where: { id: lineId } });
  const activeLinePayments = await tx.employeePayrollPayment.aggregate({
    where: { payrollLineId: lineId, status: 'SUCCESS' }, _sum: { amount: true }
  });
  const linePaidAmount = activeLinePayments._sum.amount ?? 0;
  const lineRemainingAmount = Math.max(0, line.netAmount - linePaidAmount);
  await tx.employeePayrollLine.update({
    where: { id: lineId }, data: { paidAmount: linePaidAmount, remainingAmount: lineRemainingAmount }
  });
  const batchLineTotals = await tx.employeePayrollLine.aggregate({
    where: { payrollBatchId: batchId }, _sum: { paidAmount: true, remainingAmount: true }
  });
  const batch = await tx.employeePayrollBatch.update({
    where: { id: batchId },
    data: {
      totalPaidAmount: batchLineTotals._sum.paidAmount ?? 0,
      totalRemainingAmount: batchLineTotals._sum.remainingAmount ?? 0,
      version: { increment: 1 }
    }
  });
  return { linePaidAmount, lineRemainingAmount, batch };
}

function paymentResult(
  payment: {
    id: number; payrollBatchId: number; payrollLineId: number; employeeId: number; amount: number;
    financialAccountId: number | null;
    method: 'CASH' | 'BANK_TRANSFER' | 'OTHER'; status: 'SUCCESS' | 'REVERSED'; externalReference: string | null;
    note: string | null; paidAt: Date; reversedAt: Date | null; reverseReason: string | null;
  },
  totals: { linePaidAmount: number; lineRemainingAmount: number; batch: { totalPaidAmount: number; totalRemainingAmount: number; version: number } }
): PayrollPaymentResult {
  return {
    id: payment.id,
    batchId: payment.payrollBatchId,
    lineId: payment.payrollLineId,
    employeeId: payment.employeeId,
    amount: payment.amount,
    method: payment.method,
    financialAccountId: payment.financialAccountId,
    status: payment.status,
    externalReference: payment.externalReference,
    note: payment.note,
    paidAt: payment.paidAt.toISOString(),
    reversedAt: payment.reversedAt?.toISOString() ?? null,
    reverseReason: payment.reverseReason,
    linePaidAmount: totals.linePaidAmount,
    lineRemainingAmount: totals.lineRemainingAmount,
    batchPaidAmount: totals.batch.totalPaidAmount,
    batchRemainingAmount: totals.batch.totalRemainingAmount,
    revision: totals.batch.version
  };
}

export class EmployeePayrollPaymentService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly emit: PayrollEmitter = emitToAll
  ) {}

  async recordPayment(
    batchId: number,
    lineId: number,
    input: PayrollPaymentInput,
    actor: PayrollActor,
    idempotencyKey: string
  ): Promise<PayrollPaymentResult> {
    const operation = `PAYMENT:${batchId}:${lineId}`;
    const digest = digestFor('PAYMENT', { batchId, lineId, input });
    const outcome = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM EmployeePayrollBatch WHERE id = ${batchId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM EmployeePayrollLine WHERE id = ${lineId} FOR UPDATE`;
      const replay = await tx.employeePayrollIdempotency.findUnique({
        where: { actorId_operation_idempotencyKey: { actorId: actor.id, operation, idempotencyKey } }
      });
      if (replay) {
        if (replay.requestDigest !== digest) {
          throw ApiError.conflict('Idempotency-Key đã được dùng cho yêu cầu thanh toán khác', 'PAYROLL_IDEMPOTENCY_KEY_REUSED');
        }
        return { result: replay.response as unknown as PayrollPaymentResult, replayed: true, branchId: 0, periodStart: '', periodEnd: '' };
      }
      const batch = await tx.employeePayrollBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw ApiError.notFound('Không tìm thấy bảng lương');
      const line = await tx.employeePayrollLine.findFirst({ where: { id: lineId, payrollBatchId: batchId } });
      if (!line) throw ApiError.notFound('Không tìm thấy dòng lương thuộc bảng lương');
      if (batch.status !== 'FINALIZED') {
        throw ApiError.conflict('Chỉ được chi trả bảng lương đã chốt', 'PAYROLL_STATE_INVALID');
      }
      const active = await tx.employeePayrollPayment.aggregate({
        where: { payrollLineId: line.id, status: 'SUCCESS' }, _sum: { amount: true }
      });
      const remaining = Math.max(0, line.netAmount - (active._sum.amount ?? 0));
      if (input.amount > remaining) {
        throw ApiError.conflict('Số tiền chi trả vượt quá số còn lại', 'PAYROLL_PAYMENT_EXCEEDS_REMAINING', { remainingAmount: String(remaining) });
      }
      // This also fences OTHER payments, which intentionally do not create a cashbook voucher.
      await tx.$queryRaw`SELECT id FROM CashbookSetting WHERE id = 1 FOR SHARE`;
      let financialAccountId: number | null = null;
      if (input.method === 'OTHER') {
        if (input.financialAccountId != null) throw ApiError.badRequest('Phương thức OTHER không được gắn tài khoản Sổ quỹ; hãy chọn tiền mặt hoặc chuyển khoản.');
        const setting = await tx.cashbookSetting.findUnique({ where: { id: 1 }, select: { activatedAt: true } });
        if (setting?.activatedAt) throw ApiError.badRequest('Sau khi kích hoạt Sổ quỹ, khoản chi lương phải dùng tiền mặt hoặc chuyển khoản.', undefined, 'CASHBOOK_UNSUPPORTED_PAYMENT_METHOD');
      } else {
        financialAccountId = await resolveCashbookAccountForPayment(tx, input.method, input.financialAccountId);
      }
      const payment = await tx.employeePayrollPayment.create({
        data: {
          payrollBatchId: batch.id,
          payrollLineId: line.id,
          employeeId: line.employeeId,
          amount: input.amount,
          method: input.method,
          financialAccountId,
          externalReference: input.externalReference,
          note: input.note,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          createdByUserId: actor.id
        }
      });
      let voucher = null;
      if (financialAccountId !== null) {
        const category = await tx.cashFlowCategory.findUniqueOrThrow({ where: { code: 'PAYROLL_PAYMENT' } });
        voucher = await CashbookPostingService.post(tx, {
          direction: 'PAYMENT', amount: payment.amount, accountId: financialAccountId, categoryId: category.id,
          paymentMethod: payment.method as 'CASH' | 'BANK_TRANSFER', occurredAt: payment.paidAt,
          sourceType: CashVoucherSourceType.PAYROLL_PAYMENT, sourceTransactionId: payment.id,
          sourceCode: `PAY${payment.payrollBatchId}-${payment.id}`,
          counterpartyType: 'EMPLOYEE', counterpartyId: payment.employeeId,
          counterpartyName: line.employeeName, note: payment.note ?? `Chi lương ${line.employeeName}`
        }, { id: actor.id, name: actor.name, role: 'ADMIN' });
      }
      const totals = await updateDerivedPaymentTotals(tx, batch.id, line.id);
      const result = paymentResult(payment, totals);
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_PAYROLL_PAYMENT_RECORDED', targetType: 'EmployeePayrollPayment', targetId: payment.id,
          actorId: actor.id, actorName: actor.name,
          metadata: jsonValue({ batchId, lineId, employeeId: line.employeeId, amount: payment.amount, method: payment.method, remainingAmount: result.lineRemainingAmount })
        }
      });
      await tx.employeePayrollIdempotency.create({
        data: { actorId: actor.id, operation, idempotencyKey, requestDigest: digest, response: jsonValue(result), payrollBatchId: batch.id }
      });
      return {
        result, voucher, replayed: false, branchId: batch.branchId,
        periodStart: batch.periodStart.toISOString().slice(0, 10), periodEnd: batch.periodEnd.toISOString().slice(0, 10)
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 }).catch(normalizeCashbookPersistenceError);
    if (!outcome.replayed) {
      this.emit('employee-payroll:changed', {
        batchId, branchId: outcome.branchId, employeeIds: [outcome.result.employeeId],
        periodStart: outcome.periodStart, periodEnd: outcome.periodEnd, revision: outcome.result.revision
      });
      if (outcome.voucher) this.emit('cashbook:changed', cashbookChangedEvent(outcome.voucher) as unknown as Record<string, unknown>);
    }
    return outcome.result;
  }

  async reversePayment(
    batchId: number,
    lineId: number,
    paymentId: number,
    input: PayrollReasonInput,
    actor: PayrollActor,
    idempotencyKey: string
  ): Promise<PayrollPaymentResult> {
    const operation = `PAYMENT_REVERSE:${paymentId}`;
    const digest = digestFor('PAYMENT_REVERSE', { batchId, lineId, paymentId, input });
    const outcome = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM EmployeePayrollBatch WHERE id = ${batchId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM EmployeePayrollLine WHERE id = ${lineId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM EmployeePayrollPayment WHERE id = ${paymentId} FOR UPDATE`;
      const replay = await tx.employeePayrollIdempotency.findUnique({
        where: { actorId_operation_idempotencyKey: { actorId: actor.id, operation, idempotencyKey } }
      });
      if (replay) {
        if (replay.requestDigest !== digest) {
          throw ApiError.conflict('Idempotency-Key đã được dùng cho yêu cầu đảo thanh toán khác', 'PAYROLL_IDEMPOTENCY_KEY_REUSED');
        }
        return { result: replay.response as unknown as PayrollPaymentResult, replayed: true, branchId: 0, periodStart: '', periodEnd: '' };
      }
      const batch = await tx.employeePayrollBatch.findUnique({ where: { id: batchId } });
      if (!batch) throw ApiError.notFound('Không tìm thấy bảng lương');
      const payment = await tx.employeePayrollPayment.findFirst({
        where: { id: paymentId, payrollBatchId: batchId, payrollLineId: lineId }
      });
      if (!payment) throw ApiError.notFound('Không tìm thấy giao dịch chi trả thuộc dòng lương');
      if (payment.status !== 'SUCCESS') throw ApiError.conflict('Giao dịch chi trả đã được đảo trước đó', 'PAYROLL_STATE_INVALID');
      let voucher = null;
      if (payment.financialAccountId !== null) {
        const sourceVoucher = await tx.cashVoucher.findUnique({ where: { sourceKey: `PAYROLL_PAYMENT:${payment.id}` }, select: { id: true } });
        if (sourceVoucher) {
          voucher = await CashbookPostingService.reverseSourceTransaction(tx, CashVoucherSourceType.PAYROLL_PAYMENT,
            payment.id, { id: actor.id, name: actor.name, role: 'ADMIN' }, input.reason);
        }
      }
      const reversed = await tx.employeePayrollPayment.update({
        where: { id: payment.id },
        data: { status: 'REVERSED', reversedAt: new Date(), reversedByUserId: actor.id, reverseReason: input.reason }
      });
      const totals = await updateDerivedPaymentTotals(tx, batch.id, lineId);
      const result = paymentResult(reversed, totals);
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_PAYROLL_PAYMENT_REVERSED', targetType: 'EmployeePayrollPayment', targetId: payment.id,
          actorId: actor.id, actorName: actor.name,
          metadata: jsonValue({ batchId, lineId, paymentId, amount: payment.amount, reason: input.reason, remainingAmount: result.lineRemainingAmount })
        }
      });
      await tx.employeePayrollIdempotency.create({
        data: { actorId: actor.id, operation, idempotencyKey, requestDigest: digest, response: jsonValue(result), payrollBatchId: batch.id }
      });
      return {
        result, voucher, replayed: false, branchId: batch.branchId,
        periodStart: batch.periodStart.toISOString().slice(0, 10), periodEnd: batch.periodEnd.toISOString().slice(0, 10)
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 }).catch(normalizeCashbookPersistenceError);
    if (!outcome.replayed) {
      this.emit('employee-payroll:changed', {
        batchId, branchId: outcome.branchId, employeeIds: [outcome.result.employeeId],
        periodStart: outcome.periodStart, periodEnd: outcome.periodEnd, revision: outcome.result.revision
      });
      if (outcome.voucher) this.emit('cashbook:changed', cashbookChangedEvent(outcome.voucher) as unknown as Record<string, unknown>);
    }
    return outcome.result;
  }
}
