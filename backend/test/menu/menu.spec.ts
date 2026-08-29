import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Menu & Required Modifiers API (Task 8)', () => {
  let cashierToken: string;
  let kitchenToken: string;
  let adminToken: string;

  beforeAll(async () => {
    validateTestEnvironment();
    await seedDatabase(prismaTest);

    // Tao JWT token cho cac vai tro de test phan quyen
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

    adminToken = jwt.sign(
      { sub: '1', username: 'admin', name: 'Admin', role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('GET /api/menu tra ve danh sach categories gom cac menuItems kem modifierGroups va options day du', async () => {
    const res = await request(app).get('/api/menu');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('categories');
    expect(Array.isArray(res.body.data.categories)).toBe(true);
    expect(res.body.data.categories.length).toBeGreaterThanOrEqual(5);

    const firstCat = res.body.data.categories[0];
    expect(firstCat).toHaveProperty('id');
    expect(firstCat).toHaveProperty('name');
    expect(firstCat).toHaveProperty('menuItems');
    expect(Array.isArray(firstCat.menuItems)).toBe(true);
    expect(firstCat.menuItems.length).toBeGreaterThan(0);

    // Kiem tra cau truc cua mon an co modifier
    const itemWithMod = res.body.data.categories
      .flatMap((c: { menuItems: any[] }) => c.menuItems)
      .find((m: { modifierGroups?: any[] }) => m.modifierGroups && m.modifierGroups.length > 0);

    expect(itemWithMod).toBeDefined();
    expect(itemWithMod.modifierGroups[0]).toHaveProperty('name');
    expect(itemWithMod.modifierGroups[0]).toHaveProperty('isRequired');
    expect(itemWithMod.modifierGroups[0]).toHaveProperty('options');
    expect(itemWithMod.modifierGroups[0].options.length).toBeGreaterThan(0);
    expect(itemWithMod.modifierGroups[0].options[0]).toHaveProperty('priceDelta');
  });

  it('PATCH /api/menu/:id/sold-out cho phep KITCHEN bao het mon (86d)', async () => {
    const item = await prismaTest.menuItem.findFirst();
    expect(item).not.toBeNull();

    const res = await request(app)
      .patch(`/api/menu/${item!.id}/sold-out`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ isAvailable: false });

    expect(res.status).toBe(200);
    expect(res.body.data.menuItem.isAvailable).toBe(false);

    // Kiem tra trong DB thuc su da update
    const updated = await prismaTest.menuItem.findUnique({ where: { id: item!.id } });
    expect(updated?.isAvailable).toBe(false);
  });

  it('PATCH /api/menu/:id/sold-out cho phep ADMIN mo ban lai mon an', async () => {
    const item = await prismaTest.menuItem.findFirst();
    expect(item).not.toBeNull();

    const res = await request(app)
      .patch(`/api/menu/${item!.id}/sold-out`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isAvailable: true });

    expect(res.status).toBe(200);
    expect(res.body.data.menuItem.isAvailable).toBe(true);

    const updated = await prismaTest.menuItem.findUnique({ where: { id: item!.id } });
    expect(updated?.isAvailable).toBe(true);
  });

  it('PATCH /api/menu/:id/sold-out tra ve 403 FORBIDDEN khi CASHIER co y thay doi trang thai 86d', async () => {
    const item = await prismaTest.menuItem.findFirst();

    const res = await request(app)
      .patch(`/api/menu/${item!.id}/sold-out`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ isAvailable: false });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('PATCH /api/menu/99999/sold-out tra ve 404 NOT_FOUND khi mon khong ton tai', async () => {
    const res = await request(app)
      .patch('/api/menu/99999/sold-out')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ isAvailable: false });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
