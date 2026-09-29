import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaTest, truncateAllTables } from '../../../test/helpers/database';
import { EmployeePayrollMutationService } from './employee-payroll.mutation.service';
import { EmployeePayrollPaymentService } from './employee-payroll.payment.service';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('EmployeePayrollPaymentService', () => {
  let actor: { id: number; name: string };
  let batchId = 0;
  let lineId = 0;
  let emit: ReturnType<typeof vi.fn>;
  let paymentService: EmployeePayrollPaymentService;
  let mutationService: EmployeePayrollMutationService;

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `pay-ledger-${Date.now()}`, passwordHash: 'hash', name: 'Payroll Admin', role: 'ADMIN' }
    });
    actor = { id: admin.id, name: admin.name };
    const branchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    const employee = await prismaTest.employee.create({
      data: { code: 'NV-PMT-001', attendanceCode: 'CC-PMT-001', name: 'Nhân viên', phone: '0900000401', startDate: day('2026-01-01') }
    });
    await prismaTest.employeeCompensation.create({
      data: { employeeId: employee.id, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: day('2026-01-01'), createdByUserId: admin.id }
    });
    emit = vi.fn();
    mutationService = new EmployeePayrollMutationService(prismaTest, emit);
    paymentService = new EmployeePayrollPaymentService(prismaTest, emit);
    const batch = await mutationService.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [employee.id] }, actor, 'create-payment-batch'
    );
    batchId = batch.id;
    lineId = (await prismaTest.employeePayrollLine.findFirstOrThrow({ where: { payrollBatchId: batchId } })).id;
    emit.mockClear();
  });

  it('accepts partial and exact payments only after finalization and rejects overpayment', async () => {
    await expect(paymentService.recordPayment(batchId, lineId, { amount: 1_000_000, method: 'CASH' }, actor, 'pay-before-final'))
      .rejects.toMatchObject({ statusCode: 409, code: 'PAYROLL_STATE_INVALID' });
    await mutationService.finalize(batchId, actor, 'finalize-payment-batch');

    const partial = await paymentService.recordPayment(
      batchId, lineId, { amount: 5_000_000, method: 'BANK_TRANSFER', externalReference: 'PAY-001' }, actor, 'payment-partial'
    );
    expect(partial).toMatchObject({ amount: 5_000_000, linePaidAmount: 5_000_000, lineRemainingAmount: 7_000_000 });
    await expect(paymentService.recordPayment(
      batchId, lineId, { amount: 7_000_001, method: 'CASH' }, actor, 'payment-over'
    )).rejects.toMatchObject({ statusCode: 409, code: 'PAYROLL_PAYMENT_EXCEEDS_REMAINING' });

    const exact = await paymentService.recordPayment(
      batchId, lineId, { amount: 7_000_000, method: 'CASH' }, actor, 'payment-exact'
    );
    expect(exact).toMatchObject({ linePaidAmount: 12_000_000, lineRemainingAmount: 0, batchRemainingAmount: 0 });
    expect(await prismaTest.employeePayrollPayment.count({ where: { payrollLineId: lineId, status: 'SUCCESS' } })).toBe(2);
  });

  it('replays the same request, rejects changed payload, and reverses append-only history', async () => {
    await mutationService.finalize(batchId, actor, 'finalize-idempotent-payment');
    const first = await paymentService.recordPayment(
      batchId, lineId, { amount: 2_000_000, method: 'CASH' }, actor, 'payment-stable-key'
    );
    expect(await paymentService.recordPayment(
      batchId, lineId, { amount: 2_000_000, method: 'CASH' }, actor, 'payment-stable-key'
    )).toEqual(first);
    expect(await prismaTest.employeePayrollPayment.count()).toBe(1);
    await expect(paymentService.recordPayment(
      batchId, lineId, { amount: 2_000_001, method: 'CASH' }, actor, 'payment-stable-key'
    )).rejects.toMatchObject({ statusCode: 409, code: 'PAYROLL_IDEMPOTENCY_KEY_REUSED' });

    const reversed = await paymentService.reversePayment(
      batchId, lineId, first.id, { reason: 'Giao dịch nhập nhầm' }, actor, 'payment-reverse-key'
    );
    expect(reversed).toMatchObject({ id: first.id, status: 'REVERSED', linePaidAmount: 0, lineRemainingAmount: 12_000_000 });
    expect(await paymentService.reversePayment(
      batchId, lineId, first.id, { reason: 'Giao dịch nhập nhầm' }, actor, 'payment-reverse-key'
    )).toEqual(reversed);
    expect(await prismaTest.employeePayrollPayment.count()).toBe(1);
  });

  it('rejects a payment ID or line that does not belong to the requested batch relationship', async () => {
    await mutationService.finalize(batchId, actor, 'finalize-relation-payment');
    await expect(paymentService.recordPayment(batchId, 999_999, { amount: 1_000, method: 'CASH' }, actor, 'wrong-line-payment'))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(paymentService.reversePayment(batchId, lineId, 999_999, { reason: 'Không tồn tại' }, actor, 'wrong-payment-reverse'))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
