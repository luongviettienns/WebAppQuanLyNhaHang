import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Inventory Balance Report API (X-N-T Kho Nguyên Liệu)', () => {
  let adminToken: string;
  let cashierToken: string;

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
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  describe('RBAC & Auth for GET /api/reports/inventory-balance', () => {
    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/reports/inventory-balance');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/reports/inventory-balance')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('accepts ADMIN role and returns inventory balance structure', async () => {
      const res = await request(app)
        .get('/api/reports/inventory-balance')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  describe('Inventory In-Out-Stock Accounting Calculations', () => {
    const reportDate = '2026-09-25';
    let testIngredientId: number;

    beforeAll(async () => {
      // Create a dedicated ingredient for testing calculations
      const ingredient = await prismaTest.ingredient.create({
        data: {
          sku: 'ING-TEST-REPORT',
          name: 'Bột mì chuyên dụng làm bánh',
          unit: 'kg',
          costPerUnit: 20000,
          currentStock: 100,
          minThreshold: 15,
          isActive: true
        }
      });
      testIngredientId = ingredient.id;

      // 1. Transaction PRIOR to report date -> opening stock
      await prismaTest.inventoryTransaction.create({
        data: {
          ingredientId: testIngredientId,
          type: 'STOCK_IN',
          quantity: 40,
          costAmount: 800000,
          createdAt: new Date('2026-09-20T10:00:00+07:00')
        }
      });

      // 2. STOCK_IN within report date -> stockIn = 30
      await prismaTest.inventoryTransaction.create({
        data: {
          ingredientId: testIngredientId,
          type: 'STOCK_IN',
          quantity: 30,
          costAmount: 600000,
          createdAt: new Date('2026-09-25T09:00:00+07:00')
        }
      });

      // 3. AUTO_DEDUCT within report date -> stockOut = 20
      await prismaTest.inventoryTransaction.create({
        data: {
          ingredientId: testIngredientId,
          type: 'AUTO_DEDUCT',
          quantity: -20,
          costAmount: 400000,
          createdAt: new Date('2026-09-25T12:00:00+07:00')
        }
      });

      // 4. KITCHEN_WASTE within report date -> waste = 5
      await prismaTest.inventoryTransaction.create({
        data: {
          ingredientId: testIngredientId,
          type: 'KITCHEN_WASTE',
          quantity: -5,
          costAmount: 100000,
          createdAt: new Date('2026-09-25T15:00:00+07:00')
        }
      });

      // 5. MANUAL_ADJUST within report date -> manualAdjust = 2
      await prismaTest.inventoryTransaction.create({
        data: {
          ingredientId: testIngredientId,
          type: 'MANUAL_ADJUST',
          quantity: 2,
          costAmount: 40000,
          createdAt: new Date('2026-09-25T18:00:00+07:00')
        }
      });
    });

    it('correctly calculates opening stock, in-period movements, and closing balance', async () => {
      const res = await request(app)
        .get(`/api/reports/inventory-balance?date=${reportDate}&search=ING-TEST-REPORT`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const { items, summary } = res.body.data;

      expect(items).toHaveLength(1);
      const row = items[0];

      expect(row.sku).toBe('ING-TEST-REPORT');
      expect(row.openingStock).toBe(40);
      expect(row.stockIn).toBe(30);
      expect(row.stockOut).toBe(20);
      expect(row.waste).toBe(5);
      expect(row.manualAdjust).toBe(2);

      // Closing = 40 + 30 - 20 - 5 + 2 = 47
      expect(row.closingStock).toBe(47);
      // Value = 47 * 20,000 = 940,000 VND
      expect(row.inventoryValue).toBe(940000);
      // Min threshold is 15 -> not low stock
      expect(row.isLowStock).toBe(false);

      expect(summary.totalInventoryValue).toBeGreaterThan(0);
    });

    it('flags isLowStock when closing stock is less than or equal to minThreshold', async () => {
      // Create ingredient with closing stock <= minThreshold
      const lowIng = await prismaTest.ingredient.create({
        data: {
          sku: 'ING-LOW-TEST',
          name: 'Hành baro tươi',
          unit: 'kg',
          costPerUnit: 15000,
          currentStock: 2,
          minThreshold: 5,
          isActive: true
        }
      });
      await prismaTest.inventoryTransaction.create({
        data: {
          ingredientId: lowIng.id,
          type: 'STOCK_IN',
          quantity: 2,
          costAmount: 30000,
          createdAt: new Date('2026-09-25T08:00:00+07:00')
        }
      });

      const res = await request(app)
        .get(`/api/reports/inventory-balance?date=${reportDate}&search=ING-LOW-TEST`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const row = res.body.data.items[0];
      expect(row.closingStock).toBe(2);
      expect(row.isLowStock).toBe(true);
    });
  });
});
