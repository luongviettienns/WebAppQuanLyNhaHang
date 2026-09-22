import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';

const headers = [
  'sku',
  'name',
  'categoryName',
  'basePrice',
  'menuType',
  'itemType',
  'isAvailable',
  'trackStock',
  'stockQuantity',
  'position',
  'description',
  'imageUrl'
];

describe('Menu import/export API (Phase 5)', () => {
  let adminToken: string;
  let cashierToken: string;

  const makeToken = (sub: string, username: string, name: string, role: 'ADMIN' | 'CASHIER') =>
    jwt.sign(
      { sub, username, name, role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

  const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

  const makeCsv = (categoryName: string, overrides: string[] = []) => {
    const values = [
      'SP999991',
      'Món nhập thử',
      categoryName,
      '45000',
      'FOOD',
      'REGULAR',
      'true',
      'false',
      '0',
      'Quầy nóng',
      'Món từ file import',
      ''
    ];
    const row = overrides.length > 0 ? overrides : values;
    return [headers.join(','), row.join(',')].join('\n');
  };

  const makeCommitRow = (categoryName: string, overrides: Record<string, unknown> = {}) => ({
    rowNumber: 2,
    name: 'Món commit thử',
    categoryName,
    basePrice: 45000,
    menuType: 'FOOD',
    itemType: 'REGULAR',
    isAvailable: true,
    trackStock: false,
    stockQuantity: 0,
    position: 'Quầy nóng',
    description: 'Món từ commit test',
    imageUrl: null,
    ...overrides
  });

  beforeAll(() => {
    validateTestEnvironment();
    adminToken = makeToken('1', 'admin', 'Admin', 'ADMIN');
    cashierToken = makeToken('2', 'cashier', 'Cashier', 'CASHIER');
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedDatabase(prismaTest);
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('allows ADMIN to preview a valid CSV without writing to the database', async () => {
    const category = await prismaTest.category.findFirstOrThrow();
    const beforeCount = await prismaTest.menuItem.count();

    const response = await request(app)
      .post('/api/menu/import/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'menu.csv', fileBase64: base64(makeCsv(category.name)), createMissingCategories: false });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ fileName: 'menu.csv', totalRows: 1, canCommit: true });
    expect(response.body.data.validRows).toHaveLength(1);
    expect(response.body.data.errorRows).toEqual([]);
    expect(await prismaTest.menuItem.count()).toBe(beforeCount);
  });

  it('returns row errors in preview and marks the import as not committable', async () => {
    const response = await request(app)
      .post('/api/menu/import/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fileName: 'menu.csv',
        fileBase64: base64(makeCsv('Đồ uống', ['SP000003', '', 'Đồ uống', '-1', 'BAD', 'REGULAR', 'maybe', 'false', '-2', '', '', ''])),
        createMissingCategories: false
      });

    expect(response.status).toBe(200);
    expect(response.body.data.canCommit).toBe(false);
    expect(response.body.data.validRows).toEqual([]);
    expect(response.body.data.errorRows[0]).toMatchObject({ rowNumber: 2 });
    expect(response.body.data.errorRows[0].error).toContain('name');
  });

  it('exports XLSX with an attachment and canonical menu headers', async () => {
    const response = await request(app)
      .get('/api/menu/export?format=xlsx')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toContain('menu_');

    const workbook = XLSX.read(response.body, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Menu, { header: 1 }) as unknown[][];
    expect(rows[0]).toEqual(headers);
    expect(rows.length).toBeGreaterThan(1);
  });

  it.each([
    ['unauthenticated', undefined, 401],
    ['cashier', 'cashier', 403]
  ] as const)('protects menu import/export for %s users', async (_label, role, expectedStatus) => {
    const token = role === 'cashier' ? cashierToken : undefined;
    const preview = request(app).post('/api/menu/import/preview');
    if (token) preview.set('Authorization', `Bearer ${token}`);
    const response = await preview.send({ fileName: 'menu.csv', fileBase64: base64(makeCsv('Đồ uống')) });

    expect(response.status).toBe(expectedStatus);
    expect(response.body.error.code).toBe(expectedStatus === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
  });

  it('rejects malformed preview payloads with VALIDATION_ERROR', async () => {
    const response = await request(app)
      .post('/api/menu/import/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileName: 'menu.csv', fileBase64: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates a new menu item and generates its SKU when the row has no SKU', async () => {
    const category = await prismaTest.category.findFirstOrThrow();
    const response = await request(app)
      .post('/api/menu/import/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceFileName: 'menu.csv', rows: [makeCommitRow(category.name)] });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ createdCount: 1, updatedCount: 0, categoryCreatedCount: 0 });

    const created = await prismaTest.menuItem.findFirstOrThrow({ where: { name: 'Món commit thử' } });
    expect(created.sku).toMatch(/^SP\d{6}$/);
  });

  it('updates an existing menu item by SKU', async () => {
    const existing = await prismaTest.menuItem.findFirstOrThrow();
    const category = await prismaTest.category.findUniqueOrThrow({ where: { id: existing.categoryId } });

    const response = await request(app)
      .post('/api/menu/import/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourceFileName: 'menu.csv',
        rows: [makeCommitRow(category.name, { sku: existing.sku, name: 'Tên món đã cập nhật', basePrice: 99000 })]
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ createdCount: 0, updatedCount: 1, categoryCreatedCount: 0 });
    await expect(prismaTest.menuItem.findUniqueOrThrow({ where: { sku: existing.sku } })).resolves.toMatchObject({
      name: 'Tên món đã cập nhật',
      basePrice: 99000
    });
  });

  it('creates a missing category only when createMissingCategories is enabled', async () => {
    const categoryName = 'Danh mục import mới';
    const response = await request(app)
      .post('/api/menu/import/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourceFileName: 'menu.csv',
        createMissingCategories: true,
        rows: [makeCommitRow(categoryName)]
      });

    expect(response.status).toBe(200);
    expect(response.body.data.categoryCreatedCount).toBe(1);
    await expect(prismaTest.category.findFirstOrThrow({ where: { name: categoryName } })).resolves.toBeTruthy();
    await expect(prismaTest.menuItem.findFirstOrThrow({ where: { name: 'Món commit thử' } })).resolves.toBeTruthy();
  });

  it('rejects a missing category when createMissingCategories is disabled', async () => {
    const beforeItems = await prismaTest.menuItem.count();
    const response = await request(app)
      .post('/api/menu/import/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceFileName: 'menu.csv', rows: [makeCommitRow('Danh mục không tồn tại')] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.values(response.body.error.details)).toEqual(
      expect.arrayContaining([expect.stringContaining('categoryName')])
    );
    expect(await prismaTest.menuItem.count()).toBe(beforeItems);
  });

  it('rejects duplicate SKUs in the import payload without writing either row', async () => {
    const category = await prismaTest.category.findFirstOrThrow();
    const duplicateSku = 'SP999998';
    const response = await request(app)
      .post('/api/menu/import/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourceFileName: 'menu.csv',
        rows: [
          makeCommitRow(category.name, { sku: duplicateSku, name: 'Dòng trùng 1' }),
          makeCommitRow(category.name, { rowNumber: 3, sku: duplicateSku, name: 'Dòng trùng 2' })
        ]
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prismaTest.menuItem.findUnique({ where: { sku: duplicateSku } })).toBeNull();
  });

  it('does not partially write valid rows when another row fails preflight validation', async () => {
    const category = await prismaTest.category.findFirstOrThrow();
    const beforeItems = await prismaTest.menuItem.count();
    const response = await request(app)
      .post('/api/menu/import/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourceFileName: 'menu.csv',
        rows: [
          makeCommitRow(category.name, { name: 'Dòng hợp lệ nhưng không được ghi' }),
          makeCommitRow('Danh mục lỗi', { rowNumber: 3, name: 'Dòng lỗi' })
        ]
      });

    expect(response.status).toBe(400);
    expect(await prismaTest.menuItem.count()).toBe(beforeItems);
    expect(await prismaTest.menuItem.findFirst({ where: { name: 'Dòng hợp lệ nhưng không được ghi' } })).toBeNull();
  });

  it('preserves modifier groups when updating an existing SKU', async () => {
    const existing = await prismaTest.menuItem.findFirstOrThrow({ include: { modifierGroups: true } });
    const category = await prismaTest.category.findUniqueOrThrow({ where: { id: existing.categoryId } });

    const response = await request(app)
      .post('/api/menu/import/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourceFileName: 'menu.csv',
        rows: [makeCommitRow(category.name, { sku: existing.sku, name: 'Cập nhật không xóa modifier' })]
      });

    expect(response.status).toBe(200);
    const updated = await prismaTest.menuItem.findUniqueOrThrow({ include: { modifierGroups: true }, where: { sku: existing.sku } });
    expect(updated.modifierGroups.map(group => group.id)).toEqual(existing.modifierGroups.map(group => group.id));
  });
});
