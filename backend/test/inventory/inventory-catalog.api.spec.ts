import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

function binaryParser(
  response: any,
  callback: (error: Error | null, body?: Buffer) => void
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error));
}

describe('Unified inventory catalog API', () => {
  let adminToken: string;
  let cashierToken: string;
  let unavailableMenuId: number;

  beforeAll(async () => {
    await truncateAllTables();

    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({
        data: { username: 'catalog_api_admin', passwordHash: 'hash', name: 'Catalog Admin', role: 'ADMIN' }
      }),
      prismaTest.user.create({
        data: { username: 'catalog_api_cashier', passwordHash: 'hash', name: 'Catalog Cashier', role: 'CASHIER' }
      })
    ]);

    const makeToken = (user: typeof admin, role: 'ADMIN' | 'CASHIER') => jwt.sign(
      { sub: String(user.id), username: user.username, name: user.name, role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    adminToken = makeToken(admin, 'ADMIN');
    cashierToken = makeToken(cashier, 'CASHIER');

    const category = await prismaTest.category.create({ data: { name: 'API Catalog' } });
    const unavailable = await prismaTest.menuItem.create({
      data: {
        categoryId: category.id,
        sku: 'API-SP-UNAVAILABLE',
        name: 'Món API tạm ngưng',
        basePrice: 45000,
        isAvailable: false,
        trackStock: false,
        menuType: 'FOOD'
      }
    });
    unavailableMenuId = unavailable.id;

    await prismaTest.ingredient.create({
      data: {
        sku: 'API-ING-001',
        name: 'Nguyên liệu API',
        unit: 'gram',
        currentStock: 12,
        minThreshold: 3,
        costPerUnit: 100
      }
    });
    await prismaTest.menuItem.create({
      data: {
        categoryId: category.id,
        sku: 'API-SP-001',
        name: 'Món API đang bán',
        basePrice: 60000,
        isAvailable: true,
        trackStock: true,
        stockQuantity: 8,
        menuType: 'FOOD'
      }
    });
  });

  it('enforces ADMIN access and returns the default paginated catalog', async () => {
    expect((await request(app).get('/api/inventory/catalog')).status).toBe(401);
    expect(
      (await request(app).get('/api/inventory/catalog').set('Authorization', `Bearer ${cashierToken}`)).status
    ).toBe(403);

    const response = await request(app)
      .get('/api/inventory/catalog?page=1&pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.rows).toHaveLength(1);
    expect(response.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, totalRows: 2, totalPages: 2 });
    expect(response.body.data.summary).toMatchObject({ totalRows: 2, trackedRows: 2 });
  });

  it('validates query parameters, supports isActive=all and returns empty results', async () => {
    const invalid = await request(app)
      .get('/api/inventory/catalog?pageSize=101')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const all = await request(app)
      .get('/api/inventory/catalog?isActive=all&managementGroup=SELLABLE')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.pagination.totalRows).toBe(2);
    expect(all.body.data.rows.some((row: { sourceId: number }) => row.sourceId === unavailableMenuId)).toBe(true);

    const empty = await request(app)
      .get('/api/inventory/catalog?search=does-not-exist')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toMatchObject({ rows: [], summary: { totalRows: 0 }, pagination: { totalPages: 0 } });
  });

  it('exports the filtered snapshot without creating inventory transactions', async () => {
    const before = await prismaTest.inventoryTransaction.count();
    const csv = await request(app)
      .get('/api/inventory/catalog/export?format=csv&managementGroup=SELLABLE')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(/inventory_catalog_.*\.csv/);
    expect(csv.text).toContain('sourceType,managementGroup,sku');
    expect(csv.text).toContain('API-SP-001');

    const xlsx = await request(app)
      .get('/api/inventory/catalog/export?format=xlsx&managementGroup=MATERIAL')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse(binaryParser);

    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(xlsx.headers['content-disposition']).toMatch(/inventory_catalog_.*\.xlsx/);
    const workbook = XLSX.read(xlsx.body, { type: 'buffer' });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 })[0]).toEqual([
      'sourceType', 'managementGroup', 'sku', 'name', 'categoryName', 'menuType', 'unit', 'costPrice',
      'stockQuantity', 'minStock', 'stockStatus', 'isActive', 'position', 'updatedAt'
    ]);
    expect(await prismaTest.inventoryTransaction.count()).toBe(before);
  });
});
