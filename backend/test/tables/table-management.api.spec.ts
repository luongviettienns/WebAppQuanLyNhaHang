import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('table management API', () => {
  let adminToken: string;
  let cashierToken: string;
  const sign = (user: { id: number; username: string; name: string; role: 'ADMIN' | 'CASHIER' | 'KITCHEN' }) => jwt.sign(
    { sub: String(user.id), username: user.username, name: user.name, role: user.role }, env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
  );

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({ data: { username: `table-admin-${Date.now()}`, passwordHash: 'hash', name: 'Quản lý bàn', role: 'ADMIN' } });
    const cashier = await prismaTest.user.create({ data: { username: `table-cashier-${Date.now()}`, passwordHash: 'hash', name: 'Thu ngân', role: 'CASHIER' } });
    adminToken = sign(admin); cashierToken = sign(cashier);
  });

  it('creates an area and a table while preserving the generated QR identity on profile updates', async () => {
    const area = await request(app).post('/api/tables/areas').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Lầu 2', displayOrder: 2 });
    expect(area.status).toBe(201);
    const created = await request(app).post('/api/tables').set('Authorization', `Bearer ${adminToken}`).send({ displayName: 'Bàn cửa sổ', areaId: area.body.data.id, seatCount: 4, displayOrder: 8, note: 'Gần ban công' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ displayName: 'Bàn cửa sổ', area: { name: 'Lầu 2' }, seatCount: 4, displayOrder: 8, isActive: true });
    expect(created.body.data.qrCodeToken).toBeTruthy();
    expect(await prismaTest.auditLog.count({ where: { action: 'TABLE_CREATED', targetId: created.body.data.id } })).toBe(1);
    const updated = await request(app).patch(`/api/tables/${created.body.data.id}`).set('Authorization', `Bearer ${adminToken}`).send({ displayName: 'Bàn cửa sổ VIP', seatCount: 6 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ id: created.body.data.id, displayName: 'Bàn cửa sổ VIP', seatCount: 6, qrCodeToken: created.body.data.qrCodeToken });
    const list = await request(app).get('/api/tables/manage?search=VIP&areaId=' + area.body.data.id).set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200); expect(list.body.data.items).toHaveLength(1);
    const bySeats = await request(app).get('/api/tables/manage?search=6').set('Authorization', `Bearer ${adminToken}`);
    expect(bySeats.body.data.items.map((item: { id: number }) => item.id)).toContain(created.body.data.id);
  });

  it('returns a conflict instead of an internal error when a requested table number already exists', async () => {
    await prismaTest.diningTable.create({ data: { tableNumber: 12, qrCodeToken: `existing-${Date.now()}` } });
    const response = await request(app).post('/api/tables').set('Authorization', `Bearer ${adminToken}`).send({ displayName: 'Bàn trùng số', tableNumber: 12, seatCount: 4 });
    expect(response.status).toBe(409);
    expect(await prismaTest.diningTable.count({ where: { tableNumber: 12 } })).toBe(1);
  });

  it('restricts configuration to admin and rejects deactivating an occupied table', async () => {
    expect((await request(app).get('/api/tables/manage').set('Authorization', `Bearer ${cashierToken}`)).status).toBe(403);
    const table = await prismaTest.diningTable.create({ data: { tableNumber: 91, qrCodeToken: `qr-${Date.now()}`, status: 'OCCUPIED', currentOrderId: 123 } });
    const response = await request(app).patch(`/api/tables/${table.id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false });
    expect(response.status).toBe(409);
  });

  it('does not expose an inactive table as a valid customer QR context', async () => {
    const table = await prismaTest.diningTable.create({ data: { tableNumber: 92, displayName: 'Bàn tạm ngưng', qrCodeToken: `inactive-${Date.now()}`, isActive: false } });
    const response = await request(app).get(`/api/tables/qr/${table.qrCodeToken}`);
    expect(response.status).toBe(404);
  });

  it('previews and commits table imports atomically and exports a usable XLSX', async () => {
    await request(app).post('/api/tables/areas').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Phòng VIP' });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['Tên phòng/bàn', 'Khu vực', 'Số ghế', 'Số thứ tự', 'Ghi chú'],
      ['Bàn VIP 01', 'Phòng VIP', 8, 1, 'Cửa sổ']
    ]), 'Phong_ban');
    const fileBase64 = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
    const preview = await request(app).post('/api/tables/manage/import/preview').set('Authorization', `Bearer ${adminToken}`).send({ fileName: 'tables.xlsx', fileBase64 });
    expect(preview.status).toBe(200); expect(preview.body.data.validRows).toHaveLength(1); expect(await prismaTest.diningTable.count()).toBe(0);
    const commit = await request(app).post('/api/tables/manage/import/commit').set('Authorization', `Bearer ${adminToken}`).send({ rows: preview.body.data.validRows.map((row: { data: unknown }) => row.data) });
    expect(commit.status).toBe(201); expect(commit.body.data.createdCount).toBe(1);
    const exported = await request(app).get('/api/tables/manage/export?format=xlsx').set('Authorization', `Bearer ${adminToken}`);
    expect(exported.status).toBe(200); expect(exported.headers['content-type']).toContain('spreadsheetml');
    const template = await request(app).get('/api/tables/manage/import/template').set('Authorization', `Bearer ${adminToken}`);
    expect(template.status).toBe(200); expect(template.headers['content-type']).toContain('spreadsheetml');
  });
});
