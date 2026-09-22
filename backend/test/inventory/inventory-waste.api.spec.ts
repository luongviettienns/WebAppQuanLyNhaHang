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

describe('inventory waste command API', () => {
  let adminToken: string;
  let cashierToken: string;
  let ingredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({ data: { username: 'waste_api_admin', passwordHash: 'hash', name: 'Quản lý xuất hủy API', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: 'waste_api_cashier', passwordHash: 'hash', name: 'Thu ngân xuất hủy API', role: 'CASHIER' } })
    ]);
    adminToken = issueToken(admin.id, admin.username, admin.name, 'ADMIN');
    cashierToken = issueToken(cashier.id, cashier.username, cashier.name, 'CASHIER');
  });

  beforeEach(async () => {
    await prismaTest.auditLog.deleteMany();
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.inventoryWasteLine.deleteMany();
    await prismaTest.inventoryWaste.deleteMany();
    await prismaTest.ingredient.deleteMany();
    const ingredient = await prismaTest.ingredient.create({
      data: { sku: 'NL-WASTE-API-1', name: 'Nguyên liệu xuất hủy API', unit: 'kg', currentStock: 10, costPerUnit: 10000 }
    });
    ingredientId = ingredient.id;
  });

  it('protects waste routes with ADMIN authorization', async () => {
    expect((await request(app).get('/api/inventory/wastes')).status).toBe(401);
    expect((await request(app).get('/api/inventory/wastes').set('Authorization', 'Bearer ' + cashierToken)).status).toBe(403);
  });

  it('creates, lists, and completes an inventory waste through the API', async () => {
    const created = await request(app)
      .post('/api/inventory/wastes')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ note: 'Vỏ bao bì bị hỏng', lines: [{ ingredientId, quantity: 3 }] });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      wasteCode: 'XH000001',
      status: 'DRAFT',
      totalQuantity: 3,
      lines: [expect.objectContaining({ ingredientId, systemQuantity: 10, lineValue: 30000 })]
    });

    const completed = await request(app)
      .post('/api/inventory/wastes/' + created.body.data.id + '/complete')
      .set('Authorization', 'Bearer ' + adminToken);

    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ status: 'COMPLETED', totalValue: 30000 });

    const list = await request(app)
      .get('/api/inventory/wastes?statuses=COMPLETED&page=1&pageSize=20')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({ pagination: { totalRows: 1 }, totalValue: 30000 });
  });

  it('returns a conflict without reducing stock when completion exceeds available inventory', async () => {
    const created = await request(app)
      .post('/api/inventory/wastes')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ note: 'Hàng hỏng', lines: [{ ingredientId, quantity: 11 }] });

    const completed = await request(app)
      .post('/api/inventory/wastes/' + created.body.data.id + '/complete')
      .set('Authorization', 'Bearer ' + adminToken);

    expect(completed.status).toBe(409);
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 10 });
    await expect(prismaTest.inventoryTransaction.count({ where: { inventoryWasteId: created.body.data.id } })).resolves.toBe(0);
  });

  it('previews Excel waste rows and exports filtered CSV', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Mã nguyên liệu', 'Tên nguyên liệu', 'Đơn vị tính', 'Số lượng hủy', 'Ghi chú'],
      ['NL-WASTE-API-1', 'Tên trong file', 'kg', 2, 'Bao bì rách'],
      ['NL-WASTE-UNKNOWN', 'Không tồn tại', 'kg', 1, 'Sai mã']
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Xuat_huy');
    const fileBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

    const preview = await request(app)
      .post('/api/inventory/wastes/import/preview')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ fileName: 'xuat-huy.xlsx', fileBase64 });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({
      totalRows: 2,
      validRows: [expect.objectContaining({ ingredientId, quantity: 2, costPerUnit: 10000, note: 'Bao bì rách' })]
    });
    expect(preview.body.data.errorRows[0].error).toContain('không tồn tại');

    await request(app)
      .post('/api/inventory/wastes')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ note: 'Bao bì rách', lines: [{ ingredientId, quantity: 2 }] });
    const exported = await request(app)
      .get('/api/inventory/wastes/export?format=csv')
      .set('Authorization', 'Bearer ' + adminToken);

    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.text).toContain('Mã xuất hủy');
    expect(exported.text).toContain('XH000001');
  });
});
