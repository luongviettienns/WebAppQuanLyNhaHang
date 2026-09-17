import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Audit Log API & Action Logging (Admin Workspace)', () => {
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);

    adminToken = jwt.sign(
      { sub: '1', username: 'admin', name: 'Quản trị viên', role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    cashierToken = jwt.sign(
      { sub: '2', username: 'cashier', name: 'Thu ngân 1', role: 'CASHIER' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    kitchenToken = jwt.sign(
      { sub: '3', username: 'kitchen', name: 'Bếp trưởng', role: 'KITCHEN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  describe('RBAC & Auth for GET /api/audit', () => {
    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/audit');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects KITCHEN role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${kitchenToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN role and returns paginated audit log list', async () => {
      const res = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('logs');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page', 1);
      expect(res.body.data).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.data.logs)).toBe(true);
    });
  });

  describe('Integration: Automatic Audit Logging for Actions', () => {
    let createdItemId: number;

    it('records MENU_ITEM_CREATED log when admin creates a menu item', async () => {
      const category = await prismaTest.category.findFirstOrThrow();

      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: category.id,
          name: 'Gà rán Sốt Cay Audit Test',
          description: 'Món dùng để test audit log',
          basePrice: 59000,
          isAvailable: true
        });

      expect(res.status).toBe(201);
      createdItemId = res.body.data.menuItem.id;

      // Check audit log
      const auditRes = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      const log = auditRes.body.data.logs.find(
        (l: any) => l.action === 'MENU_ITEM_CREATED' && l.targetId === createdItemId
      );
      expect(log).toBeDefined();
      expect(log.targetType).toBe('MenuItem');
      expect(log.actorName).toBe('Quản trị viên');
      expect(log.metadata.name).toBe('Gà rán Sốt Cay Audit Test');
      expect(log.metadata.basePrice).toBe(59000);
    });

    it('records MENU_ITEM_UPDATED log when admin updates a menu item', async () => {
      const res = await request(app)
        .patch(`/api/menu/${createdItemId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Gà rán Sốt Cay Audit Test (Đổi tên)',
          basePrice: 65000
        });

      expect(res.status).toBe(200);

      const auditRes = await request(app)
        .get(`/api/audit?action=MENU_ITEM_UPDATED`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      const log = auditRes.body.data.logs.find((l: any) => l.targetId === createdItemId);
      expect(log).toBeDefined();
      expect(log.metadata.name).toBe('Gà rán Sốt Cay Audit Test (Đổi tên)');
      expect(log.metadata.previousName).toBe('Gà rán Sốt Cay Audit Test');
      expect(log.metadata.basePrice).toBe(65000);
      expect(log.metadata.previousBasePrice).toBe(59000);
    });

    it('records MENU_ITEM_AVAILABILITY_CHANGED log when toggling sold-out status', async () => {
      const res = await request(app)
        .patch(`/api/menu/${createdItemId}/sold-out`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isAvailable: false
        });

      expect(res.status).toBe(200);

      const auditRes = await request(app)
        .get(`/api/audit?action=MENU_ITEM_AVAILABILITY_CHANGED`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      const log = auditRes.body.data.logs.find((l: any) => l.targetId === createdItemId);
      expect(log).toBeDefined();
      expect(log.metadata.isAvailable).toBe(false);
      expect(log.metadata.previousIsAvailable).toBe(true);
    });

    it('records MENU_IMAGE_UPLOADED log when admin uploads image', async () => {
      const dummyBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const res = await request(app)
        .post('/api/menu/upload-image')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          dataUrl: dummyBase64,
          fileName: 'audit_test_icon.png'
        });

      expect(res.status).toBe(200);

      const auditRes = await request(app)
        .get('/api/audit?action=MENU_IMAGE_UPLOADED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      const log = auditRes.body.data.logs.find((l: any) => l.metadata?.fileName === 'audit_test_icon.png');
      expect(log).toBeDefined();
      expect(log.action).toBe('MENU_IMAGE_UPLOADED');
      expect(log.actorName).toBe('Quản trị viên');
      expect(log.metadata.fileSize).toBeGreaterThan(0);
    });

    it('records ORDER_VOIDED log when admin voids an order', async () => {
      // 1. Create order with an item that has no required modifiers
      const item = await prismaTest.menuItem.findFirstOrThrow({
        where: {
          isAvailable: true,
          modifierGroups: { none: { isRequired: true } }
        }
      });

      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          orderType: 'TAKE_AWAY',
          items: [{ menuItemId: item.id, quantity: 2 }]
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.id;

      // 2. Void order by Admin
      const voidRes = await request(app)
        .patch(`/api/orders/${orderId}/void`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Khách đổi ý không lấy món nữa'
        });

      expect(voidRes.status).toBe(200);

      // 3. Verify audit log
      const auditRes = await request(app)
        .get(`/api/audit?action=ORDER_VOIDED`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      const log = auditRes.body.data.logs.find((l: any) => l.targetId === orderId);
      expect(log).toBeDefined();
      expect(log.action).toBe('ORDER_VOIDED');
      expect(log.targetType).toBe('Order');
      expect(log.actorName).toBe('Quản trị viên');
      expect(log.metadata.reason).toBe('Khách đổi ý không lấy món nữa');
    });

    it('supports pagination and limit query params', async () => {
      const res = await request(app)
        .get('/api/audit?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.logs.length).toBeLessThanOrEqual(2);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.total).toBeGreaterThanOrEqual(4);
      expect(res.body.data.totalPages).toBeGreaterThanOrEqual(2);
    });

    it('filters logs by category=INVENTORY (Ingredient actions + MENU_RECIPE_UPDATED)', async () => {
      // 1. Create ingredient
      const ingRes = await request(app)
        .post('/api/inventory/ingredients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'AUDIT_ING_01',
          name: 'Bột chiên xù Audit Test',
          unit: 'kg',
          currentStock: 10,
          costPerUnit: 25000,
          minThreshold: 2
        });
      expect(ingRes.status).toBe(201);

      // 2. Query audit with category=INVENTORY
      const auditRes = await request(app)
        .get('/api/audit?category=INVENTORY')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.logs.length).toBeGreaterThan(0);
      const createdLog = auditRes.body.data.logs.find(
        (l: any) => l.action === 'INGREDIENT_CREATED' && l.metadata?.sku === 'AUDIT_ING_01'
      );
      expect(createdLog).toBeDefined();
      expect(createdLog.metadata.name).toBe('Bột chiên xù Audit Test');
      expect(createdLog.metadata.unit).toBe('kg');
      expect(createdLog.metadata.stock).toBe(10);
      expect(createdLog.targetType).toBe('Ingredient');
    });

    it('filters logs by category=MENU (MenuItem actions excluding MENU_RECIPE_UPDATED)', async () => {
      const auditRes = await request(app)
        .get('/api/audit?category=MENU')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.data.logs.length).toBeGreaterThan(0);
      auditRes.body.data.logs.forEach((log: any) => {
        expect(log.targetType).toBe('MenuItem');
        expect(log.action).not.toBe('MENU_RECIPE_UPDATED');
      });
    });
  });
});
