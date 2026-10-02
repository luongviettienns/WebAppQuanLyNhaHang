import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseEndOfDayQuery } from '../../src/modules/reports/end-of-day/end-of-day.schemas';
import { SalesReportAdapter } from '../../src/modules/reports/end-of-day/sales.adapter';
import { SalesReturnService } from '../../src/modules/orders/sales-return.service';
import { prismaTest, truncateAllTables } from '../helpers/database';

const from = new Date('2026-10-02T17:00:00.000Z');
const to = new Date('2026-10-03T17:00:00.000Z');
const middle = new Date('2026-10-03T05:00:00.000Z');

// Each fixture is hand-valued so changing time, payment or filter predicates changes observable totals.
describe('End-of-day Sales adapter', () => {
  let creator: { id: number; name: string; role: 'ADMIN' };
  let otherCreatorId: number;
  let customerId: number;
  let otherCustomerId: number;
  let receiverId: number;
  let otherReceiverId: number;
  let tableId: number;
  let otherTableId: number;
  let areaId: number;
  let otherAreaId: number;
  let sequence = 0;

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({ data: { username: 'sales-admin', name: 'Người tạo', role: 'ADMIN', passwordHash: 'hash' } });
    creator = { id: admin.id, name: admin.name, role: 'ADMIN' };
    otherCreatorId = (await prismaTest.user.create({ data: { username: 'sales-other', name: 'Khác', role: 'ADMIN', passwordHash: 'hash' } })).id;
    customerId = (await prismaTest.customer.create({ data: { code: 'KH-1', name: 'Khách Một' } })).id;
    otherCustomerId = (await prismaTest.customer.create({ data: { code: 'KH-2', name: 'Khách Hai' } })).id;
    receiverId = (await prismaTest.employee.create({ data: { code: 'NV-1', attendanceCode: 'NV1', name: 'Người nhận', phone: '01', userId: creator.id } })).id;
    otherReceiverId = (await prismaTest.employee.create({ data: { code: 'NV-2', attendanceCode: 'NV2', name: 'Khác', phone: '02' } })).id;
    areaId = (await prismaTest.tableArea.create({ data: { name: 'Khu Một' } })).id;
    otherAreaId = (await prismaTest.tableArea.create({ data: { name: 'Khu Hai' } })).id;
    tableId = (await prismaTest.diningTable.create({ data: { tableNumber: 1, areaId, qrCodeToken: 'sales-table-1' } })).id;
    otherTableId = (await prismaTest.diningTable.create({ data: { tableNumber: 2, areaId: otherAreaId, qrCodeToken: 'sales-table-2' } })).id;
    sequence = 0;
  });

  function invoice(data: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
    return prismaTest.order.create({ data: {
      code: `HD-SALES-${++sequence}`, status: 'COMPLETED', orderType: 'DINE_IN', completedAt: middle,
      createdAt: new Date('2026-10-01T01:00:00Z'), totalAmount: 100, discountAmount: 10, vatAmount: 8,
      deliveryFee: 5, finalAmount: 103, paymentStatus: 'PAID', paymentMethod: 'CASH',
      customerId, createdByUserId: creator.id, receivedByEmployeeId: receiverId, tableId, ...data
    } });
  }

  function returned(orderId: number, data: Partial<Prisma.OrderReturnUncheckedCreateInput> = {}) {
    return prismaTest.orderReturn.create({ data: {
      orderId, returnCode: `TH-SALES-${++sequence}`, status: 'COMPLETED', returnedAt: middle,
      completedAt: to, totalRefundDue: 30, refundedAmount: 20, ...data
    } });
  }

  async function read(filters: Record<string, unknown> = {}) {
    const query = parseEndOfDayQuery({ date: '2026-10-03', concern: 'SALES', ...filters });
    return prismaTest.$transaction(tx => SalesReportAdapter.read(tx, query), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000
    });
  }

  it('includes exact from and excludes exact to using completedAt, never createdAt or payment time', async () => {
    const included = await invoice({ completedAt: from });
    await invoice({ completedAt: to, createdAt: middle });
    await invoice({ completedAt: new Date(from.getTime() - 1), createdAt: middle });
    await invoice({ completedAt: null, createdAt: middle });
    await invoice({ status: 'PENDING', completedAt: middle });
    await prismaTest.orderPaymentTransaction.create({ data: { orderId: included.id, status: 'SUCCESS', amount: 103, paymentMethod: 'BANK_TRANSFER', confirmedAt: to } });
    const result = await read({ paymentMethods: 'BANK_TRANSFER' });
    expect(result.totalRows).toBe(1);
    expect(result.records).toMatchObject([{ orderId: included.id, recordType: 'INVOICE', occurredAt: from.toISOString(), amount: 103 }]);
    expect(result.summary).toMatchObject({ completedInvoiceCount: 1, grossInvoiceValue: 103, salesReturnValue: 0, netInvoiceValue: 103 });
  });

  it('uses returnedAt with exact bounds and ignores refund completion time and cancelled returns', async () => {
    const old = await invoice({ completedAt: new Date('2026-09-01T00:00:00Z') });
    const included = await returned(old.id, { returnedAt: from });
    await returned(old.id, { returnedAt: to, completedAt: middle });
    await returned(old.id, { returnedAt: new Date(from.getTime() - 1), completedAt: middle });
    await returned(old.id, { status: 'CANCELLED' });
    const result = await read();
    expect(result.totalRows).toBe(1);
    expect(result.records).toMatchObject([{ orderReturnId: included.id, recordType: 'SALES_RETURN', occurredAt: from.toISOString(), amount: -30, totalRefundDue: 30 }]);
    expect(result.summary).toMatchObject({ completedInvoiceCount: 0, grossInvoiceValue: 0, salesReturnValue: 30, netInvoiceValue: -30, goodsAmount: 0, discountAmount: 0, vatAmount: 0, deliveryFee: 0 });
  });

  it('keeps the invoice snapshot immutable through the real return workflow and subtracts a later return exactly once', async () => {
    const category = await prismaTest.category.create({ data: { name: 'Sales fixture' } });
    const menu = await prismaTest.menuItem.create({ data: { categoryId: category.id, sku: 'SALES-MENU', name: 'Món', basePrice: 100 } });
    const order = await invoice({ items: { create: { menuItemId: menu.id, quantity: 1, unitPrice: 100, subtotal: 100 } } });
    const item = await prismaTest.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    const before = (await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).finalAmount;
    const created = await SalesReturnService.create({ orderId: order.id, lines: [{ orderItemId: item.id, quantity: 1 }], refundMethod: 'CASH' }, creator, 'sales-invoice-immutable');
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).finalAmount).toBe(before);
    await prismaTest.orderReturn.update({ where: { id: created.id }, data: { returnedAt: new Date('2026-10-04T05:00:00Z') } });
    expect((await read()).summary).toMatchObject({ grossInvoiceValue: 103, salesReturnValue: 0, netInvoiceValue: 103 });
    const later = await read({ date: '2026-10-04' });
    expect(later.summary).toMatchObject({ grossInvoiceValue: 0, salesReturnValue: 100, netInvoiceValue: -100 });
    expect(later.totalRows).toBe(1);
    await prismaTest.orderReturn.update({ where: { id: created.id }, data: { returnedAt: middle } });
    expect((await read()).summary).toMatchObject({ grossInvoiceValue: 103, salesReturnValue: 100, netInvoiceValue: 3 });
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: order.id } })).finalAmount).toBe(103);
  });

  it('selects successful transaction methods and flags fallback only when no transactions exist', async () => {
    const legacy = await invoice();
    const modern = await invoice();
    const rejected = await invoice();
    const pending = await invoice();
    await prismaTest.orderPaymentTransaction.createMany({ data: [
      { orderId: modern.id, status: 'SUCCESS', amount: 50, paymentMethod: 'BANK_TRANSFER', confirmedAt: to },
      { orderId: modern.id, status: 'SUCCESS', amount: 53, paymentMethod: 'CREDIT_CARD', confirmedAt: from },
      { orderId: modern.id, status: 'REJECTED', amount: 10, paymentMethod: 'E_WALLET' },
      { orderId: rejected.id, status: 'REJECTED', amount: 103, paymentMethod: 'CASH' },
      { orderId: pending.id, status: 'PENDING', amount: 103, paymentMethod: 'CASH' }
    ] });
    await returned(legacy.id);
    await returned(modern.id);
    const cash = await read({ paymentMethods: 'CASH' });
    expect(cash.totalRows).toBe(2);
    expect(cash.records.every((r: { legacyPaymentMethodFallback: boolean }) => r.legacyPaymentMethodFallback)).toBe(true);
    expect(cash.summary).toMatchObject({ grossInvoiceValue: 103, salesReturnValue: 30, netInvoiceValue: 73 });
    const bank = await read({ paymentMethods: 'BANK_TRANSFER,CREDIT_CARD' });
    expect(bank.totalRows).toBe(2);
    expect(bank.records.every((r: { legacyPaymentMethodFallback: boolean }) => !r.legacyPaymentMethodFallback)).toBe(true);
    expect(bank.records[0].paymentMethods).toEqual(['BANK_TRANSFER', 'CREDIT_CARD']);
    expect((await read({ paymentMethods: 'E_WALLET' })).totalRows).toBe(0);
    const all = await read();
    expect(all.records.filter((r: { orderId: number }) => r.orderId === rejected.id || r.orderId === pending.id).map((r: { legacyPaymentMethodFallback: boolean; paymentMethods: string[] }) => [r.legacyPaymentMethodFallback, r.paymentMethods])).toEqual([[false, []], [false, []]]);
  });

  it.each(['customerId', 'receiverEmployeeId', 'creatorUserId', 'delivery', 'areaId', 'tableId', 'search'] as const)(
    'applies %s identically to invoices, inherited return dimensions, counts and full summary', async dimension => {
      const matching = await invoice({ code: 'MATCH-INVOICE' });
      const changes: Record<string, Partial<Prisma.OrderUncheckedCreateInput>> = {
        customerId: { customerId: otherCustomerId }, receiverEmployeeId: { receivedByEmployeeId: otherReceiverId },
        creatorUserId: { createdByUserId: otherCreatorId }, delivery: { orderType: 'DELIVERY' },
        areaId: { tableId: otherTableId }, tableId: { tableId: otherTableId }, search: { code: 'OTHER' }
      };
      const excluded = await invoice(changes[dimension]);
      await returned(matching.id); await returned(excluded.id);
      const filters: Record<string, unknown> = { customerId, receiverEmployeeId: receiverId, creatorUserId: creator.id, delivery: 'false', areaId, tableId, search: 'MATCH-INVOICE' };
      const result = await read({ [dimension]: filters[dimension], pageSize: '1' });
      expect(result.totalRows).toBe(2);
      expect(result.records).toHaveLength(1);
      expect(result.records[0].orderId).toBe(matching.id);
      expect(result.summary).toMatchObject({ completedInvoiceCount: 1, grossInvoiceValue: 103, salesReturnValue: 30, netInvoiceValue: 73, goodsAmount: 100, discountAmount: 10, vatAmount: 8, deliveryFee: 5 });
      if (dimension !== 'search') expect(result.filterOptions[dimension]).toHaveLength(2);
    }
  );

  it('facets remove only their own dimension while retaining every other active filter', async () => {
    await invoice();
    await invoice({ customerId: otherCustomerId });
    await invoice({ customerId: otherCustomerId, receivedByEmployeeId: otherReceiverId });
    const result = await read({ customerId, receiverEmployeeId: receiverId, creatorUserId: creator.id, delivery: 'false', areaId, tableId, paymentMethods: 'CASH', search: 'HD-SALES' });
    expect(result.totalRows).toBe(1);
    expect(result.filterOptions.customerId?.map(o => o.value)).toEqual([customerId, otherCustomerId]);
    expect(result.filterOptions.receiverEmployeeId?.map(o => o.value)).toEqual([receiverId]);
    expect(result.filterOptions.paymentMethods?.map(o => o.value)).toEqual(['CASH']);
  });

  it('offers alternate successful payment methods while retaining the selected customer in the payment facet', async () => {
    await invoice();
    const card = await invoice();
    const otherCustomer = await invoice({ customerId: otherCustomerId });
    await prismaTest.orderPaymentTransaction.createMany({ data: [
      { orderId: card.id, status: 'SUCCESS', amount: 103, paymentMethod: 'CREDIT_CARD' },
      { orderId: card.id, status: 'REJECTED', amount: 103, paymentMethod: 'BANK_TRANSFER' },
      { orderId: otherCustomer.id, status: 'SUCCESS', amount: 103, paymentMethod: 'E_WALLET' }
    ] });
    const result = await read({ customerId, paymentMethods: 'CASH' });
    expect(result.totalRows).toBe(1);
    expect(result.summary.grossInvoiceValue).toBe(103);
    expect(result.filterOptions.paymentMethods?.map(o => o.value)).toEqual(['CASH', 'CREDIT_CARD']);
  });

  it('searches return document codes as literal text, including SQL wildcard characters', async () => {
    const order = await invoice({ code: 'SOURCE' });
    const literal = await returned(order.id, { returnCode: 'R_%' });
    await returned(order.id, { returnCode: 'R-other' });
    const result = await read({ search: 'R_%' });
    expect(result.totalRows).toBe(1);
    expect(result.records[0].orderReturnId).toBe(literal.id);
    expect(result.summary).toMatchObject({ grossInvoiceValue: 0, salesReturnValue: 30, netInvoiceValue: -30 });
  });

  it('breaks equal documentCode ties by internal source identity across invoice and return pages', async () => {
    const order = await invoice({ code: 'SAME' });
    await returned(order.id, { returnCode: 'SAME' });
    const page1 = await read({ sortBy: 'documentCode', sortOrder: 'asc', pageSize: '1' });
    const page2 = await read({ sortBy: 'documentCode', sortOrder: 'asc', pageSize: '1', page: '2' });
    expect(page1.records[0].recordType).toBe('INVOICE');
    expect(page2.records[0].recordType).toBe('SALES_RETURN');
    expect((await read({ sortBy: 'documentCode', sortOrder: 'asc', pageSize: '1' })).records).toEqual(page1.records);
  });

  it('preserves unknown historical receiver rather than inferring the linked creator', async () => {
    const order = await invoice({ receivedByEmployeeId: null });
    await returned(order.id);
    const result = await read();
    expect(result.records.every((r: { receiverEmployeeId: number | null; receiverEmployeeName: string }) => r.receiverEmployeeId === null && r.receiverEmployeeName === 'Chưa xác định')).toBe(true);
    expect(result.filterOptions.receiverEmployeeId).toEqual([{ value: null, label: 'Chưa xác định' }]);
    expect((await read({ receiverEmployeeId: receiverId })).totalRows).toBe(0);
  });

  it.each(['occurredAt', 'documentCode', 'amount'])('sorts %s deterministically across pages and keeps summaries independent of pagination', async sortBy => {
    const first = await invoice({ code: 'A' });
    const second = await invoice({ code: 'B' });
    await returned(first.id, { returnCode: 'C', totalRefundDue: 103 });
    const ascending = await read({ sortBy, sortOrder: 'asc', pageSize: '1' });
    const page2 = await read({ sortBy, sortOrder: 'asc', pageSize: '1', page: '2' });
    const page3 = await read({ sortBy, sortOrder: 'asc', pageSize: '1', page: '3' });
    expect(new Set([ascending.records[0].documentCode, page2.records[0].documentCode, page3.records[0].documentCode]).size).toBe(3);
    expect(ascending.summary).toEqual(page3.summary);
    expect(ascending.summary).toMatchObject({ completedInvoiceCount: 2, grossInvoiceValue: 206, salesReturnValue: 103, netInvoiceValue: 103 });
    expect(ascending.totalRows).toBe(3);
    if (sortBy === 'amount') expect(ascending.records[0].recordType).toBe('SALES_RETURN');
    else expect(ascending.records[0].orderId).toBe(first.id);
    if (sortBy === 'occurredAt') expect(page2.records[0].orderId).toBe(second.id);
    const descending = await read({ sortBy, sortOrder: 'desc' });
    if (sortBy === 'documentCode') expect(descending.records.map((r: { documentCode: string }) => r.documentCode)).toEqual(['C', 'B', 'A']);
    if (sortBy === 'amount') expect(descending.records.map((r: { amount: number }) => r.amount)).toEqual([103, 103, -103]);
    expect((await read({ page: '10' })).records).toEqual([]);
  });

  it('returns zero aggregates for an empty dataset and preserves record counts when net is zero', async () => {
    const empty = await read();
    expect(empty.totalRows).toBe(0);
    expect(empty.records).toEqual([]);
    expect(empty.summary).toMatchObject({ completedInvoiceCount: 0, grossInvoiceValue: 0, salesReturnValue: 0, netInvoiceValue: 0 });
    const order = await invoice(); await returned(order.id, { totalRefundDue: 103 });
    const zero = await read();
    expect(zero.totalRows).toBe(2);
    expect(zero.summary.netInvoiceValue).toBe(0);
  });
});
