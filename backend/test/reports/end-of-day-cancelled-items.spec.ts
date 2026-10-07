import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseEndOfDayQuery } from '../../src/modules/reports/end-of-day/end-of-day.schemas';
import { CancelledItemsReportAdapter } from '../../src/modules/reports/end-of-day/cancelled-items.adapter';
import { prismaTest, truncateAllTables } from '../helpers/database';

const from = new Date('2026-10-02T17:00:00Z');
const to = new Date('2026-10-03T17:00:00Z');
const middle = new Date('2026-10-03T05:00:00Z');
describe('End-of-day Cancelled Items adapter', () => {
  let creator: number; let actor: number; let receiver: number; let otherReceiver: number;
  let menu: number; let table: number; let otherTable: number; let area: number; let otherArea: number; let sequence = 0;
  beforeEach(async () => {
    await truncateAllTables();
    creator = (await prismaTest.user.create({ data: { username: 'cancel-creator', name: 'Creator', role: 'ADMIN', passwordHash: 'hash' } })).id;
    actor = (await prismaTest.user.create({ data: { username: 'cancel-actor', name: 'Canceller', role: 'ADMIN', passwordHash: 'hash' } })).id;
    receiver = (await prismaTest.employee.create({ data: { code: 'E1', attendanceCode: 'E1', name: 'Receiver', phone: '1', userId: creator } })).id;
    otherReceiver = (await prismaTest.employee.create({ data: { code: 'E2', attendanceCode: 'E2', name: 'Other', phone: '2' } })).id;
    area = (await prismaTest.tableArea.create({ data: { name: 'Area' } })).id;
    otherArea = (await prismaTest.tableArea.create({ data: { name: 'Other area' } })).id;
    table = (await prismaTest.diningTable.create({ data: { tableNumber: 1, areaId: area, qrCodeToken: 'T1' } })).id;
    otherTable = (await prismaTest.diningTable.create({ data: { tableNumber: 2, areaId: otherArea, qrCodeToken: 'T2' } })).id;
    const category = await prismaTest.category.create({ data: { name: 'Cancellation' } });
    menu = (await prismaTest.menuItem.create({ data: { categoryId: category.id, sku: 'CURRENT', name: 'Mutable name', basePrice: 999 } })).id;
    sequence = 0;
  }, 60000);
  function order(data: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
    return prismaTest.order.create({ data: { code: `C-${++sequence}`, status: 'CANCELLED', orderType: 'DINE_IN', cancelledAt: middle, completedAt: null,
      createdAt: new Date('2026-09-01T00:00:00Z'), createdByUserId: creator, receivedByEmployeeId: receiver, tableId: table,
      totalAmount: 230, vatAmount: 0, finalAmount: 230, voidReason: 'Legacy reason', items: { create: [{ menuItemId: menu, quantity: 2, unitPrice: 100, subtotal: 230 }, { menuItemId: menu, quantity: 1, unitPrice: 50, subtotal: 50 }] }, ...data }, include: { items: true } });
  }
  async function cancellation(o: Awaited<ReturnType<typeof order>>, data: Partial<Prisma.OrderItemCancellationUncheckedCreateInput> = {}) {
    return prismaTest.orderItemCancellation.create({ data: { orderId: o.id, orderItemId: o.items[0].id, menuItemId: menu, menuItemSku: 'SNAP_%', menuItemName: 'Snapshot name', quantity: 3, unitPrice: 100, lineAmount: 345,
      reason: 'Snapshot reason', cancelledAt: middle, cancelledByUserId: actor, orderStatusSnapshot: 'PREPARING', preparationStateSnapshot: 'PREPARING', inventoryEffect: 'RESTORED', source: 'ORDER_VOID', sourceKey: `ORDER_VOID:${o.id}:${o.items[0].id}`, ...data } });
  }
  function read(filters: Record<string, unknown> = {}) {
    return prismaTest.$transaction(tx => CancelledItemsReportAdapter.read(tx, parseEndOfDayQuery({ date: '2026-10-03', concern: 'CANCELLED_ITEMS', ...filters })), { isolationLevel: 'RepeatableRead', timeout: 30000 });
  }
  it('selects ledger snapshots by cancelledAt including from excluding to independent of order status and timestamps', async () => {
    const o = await order({ status: 'COMPLETED', completedAt: to, cancelledAt: to });
    const c = await cancellation(o, { cancelledAt: from, source: 'ITEM_CANCEL' });
    await cancellation(await order(), { cancelledAt: to });
    await cancellation(await order(), { cancelledAt: new Date(from.getTime() - 1) });
    await prismaTest.menuItem.update({ where: { id: menu }, data: { sku: 'RENAMED', name: 'Renamed' } });
    await prismaTest.orderItem.update({ where: { id: o.items[0].id }, data: { quantity: 99, subtotal: 9999 } });
    const result = await read();
    expect(result.totalRows).toBe(1);
    expect(result.records[0]).toMatchObject({ cancellationId: c.id, source: 'ITEM_CANCEL', occurredAt: from.toISOString(), menuItemSku: 'SNAP_%', menuItemName: 'Snapshot name', quantity: 3, unitPrice: 100, lineAmount: 345, reason: 'Snapshot reason', orderStatusSnapshot: 'PREPARING', preparationStateSnapshot: 'PREPARING', inventoryEffect: 'RESTORED', dataQuality: 'RECORDED' });
    expect(result.summary).toMatchObject({ cancelledOrderCount: 1, cancelledItemCount: 1, cancelledQuantity: 3, unrecognizedLineAmount: 345, historicalFallbackRows: 0 });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it('emits exactly one descriptive fallback per legacy item by cancelledAt and never fabricates actor or inventory effects', async () => {
    const o = await order({ cancelledAt: from, receivedByEmployeeId: null });
    await order({ cancelledAt: to, createdAt: middle });
    await order({ cancelledAt: new Date(from.getTime() - 1), createdAt: middle });
    await order({ cancelledAt: null }); await order({ status: 'PENDING' });
    const result = await read();
    expect(result.totalRows).toBe(2);
    expect(result.records.map(r => r.orderItemId).sort()).toEqual(o.items.map(i => i.id).sort());
    for (const row of result.records) expect(row).toMatchObject({ source: 'LEGACY_ORDER_VOID', dataQuality: 'HISTORICAL_FALLBACK', occurredAt: from.toISOString(), cancelledByUserId: null, preparationStateSnapshot: 'UNKNOWN', orderStatusSnapshot: null, inventoryEffect: null, receiverEmployeeId: null, receiverEmployeeName: 'Chưa xác định' });
    expect(result.filterOptions.receiverEmployeeId).toEqual([{ value: null, label: 'Chưa xác định' }]);
    expect(result.summary).toMatchObject({ cancelledOrderCount: 1, cancelledItemCount: 2, cancelledQuantity: 3, unrecognizedLineAmount: 280, historicalFallbackRows: 2 });
  });
  it('suppresses all fallback for an order with even one ledger row outside the window or active reason filter', async () => {
    await cancellation(await order(), { cancelledAt: to });
    await cancellation(await order(), { reason: 'Excluded' });
    const result = await read({ cancelReason: 'Legacy reason' });
    expect(result.totalRows).toBe(0);
    expect((await read()).totalRows).toBe(1);
  });
  it('separates creator from canceller and preserves unknown receivers without inferring creator', async () => {
    const o = await order({ receivedByEmployeeId: null }); await cancellation(o);
    const result = await read({ creatorUserId: creator });
    expect(result.totalRows).toBe(1);
    expect(result.records[0]).toMatchObject({ creatorUserId: creator, cancelledByUserId: actor, cancelledByUserName: 'Canceller', receiverEmployeeId: null, receiverEmployeeName: 'Chưa xác định' });
    expect((await read({ creatorUserId: actor })).totalRows).toBe(0);
    expect((await read({ receiverEmployeeId: receiver })).totalRows).toBe(0);
    expect(result.summary.byCancelledByUser).toEqual([{ cancelledByUserId: actor, label: 'Canceller', rowCount: 1, quantity: 3, lineAmount: 345 }]);
  });
  it('does not subtract revenue or mutate finalAmount for cancelled-before-completion orders', async () => {
    const modern = await order(); await cancellation(modern);
    const legacy = await order();
    const before = await prismaTest.order.findMany({ select: { id: true, finalAmount: true, status: true, completedAt: true } });
    const snapshots = await prismaTest.orderItemCancellation.findMany();
    const result = await read();
    expect(result.summary.unrecognizedLineAmount).toBe(625);
    expect(result.summary).not.toHaveProperty('netInvoiceValue');
    expect(result.summary).not.toHaveProperty('revenueAdjustment');
    expect(await prismaTest.order.findMany({ select: { id: true, finalAmount: true, status: true, completedAt: true } })).toEqual(before);
    expect(await prismaTest.orderItemCancellation.findMany()).toEqual(snapshots);
    expect(result.records.filter(r => r.orderId === legacy.id)).toHaveLength(2);
  });
  it.each(['receiverEmployeeId', 'creatorUserId', 'delivery', 'areaId', 'tableId', 'cancelReason', 'search'] as const)('applies %s to both sources, full summary/count/pages and self-excluding facets', async dimension => {
    const changes: Record<string, Partial<Prisma.OrderUncheckedCreateInput>> = { receiverEmployeeId: { receivedByEmployeeId: otherReceiver }, creatorUserId: { createdByUserId: actor }, delivery: { orderType: 'DELIVERY' }, areaId: { tableId: otherTable }, tableId: { tableId: otherTable }, cancelReason: { voidReason: 'Other reason' }, search: { code: 'OTHER' } };
    await cancellation(await order({ code: 'MATCH' }), { reason: 'Legacy reason' });
    await order({ code: 'MATCH-LEGACY' });
    const excluded = await order(changes[dimension]);
    await cancellation(excluded, { reason: dimension === 'cancelReason' ? 'Other reason' : 'Legacy reason' });
    await order({ ...changes[dimension], ...(dimension === 'search' ? { code: 'OTHER-LEGACY' } : {}) });
    const values = { receiverEmployeeId: receiver, creatorUserId: creator, delivery: false, areaId: area, tableId: table, cancelReason: 'Legacy reason', search: 'MATCH' };
    const result = await read({ [dimension]: values[dimension], pageSize: 1 });
    expect(result.totalRows).toBe(3);
    expect(result.summary).toMatchObject({ cancelledOrderCount: 2, cancelledItemCount: 3, cancelledQuantity: 6, unrecognizedLineAmount: 625, historicalFallbackRows: 2 });
    expect(result.records).toHaveLength(1);
    if (dimension !== 'search') expect(result.filterOptions[dimension]).toHaveLength(2);
  });
  it('facet self-exclusion retains other filters, while reason and search are literal parameterized text', async () => {
    await cancellation(await order(), { reason: "R_'%" });
    await cancellation(await order(), { reason: 'Other reason' });
    await cancellation(await order({ receivedByEmployeeId: otherReceiver }), { reason: 'Other receiver' });
    const result = await read({ receiverEmployeeId: receiver, cancelReason: "R_'%", search: 'SNAP_%' });
    expect(result.totalRows).toBe(1);
    expect(result.filterOptions.cancelReason?.map(o => o.value).sort()).toEqual(['Other reason', "R_'%"].sort());
    expect(result.filterOptions.receiverEmployeeId?.map(o => o.value)).toEqual([receiver]);
    expect((await read({ search: "' OR 1=1 --" })).totalRows).toBe(0);
  });
  it('keeps every stored preparation, inventory and status value truthful in rows and breakdowns', async () => {
    for (const [status, preparation, effect] of [['PENDING', 'NOT_STARTED', 'NONE'], ['PREPARING', 'PREPARING', 'RESTORED'], ['READY', 'READY', 'WASTE_RECORDED'], ['COMPLETED', 'UNKNOWN', 'NONE']] as const) await cancellation(await order(), { orderStatusSnapshot: status, preparationStateSnapshot: preparation, inventoryEffect: effect });
    const result = await read();
    expect(result.records.map(r => r.preparationStateSnapshot).sort()).toEqual(['NOT_STARTED', 'PREPARING', 'READY', 'UNKNOWN']);
    expect(result.summary.byInventoryEffect).toEqual(expect.arrayContaining([expect.objectContaining({ value: 'RESTORED', rowCount: 1 }), expect.objectContaining({ value: 'WASTE_RECORDED', rowCount: 1 }), expect.objectContaining({ value: 'NONE', rowCount: 2 })]));
    expect(result.records.every(r => r.inventoryWasteId === null)).toBe(true);
    expect(result.summary.unrecognizedLineAmount).toBe(1035);
  });
  it('maps only stored legacy actor/reason and distinguishes unknown reason without invention', async () => {
    await order({ voidedByUserId: actor, voidReason: null });
    const result = await read({ creatorUserId: creator });
    expect(result.records.every(r => r.cancelledByUserId === actor && r.reason === null)).toBe(true);
    expect(result.filterOptions.cancelReason).toEqual([{ value: null, label: 'Chưa xác định' }]);
    expect(result.summary.byCancelledByUser).toEqual([{ cancelledByUserId: actor, label: 'Canceller', rowCount: 2, quantity: 3, lineAmount: 280 }]);
  });
  it.each(['occurredAt', 'menuItemName', 'quantity', 'lineAmount'])('sorts %s with unique stable keys across both sources and full summaries', async sortBy => {
    await cancellation(await order()); await order();
    const pages = await Promise.all([1, 2, 3].map(page => read({ sortBy, sortOrder: 'asc', pageSize: 1, page })));
    expect(new Set(pages.map(p => p.records[0].rowKey)).size).toBe(3);
    expect(pages[0].summary).toEqual(pages[2].summary);
    expect(pages[0].totalRows).toBe(3);
    expect((await read({ sortBy, sortOrder: 'asc', pageSize: 1 })).records).toEqual(pages[0].records);
    if (sortBy === 'quantity') expect((await read({ sortBy, sortOrder: 'desc' })).records.map(r => r.quantity)).toEqual([3, 2, 1]);
    if (sortBy === 'lineAmount') expect((await read({ sortBy, sortOrder: 'desc' })).records.map(r => r.lineAmount)).toEqual([345, 230, 50]);
    expect((await read({ page: 10 })).records).toEqual([]);
  });
  it('returns zero totals and empty breakdowns for an empty dataset', async () => {
    expect(await read()).toMatchObject({ totalRows: 0, records: [], summary: { cancelledOrderCount: 0, cancelledItemCount: 0, cancelledQuantity: 0, unrecognizedLineAmount: 0, historicalFallbackRows: 0, byReason: [], byCancelledByUser: [] } });
  });
});
