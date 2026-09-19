import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';

describe('Category administration API (Phase 3)', () => {
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;

  const makeToken = (sub: string, username: string, name: string, role: 'ADMIN' | 'CASHIER' | 'KITCHEN') =>
    jwt.sign(
      { sub, username, name, role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

  beforeAll(() => {
    validateTestEnvironment();
    adminToken = makeToken('1', 'admin', 'Admin', 'ADMIN');
    cashierToken = makeToken('2', 'cashier', 'Cashier', 'CASHIER');
    kitchenToken = makeToken('3', 'kitchen', 'Kitchen', 'KITCHEN');
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedDatabase(prismaTest);
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('allows ADMIN to create and update a category with normalized name', async () => {
    const createResponse = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '  Đồ Uống Mới  ', displayOrder: 20 });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.category).toMatchObject({ name: 'Đồ Uống Mới', displayOrder: 20 });

    const categoryId = createResponse.body.data.category.id;
    const updateResponse = await request(app)
      .patch(`/api/menu/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Đồ Uống Lạnh', displayOrder: 3 });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.category).toMatchObject({ id: categoryId, name: 'Đồ Uống Lạnh', displayOrder: 3 });
  });

  it('rejects duplicate category names case-insensitively', async () => {
    const existing = await prismaTest.category.findFirstOrThrow();
    const response = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: ` ${existing.name.toUpperCase()} ` });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it.each([
    ['cashier', 'CASHIER'],
    ['kitchen', 'KITCHEN']
  ] as const)('rejects %s from category administration', async (_label, role) => {
    const token = role === 'CASHIER' ? cashierToken : kitchenToken;
    const response = await request(app)
      .post('/api/menu/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Không được phép' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects unauthenticated category administration', async () => {
    const response = await request(app)
      .post('/api/menu/categories')
      .send({ name: 'Không đăng nhập' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('blocks deleting a category that still contains menu items', async () => {
    const source = await prismaTest.category.findFirstOrThrow({
      where: { menuItems: { some: {} } }
    });

    const response = await request(app)
      .delete(`/api/menu/categories/${source.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('moves menu items before deleting a non-empty category when requested', async () => {
    const source = await prismaTest.category.findFirstOrThrow({
      where: { menuItems: { some: {} } },
      include: { menuItems: true }
    });
    const destination = await prismaTest.category.findFirstOrThrow({ where: { id: { not: source.id } } });

    const response = await request(app)
      .delete(`/api/menu/categories/${source.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moveToCategoryId: destination.id });

    expect(response.status).toBe(200);
    expect(response.body.data.deletedCategoryId).toBe(source.id);
    expect(await prismaTest.category.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await prismaTest.menuItem.count({ where: { categoryId: destination.id } })).toBeGreaterThanOrEqual(source.menuItems.length);
  });

  it('deletes an empty category without moving menu items', async () => {
    const category = await prismaTest.category.create({ data: { name: 'Danh mục tạm', displayOrder: 99 } });

    const response = await request(app)
      .delete(`/api/menu/categories/${category.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.deletedCategoryId).toBe(category.id);
    expect(await prismaTest.category.findUnique({ where: { id: category.id } })).toBeNull();
  });

  it('reorders all categories atomically and rejects incomplete ID lists', async () => {
    const categories = await prismaTest.category.findMany({ orderBy: { id: 'asc' } });
    const reversedIds = categories.map(category => category.id).reverse();

    const response = await request(app)
      .patch('/api/menu/categories/reorder')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: reversedIds });

    expect(response.status).toBe(200);
    expect(response.body.data.categories.map((category: { id: number }) => category.id)).toEqual(reversedIds);

    const invalidResponse = await request(app)
      .patch('/api/menu/categories/reorder')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: reversedIds.slice(1) });

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error.code).toBe('VALIDATION_ERROR');
  });
});
