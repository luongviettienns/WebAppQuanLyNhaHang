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
});
