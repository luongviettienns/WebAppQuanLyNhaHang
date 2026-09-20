import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';

describe('Menu bulk actions API (Phase 6)', () => {
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

  it('allows ADMIN to apply a valid bulk action', async () => {
    const items = await prismaTest.menuItem.findMany({ take: 2, orderBy: { id: 'asc' } });
    const auditBefore = await prismaTest.auditLog.count({ where: { action: 'MENU_ITEMS_BULK_UPDATED' } });

    const response = await request(app)
      .patch('/api/menu/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ids: items.map(item => item.id),
        action: 'setAvailability',
        payload: { isAvailable: false }
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ updatedCount: 2, action: 'setAvailability' });
    expect(await prismaTest.auditLog.count({ where: { action: 'MENU_ITEMS_BULK_UPDATED' } })).toBe(auditBefore + 1);
    expect(await prismaTest.menuItem.count({ where: { id: { in: items.map(item => item.id) }, isAvailable: false } })).toBe(2);
  });

  it.each([
    ['setCategory', { categoryId: 2 }],
    ['setMenuType', { menuType: 'DRINK' }],
    ['setItemType', { itemType: 'COMBO' }],
    ['setTrackStock', { trackStock: true }]
  ] as const)('applies %s to every selected item', async (action, payload) => {
    const items = await prismaTest.menuItem.findMany({ take: 2, orderBy: { id: 'asc' } });
    const response = await request(app)
      .patch('/api/menu/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: items.map(item => item.id), action, payload });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ updatedCount: 2, action });
  });

  it('adjusts stock by delta for each selected item', async () => {
    const items = await prismaTest.menuItem.findMany({ take: 2, orderBy: { id: 'asc' } });
    await prismaTest.menuItem.update({ where: { id: items[0].id }, data: { stockQuantity: 2 } });
    await prismaTest.menuItem.update({ where: { id: items[1].id }, data: { stockQuantity: 5 } });

    const response = await request(app)
      .patch('/api/menu/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: items.map(item => item.id), action: 'adjustStock', payload: { delta: -1 } });

    expect(response.status).toBe(200);
    const updated = await prismaTest.menuItem.findMany({ where: { id: { in: items.map(item => item.id) } }, orderBy: { id: 'asc' } });
    expect(updated.map(item => item.stockQuantity)).toEqual([1, 4]);
  });

  it('rejects a negative final stock without changing any selected item or audit log', async () => {
    const items = await prismaTest.menuItem.findMany({ take: 2, orderBy: { id: 'asc' } });
    await prismaTest.menuItem.update({ where: { id: items[0].id }, data: { stockQuantity: 0 } });
    await prismaTest.menuItem.update({ where: { id: items[1].id }, data: { stockQuantity: 5 } });
    const auditBefore = await prismaTest.auditLog.count({ where: { action: 'MENU_ITEMS_BULK_UPDATED' } });

    const response = await request(app)
      .patch('/api/menu/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: items.map(item => item.id), action: 'adjustStock', payload: { delta: -1 } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prismaTest.menuItem.findUniqueOrThrow({ where: { id: items[0].id } })).toMatchObject({ stockQuantity: 0 });
    expect(await prismaTest.menuItem.findUniqueOrThrow({ where: { id: items[1].id } })).toMatchObject({ stockQuantity: 5 });
    expect(await prismaTest.auditLog.count({ where: { action: 'MENU_ITEMS_BULK_UPDATED' } })).toBe(auditBefore);
  });

  it('soft-deletes selected items without deleting their rows', async () => {
    const items = await prismaTest.menuItem.findMany({ take: 2, orderBy: { id: 'asc' } });

    const response = await request(app)
      .patch('/api/menu/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: items.map(item => item.id), action: 'delete', payload: {} });

    expect(response.status).toBe(200);
    expect(await prismaTest.menuItem.count({ where: { id: { in: items.map(item => item.id) } } })).toBe(2);
    expect(await prismaTest.menuItem.count({ where: { id: { in: items.map(item => item.id) }, isAvailable: false } })).toBe(2);
  });

  it('rejects mixed valid and missing IDs without a partial update', async () => {
    const item = await prismaTest.menuItem.findFirstOrThrow({ orderBy: { id: 'asc' } });

    const response = await request(app)
      .patch('/api/menu/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [item.id, 999999], action: 'setAvailability', payload: { isAvailable: false } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ isAvailable: true });
  });

  it('rejects a missing target category before writing', async () => {
    const item = await prismaTest.menuItem.findFirstOrThrow({ orderBy: { id: 'asc' } });
    const previousCategoryId = item.categoryId;

    const response = await request(app)
      .patch('/api/menu/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [item.id], action: 'setCategory', payload: { categoryId: 999999 } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ categoryId: previousCategoryId });
  });

  it.each([
    ['unauthenticated', undefined, 401],
    ['cashier', 'cashier', 403],
    ['kitchen', 'kitchen', 403]
  ] as const)('protects bulk actions for %s users', async (_label, role, expectedStatus) => {
    const items = await prismaTest.menuItem.findMany({ take: 1 });
    const token = role === 'cashier' ? cashierToken : role === 'kitchen' ? kitchenToken : undefined;
    const requestBuilder = request(app)
      .patch('/api/menu/bulk')
      .send({ ids: items.map(item => item.id), action: 'setAvailability', payload: { isAvailable: false } });
    if (token) requestBuilder.set('Authorization', `Bearer ${token}`);

    const response = await requestBuilder;

    expect(response.status).toBe(expectedStatus);
  });

  it.each([
    ['empty ids', { ids: [], action: 'setAvailability', payload: { isAvailable: false } }],
    ['duplicate ids', { ids: [1, 1], action: 'setAvailability', payload: { isAvailable: false } }],
    ['too many ids', { ids: Array.from({ length: 201 }, (_, index) => index + 1), action: 'delete', payload: {} }],
    ['invalid action payload', { ids: [1], action: 'setAvailability', payload: { isAvailable: 'no' } }]
  ] as const)('rejects %s with VALIDATION_ERROR', async (_label, body) => {
    const response = await request(app)
      .patch('/api/menu/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
