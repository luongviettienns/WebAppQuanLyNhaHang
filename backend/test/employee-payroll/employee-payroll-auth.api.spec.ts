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
});
