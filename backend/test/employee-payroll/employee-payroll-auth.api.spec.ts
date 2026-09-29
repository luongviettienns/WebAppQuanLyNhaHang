import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';

const token = (role: 'CASHIER' | 'KITCHEN') => jwt.sign(
  { sub: '1', username: role.toLowerCase(), name: role, role },
  env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
);

describe('employee payroll authorization', () => {
  const endpoints = [
    '/api/employee-payrolls',
    '/api/employee-payrolls/1',
    '/api/employee-payrolls/1/export?format=csv'
  ];

  it.each(endpoints)('rejects guests on GET %s', async endpoint => {
    const response = await request(app).get(endpoint);
    expect(response.status).toBe(401);
  });

  it.each(['CASHIER', 'KITCHEN'] as const)('rejects %s from every payroll read endpoint', async role => {
    for (const endpoint of endpoints) {
      const response = await request(app).get(endpoint).set('Authorization', `Bearer ${token(role)}`);
      expect(response.status).toBe(403);
    }
  });

  it.each([
    ['/api/employee-payrolls', { branchId: 1, month: '2026-09', scope: 'ALL' }],
    ['/api/employee-payrolls/1/recalculate', {}],
    ['/api/employee-payrolls/1/finalize', {}],
    ['/api/employee-payrolls/1/cancel', { reason: 'Hủy bảng lương' }],
    ['/api/employee-payrolls/1/lines/1/adjustments', { type: 'BONUS', amount: 1000, reason: 'Thưởng' }],
    ['/api/employee-payrolls/1/lines/1/adjustments/1/reverse', { reason: 'Đảo điều chỉnh' }]
  ] as const)('rejects guests and non-Admin roles on POST %s', async (endpoint, body) => {
    expect((await request(app).post(endpoint).send(body)).status).toBe(401);
    expect((await request(app).post(endpoint).set('Authorization', `Bearer ${token('CASHIER')}`).send(body)).status).toBe(403);
    expect((await request(app).post(endpoint).set('Authorization', `Bearer ${token('KITCHEN')}`).send(body)).status).toBe(403);
  });
});
