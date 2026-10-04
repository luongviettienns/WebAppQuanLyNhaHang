import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseEndOfDayQuery } from '../../src/modules/reports/end-of-day/end-of-day.schemas';
import { CashflowReportAdapter } from '../../src/modules/reports/end-of-day/cashflow.adapter';
import { prismaTest, truncateAllTables } from '../helpers/database';

const from = new Date('2026-10-02T17:00:00.000Z');
const to = new Date('2026-10-03T17:00:00.000Z');
const middle = new Date('2026-10-03T05:00:00.000Z');
describe('End-of-day canonical Cashflow adapter', () => {
  let actorId: number, otherActorId: number, customerId: number, otherCustomerId: number;
  let accountId: number, categoryId: number, orderId: number, sequence: number;
  beforeEach(async () => {
    await truncateAllTables();
    actorId = (await prismaTest.user.create({ data: { username: 'cash-actor', name: 'Xác nhận', role: 'ADMIN', passwordHash: 'hash' } })).id;
    otherActorId = (await prismaTest.user.create({ data: { username: 'cash-other', name: 'Khác', role: 'ADMIN', passwordHash: 'hash' } })).id;
    customerId = (await prismaTest.customer.create({ data: { code: 'KH-CASH-1', name: 'Khách Một' } })).id;
    otherCustomerId = (await prismaTest.customer.create({ data: { code: 'KH-CASH-2', name: 'Khách Hai' } })).id;
    accountId = (await prismaTest.financialAccount.findUniqueOrThrow({ where: { code: 'CASH' } })).id;
    categoryId = (await prismaTest.cashFlowCategory.findUniqueOrThrow({ where: { code: 'CUSTOMER_PAYMENT' } })).id;
    orderId = (await prismaTest.order.create({ data: { code: 'HD-CASH', status: 'COMPLETED', totalAmount: 500, vatAmount: 0, finalAmount: 500, completedAt: to, customerId, createdByUserId: otherActorId } })).id;
    sequence = 0;
  });
  function payment(data: Partial<Prisma.OrderPaymentTransactionUncheckedCreateInput> = {}) {
    return prismaTest.orderPaymentTransaction.create({ data: { orderId, status: 'SUCCESS', amount: 100, paymentMethod: 'CASH', confirmedAt: middle, confirmedByUserId: actorId, ...data } });
  }
  function voucher(data: Partial<Prisma.CashVoucherUncheckedCreateInput> = {}) {
    const n = ++sequence;
    return prismaTest.cashVoucher.create({ data: { code: `PT-CASH-${n}`, sourceKey: `MANUAL:${n}`, sourceType: 'MANUAL', direction: 'RECEIPT', amount: 100,
      occurredAt: middle, accountId, categoryId, createdByUserId: otherActorId, ...data } });
  }
  function read(filters: Record<string, unknown> = {}) {
    const query = parseEndOfDayQuery({ date: '2026-10-03', concern: 'CASHFLOW', ...filters });
    return prismaTest.$transaction(tx => CashflowReportAdapter.read(tx, query), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
  }
  async function reservation() {
    return prismaTest.reservation.create({ data: { code: `RS-${++sequence}`, accessToken: `token-${sequence}`, customerId, scheduledAt: to, partySize: 2, contactName: 'Khách', contactPhone: '01' } });
  }

  it('deduplicates linked transactions, preserves split payments and enriches from posted vouchers only', async () => {
    const cash = await payment();
    const card = await payment({ amount: 40, paymentMethod: 'CREDIT_CARD' });
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: cash.id, sourceKey: `ORDER_PAYMENT:${cash.id}`, amount: 999 });
    const result = await read();
    expect(result.totalRows).toBe(2);
    expect(result.records.map(r => r.sourceTransactionId)).toEqual([cash.id, card.id]);
    expect(result.records[0]).toMatchObject({ amount: 100, accountId, categoryId, reconciliationStatus: 'RECONCILED', creatorUserId: actorId });
    expect(result.records[1]).toMatchObject({ amount: 40, reconciliationStatus: 'UNRECONCILED', cashVoucherId: null });
    expect(result.summary).toMatchObject({ totalReceipts: 140, totalPayments: 0, netCashFlow: 140, unreconciledCount: 1 });
    expect(result.summary.byPaymentMethod).toEqual(expect.arrayContaining([{ value: 'CASH', label: 'CASH', totalReceipts: 100, totalPayments: 0, netCashFlow: 100, eventCount: 1 }]));
    expect(result.summary.byAccount.find(b => b.label === 'Tiền mặt')?.value).toBe(accountId);
    expect(result.summary.byCategory.find(b => b.value !== null)?.value).toBe(categoryId);
    expect(result.records[0]).not.toHaveProperty('reconciled');
    expect(await prismaTest.cashVoucher.count()).toBe(1);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it('filters after canonical timestamp resolution when voucher and domain are on different days', async () => {
    const today = await payment({ confirmedAt: from });
    const tomorrow = await payment({ confirmedAt: to });
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: today.id, sourceKey: `ORDER_PAYMENT:${today.id}`, occurredAt: to });
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: tomorrow.id, sourceKey: `ORDER_PAYMENT:${tomorrow.id}`, occurredAt: from });
    const result = await read();
    expect(result.records).toMatchObject([{ sourceTransactionId: today.id, occurredAt: from.toISOString(), reconciliationStatus: 'RECONCILED' }]);
    expect(result.totalRows).toBe(1);
    expect((await read({ date: '2026-10-04' })).records).toMatchObject([{ sourceTransactionId: tomorrow.id, occurredAt: to.toISOString() }]);
  });
  it('includes confirmed reservation deposits/refunds but excludes apply-to-bill and forfeiture', async () => {
    const rs = await reservation();
    await prismaTest.reservationDepositTransaction.createMany({ data: [
      { reservationId: rs.id, type: 'DEPOSIT', status: 'SUCCESS', amount: 100, confirmedAt: from, paymentMethod: 'CASH', confirmedByUserId: actorId },
      { reservationId: rs.id, type: 'REFUND', status: 'SUCCESS', amount: 20, confirmedAt: middle, paymentMethod: 'BANK_TRANSFER', confirmedByUserId: actorId },
      { reservationId: rs.id, type: 'PARTIAL_REFUND', status: 'SUCCESS', amount: 10, confirmedAt: middle },
      { reservationId: rs.id, type: 'APPLY_TO_BILL', status: 'SUCCESS', amount: 70, confirmedAt: middle, orderId },
      { reservationId: rs.id, type: 'FORFEIT', status: 'SUCCESS', amount: 70, confirmedAt: middle },
      { reservationId: rs.id, type: 'DEPOSIT', status: 'PENDING', amount: 90, confirmedAt: middle }
    ] });
    const result = await read();
    expect(result.totalRows).toBe(3);
    expect(result.summary).toMatchObject({ totalReceipts: 100, totalPayments: 30, netCashFlow: 70, unreconciledCount: 3 });
    expect(result.records.every(r => r.customerId === customerId)).toBe(true);
    expect(result.records.find(r => r.amount === -10)?.creatorUserId).toBeNull();
  });
  it('reports actual return refund at completedAt rather than refund due or returnedAt', async () => {
    const returned = await prismaTest.orderReturn.create({ data: { orderId, returnCode: 'TH-CASH', status: 'COMPLETED', totalRefundDue: 80, refundedAmount: 30, returnedAt: to, completedAt: from, createdByUserId: actorId } });
    await prismaTest.orderReturn.createMany({ data: [
      { orderId, returnCode: 'TH-NEXT', totalRefundDue: 70, refundedAmount: 20, returnedAt: from, completedAt: to },
      { orderId, returnCode: 'TH-ZERO', refundedAmount: 0, completedAt: middle },
      { orderId, returnCode: 'TH-CANCELLED', status: 'CANCELLED', refundedAmount: 40, completedAt: middle }
    ] });
    await voucher({ sourceType: 'SALES_RETURN_REFUND', sourceTransactionId: returned.id, sourceKey: `SALES_RETURN_REFUND:${returned.id}`, direction: 'PAYMENT', occurredAt: to, amount: 30 });
    expect((await read()).records).toMatchObject([{ sourceType: 'SALES_RETURN_REFUND', amount: -30, occurredAt: from.toISOString(), refundCompletedAt: from.toISOString(), creatorUserId: actorId }]);
    expect((await read()).summary).toMatchObject({ totalPayments: 30, netCashFlow: -30 });
  });
  it('suppresses and counts inconsistent posted vouchers linked to apply-to-bill or forfeiture without changing cash totals', async () => {
    const rs = await reservation();
    const apply = await prismaTest.reservationDepositTransaction.create({ data: { reservationId: rs.id, type: 'APPLY_TO_BILL', status: 'SUCCESS', amount: 100, confirmedAt: from, confirmedByUserId: actorId } });
    const forfeit = await prismaTest.reservationDepositTransaction.create({ data: { reservationId: rs.id, type: 'FORFEIT', status: 'PENDING', amount: 50, confirmedAt: middle, confirmedByUserId: actorId } });
    await voucher({ sourceType: 'RESERVATION_DEPOSIT', sourceTransactionId: apply.id, sourceKey: `RESERVATION_DEPOSIT:${apply.id}`, occurredAt: to, paymentMethod: 'CASH' });
    await voucher({ sourceType: 'RESERVATION_REFUND', sourceTransactionId: null, sourceKey: `RESERVATION_REFUND:${forfeit.id}`, paymentMethod: 'CASH', direction: 'PAYMENT', amount: 50 });
    await voucher({ paymentMethod: 'CASH', amount: 20 });
    const result = await read();
    expect(result.totalRows).toBe(1);
    expect(result.records[0].sourceType).toBe('MANUAL');
    expect(result.summary).toMatchObject({ totalReceipts: 20, totalPayments: 0, netCashFlow: 20 });
    expect(result.invariantCounters.suppressedNonCashReservationVoucherCount).toBe(2);
    const filtered = await read({ recordTypes: 'RESERVATION_DEPOSIT', customerId, creatorUserId: actorId, paymentMethods: 'CASH' });
    expect(filtered.totalRows).toBe(0);
    expect(filtered.invariantCounters.suppressedNonCashReservationVoucherCount).toBe(1);
    expect((await read({ date: '2026-10-04' })).invariantCounters.suppressedNonCashReservationVoucherCount).toBe(0);
  });
  it('keeps cancelled linked money unreconciled and excludes cancelled standalone vouchers', async () => {
    const paid = await payment();
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: paid.id, sourceKey: `ORDER_PAYMENT:${paid.id}`, status: 'CANCELLED' });
    await voucher({ status: 'CANCELLED' });
    const result = await read();
    expect(result.totalRows).toBe(1);
    expect(result.records[0]).toMatchObject({ amount: 100, cashVoucherId: null, accountId: null, reconciliationStatus: 'UNRECONCILED' });
    expect(await prismaTest.cashVoucher.count()).toBe(2);
  });
  it('includes posted manual and signed reversals and preserves zero net with events', async () => {
    const original = await voucher({ counterpartyType: 'CUSTOMER', counterpartyId: customerId });
    await voucher({ sourceType: 'REVERSAL', sourceTransactionId: original.id, sourceKey: `REVERSAL:${original.id}`, reversalOfId: original.id, direction: 'PAYMENT', occurredAt: from });
    await voucher({ occurredAt: to, amount: 200 });
    const result = await read();
    expect(result.totalRows).toBe(2);
    expect(result.summary).toMatchObject({ totalReceipts: 100, totalPayments: 100, netCashFlow: 0, unreconciledCount: 0 });
    expect(result.records.find(r => r.sourceType === 'REVERSAL')).toMatchObject({ amount: -100, reversalOfId: original.id, occurredAt: from.toISOString(), customerId: null });
  });
  it('matches canonical sourceKey without transaction ID and uses occurredAt for missing domain vouchers', async () => {
    const paid = await payment();
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: null, sourceKey: `ORDER_PAYMENT:${paid.id}` });
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: 999999, sourceKey: 'ORDER_PAYMENT:999999', amount: 25 });
    const result = await read();
    expect(result.totalRows).toBe(2);
    expect(result.summary.totalReceipts).toBe(125);
    expect(result.records.find(r => r.sourceTransactionId === paid.id)?.reconciliationStatus).toBe('RECONCILED');
  });
  it('resolves supplier, receipt, purchase return and payroll voucher timestamps from their actual transaction sources', async () => {
    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC-CASH', name: 'Nhà cung cấp' } });
    const receipt = await prismaTest.purchaseReceipt.create({ data: { receiptCode: 'PN-CASH', supplierId: supplier.id, receivedAt: to, postedAt: to, status: 'POSTED' } });
    const receiptPayment = await prismaTest.supplierPayment.create({ data: { supplierId: supplier.id, purchaseReceiptId: receipt.id, amount: 10, paymentMethod: 'CASH', paidAt: from, createdByUserId: actorId } });
    const supplierPayment = await prismaTest.supplierPayment.create({ data: { supplierId: supplier.id, amount: 20, paymentMethod: 'CASH', paidAt: from, createdByUserId: actorId } });
    const returned = await prismaTest.purchaseReturn.create({ data: { returnCode: 'TN-CASH', status: 'COMPLETED', returnedAt: to, completedAt: from, completedByUserId: actorId, refundAmount: 30 } });
    const employee = await prismaTest.employee.create({ data: { code: 'NV-CASH', attendanceCode: 'NV-CASH', name: 'Nhân viên', phone: '01' } });
    const branchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    const batch = await prismaTest.employeePayrollBatch.create({ data: { code: 'BL-CASH', name: 'Lương', branchId, periodStart: from, periodEnd: to, createdByUserId: otherActorId } });
    const line = await prismaTest.employeePayrollLine.create({ data: { payrollBatchId: batch.id, employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name, warningCodes: [], sourceSnapshot: {}, calculatedAt: middle } });
    const payroll = await prismaTest.employeePayrollPayment.create({ data: { payrollBatchId: batch.id, payrollLineId: line.id, employeeId: employee.id, amount: 40, method: 'CASH', paidAt: from, createdByUserId: actorId } });
    for (const [sourceType, sourceTransactionId, amount, direction] of [
      ['PURCHASE_RECEIPT_PAYMENT', receiptPayment.id, 10, 'PAYMENT'], ['SUPPLIER_PAYMENT', supplierPayment.id, 20, 'PAYMENT'],
      ['PURCHASE_RETURN_REFUND', returned.id, 30, 'RECEIPT'], ['PAYROLL_PAYMENT', payroll.id, 40, 'PAYMENT']
    ] as const) await voucher({ sourceType, sourceTransactionId, sourceKey: `${sourceType}:${sourceTransactionId}`, amount, direction, occurredAt: to });
    const result = await read({ creatorUserId: actorId });
    expect(result.totalRows).toBe(4);
    expect(result.records.every(r => r.occurredAt === from.toISOString() && r.customerId === null)).toBe(true);
    expect(result.summary).toMatchObject({ totalReceipts: 30, totalPayments: 70, netCashFlow: -40 });
    expect((await read({ date: '2026-10-04' })).totalRows).toBe(0);
  });
  it.each(['customerId', 'creatorUserId', 'paymentMethods', 'recordTypes', 'search'] as const)('applies %s to rows, unpaginated totals and self-excluding facets', async dimension => {
    await payment();
    const otherOrder = await prismaTest.order.create({ data: { code: 'HD-OTHER', totalAmount: 0, vatAmount: 0, finalAmount: 0, customerId: otherCustomerId } });
    await payment({ orderId: otherOrder.id, confirmedByUserId: otherActorId, paymentMethod: 'CREDIT_CARD', amount: 40 });
    await voucher({ amount: 25, paymentMethod: 'CASH', counterpartyType: 'CUSTOMER', counterpartyId: customerId, createdByUserId: actorId });
    const values = { customerId, creatorUserId: actorId, paymentMethods: 'CASH', recordTypes: 'ORDER_PAYMENT', search: 'HD-CASH' };
    const result = await read({ [dimension]: values[dimension], pageSize: '1' });
    const count = dimension === 'search' ? 1 : 2;
    const receipts = dimension === 'recordTypes' ? 140 : dimension === 'search' ? 100 : 125;
    expect(result.totalRows).toBe(count);
    expect(result.records).toHaveLength(1);
    expect(result.summary.totalReceipts).toBe(receipts);
    if (dimension !== 'search') expect(result.filterOptions[dimension]).toHaveLength(2);
  });
  it('facets self-exclude only their own filter, including source and payment method', async () => {
    await payment();
    await payment({ paymentMethod: 'CREDIT_CARD' });
    const other = await prismaTest.order.create({ data: { code: 'HD-CASH-2', totalAmount: 0, vatAmount: 0, finalAmount: 0, customerId: otherCustomerId } });
    await payment({ orderId: other.id });
    await payment({ orderId: other.id, paymentMethod: 'BANK_TRANSFER', confirmedByUserId: otherActorId });
    await voucher({ paymentMethod: 'CASH', counterpartyType: 'CUSTOMER', counterpartyId: customerId, createdByUserId: actorId, sourceCode: 'HD-CASH' });
    const result = await read({ customerId, creatorUserId: actorId, paymentMethods: 'CASH', recordTypes: 'ORDER_PAYMENT', search: 'HD-CASH' });
    expect(result.totalRows).toBe(1);
    expect(result.filterOptions.customerId?.map(o => o.value)).toEqual([customerId, otherCustomerId]);
    expect(result.filterOptions.creatorUserId?.map(o => o.value)).toEqual([actorId]);
    expect(result.filterOptions.paymentMethods?.map(o => o.value)).toEqual(['CASH', 'CREDIT_CARD']);
    expect(result.filterOptions.recordTypes?.map(o => o.value)).toEqual(['MANUAL', 'ORDER_PAYMENT']);
  });
  it('treats search wildcards and SQL-looking strings as literal data', async () => {
    await voucher({ code: 'PT_%' });
    await voucher({ code: 'PT-other' });
    expect((await read({ search: 'PT_%' })).totalRows).toBe(1);
    expect((await read({ search: "' OR 1=1 --" })).totalRows).toBe(0);
  });
  it.each(['occurredAt', 'amount', 'sourceType'])('sorts %s with stable keys and keeps summary/facets independent of pagination', async sortBy => {
    const first = await payment(); const second = await payment();
    await voucher({ direction: 'PAYMENT', amount: 30 });
    const page1 = await read({ sortBy, sortOrder: 'asc', pageSize: '1' });
    const page2 = await read({ sortBy, sortOrder: 'asc', pageSize: '1', page: '2' });
    const page3 = await read({ sortBy, sortOrder: 'asc', pageSize: '1', page: '3' });
    expect(new Set([page1.records[0].key, page2.records[0].key, page3.records[0].key]).size).toBe(3);
    expect(page1.summary).toEqual(page3.summary);
    expect(page1.filterOptions).toEqual(page3.filterOptions);
    expect(page1.summary).toMatchObject({ totalReceipts: 200, totalPayments: 30, netCashFlow: 170 });
    expect((await read({ sortBy, sortOrder: 'asc', pageSize: '1' })).records).toEqual(page1.records);
    const all = await read({ sortBy, sortOrder: 'desc' });
    expect(all.records.filter(r => r.sourceType === 'ORDER_PAYMENT').map(r => r.sourceTransactionId)).toEqual([first.id, second.id]);
    expect((await read({ page: '10' })).records).toEqual([]);
  });
  it('returns an empty normalized result without fabricating unknown identities', async () => {
    const empty = await read();
    expect(empty.totalRows).toBe(0); expect(empty.records).toEqual([]);
    expect(empty.summary).toMatchObject({ totalReceipts: 0, totalPayments: 0, netCashFlow: 0, unreconciledCount: 0 });
    await payment({ confirmedByUserId: null });
    expect((await read()).records[0].creatorUserId).toBeNull();
    expect((await read({ creatorUserId: otherActorId })).totalRows).toBe(0);
  });
  it('deduplicates integrated vouchers before date, filter, summary, facet and page projections', async () => {
    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC-DUP', name: 'Nhà cung cấp' } });
    const paid = await prismaTest.supplierPayment.create({ data: { supplierId: supplier.id, amount: 25, paymentMethod: 'CASH', paidAt: from, createdByUserId: actorId } });
    const first = await voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: paid.id, sourceKey: 'legacy:supplier:first', amount: 25, direction: 'PAYMENT', paymentMethod: 'CASH', occurredAt: to });
    await voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: paid.id, sourceKey: `SUPPLIER_PAYMENT:${paid.id}`, amount: 999, direction: 'PAYMENT', paymentMethod: 'CREDIT_CARD', occurredAt: from });
    const result = await read({ recordTypes: 'SUPPLIER_PAYMENT', pageSize: '1' });
    expect(result.totalRows).toBe(1);
    expect(result.records).toMatchObject([{ key: `SUPPLIER_PAYMENT:${paid.id}`, sourceTransactionId: paid.id, cashVoucherId: first.id, amount: -25, occurredAt: from.toISOString(), creatorUserId: actorId }]);
    expect(result.summary).toMatchObject({ totalPayments: 25, netCashFlow: -25, bySource: [{ value: 'SUPPLIER_PAYMENT', label: 'SUPPLIER_PAYMENT', totalReceipts: 0, totalPayments: 25, netCashFlow: -25, eventCount: 1 }] });
    expect(result.filterOptions.paymentMethods?.map(o => o.value)).toEqual(['CASH']);
    expect((await read({ paymentMethods: 'CREDIT_CARD' })).totalRows).toBe(0);
    const page2 = await read({ page: '2', pageSize: '1' });
    expect(page2.records).toEqual([]); expect(page2.summary).toEqual(result.summary);
    expect((await read({ date: '2026-10-04' })).totalRows).toBe(0);
  });
  it('deduplicates missing-domain vouchers identified by explicit id and exact stable key before time filtering', async () => {
    const first = await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: 99999, sourceKey: 'legacy:missing:first', amount: 25, occurredAt: from, paymentMethod: 'CASH' });
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: null, sourceKey: 'ORDER_PAYMENT:99999', amount: 100, occurredAt: to, paymentMethod: 'BANK_TRANSFER' });
    const result = await read();
    expect(result.totalRows).toBe(1);
    expect(result.records).toMatchObject([{ key: 'ORDER_PAYMENT:99999', sourceTransactionId: 99999, cashVoucherId: first.id, amount: 25 }]);
    expect(result.summary).toMatchObject({ totalReceipts: 25, netCashFlow: 25 });
    expect(result.filterOptions.paymentMethods?.map(o => o.value)).toEqual(['CASH']);
    expect((await read({ date: '2026-10-04' })).totalRows).toBe(0);
  });
  it('resolves one supplier target by authoritative explicit id and counts its conflicting existing key target', async () => {
    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC-CONFLICT', name: 'Nhà cung cấp' } });
    const a = await prismaTest.supplierPayment.create({ data: { supplierId: supplier.id, amount: 25, paymentMethod: 'CASH', paidAt: from, createdByUserId: actorId } });
    const b = await prismaTest.supplierPayment.create({ data: { supplierId: supplier.id, amount: 60, paymentMethod: 'CASH', paidAt: to, createdByUserId: otherActorId } });
    const linked = await voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: a.id, sourceKey: `SUPPLIER_PAYMENT:${b.id}`, direction: 'PAYMENT', amount: 25, occurredAt: to });
    const result = await read();
    expect(result.totalRows).toBe(1);
    expect(result.records).toMatchObject([{ key: `SUPPLIER_PAYMENT:${a.id}`, sourceTransactionId: a.id, cashVoucherId: linked.id, occurredAt: from.toISOString(), creatorUserId: actorId, amount: -25 }]);
    expect(result.summary.totalPayments).toBe(25);
    expect(result.invariantCounters.conflictingVoucherIdentityCount).toBe(1);
    const tomorrow = await read({ date: '2026-10-04' });
    expect(tomorrow.totalRows).toBe(0); expect(tomorrow.invariantCounters.conflictingVoucherIdentityCount).toBe(0);
    expect((await read({ creatorUserId: otherActorId })).invariantCounters.conflictingVoucherIdentityCount).toBe(0);
  });
  it('reconciles only the explicit core target when one voucher identity names two existing payments', async () => {
    const a = await payment({ confirmedAt: from });
    const b = await payment({ amount: 40, paymentMethod: 'CREDIT_CARD' });
    const linked = await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: a.id, sourceKey: `ORDER_PAYMENT:${b.id}`, occurredAt: to });
    const result = await read();
    expect(result.totalRows).toBe(2);
    expect(result.records.find(r => r.sourceTransactionId === a.id)).toMatchObject({ cashVoucherId: linked.id, reconciliationStatus: 'RECONCILED', occurredAt: from.toISOString() });
    expect(result.records.find(r => r.sourceTransactionId === b.id)).toMatchObject({ cashVoucherId: null, reconciliationStatus: 'UNRECONCILED' });
    expect(result.summary).toMatchObject({ totalReceipts: 140, unreconciledCount: 1 });
    expect(result.invariantCounters.conflictingVoucherIdentityCount).toBe(1);
    expect(new Set(result.records.map(r => r.key)).size).toBe(2);
  });
  it('preserves stable-key fallback when an explicit id does not resolve', async () => {
    const paid = await payment();
    const linked = await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: 99999, sourceKey: `ORDER_PAYMENT:${paid.id}`, occurredAt: to });
    const result = await read();
    expect(result.totalRows).toBe(1);
    expect(result.records[0]).toMatchObject({ key: `ORDER_PAYMENT:${paid.id}`, cashVoucherId: linked.id, reconciliationStatus: 'RECONCILED', sourceTransactionId: paid.id });
    expect(result.invariantCounters.conflictingVoucherIdentityCount).toBe(0);
  });
  it('counts discarded conflicting vouchers using canonical core dimensions without adding their money', async () => {
    const a = await payment({ confirmedAt: from });
    const b = await payment({ amount: 40, paymentMethod: 'CREDIT_CARD' });
    const chosen = await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: a.id, sourceKey: 'legacy:chosen-core', paymentMethod: 'CASH' });
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: a.id, sourceKey: `ORDER_PAYMENT:${b.id}`, amount: 999, paymentMethod: 'CREDIT_CARD', sourceCode: 'CONFLICTING-LEDGER-CODE' });
    const result = await read({ paymentMethods: 'CASH', search: 'HD-CASH' });
    expect(result.totalRows).toBe(1);
    expect(result.records[0].cashVoucherId).toBe(chosen.id);
    expect(result.summary.totalReceipts).toBe(100);
    expect(result.invariantCounters.conflictingVoucherIdentityCount).toBe(1);
  });
  it('applies non-cash suppression only to the single resolved reservation target', async () => {
    const rs = await reservation();
    const deposit = await prismaTest.reservationDepositTransaction.create({ data: { reservationId: rs.id, type: 'DEPOSIT', status: 'SUCCESS', amount: 100, confirmedAt: from } });
    const forfeit = await prismaTest.reservationDepositTransaction.create({ data: { reservationId: rs.id, type: 'FORFEIT', status: 'SUCCESS', amount: 50, confirmedAt: middle } });
    const linked = await voucher({ sourceType: 'RESERVATION_DEPOSIT', sourceTransactionId: deposit.id, sourceKey: `RESERVATION_DEPOSIT:${forfeit.id}` });
    const result = await read();
    expect(result.totalRows).toBe(1);
    expect(result.records[0]).toMatchObject({ cashVoucherId: linked.id, reconciliationStatus: 'RECONCILED' });
    expect(result.invariantCounters.suppressedNonCashReservationVoucherCount).toBe(0);
    expect(result.invariantCounters.conflictingVoucherIdentityCount).toBe(1);
  });
  it('keeps manual and reversal vouchers independent when transaction ids happen to repeat', async () => {
    for (const [sourceType, sourceKey] of [
      ['MANUAL', 'MANUAL:first'], ['MANUAL', 'MANUAL:second'], ['REVERSAL', 'REVERSAL:first'], ['REVERSAL', 'REVERSAL:second']
    ] as const) await voucher({ sourceType, sourceTransactionId: 1, sourceKey, amount: 10 });
    const result = await read();
    expect(result.totalRows).toBe(4);
    expect(new Set(result.records.map(r => r.key)).size).toBe(4);
    expect(result.summary.totalReceipts).toBe(40);
  });
  it('filters integrated issue multiplicity through the selected canonical voucher dimensions', async () => {
    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC-ISSUES', name: 'Nhà cung cấp' } });
    const a = await prismaTest.supplierPayment.create({ data: { supplierId: supplier.id, amount: 25, paymentMethod: 'CASH', paidAt: from, createdByUserId: actorId } });
    const b = await prismaTest.supplierPayment.create({ data: { supplierId: supplier.id, amount: 60, paymentMethod: 'CASH', paidAt: to, createdByUserId: otherActorId } });
    const selected = await voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: a.id, sourceKey: 'legacy:canonical-selected', direction: 'PAYMENT', amount: 25, paymentMethod: 'CASH', sourceCode: 'CANONICAL-SELECTED', note: 'CANONICAL-NOTE' });
    await voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: a.id, sourceKey: `SUPPLIER_PAYMENT:${b.id}`, direction: 'PAYMENT', amount: 999, paymentMethod: 'CREDIT_CARD', sourceCode: 'DISCARDED-CONFLICT', note: 'DISCARDED-NOTE' });
    for (const [filter, count] of [
      [{}, 1], [{ paymentMethods: 'CASH' }, 1], [{ paymentMethods: 'CREDIT_CARD' }, 0],
      [{ search: 'CANONICAL-SELECTED' }, 1], [{ search: 'CANONICAL-NOTE' }, 1],
      [{ search: 'DISCARDED-CONFLICT' }, 0], [{ search: 'DISCARDED-NOTE' }, 0]
    ] as const) {
      const result = await read(filter);
      expect(result.totalRows).toBe(count);
      expect(result.invariantCounters.conflictingVoucherIdentityCount).toBe(count);
      expect(result.summary.totalPayments).toBe(count ? 25 : 0);
    }
    const first = await read({ paymentMethods: 'CASH', search: 'CANONICAL-SELECTED', pageSize: '1' });
    const next = await read({ paymentMethods: 'CASH', search: 'CANONICAL-SELECTED', pageSize: '1', page: '2' });
    expect(first.records[0].cashVoucherId).toBe(selected.id);
    expect(next.records).toEqual([]);
    expect(next.summary).toEqual(first.summary);
    expect(next.filterOptions).toEqual(first.filterOptions);
    expect(next.invariantCounters.conflictingVoucherIdentityCount).toBe(1);
  });
  it('filters core issues using domain facts and only selected ledger enrichment', async () => {
    const a = await payment({ confirmedAt: from, externalReference: 'DOMAIN-REFERENCE' });
    const b = await payment({ amount: 40, paymentMethod: 'CREDIT_CARD' });
    const discardedAccount = await prismaTest.financialAccount.create({ data: { code: 'DISCARDED', name: 'DISCARDED-ACCOUNT', type: 'CASH' } });
    const discardedCategory = await prismaTest.cashFlowCategory.create({ data: { code: 'DISCARDED', name: 'DISCARDED-CATEGORY', direction: 'RECEIPT' } });
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: a.id, sourceKey: 'legacy:core-selected', sourceCode: 'CANONICAL-SELECTED', note: 'CANONICAL-NOTE' });
    await voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: a.id, sourceKey: `ORDER_PAYMENT:${b.id}`, paymentMethod: 'CREDIT_CARD', accountId: discardedAccount.id, categoryId: discardedCategory.id, note: 'DISCARDED-NOTE' });
    for (const [search, count] of [
      ['CANONICAL-NOTE', 1], ['CANONICAL-SELECTED', 1], ['DOMAIN-REFERENCE', 1],
      ['DISCARDED-NOTE', 0], ['DISCARDED-ACCOUNT', 0], ['DISCARDED-CATEGORY', 0]
    ] as const) {
      const result = await read({ search });
      expect(result.totalRows).toBe(count);
      expect(result.invariantCounters.conflictingVoucherIdentityCount).toBe(count);
    }
  });
  it('places all suppressed alias multiplicity on the selected fallback day when domain time is null', async () => {
    const rs = await reservation();
    const forfeit = await prismaTest.reservationDepositTransaction.create({ data: { reservationId: rs.id, type: 'FORFEIT', status: 'PENDING', amount: 100, confirmedAt: null } });
    await voucher({ sourceType: 'RESERVATION_REFUND', sourceTransactionId: forfeit.id, sourceKey: 'legacy:suppressed-selected', occurredAt: from, paymentMethod: 'CASH', note: 'SUPPRESSED-SELECTED' });
    await voucher({ sourceType: 'RESERVATION_REFUND', sourceTransactionId: null, sourceKey: `RESERVATION_REFUND:${forfeit.id}`, occurredAt: to, paymentMethod: 'CREDIT_CARD', note: 'SUPPRESSED-DISCARDED' });
    const today = await read();
    expect(today.totalRows).toBe(0);
    expect(today.invariantCounters.suppressedNonCashReservationVoucherCount).toBe(2);
    const tomorrow = await read({ date: '2026-10-04' });
    expect(tomorrow.totalRows).toBe(0);
    expect(tomorrow.invariantCounters.suppressedNonCashReservationVoucherCount).toBe(0);
    expect((await read({ paymentMethods: 'CASH', search: 'SUPPRESSED-SELECTED', page: '2', pageSize: '1' })).invariantCounters.suppressedNonCashReservationVoucherCount).toBe(2);
    expect((await read({ paymentMethods: 'CREDIT_CARD' })).invariantCounters.suppressedNonCashReservationVoucherCount).toBe(0);
    expect((await read({ search: 'SUPPRESSED-DISCARDED' })).invariantCounters.suppressedNonCashReservationVoucherCount).toBe(0);
    expect(today.summary).toMatchObject({ totalReceipts: 0, totalPayments: 0 });
    expect(today.filterOptions.recordTypes).toEqual([]);
  });
});
