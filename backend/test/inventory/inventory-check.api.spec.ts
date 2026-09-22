import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

function issueToken(id: number, username: string, name: string, role: 'ADMIN' | 'CASHIER') {
  return jwt.sign({ sub: String(id), username, name, role }, env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
  });
}

describe('Inventory check command API', () => {
  let adminToken: string;
  let cashierToken: string;
  let ingredientId: number;
  let secondIngredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({ data: { username: 'check_api_admin', passwordHash: 'hash', name: 'Quản lý kiểm kho API', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: 'check_api_cashier', passwordHash: 'hash', name: 'Thu ngân kiểm kho API', role: 'CASHIER' } })
    ]);
    adminToken = issueToken(admin.id, admin.username, admin.name, 'ADMIN');
    cashierToken = issueToken(cashier.id, cashier.username, cashier.name, 'CASHIER');
  });

  beforeEach(async () => {
    await prismaTest.auditLog.deleteMany();
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.inventoryCheckLine.deleteMany();
    await prismaTest.inventoryCheck.deleteMany();
    await prismaTest.ingredient.deleteMany();
    const [ingredient, secondIngredient] = await Promise.all([
      prismaTest.ingredient.create({ data: { sku: 'NL-API-1', name: 'Nguyên liệu API 1', unit: 'kg', currentStock: 10, costPerUnit: 10000 } }),
      prismaTest.ingredient.create({ data: { sku: 'NL-API-2', name: 'Nguyên liệu API 2', unit: 'lít', currentStock: 4, costPerUnit: 5000 } })
    ]);
    ingredientId = ingredient.id;
    secondIngredientId = secondIngredient.id;
  });

  it('protects the stocktake routes with ADMIN authorization', async () => {
    expect((await request(app).get('/api/inventory/checks')).status).toBe(401);
    expect((await request(app).get('/api/inventory/checks').set('Authorization', `Bearer ${cashierToken}`)).status).toBe(403);
  });

  it('creates, updates, lists and balances a stocktake through the API', async () => {
    const created = await request(app)
      .post('/api/inventory/checks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Kiểm kho cuối ca', lines: [{ ingredientId, actualQuantity: 8 }, { ingredientId: secondIngredientId, actualQuantity: 4 }] });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ checkCode: 'KK000001', status: 'DRAFT', totalActualQuantity: 12, uncheckedCount: 0 });
    expect(created.body.data.lines).toEqual([
      expect.objectContaining({ ingredientId, systemQuantity: 10, actualQuantity: 8, varianceQuantity: null }),
      expect.objectContaining({ ingredientId: secondIngredientId, systemQuantity: 4, actualQuantity: 4 })
    ]);

    const updated = await request(app)
      .patch(`/api/inventory/checks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Đã rà soát', lines: [{ ingredientId, actualQuantity: 9 }, { ingredientId: secondIngredientId, actualQuantity: 4 }] });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ note: 'Đã rà soát', totalVarianceValue: -10000 });

    const balanced = await request(app)
      .post(`/api/inventory/checks/${created.body.data.id}/balance`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(balanced.status).toBe(200);
    expect(balanced.body.data).toMatchObject({ status: 'BALANCED', totalVarianceValue: -10000 });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } })).resolves.toMatchObject({ currentStock: 9 });
    await expect(prismaTest.inventoryTransaction.count({ where: { inventoryCheckId: created.body.data.id } })).resolves.toBe(1);

    const list = await request(app)
      .get('/api/inventory/checks?statuses=BALANCED&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({ pagination: { totalRows: 1 }, totalVarianceValue: -10000, increasedQuantity: 0, decreasedQuantity: 1 });

    const detail = await request(app)
      .get(`/api/inventory/checks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.recentChecks).toEqual([]);
  });

  it('previews Excel actual quantities and exports CSV', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Mã nguyên liệu', 'Tên nguyên liệu', 'Đơn vị tính', 'Số lượng thực tế'],
      ['NL-API-1', 'Tên từ file', 'kg', 7],
      ['NL-UNKNOWN', 'Không tồn tại', 'kg', 2]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Kiem_kho');
    const fileBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const preview = await request(app)
      .post('/api/inventory/checks/import/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'kiem-kho.xlsx', fileBase64 });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ totalRows: 2, validRows: [expect.objectContaining({ ingredientId, actualQuantity: 7 })] });
    expect(preview.body.data.errorRows[0].error).toContain('không tồn tại');

    await request(app).post('/api/inventory/checks').set('Authorization', `Bearer ${adminToken}`).send({ lines: [{ ingredientId, actualQuantity: 7 }] });
    const exported = await request(app).get('/api/inventory/checks/export?format=csv').set('Authorization', `Bearer ${adminToken}`);
    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.text).toContain('Mã kiểm kho');
    expect(exported.text).toContain('KK000001');
  });
});
