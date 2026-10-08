import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';

describe('Kitchen waste: options and exactly-once stock deductions', () => {
  let kitchenToken: string;
  let adminToken: string;
  let cashierToken: string;
  let ingredientId: number;
  const token = (role: string, id: number) => jwt.sign({ sub: String(id), role, name: role, username: role }, env.JWT_SECRET, {
    algorithm: 'HS256', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn: '1h'
  });
  const payload = () => ({ type: 'INGREDIENT', ingredientId, quantity: 0.05, reason: 'Rơi mất nguyên liệu', note: '50 g, đơn vị kho kg' });
  const submit = (key: string, body = payload(), auth = kitchenToken) => request(app).post('/api/inventory/kitchen-waste')
    .set('Authorization', `Bearer ${auth}`).set('Idempotency-Key', key).send(body);

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);
    kitchenToken = token('KITCHEN', 3); adminToken = token('ADMIN', 1); cashierToken = token('CASHIER', 2);
    const ingredient = await prismaTest.ingredient.create({ data: { sku: 'WASTE-SAFE', name: 'Nguyên liệu không cảnh báo', unit: 'kg', currentStock: 10, minThreshold: 1, costPerUnit: 100000 } });
    ingredientId = ingredient.id;
    await prismaTest.ingredient.create({ data: { sku: 'WASTE-INACTIVE', name: 'Ngừng hoạt động', unit: 'ml', isActive: false } });
  });
  afterAll(async () => { await prismaTest.$disconnect(); });

  it('lets kitchen search all active ingredients and preview BOM without exposing financial fields', async () => {
    const res = await request(app).get('/api/inventory/kitchen-waste/options').set('Authorization', `Bearer ${kitchenToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ingredients).toContainEqual({ id: ingredientId, sku: 'WASTE-SAFE', name: 'Nguyên liệu không cảnh báo', unit: 'kg', currentStock: 10 });
    expect(res.body.data.ingredients.some((item: { sku: string }) => item.sku === 'WASTE-INACTIVE')).toBe(false);
    expect(JSON.stringify(res.body.data)).not.toMatch(/costPerUnit|basePrice|costAmount/);
    expect(res.body.data.recipes.some((recipe: { ingredients: unknown[] }) => recipe.ingredients.length > 0)).toBe(true);
  });

  it('rejects unauthenticated and cashier access to kitchen options', async () => {
    expect((await request(app).get('/api/inventory/kitchen-waste/options')).status).toBe(401);
    expect((await request(app).get('/api/inventory/kitchen-waste/options').set('Authorization', `Bearer ${cashierToken}`)).status).toBe(403);
    expect((await request(app).get('/api/inventory/kitchen-waste/options').set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
  });

  it('requires a request key before any stock mutation', async () => {
    const before = await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    const res = await request(app).post('/api/inventory/kitchen-waste').set('Authorization', `Bearer ${kitchenToken}`).send(payload());
    expect(res.status).toBe(400);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(before.currentStock);
  });

  it('deducts 0.05 kg once and replays the same persisted response', async () => {
    const before = await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    const first = await submit('fractional-replay');
    const second = await submit('fractional-replay');
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect(first.body.data.totalCostAmount).toBe(5000);
    expect(second.body).toEqual(first.body);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBeCloseTo(before.currentStock - 0.05, 6);
    expect(await prismaTest.inventoryTransaction.count({ where: { ingredientId, type: 'KITCHEN_WASTE' } })).toBe(1);
  });

  it('rejects reuse with a changed quantity and leaves stock unchanged', async () => {
    const before = await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    expect((await submit('fractional-replay', { ...payload(), quantity: 0.1 })).status).toBe(409);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(before.currentStock);
  });

  it('serializes simultaneous retries and creates one stock ledger and one audit entry', async () => {
    const before = await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    const beforeAudit = await prismaTest.auditLog.count({ where: { action: 'KITCHEN_WASTE_RECORDED', targetId: ingredientId } });
    const responses = await Promise.all([submit('parallel-replay'), submit('parallel-replay'), submit('parallel-replay')]);
    expect(responses.map(res => res.status)).toEqual([201, 201, 201]);
    expect(responses[1].body).toEqual(responses[0].body);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBeCloseTo(before.currentStock - 0.05, 6);
    expect(await prismaTest.auditLog.count({ where: { action: 'KITCHEN_WASTE_RECORDED', targetId: ingredientId } })).toBe(beforeAudit + 1);
  });

  it('rolls back the request claim when the ingredient does not exist, allowing a corrected retry', async () => {
    expect((await submit('failed-claim', { ...payload(), ingredientId: 999999 })).status).toBe(404);
    expect(await prismaTest.kitchenWasteRequest.count({ where: { actorId: 3, requestKey: 'failed-claim' } })).toBe(0);
    expect((await submit('failed-claim')).status).toBe(201);
  });

  it('replays dish waste without subtracting the whole BOM twice', async () => {
    const menu = await prismaTest.menuItem.findFirstOrThrow({ where: { menuItemIngredients: { some: {} } }, include: { menuItemIngredients: { include: { ingredient: true } } } });
    const body = { type: 'MENU_ITEM', menuItemId: menu.id, quantity: 2, reason: 'Hỏng hai phần món' };
    const first = await request(app).post('/api/inventory/kitchen-waste').set('Authorization', `Bearer ${kitchenToken}`).set('Idempotency-Key', 'dish-replay').send(body);
    const replay = await request(app).post('/api/inventory/kitchen-waste').set('Authorization', `Bearer ${kitchenToken}`).set('Idempotency-Key', 'dish-replay').send(body);
    expect(first.status).toBe(201); expect(replay.body).toEqual(first.body);
    for (const bom of menu.menuItemIngredients) {
      expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: bom.ingredientId } })).currentStock).toBeCloseTo(bom.ingredient.currentStock - 2 * bom.quantityRequired, 6);
    }
  });

  it('scopes request keys to the actor and preserves the allowed negative-stock policy', async () => {
    const ingredient = await prismaTest.ingredient.create({ data: { sku: 'WASTE-NEGATIVE', name: 'Nguyên liệu bán âm', unit: 'ml', currentStock: 1, costPerUnit: 10 } });
    const body = { ...payload(), ingredientId: ingredient.id, quantity: 2 };
    expect((await submit('actor-scoped', body)).status).toBe(201);
    expect((await submit('actor-scoped', body, adminToken)).status).toBe(201);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).currentStock).toBe(-3);
  });
});
