import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

function issueToken(id: number, username: string, name: string, role: 'ADMIN' | 'CASHIER') {
  return jwt.sign({ sub: String(id), username, name, role }, env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
  });
}

describe('Purchase receipt command API', () => {
  let adminToken: string;
  let cashierToken: string;
  let supplierId: number;
  let ingredientId: number;
  let secondIngredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({ data: { username: 'receipt_admin', passwordHash: 'hash', name: 'Quản lý nhập hàng', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: 'receipt_cashier', passwordHash: 'hash', name: 'Thu ngân nhập hàng', role: 'CASHIER' } })
    ]);
    adminToken = issueToken(admin.id, admin.username, admin.name, 'ADMIN');
    cashierToken = issueToken(cashier.id, cashier.username, cashier.name, 'CASHIER');
  });

  beforeEach(async () => {
    await prismaTest.auditLog.deleteMany();
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.purchaseReceiptLine.deleteMany();
    await prismaTest.purchaseReceipt.deleteMany();
    await prismaTest.supplier.deleteMany();
    await prismaTest.ingredient.deleteMany();

    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC000001', name: 'Công ty Hoàng Gia' } });
    const [ingredient, secondIngredient] = await Promise.all([
      prismaTest.ingredient.create({ data: { sku: 'NL-GAO', name: 'Gạo', unit: 'kg', currentStock: 10, costPerUnit: 15000 } }),
      prismaTest.ingredient.create({ data: { sku: 'NL-DAU', name: 'Dầu ăn', unit: 'lít', currentStock: 5, costPerUnit: 30000 } })
    ]);
    supplierId = supplier.id;
    ingredientId = ingredient.id;
    secondIngredientId = secondIngredient.id;
  });

  it('requires ADMIN access for purchase receipt commands', async () => {
    const unauthenticated = await request(app).get('/api/inventory/purchase-receipts');
    expect(unauthenticated.status).toBe(401);

    const forbidden = await request(app)
      .post('/api/inventory/purchase-receipts')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({});
    expect(forbidden.status).toBe(403);
  });

  it('creates an empty draft without changing stock or creating a ledger entry', async () => {
    const response = await request(app)
      .post('/api/inventory/purchase-receipts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Lưu trước, bổ sung sau' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      receiptCode: 'PN000001', status: 'DRAFT', supplierId: null,
      subtotalAmount: 0, discountAmount: 0, payableAmount: 0, paidAmount: 0, outstandingAmount: 0,
      note: 'Lưu trước, bổ sung sau', lines: []
    });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 10, costPerUnit: 15000 });
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
  });

  it('takes ingredient snapshots, calculates draft totals and exposes list/detail', async () => {
    const createResponse = await request(app)
      .post('/api/inventory/purchase-receipts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        receivedAt: '2026-09-21T03:30:00.000Z',
        invoiceNumber: 'HD-001',
        discountAmount: 5000,
        paidAmount: 10000,
        lines: [
          { ingredientId, ingredientSku: 'CLIENT-MUST-NOT-WIN', quantity: 2, unitCost: 20000, discountAmount: 1000 },
          { ingredientId: secondIngredientId, quantity: 1, unitCost: 40000 }
        ]
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data).toMatchObject({
      receiptCode: 'PN000001', status: 'DRAFT', subtotalAmount: 79000,
      discountAmount: 5000, payableAmount: 74000, paidAmount: 10000, outstandingAmount: 64000,
      supplier: { id: supplierId, code: 'NCC000001', name: 'Công ty Hoàng Gia' }
    });
    expect(createResponse.body.data.lines).toEqual([
      expect.objectContaining({ ingredientId, ingredientSku: 'NL-GAO', ingredientName: 'Gạo', unit: 'kg', lineAmount: 39000 }),
      expect.objectContaining({ ingredientId: secondIngredientId, ingredientSku: 'NL-DAU', ingredientName: 'Dầu ăn', unit: 'lít', lineAmount: 40000 })
    ]);

    const detail = await request(app)
      .get(`/api/inventory/purchase-receipts/${createResponse.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.lines).toHaveLength(2);

    const list = await request(app)
      .get('/api/inventory/purchase-receipts?page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({
      pagination: { page: 1, pageSize: 20, totalRows: 1, totalPages: 1 },
      totalPayableAmount: 74000
    });
    expect(list.body.data.items[0]).toMatchObject({ id: createResponse.body.data.id, payableAmount: 74000, outstandingAmount: 64000 });
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
  });

  it('replaces draft lines on update and keeps inventory unchanged', async () => {
    const created = await request(app)
      .post('/api/inventory/purchase-receipts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierId, lines: [{ ingredientId, quantity: 2, unitCost: 20000 }] });

    const updated = await request(app)
      .patch(`/api/inventory/purchase-receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        discountAmount: 1000,
        paidAmount: 5000,
        note: 'Đã đổi nguyên liệu',
        lines: [{ ingredientId: secondIngredientId, quantity: 3, unitCost: 40000, discountAmount: 2000 }]
      });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      subtotalAmount: 118000, discountAmount: 1000, payableAmount: 117000,
      paidAmount: 5000, outstandingAmount: 112000, note: 'Đã đổi nguyên liệu'
    });
    expect(updated.body.data.lines).toEqual([
      expect.objectContaining({ ingredientId: secondIngredientId, ingredientSku: 'NL-DAU', lineAmount: 118000 })
    ]);
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
    await expect(prismaTest.ingredient.findUnique({ where: { id: secondIngredientId } }))
      .resolves.toMatchObject({ currentStock: 5, costPerUnit: 30000 });
  });

  it('cancels only a draft and makes it immutable without changing inventory', async () => {
    const created = await request(app)
      .post('/api/inventory/purchase-receipts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierId, lines: [{ ingredientId, quantity: 1, unitCost: 18000 }] });

    const cancelled = await request(app)
      .post(`/api/inventory/purchase-receipts/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED' });

    const patchResponse = await request(app)
      .patch(`/api/inventory/purchase-receipts/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Không được sửa' });
    expect(patchResponse.status).toBe(409);

    const postResponse = await request(app)
      .post(`/api/inventory/purchase-receipts/${created.body.data.id}/post`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(postResponse.status).toBe(409);
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
  });

  it('rejects duplicate ingredients and an inactive supplier in a new draft', async () => {
    const duplicateLines = await request(app)
      .post('/api/inventory/purchase-receipts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        lines: [
          { ingredientId, quantity: 1, unitCost: 10000 },
          { ingredientId, quantity: 2, unitCost: 11000 }
        ]
      });
    expect(duplicateLines.status).toBe(400);
    expect(duplicateLines.body.error.code).toBe('VALIDATION_ERROR');

    await prismaTest.supplier.update({ where: { id: supplierId }, data: { isActive: false } });
    const inactiveSupplier = await request(app)
      .post('/api/inventory/purchase-receipts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ supplierId, lines: [] });
    expect(inactiveSupplier.status).toBe(400);
    expect(inactiveSupplier.body.error.message).toContain('Nhà cung cấp');
  });

  it('rejects a null received date instead of coercing it to the Unix epoch', async () => {
    const response = await request(app)
      .post('/api/inventory/purchase-receipts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ receivedAt: null });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
