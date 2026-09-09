import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Admin Menu Management API (Task 12 - Module M7)', () => {
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;
  let validCategoryId: number;

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

    const category = await prismaTest.category.findFirstOrThrow();
    validCategoryId = category.id;
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  describe('POST /api/menu (Admin Create Menu Item)', () => {
    const validItemPayload = {
      name: 'Burger Siêu Cay Crispy',
      basePrice: 75000,
      categoryId: 1, // Will override in test with validCategoryId
      description: 'Burger gà cay đặc biệt với sốt ớt habanero',
      imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd',
      modifierGroups: [
        {
          name: 'Cấp độ cay',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            { name: 'Cay vừa (Mild)', priceDelta: 0 },
            { name: 'Cay nồng (Hot)', priceDelta: 5000 },
            { name: 'Siêu cay (Extreme)', priceDelta: 10000 }
          ]
        }
      ]
    };

    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .post('/api/menu')
        .send({ ...validItemPayload, categoryId: validCategoryId });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ ...validItemPayload, categoryId: validCategoryId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects KITCHEN role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ ...validItemPayload, categoryId: validCategoryId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects negative or zero basePrice with 400 VALIDATION_ERROR', async () => {
      const resZero = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validItemPayload, categoryId: validCategoryId, basePrice: 0 });

      expect(resZero.status).toBe(400);
      expect(resZero.body.error.code).toBe('VALIDATION_ERROR');

      const resNeg = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validItemPayload, categoryId: validCategoryId, basePrice: -25000 });

      expect(resNeg.status).toBe(400);
      expect(resNeg.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-integer price with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validItemPayload, categoryId: validCategoryId, basePrice: 75000.5 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects non-existent categoryId with 400 or 404', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validItemPayload, categoryId: 999999 });

      expect([400, 404]).toContain(res.status);
    });

    it('rejects invalid modifier minSelect > maxSelect with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validItemPayload,
          categoryId: validCategoryId,
          modifierGroups: [
            {
              name: 'Size nước',
              isRequired: true,
              minSelect: 2,
              maxSelect: 1, // Invalid: minSelect > maxSelect
              options: [{ name: 'Lớn', priceDelta: 5000 }]
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects modifier group with fewer options than maxSelect with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ...validItemPayload,
          categoryId: validCategoryId,
          modifierGroups: [
            {
              name: 'Topping sốt',
              isRequired: false,
              minSelect: 0,
              maxSelect: 3, // Requires at least 3 options available
              options: [{ name: 'Sốt cay', priceDelta: 2000 }] // Only 1 option provided
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows ADMIN to create valid menu item with modifiers and returns complete MenuItemDto', async () => {
      const res = await request(app)
        .post('/api/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validItemPayload, categoryId: validCategoryId });

      expect(res.status).toBe(201);
      expect(res.body.data.menuItem).toBeDefined();
      expect(res.body.data.menuItem.name).toBe('Burger Siêu Cay Crispy');
      expect(res.body.data.menuItem.basePrice).toBe(75000);
      expect(res.body.data.menuItem.categoryId).toBe(validCategoryId);
      expect(res.body.data.menuItem.modifierGroups).toHaveLength(1);
      expect(res.body.data.menuItem.modifierGroups[0].options).toHaveLength(3);

      // Verify persisted in DB
      const dbItem = await prismaTest.menuItem.findUnique({
        where: { id: res.body.data.menuItem.id },
        include: { modifierGroups: { include: { options: true } } }
      });
      expect(dbItem).not.toBeNull();
      expect(dbItem?.name).toBe('Burger Siêu Cay Crispy');
    });
  });

  describe('PATCH /api/menu/:id (Admin Update Menu Item)', () => {
    let itemToUpdateId: number;

    beforeAll(async () => {
      const item = await prismaTest.menuItem.findFirstOrThrow();
      itemToUpdateId = item.id;
    });

    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .patch(`/api/menu/${itemToUpdateId}`)
        .send({ name: 'Tên mới' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .patch(`/api/menu/${itemToUpdateId}`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ name: 'Tên mới' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects KITCHEN role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .patch(`/api/menu/${itemToUpdateId}`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ name: 'Tên mới' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects updating non-existent menu item with 404 NOT_FOUND', async () => {
      const res = await request(app)
        .patch('/api/menu/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Tên mới' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('allows ADMIN to update price, name, description and returns complete MenuItemDto', async () => {
      const res = await request(app)
        .patch(`/api/menu/${itemToUpdateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Burger Gà Giòn Sốt Phô Mai Đặc Biệt',
          basePrice: 89000,
          description: 'Công thức mới sốt phô mai cheddar béo ngậy'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.menuItem.name).toBe('Burger Gà Giòn Sốt Phô Mai Đặc Biệt');
      expect(res.body.data.menuItem.basePrice).toBe(89000);
      expect(res.body.data.menuItem.description).toBe('Công thức mới sốt phô mai cheddar béo ngậy');

      // Verify in DB
      const updated = await prismaTest.menuItem.findUnique({ where: { id: itemToUpdateId } });
      expect(updated?.basePrice).toBe(89000);
      expect(updated?.name).toBe('Burger Gà Giòn Sốt Phô Mai Đặc Biệt');
    });
  });
});
