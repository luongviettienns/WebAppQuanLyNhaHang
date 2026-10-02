import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';

describe('cashbook route protection', () => {
  it('requires authentication for list, manual posting, reversal and export routes', async () => {
    expect((await request(app).get('/api/cashbook')).status).toBe(401);
    expect((await request(app).post('/api/cashbook/vouchers').send({})).status).toBe(401);
    expect((await request(app).post('/api/cashbook/vouchers/1/cancel').send({})).status).toBe(401);
    expect((await request(app).get('/api/cashbook/export')).status).toBe(401);
  });

  it('keeps account management and voucher cancellation ADMIN-only', async () => {
    const cashierToken = jwt.sign(
      { sub: '71', username: 'cashier', name: 'Cashier', role: 'CASHIER' }, env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    expect((await request(app).post('/api/cashbook/vouchers/1/cancel').set('Authorization', `Bearer ${cashierToken}`).send({})).status).toBe(403);
    expect((await request(app).post('/api/cashbook/accounts').set('Authorization', `Bearer ${cashierToken}`).send({})).status).toBe(403);
  });
});
