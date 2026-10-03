import { Prisma, InventoryTransactionType } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseEndOfDayQuery } from '../../src/modules/reports/end-of-day/end-of-day.schemas';
import { GoodsReportAdapter } from '../../src/modules/reports/end-of-day/goods.adapter';
import { prismaTest, truncateAllTables } from '../helpers/database';

const from = new Date('2026-10-02T17:00:00Z');
const to = new Date('2026-10-03T17:00:00Z');
const middle = new Date('2026-10-03T05:00:00Z');

describe('End-of-day Goods adapter', () => {
  let creator: number;
  let actor: number;
  let menu: number;
  let ingredient: number;
  let sequence = 0;
  beforeEach(async () => {
    await truncateAllTables();
    creator = (await prismaTest.user.create({ data: { username: 'goods-creator', name: 'Creator', role: 'ADMIN', passwordHash: 'hash' } })).id;
    actor = (await prismaTest.user.create({ data: { username: 'goods-actor', name: 'Actor', role: 'ADMIN', passwordHash: 'hash' } })).id;
    const category = await prismaTest.category.create({ data: { name: 'Goods' } });
    menu = (await prismaTest.menuItem.create({ data: { categoryId: category.id, sku: 'M_%', name: 'Dish', basePrice: 100 } })).id;
    ingredient = (await prismaTest.ingredient.create({ data: { sku: 'ING', name: 'Ingredient', unit: 'gram', costPerUnit: 10 } })).id;
    sequence = 0;
  }, 60000);
  function sale(data: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
    return prismaTest.order.create({ data: { code: `G-${++sequence}`, status: 'COMPLETED', orderType: 'TAKE_AWAY', completedAt: middle,
      createdAt: new Date('2026-09-01T00:00:00Z'), createdByUserId: creator, totalAmount: 230, vatAmount: 0, finalAmount: 230,
      items: { create: { menuItemId: menu, quantity: 2, unitPrice: 100, subtotal: 230 } }, ...data } });
  }
  function event(type: InventoryTransactionType, quantity: number, costAmount: number, data: Partial<Prisma.InventoryTransactionUncheckedCreateInput> = {}) {
    return prismaTest.inventoryTransaction.create({ data: { ingredientId: ingredient, type, quantity, costAmount, createdAt: middle, createdByUserId: actor, ...data } });
  }
  function read(filters: Record<string, unknown> = {}) {
    return prismaTest.$transaction(tx => GoodsReportAdapter.read(tx, parseEndOfDayQuery({ date: '2026-10-03', concern: 'GOODS', ...filters })), { isolationLevel: 'RepeatableRead', timeout: 30000 });
  }
  it('uses completedAt for completed sale items and createdAt for inventory with half-open bounds', async () => {
    const included = await sale({ completedAt: from });
    await sale({ completedAt: to, createdAt: middle });
    await sale({ completedAt: new Date(from.getTime() - 1), createdAt: middle });
    await sale({ status: 'PENDING', completedAt: middle });
    await sale({ completedAt: null, createdAt: middle });
    const ledger = await event('AUTO_DEDUCT', -10, 100, { createdAt: from, orderId: included.id });
    await event('AUTO_DEDUCT', -20, 200, { createdAt: to });
    await event('AUTO_DEDUCT', -30, 300, { createdAt: new Date(from.getTime() - 1) });
    const result = await read();
    expect(result.totalRows).toBe(2);
    expect(result.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordType: 'SALE_ITEM', orderId: included.id, occurredAt: from.toISOString(), quantity: 2, amount: 230 }),
      expect.objectContaining({ recordType: 'INVENTORY_EVENT', inventoryTransactionId: ledger.id, occurredAt: from.toISOString(), quantity: -10 })
    ]));
    expect(result.summary).toMatchObject({ saleItemCount: 1, soldMenuItemQuantity: 2, inventoryEventCount: 1, netSalesCogs: 100 });
  });
  it('maps all seven types, preserves signed quantities and stored costs, and separates units and waste from COGS', async () => {
    await sale();
    const cases = [
      ['STOCK_IN', 100, 1000, 1000], ['PURCHASE_RETURN', -10, 100, -100],
      ['AUTO_DEDUCT', -20, -200, -200], ['KITCHEN_WASTE', -3, 30, -30],
      ['MANUAL_ADJUST', -2, 20, -20], ['VOID_RESTORE', 5, -50, 50], ['SALES_RETURN', 4, 40, 40]
    ] as const;
    for (const [type, quantity, cost] of cases) await event(type, quantity, cost);
    await event('MANUAL_ADJUST', 1, -10);
    const ml = await prismaTest.ingredient.create({ data: { sku: 'ML', name: 'Milk', unit: 'ml' } });
    await event('STOCK_IN', 500, 500, { ingredientId: ml.id });
    const result = await read({ pageSize: 1 });
    expect(result.totalRows).toBe(10);
    expect(result.summary).toMatchObject({ soldMenuItemQuantity: 2, saleItemAmount: 230, netSalesCogs: 160, salesReturnCost: 40, kitchenWasteCost: 30, manualAdjustmentCost: -10 });
    expect(result.summary.inventoryQuantityByUnit).toEqual([{ unit: 'gram', quantity: 75 }, { unit: 'ml', quantity: 500 }]);
    expect(result.summary).not.toHaveProperty('quantity');
    const rows = (await read({ recordTypes: 'INVENTORY_EVENT', sortBy: 'occurredAt', sortOrder: 'asc' })).records;
    for (const [type, quantity, costAmount, signedCostAmount] of cases) expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ inventoryType: type, quantity, costAmount, signedCostAmount, unit: 'gram', quantityKind: 'INGREDIENT' })]));
    expect((await read({ recordTypes: 'SALE_ITEM' })).records[0]).toMatchObject({ unit: 'portion', quantityKind: 'MENU_ITEM', costAmount: null, signedCostAmount: null });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it.each(['SALE_ITEM', 'INVENTORY_EVENT', 'STOCK_IN', 'PURCHASE_RETURN', 'AUTO_DEDUCT', 'KITCHEN_WASTE', 'MANUAL_ADJUST', 'VOID_RESTORE', 'SALES_RETURN'])('narrows recordTypes=%s consistently and self-excludes that facet', async type => {
    await sale();
    for (const kind of Object.values(InventoryTransactionType)) await event(kind, kind === 'MANUAL_ADJUST' ? -1 : 1, 10);
    const result = await read({ recordTypes: type, pageSize: 1 });
    expect(result.totalRows).toBe(type === 'INVENTORY_EVENT' ? 7 : 1);
    expect(result.summary.saleItemCount).toBe(type === 'SALE_ITEM' ? 1 : 0);
    expect(result.summary.inventoryEventCount).toBe(type === 'INVENTORY_EVENT' ? 7 : type === 'SALE_ITEM' ? 0 : 1);
    expect(result.filterOptions.recordTypes?.map(o => o.value).sort()).toEqual(['SALE_ITEM', 'INVENTORY_EVENT', ...Object.values(InventoryTransactionType)].sort());
  });
  it('uses the order creator for sales but actual inventory actor for ledger and retains other filters in facets', async () => {
    const order = await sale();
    await sale({ createdByUserId: actor });
    await event('AUTO_DEDUCT', -2, 20, { orderId: order.id });
    await event('STOCK_IN', 3, 30, { createdByUserId: creator });
    const result = await read({ creatorUserId: creator, pageSize: 1 });
    expect(result.totalRows).toBe(2);
    expect(result.summary).toMatchObject({ soldMenuItemQuantity: 2, netSalesCogs: 0, stockInCost: 30 });
    expect(result.filterOptions.creatorUserId?.map(o => o.value)).toEqual([creator, actor]);
    const inventory = await read({ creatorUserId: creator, recordTypes: 'AUTO_DEDUCT' });
    expect(inventory.totalRows).toBe(0);
    expect(inventory.filterOptions.creatorUserId?.map(o => o.value)).toEqual([actor]);
    expect(inventory.filterOptions.recordTypes?.map(o => o.value).sort()).toEqual(['SALE_ITEM', 'INVENTORY_EVENT', 'STOCK_IN'].sort());
  });
  it('searches literal wildcard and quote text without interpolating SQL', async () => {
    await sale(); await sale({ code: "Q_'%" });
    await event('STOCK_IN', 1, 10, { note: "Q_'%" }); await event('STOCK_IN', 2, 20, { note: 'Q-other' });
    expect((await read({ search: "Q_'%" })).totalRows).toBe(2);
    expect((await read({ search: "' OR 1=1 --" })).totalRows).toBe(0);
    expect((await read({ search: 'M_%' })).totalRows).toBe(2);
  });
  it.each(['occurredAt', 'recordType', 'quantity', 'amount'])('sorts %s with stable identities across pages and keeps full aggregates', async sortBy => {
    await sale(); await sale(); await event('AUTO_DEDUCT', -2, 20);
    const pages = await Promise.all([1, 2, 3].map(page => read({ sortBy, sortOrder: 'asc', pageSize: 1, page })));
    expect(new Set(pages.map(p => p.records[0].rowKey)).size).toBe(3);
    expect(pages[0].summary).toEqual(pages[2].summary);
    expect(pages[0].totalRows).toBe(3);
    expect((await read({ sortBy, sortOrder: 'asc', pageSize: 1 })).records).toEqual(pages[0].records);
    const desc = await read({ sortBy, sortOrder: 'desc' });
    if (sortBy === 'quantity') expect(desc.records.map(r => r.quantity)).toEqual([2, 2, -2]);
    if (sortBy === 'amount') expect(desc.records.map(r => r.amount)).toEqual([230, 230, -20]);
    expect((await read({ page: 10 })).records).toEqual([]);
  });
  it('returns zero summaries for empty data and retains rows when net COGS is zero', async () => {
    expect((await read()).summary).toMatchObject({ saleItemCount: 0, soldMenuItemQuantity: 0, netSalesCogs: 0, kitchenWasteCost: 0, inventoryQuantityByUnit: [] });
    await event('AUTO_DEDUCT', -1, 10); await event('SALES_RETURN', 1, 10);
    expect(await read()).toMatchObject({ totalRows: 2, summary: { netSalesCogs: 0 } });
  });
});
