import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('Sales returns API', () => {
  let token: string;
  let kitchenToken: string;
  let orderId: number;
  let orderItemId: number;
  let ingredientId: number;
  let menuItemId: number;
  let tableId: number;
  const root = '/api/orders/returns';

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const sign = (user: { id: number; username: string; name: string; role: 'ADMIN' | 'KITCHEN' | 'CASHIER' }) => jwt.sign(
    { sub: String(user.id), username: user.username, name: user.name, role: user.role },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
  );

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({ data: { username: `return-admin-${Date.now()}`, passwordHash: 'hash', name: 'Quản lý trả hàng', role: 'ADMIN' } });
    const kitchen = await prismaTest.user.create({ data: { username: `return-kitchen-${Date.now()}`, passwordHash: 'hash', name: 'Bếp', role: 'KITCHEN' } });
    token = sign(admin); kitchenToken = sign(kitchen);
    const category = await prismaTest.category.create({ data: { name: 'Món trả hàng' } });
    const menu = await prismaTest.menuItem.create({ data: { categoryId: category.id, sku: 'RETURN-001', name: 'Gà rán trả hàng', basePrice: 50000, trackStock: true, stockQuantity: 3 } });
    menuItemId = menu.id;
    const ingredient = await prismaTest.ingredient.create({ data: { sku: 'RETURN-ING', name: 'Gà nguyên liệu', unit: 'phần', currentStock: 8, costPerUnit: 20000 } });
    ingredientId = ingredient.id;
    await prismaTest.menuItemIngredient.create({ data: { menuItemId: menu.id, ingredientId: ingredient.id, quantityRequired: 1 } });
    const table = await prismaTest.diningTable.create({ data: { tableNumber: 41, qrCodeToken: `return-qr-${Date.now()}` } });
    tableId = table.id;
    const order = await prismaTest.order.create({
      data: {
        code: `HD-RETURN-${Date.now()}`, orderType: 'DINE_IN', status: 'COMPLETED', paymentStatus: 'PAID', paymentMethod: 'CASH',
        tableId: table.id, totalAmount: 100000, vatAmount: 8000, finalAmount: 108000, paidAt: new Date('2026-09-23T04:00:00Z'),
        items: { create: { menuItemId: menu.id, quantity: 2, unitPrice: 50000, subtotal: 100000 } }
      }, include: { items: true }
    });
    orderId = order.id; orderItemId = order.items[0].id;
  });

  it('lists eligible paid orders and creates a partial return atomically', async () => {
    const candidates = await request(app).get(`${root}/candidates?search=HD-RETURN`).set(auth());
    expect(candidates.status).toBe(200);
    expect(candidates.body.data.items[0]).toMatchObject({ orderId, code: expect.stringContaining('HD-RETURN'), tableNumber: 41 });
    expect(candidates.body.data.items[0].remainingItems[0]).toMatchObject({ orderItemId, soldQuantity: 2, returnedQuantity: 0, remainingQuantity: 2, unitPrice: 50000 });

    const created = await request(app).post(root).set(auth()).send({ orderId, lines: [{ orderItemId, quantity: 1 }], refundMethod: 'CASH' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ orderId, status: 'COMPLETED', totalRefundDue: 50000, refundedAmount: 50000 });
    expect(created.body.data.returnCode).toMatch(/^THD\d{6,}$/);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(9);
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: menuItemId } })).stockQuantity).toBe(4);
    expect(await prismaTest.inventoryTransaction.count({ where: { orderReturnId: created.body.data.id, type: 'SALES_RETURN' } })).toBe(1);
    expect(await prismaTest.auditLog.count({ where: { action: 'ORDER_RETURN_COMPLETED', targetId: created.body.data.id } })).toBe(1);
  });

  it('rejects over-return and serializes concurrent attempts', async () => {
    const first = await request(app).post(root).set(auth()).send({ orderId, lines: [{ orderItemId, quantity: 1 }] });
    expect(first.status).toBe(201);
    const over = await request(app).post(root).set(auth()).send({ orderId, lines: [{ orderItemId, quantity: 2 }] });
    expect(over.status).toBe(409);
    const concurrent = await Promise.all([
      request(app).post(root).set(auth()).send({ orderId, lines: [{ orderItemId, quantity: 1 }] }),
      request(app).post(root).set(auth()).send({ orderId, lines: [{ orderItemId, quantity: 1 }] })
    ]);
    expect(concurrent.map(response => response.status).sort()).toEqual([201, 409]);
  });

  it('lists and loads a completed return and enforces roles', async () => {
    const created = await request(app).post(root).set(auth()).send({ orderId, lines: [{ orderItemId, quantity: 1 }], note: 'Khách đổi ý' });
    const list = await request(app).get(`${root}?statuses=COMPLETED&tableId=${tableId}`).set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.items[0]).toMatchObject({ returnCode: created.body.data.returnCode, sourceOrderCode: expect.stringContaining('HD-RETURN'), tableNumber: 41, refundedAmount: 50000 });
    expect(list.body.data.summary).toMatchObject({ totalRefundDue: 50000, totalRefunded: 50000 });
    const detail = await request(app).get(`${root}/${created.body.data.id}`).set(auth());
    expect(detail.status).toBe(200);
    expect(detail.body.data.lines[0]).toMatchObject({ orderItemId, quantity: 1, unitPrice: 50000, lineAmount: 50000 });
    expect((await request(app).get(root)).status).toBe(401);
    expect((await request(app).get(root).set('Authorization', `Bearer ${kitchenToken}`)).status).toBe(403);
  });
});
