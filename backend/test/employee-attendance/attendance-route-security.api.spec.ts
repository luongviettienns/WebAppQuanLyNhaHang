import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { app } from '../../src/app';

function signedToken(role: 'ADMIN' | 'CASHIER' | 'KITCHEN') {
  return jwt.sign({ sub: '1', username: 'test-user', name: 'Test User', role }, env.JWT_SECRET, {
    expiresIn: '5m', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
  });
}

describe('employee attendance route security', () => {
  it('protects the weekly attendance read model and validates Monday week boundaries before querying', async () => {
    const path = '/api/employee-attendance/week?weekStart=2026-09-28&branchId=1';
    const guest = await request(app).get(path);
    const cashier = await request(app).get(path).set('Authorization', `Bearer ${signedToken('CASHIER')}`);
    const invalidWeek = await request(app).get('/api/employee-attendance/week?weekStart=2026-09-27&branchId=1')
      .set('Authorization', `Bearer ${signedToken('ADMIN')}`);

    expect(guest.status).toBe(401);
    expect(cashier.status).toBe(403);
    expect(invalidWeek.status).toBe(400);
    expect(invalidWeek.body.error.code).toBe('ATTENDANCE_DATE_INVALID');

    const invalidExceptionWeek = await request(app).get('/api/employee-attendance/exceptions?weekStart=2026-09-27&branchId=1')
      .set('Authorization', `Bearer ${signedToken('ADMIN')}`);
    expect(invalidExceptionWeek.status).toBe(400);
    expect(invalidExceptionWeek.body.error.code).toBe('ATTENDANCE_DATE_INVALID');
  });

  it('protects Admin-only manual attendance mutations and validates reason before persistence', async () => {
    const guest = await request(app).post('/api/employee-attendance/sessions/manual').send({});
    const cashier = await request(app).post('/api/employee-attendance/sessions/manual')
      .set('Authorization', `Bearer ${signedToken('CASHIER')}`).send({});
    const missingReason = await request(app).post('/api/employee-attendance/sessions/manual')
      .set('Authorization', `Bearer ${signedToken('ADMIN')}`).send({
        employeeId: 4, branchId: 1, checkInAt: '2026-09-29T08:00:00+07:00'
      });

    expect(guest.status).toBe(401);
    expect(cashier.status).toBe(403);
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.error.code).toBe('ATTENDANCE_REASON_REQUIRED');
  });

  it('requires Admin for attendance session administration', async () => {
    const guest = await request(app).get('/api/employee-attendance/kiosk-sessions?branchId=1');
    const cashier = await request(app).get('/api/employee-attendance/kiosk-sessions?branchId=1')
      .set('Authorization', `Bearer ${signedToken('CASHIER')}`);
    const kitchen = await request(app).get('/api/employee-attendance/kiosk-sessions?branchId=1')
      .set('Authorization', `Bearer ${signedToken('KITCHEN')}`);

    expect(guest.status).toBe(401);
    expect(cashier.status).toBe(403);
    expect(kitchen.status).toBe(403);
  });

  it('does not accept an Admin JWT as the kiosk capability', async () => {
    const response = await request(app).post('/api/attendance-kiosk/punch')
      .set('Authorization', `Bearer ${signedToken('ADMIN')}`)
      .send({ action: 'CHECK_IN', attendanceCode: 'NV-EXAMPLE', idempotencyKey: 'test-key-0001' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('KIOSK_SESSION_INVALID');
  });

  it('rejects kiosk credentials placed in query, params, or body instead of the dedicated header', async () => {
    const values = [
      request(app).post(`/api/attendance-kiosk/punch?credential=${'a'.repeat(43)}`).send({}),
      request(app).post(`/api/attendance-kiosk/${'a'.repeat(43)}/punch`).send({}),
      request(app).post('/api/attendance-kiosk/punch').send({ credential: 'a'.repeat(43) })
    ];
    const responses = await Promise.all(values);

    expect(responses.map(response => response.status)).toEqual([401, 401, 401]);
    expect(responses.map(response => response.body.error.code)).toEqual([
      'KIOSK_SESSION_INVALID', 'KIOSK_SESSION_INVALID', 'KIOSK_SESSION_INVALID'
    ]);
  });
});
