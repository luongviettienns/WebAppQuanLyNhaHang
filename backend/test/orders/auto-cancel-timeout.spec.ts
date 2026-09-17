import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { OrdersService } from '../../src/modules/orders/orders.service';

describe('Auto-Cancel Timeout Orders (Tier 2 Logic)', () => {
  let adminToken: string;

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);

    adminToken = jwt.sign(
      { sub: '1', username: 'admin', name: 'Admin', role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('automatically cancels PENDING orders older than 60 minutes with timeout reason', async () => {
    const table = await prismaTest.diningTable.findFirstOrThrow({ where: { tableNumber: 1 } });
    const burger = await prismaTest.menuItem.findFirstOrThrow({ where: { name: { contains: 'Burger' } } });

    // Create a PENDING order
    const created = await OrdersService.createOrder({
      orderType: 'DINE_IN',
      tableId: table.id,
      items: [{ menuItemId: burger.id, quantity: 1, selectedModifiers: [] }]
    });

    // Simulate created 65 minutes ago
    const pastDate = new Date(Date.now() - 65 * 60 * 1000);
    await prismaTest.order.update({
      where: { id: created.order.id },
      data: { createdAt: pastDate, updatedAt: pastDate }
    });

    // Run auto-cancel service
    const result = await OrdersService.autoCancelExpiredOrders(60);

    expect(result.cancelledCount).toBeGreaterThanOrEqual(1);
    expect(result.cancelledOrderIds).toContain(created.order.id);

    // Verify in DB
    const updated = await prismaTest.order.findUniqueOrThrow({ where: { id: created.order.id } });
    expect(updated.status).toBe('CANCELLED');
    expect(updated.paymentStatus).toBe('VOIDED');
    expect(updated.voidReason).toBe('Quá thời gian: Hơn 1 giờ chưa cập nhật trạng thái');
    expect(updated.cancelledAt).not.toBeNull();
    expect(updated.voidedAt).not.toBeNull();

    // Table should return to AVAILABLE because it has no other unpaid orders
    const updatedTable = await prismaTest.diningTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(updatedTable.status).toBe('AVAILABLE');
    expect(updatedTable.currentOrderId).toBeNull();
  });

  it('does NOT cancel PENDING orders created within 60 minutes', async () => {
    const table = await prismaTest.diningTable.findFirstOrThrow({ where: { tableNumber: 2 } });
    const burger = await prismaTest.menuItem.findFirstOrThrow({ where: { name: { contains: 'Burger' } } });

    const created = await OrdersService.createOrder({
      orderType: 'DINE_IN',
      tableId: table.id,
      items: [{ menuItemId: burger.id, quantity: 1, selectedModifiers: [] }]
    });

    // Simulate created 20 minutes ago
    const pastDate = new Date(Date.now() - 20 * 60 * 1000);
    await prismaTest.order.update({
      where: { id: created.order.id },
      data: { createdAt: pastDate, updatedAt: pastDate }
    });

    const result = await OrdersService.autoCancelExpiredOrders(60);
    expect(result.cancelledOrderIds).not.toContain(created.order.id);

    const orderInDb = await prismaTest.order.findUniqueOrThrow({ where: { id: created.order.id } });
    expect(orderInDb.status).toBe('PENDING');
  });

  it('does NOT cancel orders in PREPARING or READY status even if older than 60 minutes', async () => {
    const table = await prismaTest.diningTable.findFirstOrThrow({ where: { tableNumber: 3 } });
    const burger = await prismaTest.menuItem.findFirstOrThrow({ where: { name: { contains: 'Burger' } } });

    // Order 1: PREPARING
    const order1 = await OrdersService.createOrder({
      orderType: 'DINE_IN',
      tableId: table.id,
      items: [{ menuItemId: burger.id, quantity: 1, selectedModifiers: [] }]
    });
    await OrdersService.updateOrderStatus(order1.order.id, 'PREPARING');

    // Order 2: READY
    const order2 = await OrdersService.createOrder({
      orderType: 'TAKE_AWAY',
      items: [{ menuItemId: burger.id, quantity: 1, selectedModifiers: [] }]
    });
    await OrdersService.updateOrderStatus(order2.order.id, 'PREPARING');
    await OrdersService.updateOrderStatus(order2.order.id, 'READY');

    // Simulate created 70 minutes ago
    const pastDate = new Date(Date.now() - 70 * 60 * 1000);
    await prismaTest.order.update({
      where: { id: order1.order.id },
      data: { createdAt: pastDate, updatedAt: pastDate }
    });
    await prismaTest.order.update({
      where: { id: order2.order.id },
      data: { createdAt: pastDate, updatedAt: pastDate }
    });

    const result = await OrdersService.autoCancelExpiredOrders(60);
    expect(result.cancelledOrderIds).not.toContain(order1.order.id);
    expect(result.cancelledOrderIds).not.toContain(order2.order.id);

    const check1 = await prismaTest.order.findUniqueOrThrow({ where: { id: order1.order.id } });
    const check2 = await prismaTest.order.findUniqueOrThrow({ where: { id: order2.order.id } });
    expect(check1.status).toBe('PREPARING');
    expect(check2.status).toBe('READY');
  });

  it('keeps table OCCUPIED if there is another active unpaid order when one order is auto-cancelled', async () => {
    const table = await prismaTest.diningTable.findFirstOrThrow({ where: { tableNumber: 4 } });
    const burger = await prismaTest.menuItem.findFirstOrThrow({ where: { name: { contains: 'Burger' } } });

    // Order A: 65 mins old
    const orderA = await OrdersService.createOrder({
      orderType: 'DINE_IN',
      tableId: table.id,
      items: [{ menuItemId: burger.id, quantity: 1, selectedModifiers: [] }]
    });
    const pastDate = new Date(Date.now() - 65 * 60 * 1000);
    await prismaTest.order.update({
      where: { id: orderA.order.id },
      data: { createdAt: pastDate, updatedAt: pastDate }
    });

    // Order B: 5 mins old
    const orderB = await OrdersService.createOrder({
      orderType: 'DINE_IN',
      tableId: table.id,
      items: [{ menuItemId: burger.id, quantity: 1, selectedModifiers: [] }]
    });

    const result = await OrdersService.autoCancelExpiredOrders(60);
    expect(result.cancelledOrderIds).toContain(orderA.order.id);
    expect(result.cancelledOrderIds).not.toContain(orderB.order.id);

    // Table should remain OCCUPIED pointing to orderB
    const tableInDb = await prismaTest.diningTable.findUniqueOrThrow({ where: { id: table.id } });
    expect(tableInDb.status).toBe('OCCUPIED');
    expect(tableInDb.currentOrderId).toBe(orderB.order.id);
  });

  it('provides a POST /api/orders/auto-cancel-expired endpoint', async () => {
    const res = await request(app)
      .post('/api/orders/auto-cancel-expired')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.cancelledCount).toBe('number');
  });
});
