import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import * as socket from '../../src/lib/socket';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';

describe('atomic order cancellation history', () => {
  let categoryId: number;
  let actorId: number;
  let sequence = 0;
  const secondClient = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    categoryId = (await prismaTest.category.create({ data: { name: 'Cancellation tests' } })).id;
    actorId = (await prismaTest.user.create({ data: {
      username: 'cancellation-admin', passwordHash: 'fixture', name: 'Cancellation Admin', role: 'ADMIN'
    } })).id;
  }, 60000);
  afterEach(() => { vi.restoreAllMocks(); });
  afterAll(async () => { await Promise.all([prismaTest.$disconnect(), secondClient.$disconnect()]); });

  async function fixture(dineIn = false) {
    sequence += 1;
    const tracked = await prismaTest.menuItem.create({ data: {
      categoryId, sku: `VOID-${sequence}`, name: 'Tracked dish', basePrice: 10000, trackStock: true, stockQuantity: 10
    } });
    const untracked = await prismaTest.menuItem.create({ data: {
      categoryId, sku: `VOID-U-${sequence}`, name: 'Untracked dish', basePrice: 5000
    } });
    const table = dineIn ? await prismaTest.diningTable.create({ data: {
      tableNumber: 100 + sequence, qrCodeToken: `void-table-${sequence}`
    } }) : null;
    const result = await OrdersService.createOrder({
      orderType: table ? 'DINE_IN' : 'TAKE_AWAY', ...(table ? { tableId: table.id } : {}),
      items: [
        { menuItemId: tracked.id, quantity: 2, selectedModifiers: [] },
        { menuItemId: untracked.id, quantity: 1, selectedModifiers: [] }
      ]
    }, actorId);
    // The line snapshot must use stored subtotal, including modifiers, rather than recompute quantity * unit price.
    await prismaTest.orderItem.updateMany({ where: { orderId: result.order.id, menuItemId: tracked.id }, data: { subtotal: 23000 } });
    const order = await prismaTest.order.findUniqueOrThrow({
      where: { id: result.order.id }, include: { items: { include: { menuItem: true }, orderBy: { id: 'asc' } } }
    });
    vi.spyOn(socket, 'emitToAll').mockClear();
    vi.spyOn(socket, 'emitToRoom').mockClear();
    return { order, tracked, untracked, table };
  }

  function observeTransaction(observe: (tx: Prisma.TransactionClient, result: unknown) => Promise<void>) {
    const realTransaction = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, '$transaction').mockImplementation((async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) =>
      realTransaction(async (tx) => {
        const result = await callback(tx);
        await observe(tx, result);
        return result;
      }, options)) as typeof prisma.$transaction);
  }

  function failSecondCancellationInsert() {
    const realTransaction = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, '$transaction').mockImplementation((async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: object) =>
      realTransaction(async (tx) => {
        const realCreate = tx.orderItemCancellation.create.bind(tx.orderItemCancellation);
        let writes = 0;
        vi.spyOn(tx.orderItemCancellation, 'create').mockImplementation(((args: Parameters<typeof realCreate>[0]) => {
          writes += 1;
          if (writes === 2) throw new Error('injected cancellation persistence failure');
          return realCreate(args);
        }) as unknown as typeof realCreate);
        return callback(tx);
      }, options)) as typeof prisma.$transaction);
  }

  async function assertRollback(f: Awaited<ReturnType<typeof fixture>>) {
    const stored = await prismaTest.order.findUniqueOrThrow({ where: { id: f.order.id } });
    expect(stored.status).toBe('PENDING');
    expect(stored.paymentStatus).toBe('UNPAID');
    expect(stored.cancelledAt).toBeNull();
    expect(stored.voidReason).toBeNull();
    expect(stored.finalAmount).toBe(f.order.finalAmount);
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: f.tracked.id } })).stockQuantity).toBe(8);
    if (f.table) expect(await prismaTest.diningTable.findUniqueOrThrow({ where: { id: f.table.id } }))
      .toMatchObject({ status: 'OCCUPIED', currentOrderId: f.order.id });
    expect(await prismaTest.orderItemCancellation.count({ where: { orderId: f.order.id } })).toBe(0);
    expect(await prismaTest.auditLog.count({ where: { action: 'ORDER_VOIDED', targetId: f.order.id } })).toBe(0);
    expect(await prismaTest.inventoryTransaction.count({ where: { orderId: f.order.id } })).toBe(0);
    expect(vi.mocked(socket.emitToAll)).not.toHaveBeenCalled();
    expect(vi.mocked(socket.emitToRoom)).not.toHaveBeenCalled();
  }

  it('creates immutable snapshots for every line with stored amounts, actor and actual stock effect', async () => {
    const f = await fixture();
    await OrdersService.voidOrder(f.order.id, { reason: 'Customer left' }, actorId);
    const rows = await prismaTest.orderItemCancellation.findMany({ where: { orderId: f.order.id }, orderBy: { orderItemId: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      orderItemId: f.order.items[0].id, menuItemId: f.tracked.id, menuItemSku: f.tracked.sku,
      menuItemName: 'Tracked dish', quantity: 2, unitPrice: 10000, lineAmount: 23000,
      reason: 'Customer left', cancelledByUserId: actorId, orderStatusSnapshot: 'PENDING',
      preparationStateSnapshot: 'NOT_STARTED', inventoryEffect: 'RESTORED', inventoryWasteId: null,
      source: 'ORDER_VOID', sourceKey: `ORDER_VOID:${f.order.id}:${f.order.items[0].id}`
    });
    expect(rows[1]).toMatchObject({ menuItemName: 'Untracked dish', lineAmount: 5000, inventoryEffect: 'NONE' });
    const stored = await prismaTest.order.findUniqueOrThrow({ where: { id: f.order.id } });
    expect(rows.every(row => row.cancelledAt.getTime() === stored.cancelledAt!.getTime())).toBe(true);
    expect(stored.finalAmount).toBe(f.order.finalAmount);
    await prismaTest.menuItem.update({ where: { id: f.tracked.id }, data: { sku: `RENAMED-${sequence}`, name: 'Changed name', basePrice: 99999 } });
    await expect(OrdersService.voidOrder(f.order.id, { reason: 'Changed reason' }, actorId)).rejects.toMatchObject({ code: 'ORDER_STATE_INVALID' });
    expect(await prismaTest.orderItemCancellation.findMany({ where: { orderId: f.order.id }, orderBy: { orderItemId: 'asc' } })).toEqual(rows);
  });

  it.each(['PREPARING', 'READY'] as const)('snapshots order preparation state %s without inventing line-level KDS state', async status => {
    const f = await fixture();
    await OrdersService.updateOrderStatus(f.order.id, 'PREPARING');
    if (status === 'READY') await OrdersService.updateOrderStatus(f.order.id, 'READY');
    await OrdersService.voidOrder(f.order.id, { reason: 'Kitchen cancellation' }, actorId);
    const rows = await prismaTest.orderItemCancellation.findMany({ where: { orderId: f.order.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.orderStatusSnapshot === status && row.preparationStateSnapshot === status)).toBe(true);
  });

  it('rolls back order, table, stock, partial cancellation rows and audit with no notifications on persistence failure', async () => {
    const f = await fixture(true);
    failSecondCancellationInsert();
    await expect(OrdersService.voidOrder(f.order.id, { reason: 'Atomic failure' }, actorId)).rejects.toThrow('injected cancellation persistence failure');
    await assertRollback(f);
  });

  it.each(['manual', 'timeout'] as const)('%s rolls back cancellation history and all state when transactional audit persistence fails', async mode => {
    const f = await fixture(true);
    if (mode === 'timeout') await prismaTest.order.update({ where: { id: f.order.id }, data: { createdAt: new Date(Date.now() - 65 * 60000) } });
    vi.spyOn(AuditService, 'logInTransaction').mockRejectedValueOnce(new Error('injected audit failure'));
    if (mode === 'manual') await expect(OrdersService.voidOrder(f.order.id, { reason: 'Audit failure' }, actorId)).rejects.toThrow('injected audit failure');
    else {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect((await OrdersService.autoCancelExpiredOrders()).cancelledOrderIds).not.toContain(f.order.id);
    }
    await assertRollback(f);
    // Keep this rolled-back expired fixture out of subsequent scheduler runs.
    if (mode === 'timeout') await prismaTest.order.update({ where: { id: f.order.id }, data: { createdAt: new Date() } });
  });

  it.each(['manual', 'timeout'] as const)('%s emits inventory, menu, KDS, order and table events only after cancellation and audit commit', async mode => {
    const f = await fixture(true);
    if (mode === 'timeout') await prismaTest.order.update({ where: { id: f.order.id }, data: { createdAt: new Date(Date.now() - 65 * 60000) } });
    let checked = false;
    observeTransaction(async tx => {
      expect(await tx.orderItemCancellation.count({ where: { orderId: f.order.id } })).toBe(2);
      expect(await tx.auditLog.count({ where: { action: 'ORDER_VOIDED', targetId: f.order.id } })).toBe(1);
      await assertRollback(f);
      checked = true;
    });
    if (mode === 'manual') await OrdersService.voidOrder(f.order.id, { reason: 'Commit gate' }, actorId);
    else expect((await OrdersService.autoCancelExpiredOrders()).cancelledOrderIds).toContain(f.order.id);
    expect(checked).toBe(true);
    expect(vi.mocked(socket.emitToAll).mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      'inventory:changed', 'menu:stockChanged', 'order:statusChanged', 'table:statusChanged'
    ]));
    expect(vi.mocked(socket.emitToRoom)).toHaveBeenCalledWith('restaurant:kds', 'order:statusChanged', expect.objectContaining({ orderId: f.order.id, status: 'CANCELLED' }));
  });

  it('timeout cancellation uses a nullable system actor and the same atomic writer; failed writes stay pending and retry once', async () => {
    const f = await fixture(true);
    await prismaTest.order.update({ where: { id: f.order.id }, data: { createdAt: new Date(Date.now() - 65 * 60000) } });
    failSecondCancellationInsert();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await OrdersService.autoCancelExpiredOrders()).cancelledOrderIds).not.toContain(f.order.id);
    await assertRollback(f);
    expect(errors).toHaveBeenCalled();
    vi.restoreAllMocks();
    expect((await OrdersService.autoCancelExpiredOrders()).cancelledOrderIds).toContain(f.order.id);
    expect((await OrdersService.autoCancelExpiredOrders()).cancelledOrderIds).not.toContain(f.order.id);
    const rows = await prismaTest.orderItemCancellation.findMany({ where: { orderId: f.order.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.cancelledByUserId === null && row.reason === 'Quá thời gian: Hơn 1 giờ chưa cập nhật trạng thái' && row.source === 'ORDER_VOID')).toBe(true);
    expect(await prismaTest.auditLog.findMany({ where: { action: 'ORDER_VOIDED', targetId: f.order.id } }))
      .toEqual([expect.objectContaining({ actorId: null, actorName: null })]);
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: f.tracked.id } })).stockQuantity).toBe(10);
  });

  it('racing manual void requests leave one set of history, one audit and one stock restoration', async () => {
    const f = await fixture(true);
    const results = await Promise.allSettled([
      OrdersService.voidOrder(f.order.id, { reason: 'Race A' }, actorId),
      OrdersService.voidOrder(f.order.id, { reason: 'Race B' }, actorId)
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'ORDER_STATE_INVALID' } });
    expect(await prismaTest.orderItemCancellation.count({ where: { orderId: f.order.id } })).toBe(2);
    expect(await prismaTest.auditLog.count({ where: { action: 'ORDER_VOIDED', targetId: f.order.id } })).toBe(1);
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: f.tracked.id } })).stockQuantity).toBe(10);
    expect(vi.mocked(socket.emitToAll).mock.calls.filter(call => call[0] === 'order:statusChanged')).toHaveLength(1);
  });

  it('the unique source key makes concurrent writer retries append-only even with older read snapshots', async () => {
    const f = await fixture();
    const { recordOrderVoidCancellations } = await import('../../src/modules/orders/order-cancellation.service');
    const context = { reason: 'Original reason', cancelledAt: new Date('2026-10-03T01:00:00.000Z'), cancelledByUserId: actorId, restoredMenuItemIds: [f.tracked.id] };
    let arrived = 0;
    let release!: () => void;
    const bothRead = new Promise<void>(resolve => { release = resolve; });
    const write = (client: PrismaClient) => client.$transaction(async tx => {
      expect(await tx.orderItemCancellation.count({ where: { orderId: f.order.id } })).toBe(0);
      arrived += 1;
      if (arrived === 2) release();
      await bothRead;
      await recordOrderVoidCancellations(tx, f.order, context);
    });
    await Promise.all([write(prismaTest), write(secondClient)]);
    const original = await prismaTest.orderItemCancellation.findMany({ where: { orderId: f.order.id }, orderBy: { id: 'asc' } });
    expect(original).toHaveLength(2);
    await prismaTest.$transaction(tx => recordOrderVoidCancellations(tx, f.order, { ...context, reason: 'Retried reason', cancelledByUserId: null }));
    expect(await prismaTest.orderItemCancellation.findMany({ where: { orderId: f.order.id }, orderBy: { id: 'asc' } })).toEqual(original);
  });

  it('records the configured timeout in the cancellation reason and audit provenance', async () => {
    const f = await fixture();
    await prismaTest.order.update({ where: { id: f.order.id }, data: { createdAt: new Date(Date.now() - 31 * 60000) } });
    expect((await OrdersService.autoCancelExpiredOrders(30)).cancelledOrderIds).toContain(f.order.id);
    const rows = await prismaTest.orderItemCancellation.findMany({ where: { orderId: f.order.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.reason === 'Quá thời gian: Hơn 30 phút chưa cập nhật trạng thái')).toBe(true);
    expect(await prismaTest.auditLog.findFirstOrThrow({ where: { action: 'ORDER_VOIDED', targetId: f.order.id } }))
      .toMatchObject({ actorId: null, metadata: { source: 'ORDER_VOID', trigger: 'AUTO_CANCEL_TIMEOUT', timeoutMinutes: 30 } });
  });
});
