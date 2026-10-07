import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Extended Reports API: Customers, Suppliers, Employees, Channels (TDD)', () => {
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

  describe('1. Báo cáo Khách hàng (/api/reports/customers)', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/reports/customers');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role with 403', async () => {
      const res = await request(app)
        .get('/api/reports/customers')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    it('returns customer report structure for ADMIN', async () => {
      const res = await request(app)
        .get('/api/reports/customers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.topCustomers)).toBe(true);
    });
  });

  describe('2. Báo cáo Nhà cung cấp (/api/reports/suppliers)', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/reports/suppliers');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role with 403', async () => {
      const res = await request(app)
        .get('/api/reports/suppliers')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    it('returns supplier report structure for ADMIN', async () => {
      const res = await request(app)
        .get('/api/reports/suppliers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.suppliers)).toBe(true);
    });
  });

  describe('3. Báo cáo Nhân viên (/api/reports/employees)', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/reports/employees');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role with 403', async () => {
      const res = await request(app)
        .get('/api/reports/employees')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    it('returns employee report structure for ADMIN', async () => {
      const res = await request(app)
        .get('/api/reports/employees')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.summary).toBeDefined();
      expect(Array.isArray(res.body.data.employees)).toBe(true);
    });
  });

  describe('4. Báo cáo Kênh bán hàng (/api/reports/channels)', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/reports/channels');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role with 403', async () => {
      const res = await request(app)
        .get('/api/reports/channels')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    it('returns channel report structure with dineIn, takeAway, delivery breakdown for ADMIN', async () => {
      const res = await request(app)
        .get('/api/reports/channels')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.summary.dineIn).toBeDefined();
      expect(res.body.data.summary.takeAway).toBeDefined();
      expect(res.body.data.summary.delivery).toBeDefined();
      expect(Array.isArray(res.body.data.deliveryPartners)).toBe(true);
    });
  });
});
