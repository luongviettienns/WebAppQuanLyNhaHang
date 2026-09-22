import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';
import { SupplierService } from '../../src/modules/inventory/supplier.service';

function issueToken(id: number, username: string, name: string, role: 'ADMIN' | 'CASHIER') {
  return jwt.sign({ sub: String(id), username, name, role }, env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
  });
}

describe('Supplier management API', () => {
  let adminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    await truncateAllTables();
    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({ data: { username: 'supplier_admin', passwordHash: 'hash', name: 'Quản lý NCC', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: 'supplier_cashier', passwordHash: 'hash', name: 'Thu ngân NCC', role: 'CASHIER' } })
    ]);
    adminToken = issueToken(admin.id, admin.username, admin.name, 'ADMIN');
    cashierToken = issueToken(cashier.id, cashier.username, cashier.name, 'CASHIER');
  });

  beforeEach(async () => {
    await prismaTest.auditLog.deleteMany();
    await prismaTest.supplier.deleteMany();
  });

  afterAll(() => prismaTest.$disconnect());

  it('requires an ADMIN token for supplier management', async () => {
    const unauthenticated = await request(app).get('/api/inventory/suppliers');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe('UNAUTHENTICATED');

    const cashier = await request(app)
      .post('/api/inventory/suppliers')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'Không được tạo' });
    expect(cashier.status).toBe(403);
    expect(cashier.body.error.code).toBe('FORBIDDEN');
  });

  it('creates a supplier with a server-generated code and audit log', async () => {
    const response = await request(app)
      .post('/api/inventory/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '  Công ty Hoàng Gia  ', phone: '0909000001', taxCode: '0312345678' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      code: 'NCC000001', name: 'Công ty Hoàng Gia', phone: '0909000001', taxCode: '0312345678', isActive: true
    });
    await expect(prismaTest.auditLog.findFirst({
      where: { action: 'SUPPLIER_CREATED', targetType: 'Supplier', targetId: response.body.data.id }
    })).resolves.toMatchObject({ metadata: expect.objectContaining({ code: 'NCC000001', name: 'Công ty Hoàng Gia' }) });
  });

  it('normalizes manual codes and rejects a case-insensitive duplicate', async () => {
    const first = await request(app)
      .post('/api/inventory/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: '  ncc-special  ', name: 'Nhà cung cấp đặc biệt', email: 'contact@example.com' });
    expect(first.status).toBe(201);
    expect(first.body.data.code).toBe('NCC-SPECIAL');

    const duplicate = await request(app)
      .post('/api/inventory/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'Ncc-Special', name: 'Trùng mã' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatchObject({ code: 'CONFLICT', message: 'Mã nhà cung cấp đã tồn tại' });
  });

  it('filters active suppliers by normalized search and exposes only active choices', async () => {
    await Promise.all([
      prismaTest.supplier.create({ data: { code: 'NCC000010', name: 'Đại lý Hồng Phúc' } }),
      prismaTest.supplier.create({ data: { code: 'NCC000011', name: 'Công ty Hoàng Gia', isActive: false } }),
      prismaTest.supplier.create({ data: { code: 'NCC000012', name: 'Nhà cung cấp khác' } })
    ]);

    const response = await request(app)
      .get('/api/inventory/suppliers?search=  HỒNG  &isActive=true&page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ pagination: { page: 1, pageSize: 10, totalRows: 1, totalPages: 1 } });
    expect(response.body.data.items).toEqual([expect.objectContaining({ code: 'NCC000010', name: 'Đại lý Hồng Phúc' })]);

    await expect(SupplierService.findSelectable('Hồng')).resolves.toEqual([
      expect.objectContaining({ code: 'NCC000010', name: 'Đại lý Hồng Phúc' })
    ]);
  });

  it('updates supplier profile and deactivation removes it from choices without deleting its record', async () => {
    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC000020', name: 'Cửa hàng Đại Việt' } });
    const response = await request(app)
      .patch(`/api/inventory/suppliers/${supplier.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '  Cửa hàng Đại Việt Mới  ', address: 'Số 12, Quận 1', isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: supplier.id, name: 'Cửa hàng Đại Việt Mới', address: 'Số 12, Quận 1', isActive: false });
    await expect(prismaTest.supplier.findUnique({ where: { id: supplier.id } })).resolves.toMatchObject({ isActive: false });
    await expect(SupplierService.findSelectable('đại việt')).resolves.toEqual([]);
    await expect(prismaTest.auditLog.findFirst({
      where: { action: 'SUPPLIER_UPDATED', targetType: 'Supplier', targetId: supplier.id }
    })).resolves.toMatchObject({ metadata: expect.objectContaining({ isActive: false }) });
  });

  it('validates input and rejects an empty update', async () => {
    const invalidCreate = await request(app)
      .post('/api/inventory/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'A', email: 'khong-phai-email' });
    expect(invalidCreate.status).toBe(400);
    expect(invalidCreate.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });

    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC000021', name: 'Kiểm tra patch' } });
    const emptyPatch = await request(app)
      .patch(`/api/inventory/suppliers/${supplier.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(emptyPatch.status).toBe(400);
    expect(emptyPatch.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
