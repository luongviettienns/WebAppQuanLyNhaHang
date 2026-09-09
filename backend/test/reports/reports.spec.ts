import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Daily Reports & Analytics API (Task 13 - Module M7)', () => {
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

  describe('RBAC & Auth for GET /api/reports/daily', () => {
    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/reports/daily');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/reports/daily')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects KITCHEN role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/reports/daily')
        .set('Authorization', `Bearer ${kitchenToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects invalid date format with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/reports/daily?date=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Empty Day Zero-Safe Handling', () => {
    it('returns zero-safe default values when no orders exist on the date', async () => {
      const res = await request(app)
        .get('/api/reports/daily?date=2026-01-01')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.report).toBeDefined();
      expect(res.body.data.report.date).toBe('2026-01-01');
      expect(res.body.data.report.totalOrders).toBe(0);
      expect(res.body.data.report.completedOrders).toBe(0);
      expect(res.body.data.report.cancelledOrders).toBe(0);
      expect(res.body.data.report.totalRevenue).toBe(0);
      expect(res.body.data.report.averageOrderValue).toBe(0);
      expect(res.body.data.report.averagePrepTimeSec).toBe(0);
      expect(res.body.data.report.topSellers).toEqual([]);
    });
  });

  describe('Timezone Asia/Ho_Chi_Minh & Midnight Straddling', () => {
    const reportDate = '2026-08-15';

    beforeAll(async () => {
      const itemBurger = await prismaTest.menuItem.findFirstOrThrow({ where: { name: { contains: 'Burger' } } });
      const itemDrink = await prismaTest.menuItem.findFirstOrThrow({ where: { name: { contains: 'Pepsi' } } });

      // Order 1: 2026-08-14 23:59:50 VN (10s before midnight) -> Should NOT be in 2026-08-15
      await prismaTest.order.create({
        data: {
          code: 'CRISPY-20260814-0001',
          orderType: 'TAKE_AWAY',
          status: 'COMPLETED',
          totalAmount: 100000,
          vatAmount: 8000,
          finalAmount: 108000,
          paymentStatus: 'PAID',
          paidAt: new Date('2026-08-14T23:59:55+07:00'),
          createdAt: new Date('2026-08-14T23:59:50+07:00'),
          preparingAt: new Date('2026-08-14T23:59:51+07:00'),
          readyAt: new Date('2026-08-14T23:59:54+07:00'),
          completedAt: new Date('2026-08-14T23:59:55+07:00')
        }
      });

      // Order 2: 2026-08-15 00:00:10 VN (10s after midnight) -> IN 2026-08-15 (COMPLETED)
      // Prep time: 180s (3m)
      const order2 = await prismaTest.order.create({
        data: {
          code: 'CRISPY-20260815-0001',
          orderType: 'DINE_IN',
          status: 'COMPLETED',
          totalAmount: 100000,
          vatAmount: 8000,
          finalAmount: 108000,
          paymentStatus: 'PAID',
          paidAt: new Date('2026-08-15T00:05:00+07:00'),
          createdAt: new Date('2026-08-15T00:00:10+07:00'),
          preparingAt: new Date('2026-08-15T00:01:00+07:00'),
          readyAt: new Date('2026-08-15T00:04:00+07:00'), // 180s
          completedAt: new Date('2026-08-15T00:05:00+07:00')
        }
      });
      await prismaTest.orderItem.create({
        data: {
          orderId: order2.id,
          menuItemId: itemBurger.id,
          quantity: 2,
          unitPrice: 50000,
          subtotal: 100000
        }
      });

      // Order 3: 2026-08-15 12:30:00 VN -> IN 2026-08-15 (COMPLETED)
      // Prep time: 240s (4m)
      const order3 = await prismaTest.order.create({
        data: {
          code: 'CRISPY-20260815-0002',
          orderType: 'TAKE_AWAY',
          status: 'COMPLETED',
          totalAmount: 200000,
          vatAmount: 16000,
          finalAmount: 216000,
          paymentStatus: 'PAID',
          paidAt: new Date('2026-08-15T12:40:00+07:00'),
          createdAt: new Date('2026-08-15T12:30:00+07:00'),
          preparingAt: new Date('2026-08-15T12:31:00+07:00'),
          readyAt: new Date('2026-08-15T12:35:00+07:00'), // 240s
          completedAt: new Date('2026-08-15T12:40:00+07:00')
        }
      });
      await prismaTest.orderItem.createMany({
        data: [
          {
            orderId: order3.id,
            menuItemId: itemBurger.id,
            quantity: 3,
            unitPrice: 50000,
            subtotal: 150000
          },
          {
            orderId: order3.id,
            menuItemId: itemDrink.id,
            quantity: 2,
            unitPrice: 25000,
            subtotal: 50000
          }
        ]
      });

      // Order 4: 2026-08-15 14:00:00 VN -> IN 2026-08-15 (CANCELLED / VOIDED)
      // Must be excluded from revenue and prep time
      const order4 = await prismaTest.order.create({
        data: {
          code: 'CRISPY-20260815-0003',
          orderType: 'DINE_IN',
          status: 'CANCELLED',
          totalAmount: 150000,
          vatAmount: 12000,
          finalAmount: 162000,
          paymentStatus: 'VOIDED',
          voidReason: 'Khách đổi ý hủy đơn',
          createdAt: new Date('2026-08-15T14:00:00+07:00'),
          cancelledAt: new Date('2026-08-15T14:02:00+07:00')
        }
      });
      await prismaTest.orderItem.create({
        data: {
          orderId: order4.id,
          menuItemId: itemBurger.id,
          quantity: 3,
          unitPrice: 50000,
          subtotal: 150000
        }
      });

      // Order 5: 2026-08-15 15:00:00 VN -> IN 2026-08-15 (PENDING)
      // Must be excluded from revenue and prep time
      await prismaTest.order.create({
        data: {
          code: 'CRISPY-20260815-0004',
          orderType: 'DINE_IN',
          status: 'PENDING',
          totalAmount: 50000,
          vatAmount: 4000,
          finalAmount: 54000,
          paymentStatus: 'UNPAID',
          createdAt: new Date('2026-08-15T15:00:00+07:00')
        }
      });

      // Order 6: 2026-08-16 00:00:05 VN (Next day) -> Should NOT be in 2026-08-15
      await prismaTest.order.create({
        data: {
          code: 'CRISPY-20260816-0001',
          orderType: 'TAKE_AWAY',
          status: 'COMPLETED',
          totalAmount: 300000,
          vatAmount: 24000,
          finalAmount: 324000,
          paymentStatus: 'PAID',
          createdAt: new Date('2026-08-16T00:00:05+07:00'),
          completedAt: new Date('2026-08-16T00:10:00+07:00')
        }
      });
    });

    it('correctly filters orders in Asia/Ho_Chi_Minh and excludes cancelled/pending from revenue and SOS', async () => {
      const res = await request(app)
        .get(`/api/reports/daily?date=${reportDate}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const report = res.body.data.report;

      expect(report.date).toBe(reportDate);
      // Total orders created on 2026-08-15: Order 2, Order 3, Order 4, Order 5 = 4 orders
      expect(report.totalOrders).toBe(4);
      // Completed orders: Order 2, Order 3 = 2 orders
      expect(report.completedOrders).toBe(2);
      // Cancelled orders: Order 4 = 1 order
      expect(report.cancelledOrders).toBe(1);

      // Revenue: 108000 + 216000 = 324000 VND (finalAmount of completed orders)
      expect(report.totalRevenue).toBe(324000);

      // Average Order Value: 324000 / 2 = 162000 VND
      expect(report.averageOrderValue).toBe(162000);

      // Average Prep Time: (180 + 240) / 2 = 210 seconds
      expect(report.averagePrepTimeSec).toBe(210);

      // Top Sellers (from completed orders only):
      // Burger: 2 (order 2) + 3 (order 3) = 5 sold, revenue 250000
      // Drink: 2 (order 3) = 2 sold, revenue 50000
      expect(report.topSellers).toHaveLength(2);
      expect(report.topSellers[0].quantitySold).toBe(5);
      expect(report.topSellers[0].revenue).toBe(250000);
      expect(report.topSellers[1].quantitySold).toBe(2);
      expect(report.topSellers[1].revenue).toBe(50000);
    });

    it('defaults to today when date parameter is omitted and returns valid report structure', async () => {
      const res = await request(app)
        .get('/api/reports/daily')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.report).toBeDefined();
      expect(typeof res.body.data.report.date).toBe('string');
      expect(typeof res.body.data.report.totalRevenue).toBe('number');
    });
  });
});
