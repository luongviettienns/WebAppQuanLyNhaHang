import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { SupplierPaymentService } from '../../src/modules/inventory/supplier-payment.service';
import { CashbookBalanceService } from '../../src/modules/cashbook/cashbook-balance.service';
import { EmployeePayrollPaymentService } from '../../src/modules/employee-payroll/employee-payroll.payment.service';
import { CashbookPostingService, resolveCashbookAccountForPayment } from '../../src/modules/cashbook/cashbook-posting.service';
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

  it('validates against the latest ledger rows after waiting for an account lock under MySQL REPEATABLE READ', async () => {
    const now = new Date();
    const openingAt = new Date(now.getTime() - 60_000);
    const paidAt = new Date(now.getTime() - 1_000);
    const actor = await prismaTest.user.create({
      data: { username: `cashbook-independent-race-${Date.now()}`, passwordHash: 'test', name: 'Quản lý', role: 'ADMIN' }
    });
    const category = await prismaTest.cashFlowCategory.create({
      data: { code: `RACE-${Date.now()}`, name: 'Chi tranh chấp', direction: 'PAYMENT', affectsBusinessResultDefault: true }
    });
    const account = await prismaTest.financialAccount.create({
      data: { code: `CASH-IND-${Date.now()}`, name: 'Quỹ tiền mặt độc lập', type: 'CASH', openingBalance: 100_000, openingAt }
    });
    await prismaTest.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: openingAt, activatedByUserId: actor.id } });

    let signalAccountLock!: () => void;
    let releaseAccountLock!: () => void;
    const accountLocked = new Promise<void>(resolve => { signalAccountLock = resolve; });
    const accountLockGate = new Promise<void>(resolve => { releaseAccountLock = resolve; });
    const accountLockHolder = prismaTest.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM FinancialAccount WHERE id = ${account.id} FOR UPDATE`;
      signalAccountLock();
      await accountLockGate;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
    await accountLocked;

    let readyCount = 0;
    let signalSnapshotsReady!: () => void;
    let releasePostings!: () => void;
    const snapshotsReady = new Promise<void>(resolve => { signalSnapshotsReady = resolve; });
    const postingGate = new Promise<void>(resolve => { releasePostings = resolve; });
    const postPayment = (clientRequestId: string) => prismaTest.$transaction(async tx => {
      // This consistent read models source workflows that read their own source row before posting.
      await tx.cashVoucher.findUnique({ where: { sourceKey: `MANUAL:${actor.id}:${clientRequestId}` } });
      readyCount += 1;
      if (readyCount === 2) signalSnapshotsReady();
      await postingGate;
      return CashbookPostingService.post(tx, {
        direction: 'PAYMENT', amount: 80_000, accountId: account.id, categoryId: category.id,
        paymentMethod: 'CASH', occurredAt: paidAt, sourceType: 'MANUAL', clientRequestId,
        reason: 'Kiểm thử tranh chấp số dư'
      }, { id: actor.id, name: actor.name, role: 'ADMIN' });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });

    const attempts = [postPayment(`independent-a-${Date.now()}`), postPayment(`independent-b-${Date.now()}`)];
    await snapshotsReady;
    releasePostings();
    await new Promise(resolve => setTimeout(resolve, 75));
    releaseAccountLock();
    await accountLockHolder;
    const results = await Promise.allSettled(attempts);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') expect(rejected.reason).toMatchObject({ code: 'CASHBOOK_NEGATIVE_BALANCE' });
    await expect(prismaTest.cashVoucher.count({ where: { accountId: account.id, sourceType: 'MANUAL' } })).resolves.toBe(1);
    await expect(prismaTest.$transaction(tx => CashbookBalanceService.balanceAt(tx, account.id, paidAt))).resolves.toBe(20_000);
  });

  it('rejects a posting when its account is deactivated while the REPEATABLE READ transaction waits for the account lock', async () => {
    const now = new Date();
    const openingAt = new Date(now.getTime() - 60_000);
    const paidAt = new Date(now.getTime() - 1_000);
    const actor = await prismaTest.user.create({
      data: { username: `cashbook-deactivation-race-${Date.now()}`, passwordHash: 'test', name: 'Quản lý', role: 'ADMIN' }
    });
    const category = await prismaTest.cashFlowCategory.create({
      data: { code: `DEACT-${Date.now()}`, name: 'Chi tài khoản sắp ngừng', direction: 'PAYMENT', affectsBusinessResultDefault: true }
    });
    const account = await prismaTest.financialAccount.create({
      data: { code: `CASH-DEACT-${Date.now()}`, name: 'Quỹ sắp ngừng', type: 'CASH', openingBalance: 100_000, openingAt }
    });
    await prismaTest.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: openingAt, activatedByUserId: actor.id } });

    let signalAccountLock!: () => void;
    let releaseAccountLock!: () => void;
    const accountLocked = new Promise<void>(resolve => { signalAccountLock = resolve; });
    const accountLockGate = new Promise<void>(resolve => { releaseAccountLock = resolve; });
    const accountLockHolder = prismaTest.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM FinancialAccount WHERE id = ${account.id} FOR UPDATE`;
      signalAccountLock();
      await accountLockGate;
    }, { timeout: 30_000 });
    await accountLocked;

    const clientRequestId = `deactivation-race-${Date.now()}`;
    let signalSnapshotReady!: () => void;
    let releasePosting!: () => void;
    const snapshotReady = new Promise<void>(resolve => { signalSnapshotReady = resolve; });
    const postingGate = new Promise<void>(resolve => { releasePosting = resolve; });
    const posting = prismaTest.$transaction(async tx => {
      await tx.cashVoucher.findUnique({ where: { sourceKey: `MANUAL:${actor.id}:${clientRequestId}` } });
      signalSnapshotReady();
      await postingGate;
      return CashbookPostingService.post(tx, {
        direction: 'PAYMENT', amount: 10_000, accountId: account.id, categoryId: category.id,
        paymentMethod: 'CASH', occurredAt: paidAt, sourceType: 'MANUAL', clientRequestId,
        reason: 'Kiểm thử tài khoản bị ngừng'
      }, { id: actor.id, name: actor.name, role: 'ADMIN' });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
    await snapshotReady;
    const deactivation = prismaTest.$transaction(tx => tx.financialAccount.update({ where: { id: account.id }, data: { isActive: false } }));
    await new Promise(resolve => setTimeout(resolve, 75));
    releaseAccountLock();
    await accountLockHolder;
    await deactivation;
    releasePosting();
    const result = await posting.then(value => ({ value }), error => ({ error }));

    expect(result).toHaveProperty('error');
    if ('error' in result) expect(result.error).toMatchObject({ code: 'CASHBOOK_ACCOUNT_INACTIVE' });
    await expect(prismaTest.cashVoucher.count({ where: { accountId: account.id } })).resolves.toBe(0);
  });

  it('posts after activation commits while a source transaction waits on the activation fence under REPEATABLE READ', async () => {
    const now = new Date();
    const openingAt = new Date(now.getTime() - 60_000);
    const paidAt = new Date(now.getTime() - 1_000);
    const actor = await prismaTest.user.create({
      data: { username: `cashbook-rr-activation-${Date.now()}`, passwordHash: 'test', name: 'Quản lý', role: 'ADMIN' }
    });
    const account = await prismaTest.financialAccount.findUniqueOrThrow({ where: { code: 'CASH' } });
    const category = await prismaTest.cashFlowCategory.findUniqueOrThrow({ where: { code: 'CUSTOMER_PAYMENT' } });

    let signalSettingLock!: () => void;
    let releaseActivation!: () => void;
    const settingLocked = new Promise<void>(resolve => { signalSettingLock = resolve; });
    const activationGate = new Promise<void>(resolve => { releaseActivation = resolve; });
    const activation = prismaTest.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM CashbookSetting WHERE id = 1 FOR UPDATE`;
      signalSettingLock();
      await activationGate;
      await tx.financialAccount.update({ where: { id: account.id }, data: { openingBalance: 100_000, openingAt } });
      await tx.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: openingAt, activatedByUserId: actor.id } });
    }, { timeout: 30_000 });
    await settingLocked;

    let signalSnapshotReady!: () => void;
    let releaseSource!: () => void;
    const snapshotReady = new Promise<void>(resolve => { signalSnapshotReady = resolve; });
    const sourceGate = new Promise<void>(resolve => { releaseSource = resolve; });
    const sourcePayment = prismaTest.$transaction(async tx => {
      await tx.cashVoucher.findUnique({ where: { sourceKey: 'ORDER_PAYMENT:99901' } });
      signalSnapshotReady();
      await sourceGate;
      const resolvedAccountId = await resolveCashbookAccountForPayment(tx, 'CASH');
      if (resolvedAccountId === null) return null;
      return CashbookPostingService.post(tx, {
        direction: 'RECEIPT', amount: 20_000, accountId: resolvedAccountId, categoryId: category.id,
        paymentMethod: 'CASH', occurredAt: paidAt, sourceType: 'ORDER_PAYMENT', sourceTransactionId: 99901,
        sourceCode: 'ORD-RR-ACTIVATION-1'
      }, { id: actor.id, name: actor.name, role: 'ADMIN' });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
    await snapshotReady;
    releaseSource();
    await new Promise(resolve => setTimeout(resolve, 75));
    releaseActivation();
    await activation;
    const voucher = await sourcePayment;

    expect(voucher).not.toBeNull();
    await expect(prismaTest.cashVoucher.count({ where: { sourceType: 'ORDER_PAYMENT', sourceTransactionId: 99901 } })).resolves.toBe(1);
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
