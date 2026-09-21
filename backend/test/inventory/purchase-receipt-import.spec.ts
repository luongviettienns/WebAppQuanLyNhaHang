import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

function issueAdminToken(id: number, username: string, name: string): string {
  return jwt.sign({ sub: String(id), username, name, role: 'ADMIN' }, env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
  });
}

function workbookBase64(rows: Array<Array<string | number>>): string {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Mã nguyên liệu', 'Tên nguyên liệu', 'Đơn vị tính', 'Số lượng nhập', 'Đơn giá nhập (VND)', 'Ghi chú'],
    ...rows
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Import');
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

describe('Purchase receipt Excel preview API', () => {
  let adminToken: string;
  let ingredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: 'receipt_import_admin', passwordHash: 'hash', name: 'Quản lý nhập Excel', role: 'ADMIN' }
    });
    adminToken = issueAdminToken(admin.id, admin.username, admin.name);
  });

  beforeEach(async () => {
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.purchaseReceiptLine.deleteMany();
    await prismaTest.purchaseReceipt.deleteMany();
    await prismaTest.supplier.deleteMany();
    await prismaTest.ingredient.deleteMany();
    const ingredient = await prismaTest.ingredient.create({
      data: { sku: 'NL-GAO-PREVIEW', name: 'Gạo preview', unit: 'kg', currentStock: 10, costPerUnit: 15000 }
    });
    ingredientId = ingredient.id;
  });

  it('previews valid rows and errors without creating a receipt or stock transaction', async () => {
    const response = await request(app)
      .post('/api/inventory/purchase-receipts/import/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fileName: 'phieu-nhap.xlsx',
        fileBase64: workbookBase64([
          ['NL-GAO-PREVIEW', 'Tên từ file không được ghi đè', 'kg', 3, 20000, 'Lô sáng'],
          ['NL-KHONG-TON-TAI', 'Không tồn tại', 'kg', 1, 10000, '']
        ])
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ fileName: 'phieu-nhap.xlsx', totalRows: 2 });
    expect(response.body.data.validRows).toEqual([
      expect.objectContaining({
        rowNumber: 2, ingredientId, ingredientSku: 'NL-GAO-PREVIEW', ingredientName: 'Gạo preview',
        unit: 'kg', quantity: 3, unitCost: 20000, discountAmount: 0, note: 'Lô sáng'
      })
    ]);
    expect(response.body.data.errorRows).toEqual([
      expect.objectContaining({ rowNumber: 3, sku: 'NL-KHONG-TON-TAI' })
    ]);
    await expect(prismaTest.purchaseReceipt.count()).resolves.toBe(0);
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 10, costPerUnit: 15000 });
  });

  it('rejects an empty workbook before touching inventory', async () => {
    const response = await request(app)
      .post('/api/inventory/purchase-receipts/import/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'empty.xlsx', fileBase64: workbookBase64([]) });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('không có dữ liệu hợp lệ');
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
  });
});
