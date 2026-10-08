import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prismaTest, truncateAllTables } from '../helpers/database';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { TablesService } from '../../src/modules/tables/tables.service';
import { ReservationsService } from '../../src/modules/reservations/reservations.service';

describe('Table visit lifecycle', () => {
  let staffId: number, menuItemId: number, tableId: number;
  const create = (quantity = 1, expectedTableSessionId?: string | null) => OrdersService.createOrder({
    orderType: 'DINE_IN', tableId, expectedTableSessionId, items: [{ menuItemId, quantity, selectedModifiers: [] }]
  }, staffId);
  beforeEach(async () => {
    await truncateAllTables();
    staffId = (await prismaTest.user.create({ data: { username: 'visit-cashier', name: 'Thu ngân', role: 'CASHIER', passwordHash: 'test' } })).id;
    const category = await prismaTest.category.create({ data: { name: 'Visit menu' } });
    menuItemId = (await prismaTest.menuItem.create({ data: { categoryId: category.id, sku: 'VISIT-MENU', name: 'Món thử', basePrice: 100000 } })).id;
    tableId = (await prismaTest.diningTable.create({ data: { tableNumber: 71, qrCodeToken: randomUUID() } })).id;
  });
  afterAll(async () => { await prismaTest.$disconnect(); });

  it('groups additional batches, clears the marker when cleaned, and isolates every table read in the next visit', async () => {
    const first = (await create()).order, second = (await create(2)).order;
    expect(first.tableSessionId).toBeTruthy(); expect(second.tableSessionId).toBe(first.tableSessionId);
    await prismaTest.order.updateMany({ where: { tableId }, data: { status: 'COMPLETED', paymentStatus: 'PAID' } });
    await TablesService.updateTableStatus(tableId, 'AVAILABLE');
    expect((await prismaTest.diningTable.findUniqueOrThrow({ where: { id: tableId } })).currentSessionId).toBeNull();
    const next = (await create()).order;
    expect(next.tableSessionId).not.toBe(first.tableSessionId);
    const table = await prismaTest.diningTable.findUniqueOrThrow({ where: { id: tableId } });
    const results = await Promise.all([TablesService.getTableById(tableId), TablesService.getTableByTableNumber(71), TablesService.getTableByQrToken(table.qrCodeToken)]);
    for (const result of results) expect((result.table as any).orders.map((order: { id: number }) => order.id)).toEqual([next.id]);
    expect((await TablesService.getAllTables()).tables[0].orders.map((order: { id: number }) => order.id)).toEqual([next.id]);
  });

  it('retains a paid/served batch of the current visit and an active batch older than 12 hours', async () => {
    const first = (await create()).order, second = (await create(2)).order;
    await prismaTest.order.update({ where: { id: first.id }, data: { paymentStatus: 'PAID', status: 'COMPLETED' } });
    await prismaTest.order.update({ where: { id: second.id }, data: { createdAt: new Date(Date.now() - 24 * 3600000) } });
    expect((await TablesService.getTableById(tableId)).table.orders.map((order: { id: number }) => order.id).sort()).toEqual([first.id, second.id].sort());
  });

  it('rejects cleaning for paid food still preparing and waiting bank declarations', async () => {
    const order = (await create()).order;
    for (const paymentStatus of ['PAID', 'WAITING_CONFIRMATION'] as const) {
      await prismaTest.order.update({ where: { id: order.id }, data: { paymentStatus, status: 'PREPARING' } });
      await expect(TablesService.updateTableStatus(tableId, 'AVAILABLE')).rejects.toMatchObject({ statusCode: 409 });
    }
  });

  it('rejects a stale observed marker without creating a new order', async () => {
    const old = (await create()).order;
    await prismaTest.order.update({ where: { id: old.id }, data: { status: 'COMPLETED', paymentStatus: 'PAID' } });
    await TablesService.updateTableStatus(tableId, 'AVAILABLE');
    const next = (await create(1, null)).order;
    await expect(create(1, old.tableSessionId)).rejects.toMatchObject({ statusCode: 409 });
    expect(await prismaTest.order.count({ where: { tableSessionId: next.tableSessionId } })).toBe(1);
  });

  it('assigns the same visit to concurrent first orders', async () => {
    const results = await Promise.all([create(), create()]);
    expect(results[0].order.tableSessionId).toBeTruthy();
    expect(results[1].order.tableSessionId).toBe(results[0].order.tableSessionId);
  });

  it('moves the whole current visit including paid batches while preserving old table history', async () => {
    const first = (await create()).order, second = (await create(2)).order;
    await prismaTest.order.update({ where: { id: first.id }, data: { paymentStatus: 'PAID', status: 'COMPLETED' } });
    const history = await prismaTest.order.create({ data: { code: 'OLD-HISTORY', tableId, tableSessionId: randomUUID(), status: 'COMPLETED', paymentStatus: 'PAID', totalAmount: 50000, vatAmount: 3704, finalAmount: 50000 } });
    const target = await prismaTest.diningTable.create({ data: { tableNumber: 72, qrCodeToken: randomUUID() } });
    await TablesService.transferTable(tableId, target.id, { id: staffId });
    expect((await TablesService.getTableById(tableId)).table.orders).toHaveLength(0);
    const moved = (await TablesService.getTableById(target.id)).table;
    expect(moved.currentSessionId).toBe(first.tableSessionId);
    expect((moved.orders as Array<{ id: number }>).map(order => order.id).sort()).toEqual([first.id, second.id].sort());
    expect((await prismaTest.order.findUniqueOrThrow({ where: { id: history.id } })).tableId).toBe(tableId);
  });

  it('starts a reservation visit at check-in and completes it when cleaned', async () => {
    const customer = await prismaTest.customer.create({ data: { code: 'VISIT-CUSTOMER', name: 'Khách thử', phone: '0900000000' } });
    const booking = await prismaTest.reservation.create({ data: { code: 'VISIT-BOOKING', accessToken: randomUUID() + randomUUID(), customerId: customer.id, scheduledAt: new Date(), partySize: 2, contactName: 'Khách thử', contactPhone: '0900000000', status: 'CONFIRMED', depositStatus: 'PAID' } });
    await ReservationsService.checkIn(booking.id, { tableId }, staffId, 'Thu ngân');
    const checked = await prismaTest.reservation.findUniqueOrThrow({ where: { id: booking.id } });
    expect(checked.tableSessionId).toBeTruthy();
    expect((await TablesService.getTableById(tableId)).table.status).toBe('OCCUPIED');
    const order = (await create()).order;
    expect(order.tableSessionId).toBe(checked.tableSessionId);
    await prismaTest.order.update({ where: { id: order.id }, data: { status: 'COMPLETED', paymentStatus: 'PAID' } });
    await TablesService.updateTableStatus(tableId, 'AVAILABLE');
    expect((await prismaTest.reservation.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('COMPLETED');
  });
});
