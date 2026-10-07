import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Profit & Loss Report API (P&L)', () => {
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

  describe('RBAC & Auth for GET /api/reports/profit-and-loss', () => {
    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/reports/profit-and-loss');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/reports/profit-and-loss')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects KITCHEN role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/reports/profit-and-loss')
        .set('Authorization', `Bearer ${kitchenToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects invalid date format with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/reports/profit-and-loss?date=bad-date-format')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Empty Range Zero-Safe Handling', () => {
    it('returns zero-safe default values when no orders or transactions exist', async () => {
      const res = await request(app)
        .get('/api/reports/profit-and-loss?date=2020-01-01')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data).toBeDefined();
      expect(data.revenue.grossSales).toBe(0);
      expect(data.revenue.discountAmount).toBe(0);
      expect(data.revenue.returnsAmount).toBe(0);
      expect(data.revenue.netRevenue).toBe(0);
      expect(data.revenue.orderCount).toBe(0);
      expect(data.cogs.salesCogs).toBe(0);
      expect(data.cogs.grossProfit).toBe(0);
      expect(data.cogs.grossProfitMargin).toBe(0);
      expect(data.operatingExpenses.kitchenWasteCost).toBe(0);
      expect(data.operatingExpenses.cashExpenses).toBe(0);
      expect(data.operatingExpenses.totalExpenses).toBe(0);
      expect(data.netProfit.operatingProfit).toBe(0);
      expect(data.netProfit.netProfitMargin).toBe(0);
    });
  });

  describe('Accurate P&L Math and Financial Breakdown', () => {
    const reportDate = '2026-09-20';

    beforeAll(async () => {
      const itemBurger = await prismaTest.menuItem.findFirstOrThrow({ where: { name: { contains: 'Burger' } } });
      const ingredient = await prismaTest.ingredient.findFirstOrThrow();
      const account = await prismaTest.financialAccount.findFirstOrThrow();
      const category = await prismaTest.cashFlowCategory.findFirstOrThrow({ where: { direction: 'PAYMENT' } });

      // 1. COMPLETED Order: gross 200,000, discount 20,000, vat 14,400, finalAmount 194,400
      const order = await prismaTest.order.create({
        data: {
          code: 'CRISPY-20260920-0001',
          orderType: 'DINE_IN',
          status: 'COMPLETED',
          totalAmount: 200000,
          discountAmount: 20000,
          vatAmount: 14400,
          finalAmount: 194400,
          paymentMethod: 'CASH',
          paymentStatus: 'PAID',
          paidAt: new Date('2026-09-20T11:30:00+07:00'),
          createdAt: new Date('2026-09-20T11:00:00+07:00'),
          completedAt: new Date('2026-09-20T11:35:00+07:00')
        }
      });
      await prismaTest.orderItem.create({
        data: {
          orderId: order.id,
          menuItemId: itemBurger.id,
          quantity: 2,
          unitPrice: 100000,
          subtotal: 200000
        }
      });

      // 2. Sales COGS InventoryTransaction (AUTO_DEDUCT) = 60,000 VND
      await prismaTest.inventoryTransaction.create({
        data: {
          ingredientId: ingredient.id,
          orderId: order.id,
          type: 'AUTO_DEDUCT',
          quantity: -2,
          costAmount: 60000,
          createdAt: new Date('2026-09-20T11:05:00+07:00')
        }
      });

      // 3. Kitchen Waste InventoryTransaction (KITCHEN_WASTE) = 15,000 VND
      await prismaTest.inventoryTransaction.create({
        data: {
          ingredientId: ingredient.id,
          type: 'KITCHEN_WASTE',
          quantity: -0.5,
          costAmount: 15000,
          createdAt: new Date('2026-09-20T14:00:00+07:00')
        }
      });

      // 4. Operating Expense CashVoucher (PAYMENT) = 25,000 VND
      await prismaTest.cashVoucher.create({
        data: {
          code: 'PC-20260920-001',
          sourceType: 'MANUAL',
          sourceKey: 'MANUAL:PC-20260920-001',
          direction: 'PAYMENT',
          amount: 25000,
          status: 'POSTED',
          affectsBusinessResult: true,
          account: { connect: { id: account.id } },
          category: { connect: { id: category.id } },
          createdBy: { connect: { id: 1 } },
          occurredAt: new Date('2026-09-20T15:00:00+07:00'),
          note: 'Mua văn phòng phẩm'
        }
      });
    });

    it('calculates gross revenue, discounts, cogs, operating expenses and net profit correctly', async () => {
      const res = await request(app)
        .get(`/api/reports/profit-and-loss?date=${reportDate}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Net revenue = 194,400 (finalAmount)
      expect(data.revenue.grossSales).toBe(200000);
      expect(data.revenue.discountAmount).toBe(20000);
      expect(data.revenue.netRevenue).toBe(194400);
      expect(data.revenue.orderCount).toBe(1);

      // COGS = 60,000 VND
      expect(data.cogs.salesCogs).toBe(60000);
      // Gross profit = 194,400 - 60,000 = 134,400 VND
      expect(data.cogs.grossProfit).toBe(134400);
      // Gross margin = (134400 / 194400) * 100 ~ 69.1%
      expect(data.cogs.grossProfitMargin).toBeCloseTo(69.1, 1);

      // Expenses: Waste 15,000 + Cash 25,000 = 40,000 VND
      expect(data.operatingExpenses.kitchenWasteCost).toBe(15000);
      expect(data.operatingExpenses.cashExpenses).toBe(25000);
      expect(data.operatingExpenses.totalExpenses).toBe(40000);

      // Net Operating Profit = 134,400 - 40,000 = 94,400 VND
      expect(data.netProfit.operatingProfit).toBe(94400);
      // Net margin = (94400 / 194400) * 100 ~ 48.6%
      expect(data.netProfit.netProfitMargin).toBeCloseTo(48.6, 1);

      // Breakdown check
      expect(data.revenueByPaymentMethod.cash).toBe(194400);
      expect(data.expenseBreakdownByCategory.length).toBeGreaterThanOrEqual(1);
    });
  });
});
