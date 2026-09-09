import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { OrdersService } from '../../src/modules/orders/orders.service';

describe('Table Operations & Audited Void (Task 11 - Module M6)', () => {
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);

    adminToken = jwt.sign(
      { sub: '1', username: 'admin', name: 'Admin', role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    cashierToken = jwt.sign(
      { sub: '2', username: 'cashier', name: 'Cashier', role: 'CASHIER' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    kitchenToken = jwt.sign(
      { sub: '3', username: 'kitchen', name: 'Kitchen', role: 'KITCHEN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  describe('PATCH /api/orders/:id/void (Audited Void by Admin)', () => {
    let orderToVoidId: number;
    let tableId: number;

    beforeAll(async () => {
      const table = await prismaTest.diningTable.findFirstOrThrow({ where: { tableNumber: 5 } });
      tableId = table.id;
      const burger = await prismaTest.menuItem.findFirstOrThrow({ where: { name: { contains: 'Burger' } } });

      const res = await OrdersService.createOrder({
        orderType: 'DINE_IN',
        tableId: table.id,
        items: [{ menuItemId: burger.id, quantity: 1, selectedModifiers: [] }]
      });
      orderToVoidId = res.order.id;
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVoidId}/void`)
        .send({ reason: 'Khách muốn hủy' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVoidId}/void`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Khách muốn hủy' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects KITCHEN role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVoidId}/void`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ reason: 'Khách muốn hủy' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects missing or empty reason with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVoidId}/void`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows ADMIN to void order, setting status CANCELLED, payment VOIDED, and returning table to AVAILABLE', async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVoidId}/void`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Khách đổi ý đi về' });

      expect(res.status).toBe(200);
      expect(res.body.data.order.status).toBe('CANCELLED');
      expect(res.body.data.order.paymentStatus).toBe('VOIDED');
      expect(res.body.data.order.voidReason).toBe('Khách đổi ý đi về');
      expect(res.body.data.order.voidedByUserId).toBe(1);

      // Verify table state is now AVAILABLE
      const tableRes = await request(app).get(`/api/tables/${tableId}`);
      expect(tableRes.body.data.table.status).toBe('AVAILABLE');
      expect(tableRes.body.data.table.currentOrderId).toBeNull();
    });

    it('forbids voiding an already CANCELLED order', async () => {
      const res = await request(app)
        .patch(`/api/orders/${orderToVoidId}/void`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Hủy lại lần nữa' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ORDER_STATE_INVALID');
    });
  });

  describe('PATCH /api/tables/:id/status (Table Transitions: AVAILABLE <-> DIRTY)', () => {
    let cleanTableId: number;

    beforeAll(async () => {
      const table = await prismaTest.diningTable.findFirstOrThrow({ where: { tableNumber: 8 } });
      cleanTableId = table.id;
    });

    it('allows CASHIER to mark an empty table as DIRTY', async () => {
      const res = await request(app)
        .patch(`/api/tables/${cleanTableId}/status`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ status: 'DIRTY' });

      expect(res.status).toBe(200);
      expect(res.body.data.table.status).toBe('DIRTY');
    });

    it('allows CASHIER to clean table, transitioning DIRTY -> AVAILABLE', async () => {
      const res = await request(app)
        .patch(`/api/tables/${cleanTableId}/status`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ status: 'AVAILABLE' });

      expect(res.status).toBe(200);
      expect(res.body.data.table.status).toBe('AVAILABLE');
    });
  });
});
