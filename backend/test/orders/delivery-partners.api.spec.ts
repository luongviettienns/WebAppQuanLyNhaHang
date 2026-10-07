import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('delivery partners API', () => {
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({ data: { username: `delivery-admin-${Date.now()}`, passwordHash: 'hash', name: 'Điều phối', role: 'ADMIN' } });
    token = jwt.sign({ sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role }, env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
    });
  });

  it('creates grouped partners with an automatic DT code and lists their derived zero metrics', async () => {
    const group = await request(app).post('/api/orders/delivery-partner-groups').set(auth()).send({ name: 'Nội thành' });
    expect(group.status).toBe(201);

    const created = await request(app).post('/api/orders/delivery-partners').set(auth()).send({
      name: 'Shipper 01', phone: '0903000280', email: 'shipper@example.com', partnerType: 'INDIVIDUAL',
      address: 'Quận 1, TP.HCM', groupId: group.body.data.id, note: 'Ca sáng'
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code: expect.stringMatching(/^DT\d{6,}$/), name: 'Shipper 01', group: { name: 'Nội thành' }, totalOrders: 0, totalDeliveryFee: 0, outstandingAmount: 0 });

    const list = await request(app).get('/api/orders/delivery-partners?search=Shipper').set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.summary).toMatchObject({ totalOrders: 0, totalDeliveryFee: 0, outstandingAmount: 0 });

    const selectable = await request(app).get('/api/orders/delivery-partners/selectable?search=0903').set(auth());
    expect(selectable.status).toBe(200);
    expect(selectable.body.data[0]).toMatchObject({ id: created.body.data.id, name: 'Shipper 01', isActive: true });
  });

  it('validates profiles and keeps delivery-partner endpoints restricted to cashier or admin', async () => {
    expect((await request(app).get('/api/orders/delivery-partners')).status).toBe(401);
    const invalid = await request(app).post('/api/orders/delivery-partners').set(auth()).send({ name: '', phone: 'abc' });
    expect(invalid.status).toBe(400);
    const invalidGroup = await request(app).post('/api/orders/delivery-partners').set(auth()).send({ name: 'Sai nhóm', groupId: 99999 });
    expect(invalidGroup.status).toBe(400);
  });

  it('creates a delivery order only for an active partner and includes the delivery fee in the final amount', async () => {
    const partner = await request(app).post('/api/orders/delivery-partners').set(auth()).send({ name: 'Shipper tạo đơn', phone: '0903000281' });
    const category = await prismaTest.category.create({ data: { name: `Món giao ${Date.now()}` } });
    const menuItem = await prismaTest.menuItem.create({ data: { categoryId: category.id, sku: `DELIVERY-${Date.now()}`, name: 'Mì giao tận nơi', basePrice: 50000 } });

    const created = await request(app).post('/api/orders').set(auth()).send({
      orderType: 'DELIVERY', deliveryPartnerId: partner.body.data.id, deliveryAddress: '12 Nguyễn Huệ, Quận 1', deliveryFee: 15000,
      items: [{ menuItemId: menuItem.id, quantity: 2 }]
    });
    expect(created.status).toBe(201);
    expect(created.body.data.order).toMatchObject({ orderType: 'DELIVERY', deliveryPartnerId: partner.body.data.id, deliveryFee: 15000, totalAmount: 100000, vatAmount: 7407, finalAmount: 115000 });

    const noAddress = await request(app).post('/api/orders').set(auth()).send({ orderType: 'DELIVERY', deliveryPartnerId: partner.body.data.id, items: [{ menuItemId: menuItem.id, quantity: 1 }] });
    expect(noAddress.status).toBe(400);
  });

  it('derives fees and outstanding debt from completed delivery orders only', async () => {
    const partner = await request(app).post('/api/orders/delivery-partners').set(auth()).send({ name: 'Shipper báo cáo' });
    await prismaTest.order.createMany({ data: [
      { code: `DEL-COMPLETE-${Date.now()}`, orderType: 'DELIVERY', status: 'COMPLETED', deliveryPartnerId: partner.body.data.id, deliveryAddress: 'A', deliveryFee: 20000, deliveryFeePaid: 5000, totalAmount: 0, vatAmount: 0, finalAmount: 20000 },
      { code: `DEL-PENDING-${Date.now()}`, orderType: 'DELIVERY', status: 'PENDING', deliveryPartnerId: partner.body.data.id, deliveryAddress: 'B', deliveryFee: 90000, totalAmount: 0, vatAmount: 0, finalAmount: 90000 }
    ] });
    const list = await request(app).get('/api/orders/delivery-partners').set(auth());
    expect(list.body.data.items[0]).toMatchObject({ totalOrders: 1, totalDeliveryFee: 20000, outstandingAmount: 15000 });
  });

  it('previews, atomically imports and exports XLSX delivery partners', async () => {
    const group = await request(app).post('/api/orders/delivery-partner-groups').set(auth()).send({ name: 'Ngoại thành' });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['Mã đối tác', 'Tên đối tác', 'Điện thoại', 'Email', 'Loại đối tác', 'Nhóm đối tác'],
      ['DT-IMPORT-1', 'Shipper import', '0903000900', 'import@example.com', 'Cá nhân', 'Ngoại thành']
    ]), 'Doi_tac');
    const fileBase64 = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
    const preview = await request(app).post('/api/orders/delivery-partners/import/preview').set(auth()).send({ fileName: 'partners.xlsx', fileBase64 });
    expect(preview.status).toBe(200); expect(preview.body.data.validRows).toHaveLength(1);
    const committed = await request(app).post('/api/orders/delivery-partners/import/commit').set(auth()).send({ rows: preview.body.data.validRows.map((row: { data: unknown }) => row.data) });
    expect(committed.status).toBe(201); expect(committed.body.data.createdCount).toBe(1);
    const exported = await request(app).get('/api/orders/delivery-partners/export?format=xlsx').set(auth());
    expect(exported.status).toBe(200); expect(exported.headers['content-type']).toContain('spreadsheetml');
    const template = await request(app).get('/api/orders/delivery-partners/import/template').set(auth());
    expect(template.status).toBe(200); expect(template.headers['content-type']).toContain('spreadsheetml');
    expect(group.status).toBe(201);
  });
});
