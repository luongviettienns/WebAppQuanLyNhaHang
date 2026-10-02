import { beforeEach, describe, expect, it } from 'vitest';
import { SupplierPaymentService } from '../../src/modules/inventory/supplier-payment.service';
import { CashbookBalanceService } from '../../src/modules/cashbook/cashbook-balance.service';
import { EmployeePayrollPaymentService } from '../../src/modules/employee-payroll/employee-payroll.payment.service';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('cashbook MySQL transaction/concurrency invariants', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('serializes supplier payments and rolls back the source payment when the ledger would go negative', async () => {
    const now = new Date();
    const openingAt = new Date(now.getTime() - 60_000);
    const paidAt = new Date(now.getTime() - 1_000);
    const actor = await prismaTest.user.create({
      data: { username: `cashbook-concurrency-${Date.now()}`, passwordHash: 'test', name: 'Quản lý', role: 'ADMIN' }
    });
    const supplier = await prismaTest.supplier.create({ data: { code: `NCC-${Date.now()}`, name: 'Nhà cung cấp test' } });
    const account = await prismaTest.financialAccount.create({
      data: { code: `CASH-${Date.now()}`, name: 'Quỹ tiền mặt', type: 'CASH', openingBalance: 100_000, openingAt }
    });
    await prismaTest.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: openingAt, activatedByUserId: actor.id } });
    await prismaTest.purchaseReceipt.create({
      data: {
        receiptCode: `PN-${Date.now()}`, supplierId: supplier.id, receivedAt: openingAt,
        status: 'POSTED', subtotalAmount: 200_000, discountAmount: 0
      }
    });

    const attempts = await Promise.allSettled([
      SupplierPaymentService.record(supplier.id, {
        amount: 80_000, paymentMethod: 'CASH', financialAccountId: account.id, paidAt: paidAt.toISOString()
      }, `concurrent-a-${Date.now()}`, { id: actor.id, name: actor.name }),
      SupplierPaymentService.record(supplier.id, {
        amount: 80_000, paymentMethod: 'CASH', financialAccountId: account.id, paidAt: paidAt.toISOString()
      }, `concurrent-b-${Date.now()}`, { id: actor.id, name: actor.name })
    ]);

    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.find(result => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') expect(rejected.reason).toMatchObject({ code: 'CASHBOOK_NEGATIVE_BALANCE' });

    await expect(prismaTest.supplierPayment.count({ where: { supplierId: supplier.id, status: 'SUCCESS' } })).resolves.toBe(1);
    await expect(prismaTest.cashVoucher.count({ where: { accountId: account.id, sourceType: 'SUPPLIER_PAYMENT' } })).resolves.toBe(1);
    await expect(prismaTest.$transaction(tx => CashbookBalanceService.balanceAt(tx, account.id, paidAt))).resolves.toBe(20_000);
  });

  it('fences source posting against a concurrent cashbook activation', async () => {
    const now = new Date();
    const activationAt = new Date(now.getTime() - 60_000);
    const paidAt = new Date(now.getTime() - 1_000);
    const actor = await prismaTest.user.create({
      data: { username: `cashbook-activation-race-${Date.now()}`, passwordHash: 'test', name: 'Quản lý', role: 'ADMIN' }
    });
    const supplier = await prismaTest.supplier.create({ data: { code: `NCC-RACE-${Date.now()}`, name: 'Nhà cung cấp race' } });
    const account = await prismaTest.financialAccount.findUniqueOrThrow({ where: { code: 'CASH' } });
    await prismaTest.purchaseReceipt.create({
      data: { receiptCode: `PN-RACE-${Date.now()}`, supplierId: supplier.id, receivedAt: activationAt, status: 'POSTED', subtotalAmount: 100_000 }
    });

    let signalSettingLock!: () => void;
    let releaseActivation!: () => void;
    const settingLocked = new Promise<void>(resolve => { signalSettingLock = resolve; });
    const activationGate = new Promise<void>(resolve => { releaseActivation = resolve; });
    const activation = prismaTest.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM CashbookSetting WHERE id = 1 FOR UPDATE`;
      signalSettingLock();
      await activationGate;
      await tx.financialAccount.update({ where: { id: account.id }, data: { openingBalance: 100_000, openingAt: activationAt } });
      await tx.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: activationAt, activatedByUserId: actor.id } });
    }, { isolationLevel: 'ReadCommitted', timeout: 30_000 });
    await settingLocked;

    const payment = SupplierPaymentService.record(supplier.id, {
      amount: 50_000, paymentMethod: 'CASH', financialAccountId: account.id, paidAt: paidAt.toISOString()
    }, `activation-race-${Date.now()}`, { id: actor.id, name: actor.name });
    await new Promise(resolve => setTimeout(resolve, 75));
    releaseActivation();
    await activation;
    const recorded = await payment;

    expect(recorded.status).toBe('SUCCESS');
    expect(await prismaTest.cashVoucher.count({ where: { sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: recorded.id } })).toBe(1);
  });

  it('does not let an OTHER payroll payment commit across cashbook activation', async () => {
    const now = new Date();
    const activationAt = new Date(now.getTime() - 60_000);
    const actor = await prismaTest.user.create({
      data: { username: `cashbook-other-race-${Date.now()}`, passwordHash: 'test', name: 'Quản lý', role: 'ADMIN' }
    });
    const employee = await prismaTest.employee.create({
      data: { code: `NV-RACE-${Date.now()}`, attendanceCode: `CC-RACE-${Date.now()}`, name: 'Nhân viên race', phone: `09${Date.now()}` }
    });
    const batch = await prismaTest.employeePayrollBatch.create({
      data: {
        code: `BL-RACE-${Date.now()}`, name: 'Bảng lương kiểm thử', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30'),
        status: 'FINALIZED', createdByUserId: actor.id, finalizedByUserId: actor.id, finalizedAt: activationAt, totalNetAmount: 20_000, totalRemainingAmount: 20_000
      }
    });
    const line = await prismaTest.employeePayrollLine.create({
      data: {
        payrollBatchId: batch.id, employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name,
        netAmount: 20_000, remainingAmount: 20_000, warningCodes: [], sourceSnapshot: {}, calculatedAt: activationAt
      }
    });

    let signalSettingLock!: () => void;
    let releaseActivation!: () => void;
    const settingLocked = new Promise<void>(resolve => { signalSettingLock = resolve; });
    const activationGate = new Promise<void>(resolve => { releaseActivation = resolve; });
    const activation = prismaTest.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM CashbookSetting WHERE id = 1 FOR UPDATE`;
      signalSettingLock();
      await activationGate;
      await tx.financialAccount.update({ where: { code: 'CASH' }, data: { openingBalance: 100_000, openingAt: activationAt } });
      await tx.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: activationAt, activatedByUserId: actor.id } });
    }, { isolationLevel: 'ReadCommitted', timeout: 30_000 });
    await settingLocked;

    const paymentResult = new EmployeePayrollPaymentService(prismaTest).recordPayment(
      batch.id, line.id, { amount: 10_000, method: 'OTHER' }, { id: actor.id, name: actor.name }, 'other-activation-race-1'
    ).then(value => ({ value }), error => ({ error }));
    await new Promise(resolve => setTimeout(resolve, 75));
    releaseActivation();
    await activation;
    const result = await paymentResult;

    expect(result).toHaveProperty('error');
    if ('error' in result) expect(result.error).toMatchObject({ code: 'CASHBOOK_UNSUPPORTED_PAYMENT_METHOD' });
    expect(await prismaTest.employeePayrollPayment.count({ where: { payrollBatchId: batch.id } })).toBe(0);
  });
});
