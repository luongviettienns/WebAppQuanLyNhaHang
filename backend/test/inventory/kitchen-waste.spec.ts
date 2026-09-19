import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Kitchen Waste & Low Stock Alerts API (Phase 10 - Slice 10.1)', () => {
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);

    adminToken = jwt.sign(
      { sub: '1', username: 'admin', name: 'Admin Manager', role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    cashierToken = jwt.sign(
      { sub: '2', username: 'cashier', name: 'Cashier Staff', role: 'CASHIER' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    kitchenToken = jwt.sign(
      { sub: '3', username: 'kitchen', name: 'Chef Kitchen', role: 'KITCHEN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  describe('Permissions', () => {
    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .post('/api/inventory/kitchen-waste')
        .send({ type: 'INGREDIENT', ingredientId: 1, quantity: 1, reason: 'Cháy khét' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/inventory/kitchen-waste')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ type: 'INGREDIENT', ingredientId: 1, quantity: 1, reason: 'Cháy khét' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/inventory/kitchen-waste (By INGREDIENT)', () => {
    it('records direct ingredient waste, decrements stock and logs transaction', async () => {
      const ingredient = await prismaTest.ingredient.findFirstOrThrow({
        where: { currentStock: { gt: 10 } }
      });
      const initialStock = ingredient.currentStock;
      const wasteQty = 2;

      const res = await request(app)
        .post('/api/inventory/kitchen-waste')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          type: 'INGREDIENT',
          ingredientId: ingredient.id,
          quantity: wasteQty,
          reason: 'Làm rơi vỡ khay khi nấu'
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.totalCostAmount).toBe(wasteQty * ingredient.costPerUnit);

      // Verify stock in DB
      const updated = await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
      expect(updated.currentStock).toBeCloseTo(initialStock - wasteQty, 2);

      // Verify InventoryTransaction
      const tx = await prismaTest.inventoryTransaction.findFirst({
        where: {
          ingredientId: ingredient.id,
          type: 'KITCHEN_WASTE'
        },
        orderBy: { createdAt: 'desc' }
      });
      expect(tx).toBeDefined();
      expect(tx?.quantity).toBe(-wasteQty);
      expect(tx?.costAmount).toBe(wasteQty * ingredient.costPerUnit);

      // Verify AuditLog
      const audit = await prismaTest.auditLog.findFirst({
        where: { action: 'KITCHEN_WASTE_RECORDED', actorId: 3 },
        orderBy: { createdAt: 'desc' }
      });
      expect(audit).toBeDefined();
    });
  });

  describe('POST /api/inventory/kitchen-waste (By MENU_ITEM BOM)', () => {
    it('records waste by dish, automatically deducts constituent ingredients according to BOM', async () => {
      // Find a menu item with at least 1 BOM recipe ingredient
      const menuItem = await prismaTest.menuItem.findFirstOrThrow({
        where: { menuItemIngredients: { some: {} } },
        include: { menuItemIngredients: { include: { ingredient: true } } }
      });

      const firstBom = menuItem.menuItemIngredients[0];
      const initialStock = firstBom.ingredient.currentStock;
      const portions = 1;

      const res = await request(app)
        .post('/api/inventory/kitchen-waste')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({
          type: 'MENU_ITEM',
          menuItemId: menuItem.id,
          quantity: portions,
          reason: 'Cháy khét trong chảo chiên'
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.deductedIngredients.length).toBe(menuItem.menuItemIngredients.length);

      // Check constituent stock
      const updatedIng = await prismaTest.ingredient.findUniqueOrThrow({ where: { id: firstBom.ingredientId } });
      expect(updatedIng.currentStock).toBeCloseTo(initialStock - (firstBom.quantityRequired * portions), 2);
    });
  });

  describe('GET /api/inventory/low-stock-alerts', () => {
    it('allows KITCHEN and ADMIN to view ingredients at or below minThreshold', async () => {
      // Set an ingredient stock to below its minThreshold
      const ingredient = await prismaTest.ingredient.findFirstOrThrow();
      await prismaTest.ingredient.update({
        where: { id: ingredient.id },
        data: { minThreshold: 100, currentStock: 20 }
      });

      const res = await request(app)
        .get('/api/inventory/low-stock-alerts')
        .set('Authorization', `Bearer ${kitchenToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const alerted = res.body.data.find((item: any) => item.id === ingredient.id);
      expect(alerted).toBeDefined();
      expect(alerted.currentStock).toBeLessThanOrEqual(alerted.minThreshold);
    });
  });

  describe('Báo cáo COGS trên Dashboard bao gồm Kitchen Waste', () => {
    it('adds kitchen waste cost to totalCogs and computes correct grossProfit', async () => {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      const res = await request(app)
        .get(`/api/reports/daily?date=${today}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.report.profitSummary).toBeDefined();
      expect(res.body.data.report.profitSummary.kitchenWasteCost).toBeGreaterThan(0);
      expect(res.body.data.report.profitSummary.totalCogs).toBe(
        res.body.data.report.profitSummary.salesCogs + res.body.data.report.profitSummary.kitchenWasteCost
      );
    });
  });
});
