import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';

describe('General price list API', () => {
  let adminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);

    adminToken = jwt.sign(
      { sub: '1', username: 'admin', name: 'Admin', role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    cashierToken = jwt.sign(
      { sub: '2', username: 'cashier', name: 'Cashier', role: 'CASHIER' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('rejects unauthenticated and non-admin access', async () => {
    const unauthenticated = await request(app).get('/api/price-lists/general');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe('UNAUTHENTICATED');

    const cashier = await request(app)
      .get('/api/price-lists/general')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(cashier.status).toBe(403);
    expect(cashier.body.error.code).toBe('FORBIDDEN');
  });

  it('returns the general price list with menu rows for ADMIN', async () => {
    const response = await request(app)
      .get('/api/price-lists/general')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.priceList.code).toBe('GENERAL');
    expect(response.body.data.items.length).toBeGreaterThan(0);
    expect(response.body.data.items[0]).toEqual(expect.objectContaining({
      menuItemId: expect.any(Number),
      sku: expect.stringMatching(/^SP\d{6}$/),
      salePrice: expect.any(Number),
      version: 1
    }));
  });

  it('updates one price, mirrors basePrice and exposes it through the menu API', async () => {
    const row = await prismaTest.priceListItem.findFirstOrThrow({ include: { menuItem: true } });
    const nextPrice = row.salePrice + 7000;

    const response = await request(app)
      .patch(`/api/price-lists/${row.priceListId}/items/${row.menuItemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salePrice: nextPrice, expectedVersion: row.version });

    expect(response.status).toBe(200);
    expect(response.body.data.item.salePrice).toBe(nextPrice);
    expect(response.body.data.item.version).toBe(row.version + 1);

    const updatedMenuItem = await prismaTest.menuItem.findUniqueOrThrow({ where: { id: row.menuItemId } });
    expect(updatedMenuItem.basePrice).toBe(nextPrice);

    const menuResponse = await request(app).get('/api/menu');
    const itemFromMenu = menuResponse.body.data.categories
      .flatMap((category: { menuItems: Array<{ id: number; basePrice: number }> }) => category.menuItems)
      .find((item: { id: number }) => item.id === row.menuItemId);
    expect(itemFromMenu.basePrice).toBe(nextPrice);
  });

  it('returns CONFLICT and preserves the newer value for a stale version', async () => {
    const row = await prismaTest.priceListItem.findFirstOrThrow();
    const newerPrice = row.salePrice + 1000;
    await prismaTest.priceListItem.update({
      where: { id: row.id },
      data: { salePrice: newerPrice, version: row.version + 1 }
    });

    const response = await request(app)
      .patch(`/api/price-lists/${row.priceListId}/items/${row.menuItemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salePrice: row.salePrice + 2000, expectedVersion: row.version });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect((await prismaTest.priceListItem.findUniqueOrThrow({ where: { id: row.id } })).salePrice).toBe(newerPrice);
  });

  it('rejects a non-positive sale price', async () => {
    const row = await prismaTest.priceListItem.findFirstOrThrow();
    const response = await request(app)
      .patch(`/api/price-lists/${row.priceListId}/items/${row.menuItemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ salePrice: 0, expectedVersion: row.version + 1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uses the price-list value in GET /api/menu when the legacy mirror is stale', async () => {
    const item = await prismaTest.menuItem.findFirstOrThrow({ where: { modifierGroups: { none: {} } } });
    const row = await prismaTest.priceListItem.findFirstOrThrow({ where: { menuItemId: item.id } });
    const priceListSalePrice = item.basePrice + 4321;
    await prismaTest.priceListItem.update({ where: { id: row.id }, data: { salePrice: priceListSalePrice } });
    await prismaTest.menuItem.update({ where: { id: item.id }, data: { basePrice: item.basePrice } });

    const menuResponse = await request(app).get('/api/menu');
    const itemFromMenu = menuResponse.body.data.categories
      .flatMap((category: { menuItems: Array<{ id: number; basePrice: number }> }) => category.menuItems)
      .find((candidate: { id: number }) => candidate.id === item.id);
    expect(itemFromMenu.basePrice).toBe(priceListSalePrice);
  });

  it('uses the latest price-list value and snapshots it on a new order', async () => {
    const item = await prismaTest.menuItem.findFirstOrThrow({ where: { modifierGroups: { none: {} } } });
    const row = await prismaTest.priceListItem.findFirstOrThrow({ where: { menuItemId: item.id } });
    const latestPrice = row.salePrice + 6789;
    await prismaTest.priceListItem.update({ where: { id: row.id }, data: { salePrice: latestPrice } });
    await prismaTest.menuItem.update({ where: { id: item.id }, data: { basePrice: row.salePrice } });

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderType: 'TAKE_AWAY',
        items: [{ menuItemId: item.id, quantity: 1 }]
      });

    expect(response.status).toBe(201);
    expect(response.body.data.order.priceListId).toBe(row.priceListId);
    expect(response.body.data.order.items[0].unitPrice).toBe(latestPrice);
  });

  it('applies a bulk percentage operation atomically', async () => {
    const rows = await prismaTest.priceListItem.findMany({ take: 2 });
    const before = rows.map(row => row.salePrice);
    const response = await request(app)
      .patch(`/api/price-lists/${rows[0].priceListId}/items/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        menuItemIds: rows.map(row => row.menuItemId),
        operation: { mode: 'percent', value: 10, rounding: 1000 }
      });

    expect(response.status).toBe(200);
    expect(response.body.data.updatedCount).toBe(2);
    const after = await prismaTest.priceListItem.findMany({ where: { id: { in: rows.map(row => row.id) } } });
    expect(after.map(row => row.salePrice)).toEqual(before.map(price => Math.round(price * 1.1 / 1000) * 1000));
  });

  it('exports the selected price list as CSV', async () => {
    const general = await prismaTest.priceList.findUniqueOrThrow({ where: { code: 'GENERAL' } });
    const row = await prismaTest.priceListItem.findFirstOrThrow({ include: { menuItem: true } });
    const response = await request(app)
      .get(`/api/price-lists/${general.id}/export`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain(row.menuItem.sku);
  });

  it('previews and commits a valid price import by SKU', async () => {
    const general = await prismaTest.priceList.findUniqueOrThrow({ where: { code: 'GENERAL' } });
    const row = await prismaTest.priceListItem.findFirstOrThrow({ include: { menuItem: true } });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['SKU', 'Tên món', 'Nhóm món', 'Giá vốn BOM', 'Giá bán'],
      [row.menuItem.sku, row.menuItem.name, 'Import test', '', row.salePrice + 1111]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Bang_gia');
    const fileBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
    const payload = { fileName: 'price-list-test.xlsx', fileBase64 };

    const preview = await request(app)
      .post(`/api/price-lists/${general.id}/import/preview`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(preview.status).toBe(200);
    expect(preview.body.data.canCommit).toBe(true);

    const commit = await request(app)
      .post(`/api/price-lists/${general.id}/import/commit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(commit.status).toBe(200);
    expect(commit.body.data.updatedCount).toBe(1);
    expect((await prismaTest.priceListItem.findUniqueOrThrow({ where: { id: row.id } })).salePrice).toBe(row.salePrice + 1111);
  });
});
