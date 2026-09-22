import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('purchase returns lifecycle', () => {
  let token: string; let supplierId: number; let ingredientId: number; let sourceReceiptId: number;
  const root = '/api/inventory/purchase-returns';
  const authorization = () => 'Bearer ' + token;
  const draft = (quantity = 2, extra: Record<string, unknown> = {}) => ({
    supplierId, lines: [{ ingredientId, quantity, returnUnitPrice: 150 }],
    discountAmount: 20, vatAmount: 28, refundAmount: 100, refundMethod: 'CASH',
    returnedAt: '2026-09-22T05:00:00+07:00', note: 'Hàng không đạt chất lượng', ...extra
  });
  const create = async (input = draft()) => {
    const response = await request(app).post(root).set('Authorization', authorization()).send(input);
    expect(response.status).toBe(201);
    return response.body.data;
  };
  beforeEach(async () => {
    await truncateAllTables();
    const user = await prismaTest.user.create({ data: { username: 'return-admin', name: 'Người kiểm thử', role: 'ADMIN', passwordHash: 'hash' } });
    token = jwt.sign({ sub: String(user.id), role: user.role, name: user.name, username: user.username }, env.JWT_SECRET, { algorithm: 'HS256', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn: '1h' });
    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC-RETURN', name: 'Nhà cung cấp trả hàng' } });
    supplierId = supplier.id;
    const ingredient = await prismaTest.ingredient.create({ data: { sku: '00123', name: 'Bột mì', unit: 'kg', currentStock: 10, costPerUnit: 100 } });
    ingredientId = ingredient.id;
    const receipt = await prismaTest.purchaseReceipt.create({ data: {
      receiptCode: 'PN-RETURN', supplierId, status: 'POSTED', receivedAt: new Date('2026-09-21T10:00:00Z'), subtotalAmount: 1000, paidAmount: 200,
      lines: { create: { ingredientId, ingredientSku: ingredient.sku, ingredientName: ingredient.name, unit: ingredient.unit, quantity: 10, unitCost: 100 } }
    } });
    sourceReceiptId = receipt.id;
  });

  it('keeps drafts stock-neutral and completes with refund amounts separate from inventory cost', async () => {
    const created = await create();
    expect(created).toMatchObject({ status: 'DRAFT', version: 1, subtotalAmount: 300, payableAmount: 308, debtReductionAmount: 208 });
    expect(created.returnCode).toMatch(/^THN\d{6,}$/);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(10);
    expect(await prismaTest.inventoryTransaction.count()).toBe(0);
    const completed = await request(app).post(root + '/' + created.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: created.version });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ status: 'COMPLETED', version: 2, payableAmount: 308, debtReductionAmount: 208 });
    expect(completed.body.data.lines[0]).toMatchObject({ purchaseUnitCost: 100, returnUnitPrice: 150, stockCostPerUnit: 100, stockCostAmount: 200 });
    const stock = await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
    expect(stock).toMatchObject({ currentStock: 8, costPerUnit: 100 });
    const ledger = await prismaTest.inventoryTransaction.findMany();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'PURCHASE_RETURN', quantity: -2, costAmount: -200 });
    expect(await prismaTest.auditLog.count({ where: { action: 'PURCHASE_RETURN_COMPLETED', targetId: created.id } })).toBe(1);
  });

  it('saves changed draft values, rejects stale edits and makes terminal vouchers immutable', async () => {
    const created = await create();
    const updated = await request(app).patch(root + '/' + created.id).set('Authorization', authorization()).send({ ...draft(3), expectedVersion: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ version: 2, subtotalAmount: 450 });
    expect((await request(app).patch(root + '/' + created.id).set('Authorization', authorization()).send({ ...draft(4), expectedVersion: 1 })).status).toBe(409);
    expect((await request(app).post(root + '/' + created.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: 1 })).status).toBe(409);
    expect((await request(app).post(root + '/' + created.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: 2 })).status).toBe(200);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(7);
    expect((await request(app).patch(root + '/' + created.id).set('Authorization', authorization()).send({ ...draft(4), expectedVersion: 3 })).status).toBe(409);
    expect((await request(app).post(root + '/' + created.id + '/cancel').set('Authorization', authorization()).send({ expectedVersion: 3 })).status).toBe(409);
  });

  it('posts once under concurrent completion and supports cancelling empty drafts without stock changes', async () => {
    const created = await create();
    const responses = await Promise.all([1, 2].map(() => request(app).post(root + '/' + created.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: 1 })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(await prismaTest.inventoryTransaction.count()).toBe(1);
    const empty = await create({ ...draft(), lines: [], discountAmount: 0, vatAmount: 0, refundAmount: 0 });
    expect((await request(app).post(root + '/' + empty.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: 1 })).status).toBe(400);
    expect((await request(app).post(root + '/' + empty.id + '/cancel').set('Authorization', authorization()).send({ expectedVersion: 1 })).body.data.status).toBe('CANCELLED');
    expect(await prismaTest.inventoryTransaction.count()).toBe(1);
  });

  it('rolls back all lines when one exceeds stock and uses stock at completion time', async () => {
    const other = await prismaTest.ingredient.create({ data: { sku: 'OTHER', name: 'Đường', unit: 'kg', currentStock: 1, costPerUnit: 30 } });
    const created = await create(draft(2, { lines: [{ ingredientId, quantity: 2, returnUnitPrice: 150 }, { ingredientId: other.id, quantity: 2, returnUnitPrice: 30 }] }));
    expect((await request(app).post(root + '/' + created.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: 1 })).status).toBe(409);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(10);
    expect(await prismaTest.inventoryTransaction.count()).toBe(0);
    expect((await request(app).get(root + '/' + created.id).set('Authorization', authorization())).body.data.status).toBe('DRAFT');
  });

  it('serializes linked returns and rejects a different supplier or an exhausted receipt line', async () => {
    await prismaTest.ingredient.update({ where: { id: ingredientId }, data: { currentStock: 30 } });
    const a = await create(draft(6, { sourceReceiptId }));
    const b = await create(draft(6, { sourceReceiptId }));
    const responses = await Promise.all([a, b].map(row => request(app).post(root + '/' + row.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: 1 })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await prismaTest.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).currentStock).toBe(24);
    const other = await prismaTest.supplier.create({ data: { code: 'OTHER', name: 'Khác' } });
    expect((await request(app).post(root).set('Authorization', authorization()).send(draft(1, { sourceReceiptId, supplierId: other.id }))).status).toBe(400);
  });

  it('validates money, quantities, duplicate lines and authorization on every mutation', async () => {
    for (const input of [draft(0), draft(0.0001), draft(2, { discountAmount: 301 }), draft(2, { refundAmount: 309 }), draft(2, { vatAmount: -1 }), draft(2, { lines: [{ ingredientId, quantity: 2, returnUnitPrice: 1 }, { ingredientId, quantity: 1, returnUnitPrice: 1 }] })]) {
      expect((await request(app).post(root).set('Authorization', authorization()).send(input)).status).toBe(400);
    }
    expect((await request(app).post(root).send(draft())).status).toBe(401);
    const cashier = jwt.sign({ sub: '1', role: 'CASHIER', username: 'cashier', name: 'Cashier' }, env.JWT_SECRET, { algorithm: 'HS256', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn: '1h' });
    expect((await request(app).post(root).set('Authorization', 'Bearer ' + cashier).send(draft())).status).toBe(403);
    const created = await create();
    await prismaTest.supplier.update({ where: { id: supplierId }, data: { isActive: false } });
    expect((await request(app).post(root + '/' + created.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: 1 })).status).toBe(400);
  });

  it('lists returns with Vietnam date and status filters and summary across pages', async () => {
    const first = await create();
    await request(app).post(root + '/' + first.id + '/complete').set('Authorization', authorization()).send({ expectedVersion: 1 });
    await create({ ...draft(), returnedAt: '2026-08-01T05:00:00+07:00', refundAmount: 0 });
    const filtered = await request(app).get(root + '?from=2026-09-22&to=2026-09-22&statuses=COMPLETED&pageSize=1').set('Authorization', authorization());
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.pagination).toMatchObject({ totalRows: 1, totalPages: 1 });
    expect(filtered.body.data.items[0]).toMatchObject({ id: first.id, status: 'COMPLETED' });
    expect(filtered.body.data.summary).toMatchObject({ totalSubtotal: 300, totalVat: 28, totalDiscount: 20, totalRefund: 100, totalDue: 308 });
  });
});
