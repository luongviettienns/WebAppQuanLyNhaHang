import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('supplier management workspace', () => {
  let token: string;
  beforeEach(async () => {
    await truncateAllTables();
    const user = await prismaTest.user.create({ data: { username: 'supplier_manager', name: 'Quản lý', passwordHash: 'hash', role: 'ADMIN' } });
    token = jwt.sign({ sub: String(user.id), username: user.username, name: user.name, role: 'ADMIN' }, env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
    });
  });
  const url = '/api/inventory';
  const workbook = (rows: unknown[][]) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'NCC');
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
  };

  it('persists grouped profiles and clears optional fields without deleting history', async () => {
    const group = await request(app).post(url + '/supplier-groups').set('Authorization', 'Bearer ' + token).send({ name: 'Thực phẩm' });
    expect(group.status).toBe(201);
    const created = await request(app).post(url + '/suppliers').set('Authorization', 'Bearer ' + token).send({
      name: 'Nhà cung cấp A', email: 'a@example.com', groupId: group.body.data.id,
      identityNumber: '012345678901', companyName: 'Công ty A', province: 'Hà Nội', ward: 'Ba Đình'
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ identityNumber: '012345678901', companyName: 'Công ty A', group: { name: 'Thực phẩm' } });
    const updated = await request(app).patch(url + '/suppliers/' + created.body.data.id).set('Authorization', 'Bearer ' + token)
      .send({ email: null, groupId: null, isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ email: null, groupId: null, group: null, isActive: false });
    const detail = await request(app).get(url + '/suppliers/' + created.body.data.id).set('Authorization', 'Bearer ' + token);
    expect(detail.status).toBe(200);
    expect(detail.body.data.code).toBe(created.body.data.code);
    const rename = await request(app).patch(url + '/supplier-groups/' + group.body.data.id).set('Authorization', 'Bearer ' + token).send({ name: 'Đồ khô' });
    expect(rename.status).toBe(200);
    expect(rename.body.data.name).toBe('Đồ khô');
  });

  it('rejects invalid groups and protects new endpoints', async () => {
    const response = await request(app).post(url + '/suppliers').set('Authorization', 'Bearer ' + token).send({ name: 'Nhóm sai', groupId: 99999 });
    expect(response.status).toBe(400);
    for (const path of ['/supplier-groups', '/suppliers/export', '/suppliers/import/template', '/suppliers/1/receipts']) {
      expect((await request(app).get(url + path)).status).toBe(401);
    }
  });

  it('counts only posted net purchases and keeps lifetime outstanding when filtering Vietnam dates', async () => {
    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC-A', name: 'Công ty A' } });
    await prismaTest.purchaseReceipt.createMany({ data: [
      { receiptCode: 'PN-A', supplierId: supplier.id, status: 'POSTED', receivedAt: new Date('2026-09-21T17:00:00Z'), subtotalAmount: 100000, discountAmount: 10000, paidAmount: 30000 },
      { receiptCode: 'PN-B', supplierId: supplier.id, status: 'POSTED', receivedAt: new Date('2026-09-22T16:59:59Z'), subtotalAmount: 20000, paidAmount: 20000 },
      { receiptCode: 'PN-C', supplierId: supplier.id, status: 'DRAFT', receivedAt: new Date('2026-09-22T05:00:00Z'), subtotalAmount: 999999 },
      { receiptCode: 'PN-D', supplierId: supplier.id, status: 'CANCELLED', receivedAt: new Date('2026-09-22T05:00:00Z'), subtotalAmount: 999999 }
    ] });
    const list = await request(app).get(url + '/suppliers?from=2026-09-22&to=2026-09-22').set('Authorization', 'Bearer ' + token);
    expect(list.status).toBe(200);
    expect(list.body.data.items[0]).toMatchObject({ totalPurchase: 110000, outstandingAmount: 60000 });
    expect(list.body.data.summary).toMatchObject({ totalPurchase: 110000, outstandingAmount: 60000 });
    const outside = await request(app).get(url + '/suppliers?from=2026-09-23&to=2026-09-23').set('Authorization', 'Bearer ' + token);
    expect(outside.body.data.items[0]).toMatchObject({ totalPurchase: 0, outstandingAmount: 60000 });
    const history = await request(app).get(url + '/suppliers/' + supplier.id + '/receipts?pageSize=2').set('Authorization', 'Bearer ' + token);
    expect(history.status).toBe(200);
    expect(history.body.data.pagination.totalRows).toBe(4);
    expect(history.body.data.items).toHaveLength(2);
  });

  it('filters amounts before pagination and includes suppliers with no posted purchases', async () => {
    const [a, b] = await Promise.all(['A', 'B'].map(code => prismaTest.supplier.create({ data: { code, name: 'Supplier ' + code } })));
    await prismaTest.purchaseReceipt.create({ data: { receiptCode: 'PN1', supplierId: b.id, status: 'POSTED', receivedAt: new Date(), subtotalAmount: 5000 } });
    const all = await request(app).get(url + '/suppliers?pageSize=1').set('Authorization', 'Bearer ' + token);
    expect(all.body.data.summary).toMatchObject({ totalPurchase: 5000, outstandingAmount: 5000 });
    expect(all.body.data.pagination.totalRows).toBe(2);
    const filtered = await request(app).get(url + '/suppliers?minPurchase=1&pageSize=1').set('Authorization', 'Bearer ' + token);
    expect(filtered.body.data.items.map((item: { id: number }) => item.id)).toEqual([b.id]);
    expect(filtered.body.data.pagination.totalRows).toBe(1);
    const zero = await request(app).get(url + '/suppliers?maxPurchase=0&groupId=0').set('Authorization', 'Bearer ' + token);
    expect(zero.body.data.items.map((item: { id: number }) => item.id)).toEqual([a.id]);
    expect((await request(app).get(url + '/suppliers?from=2026-02-30').set('Authorization', 'Bearer ' + token)).status).toBe(400);
    expect((await request(app).get(url + '/suppliers?minPurchase=10&maxPurchase=1').set('Authorization', 'Bearer ' + token)).status).toBe(400);
  });

  it('previews without writes and atomically creates imports with duplicate protection', async () => {
    const fileBase64 = workbook([['Mã nhà cung cấp', 'Tên nhà cung cấp', 'Điện thoại', 'Email'], ['IMP1', 'Đại lý Một', '0900000001', 'one@example.com']]);
    const preview = await request(app).post(url + '/suppliers/import/preview').set('Authorization', 'Bearer ' + token).send({ fileName: 'suppliers.xlsx', fileBase64 });
    expect(preview.status).toBe(200);
    expect(preview.body.data.validRows).toHaveLength(1);
    expect(await prismaTest.supplier.count()).toBe(0);
    const imported = await request(app).post(url + '/suppliers/import/commit').set('Authorization', 'Bearer ' + token).send({ rows: preview.body.data.validRows.map((row: { data: unknown }) => row.data) });
    expect(imported.status).toBe(201);
    expect(imported.body.data.createdCount).toBe(1);
    const duplicate = await request(app).post(url + '/suppliers/import/commit').set('Authorization', 'Bearer ' + token).send({ rows: [{ code: 'IMP2', name: 'Mới hợp lệ' }, { code: 'imp1', name: 'Trùng có sẵn' }] });
    expect(duplicate.status).toBe(409);
    expect(await prismaTest.supplier.count()).toBe(1);
    const invalid = await request(app).post(url + '/suppliers/import/preview').set('Authorization', 'Bearer ' + token).send({ fileName: 'bad.xlsx', fileBase64: workbook([['Mã nhà cung cấp', 'Tên nhà cung cấp'], ['NEW', 'A'], ['IMP1', 'Trùng']]) });
    expect(invalid.body.data.errorRows).toHaveLength(2);
  });

  it('exports selected filtered rows as text-safe CSV and downloads a usable template', async () => {
    const selected = await prismaTest.supplier.create({ data: { code: 'CSV1', name: '=HYPERLINK("bad")', phone: '+84900000000' } });
    await prismaTest.supplier.create({ data: { code: 'CSV2', name: 'Không chọn' } });
    const csv = await request(app).get(url + '/suppliers/export?format=csv&ids=' + selected.id).set('Authorization', 'Bearer ' + token);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('CSV1');
    expect(csv.text).not.toContain('CSV2');
    expect(csv.text).toContain("'=HYPERLINK");
    const template = await request(app).get(url + '/suppliers/import/template').set('Authorization', 'Bearer ' + token);
    expect(template.status).toBe(200);
    expect(template.headers['content-type']).toContain('spreadsheetml');
  });
});
