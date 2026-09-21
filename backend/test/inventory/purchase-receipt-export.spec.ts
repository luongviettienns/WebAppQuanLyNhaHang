import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

describe('Purchase receipt list and export API', () => {
  let adminToken: string;
  let supplierId: number;
  let ingredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: 'receipt_export_admin', passwordHash: 'hash', name: 'Quản lý xuất phiếu', role: 'ADMIN' }
    });
    adminToken = issueAdminToken(admin.id, admin.username, admin.name);
  });

  beforeEach(async () => {
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.purchaseReceiptLine.deleteMany();
    await prismaTest.purchaseReceipt.deleteMany();
    await prismaTest.supplier.deleteMany();
    await prismaTest.ingredient.deleteMany();
    const supplier = await prismaTest.supplier.create({
      data: { code: 'NCC000010', name: 'Công ty Hoàng Gia' }
    });
    supplierId = supplier.id;
    const ingredient = await prismaTest.ingredient.create({
      data: { sku: 'NL-EXPORT', name: 'Nguyên liệu export', unit: 'kg', currentStock: 0, costPerUnit: 20000 }
    });
    ingredientId = ingredient.id;
  });

  it('filters receipts by status, date range and search text', async () => {
    await prismaTest.purchaseReceipt.createMany({
      data: [
        {
          receiptCode: 'PN000010', supplierId, receivedAt: new Date('2026-09-10T08:00:00.000Z'),
          status: 'POSTED', subtotalAmount: 100000, discountAmount: 0, paidAmount: 20000
        },
        {
          receiptCode: 'PN000011', supplierId, receivedAt: new Date('2026-09-11T08:00:00.000Z'),
          status: 'DRAFT', subtotalAmount: 80000, discountAmount: 0, paidAmount: 0
        },
        {
          receiptCode: 'PN000012', supplierId, receivedAt: new Date('2026-10-01T08:00:00.000Z'),
          status: 'POSTED', subtotalAmount: 70000, discountAmount: 0, paidAmount: 0
        }
      ]
    });
    const receipt = await prismaTest.purchaseReceipt.findUniqueOrThrow({ where: { receiptCode: 'PN000010' } });
    await prismaTest.purchaseReceiptLine.create({
      data: {
        purchaseReceiptId: receipt.id, ingredientId, ingredientSku: 'NL-EXPORT', ingredientName: 'Nguyên liệu export',
        unit: 'kg', quantity: 5, unitCost: 20000
      }
    });

    const response = await request(app)
      .get('/api/inventory/purchase-receipts?status=POSTED&from=2026-09-01&to=2026-09-30&search=PN000010')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      receiptCode: 'PN000010', status: 'POSTED', payableAmount: 100000, paidAmount: 20000, outstandingAmount: 80000
    });
    expect(response.body.data.totalPayableAmount).toBe(100000);
  });

  it('exports only POSTED receipts inside the selected date range', async () => {
    await prismaTest.purchaseReceipt.createMany({
      data: [
        {
          receiptCode: 'PN000010', supplierId, receivedAt: new Date('2026-09-10T08:00:00.000Z'),
          status: 'POSTED', subtotalAmount: 100000, discountAmount: 0, paidAmount: 20000
        },
        {
          receiptCode: 'PN000011', supplierId, receivedAt: new Date('2026-09-11T08:00:00.000Z'),
          status: 'DRAFT', subtotalAmount: 80000, discountAmount: 0, paidAmount: 0
        },
        {
          receiptCode: 'PN000012', supplierId, receivedAt: new Date('2026-10-01T08:00:00.000Z'),
          status: 'POSTED', subtotalAmount: 70000, discountAmount: 0, paidAmount: 0
        }
      ]
    });

    const response = await request(app)
      .get('/api/inventory/purchase-receipts/export?status=POSTED&from=2026-09-01&to=2026-09-30&format=csv')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(/purchase_receipts_.*\.csv/);
    expect(response.text).toContain('Mã phiếu,Thời gian,Nhà cung cấp,Tổng tiền hàng,Giảm giá,Cần trả,Đã trả,Công nợ,Trạng thái');
    expect(response.text).toContain('PN000010');
    expect(response.text).not.toContain('PN000011');
    expect(response.text).not.toContain('PN000012');
  });
});
