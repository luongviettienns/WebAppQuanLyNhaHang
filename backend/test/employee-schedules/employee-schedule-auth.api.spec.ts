import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';

type Role = 'ADMIN' | 'CASHIER' | 'KITCHEN';

const tokenFor = (role: Role) => jwt.sign(
  { sub: '987654', username: `schedule-${role.toLowerCase()}`, name: 'Schedule tester', role },
  env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
);

const protectedRequests = (token?: string) => {
  const req = (method: 'get' | 'post' | 'patch' | 'delete', url: string) => {
    let operation = request(app)[method](url);
    if (token) operation = operation.set('Authorization', `Bearer ${token}`);
    if (method === 'post' || method === 'patch') operation = operation.send({});
    return operation;
  };

  return [
    req('get', '/api/employee-schedules/week?weekStart=2026-09-28'),
    req('get', '/api/employee-schedules/shifts'),
    req('post', '/api/employee-schedules'),
    req('patch', '/api/employee-schedules/1'),
    req('delete', '/api/employee-schedules/1?workDate=2026-09-28&scope=occurrence'),
    req('post', '/api/employee-schedules/shifts'),
    req('get', '/api/employee-schedules/export?weekStart=2026-09-28&format=csv'),
    req('get', '/api/employee-schedules/import/template'),
    req('post', '/api/employee-schedules/import/preview'),
    req('post', '/api/employee-schedules/import/commit')
  ];
};

describe('employee schedule authorization', () => {
  it('requires authentication for every schedule read and mutation endpoint', async () => {
    const responses = await Promise.all(protectedRequests());

    expect(responses.map(response => response.status)).toEqual(Array(10).fill(401));
  });

  it.each(['CASHIER', 'KITCHEN'] as const)('denies %s access to every schedule endpoint', async role => {
    const responses = await Promise.all(protectedRequests(tokenFor(role)));

    expect(responses.map(response => response.status)).toEqual(Array(10).fill(403));
    expect(responses.map(response => response.body.error.code)).toEqual(Array(10).fill('FORBIDDEN'));
  });
});
