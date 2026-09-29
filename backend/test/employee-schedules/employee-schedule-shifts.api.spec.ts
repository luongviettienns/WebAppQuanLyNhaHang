import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

let adminToken = '';
const auth = () => ({ Authorization: `Bearer ${adminToken}` });

describe('employee schedule shifts API', () => {
  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `schedule-admin-${Date.now()}`, passwordHash: 'test-hash', name: 'Schedule Admin', role: 'ADMIN' }
    });
    await prismaTest.workShift.createMany({ data: [
      { code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720 },
      { code: 'AFTERNOON', name: 'Ca chiều', startMinute: 780, endMinute: 1020 },
      { code: 'EVENING', name: 'Ca tối', startMinute: 1080, endMinute: 1320 }
    ] });
    adminToken = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  it('provides the three built-in shifts with their agreed hours', async () => {
    const response = await request(app).get('/api/employee-schedules/shifts').set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.shifts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720, isActive: true }),
      expect.objectContaining({ code: 'AFTERNOON', name: 'Ca chiều', startMinute: 780, endMinute: 1020, isActive: true }),
      expect.objectContaining({ code: 'EVENING', name: 'Ca tối', startMinute: 1080, endMinute: 1320, isActive: true })
    ]));
  });

  it('creates a custom shift after normalizing its code and name', async () => {
    const response = await request(app).post('/api/employee-schedules/shifts').set(auth()).send({
      code: ' custom-1 ', name: ' Ca linh hoạt ', startMinute: 600, endMinute: 660
    });

    expect(response.status).toBe(201);
    expect(response.body.data.shift).toMatchObject({
      code: 'CUSTOM-1', name: 'Ca linh hoạt', startMinute: 600, endMinute: 660, isActive: true
    });
  });

  it('rejects reversed or out-of-day shift times with a concrete error', async () => {
    const response = await request(app).post('/api/employee-schedules/shifts').set(auth()).send({
      code: 'NIGHT-1', name: 'Ca qua đêm', startMinute: 1320, endMinute: 120
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SCHEDULE_TIME_INVALID');
  });

  it('rejects a duplicate normalized shift code with a stable conflict', async () => {
    await request(app).post('/api/employee-schedules/shifts').set(auth()).send({
      code: 'CUSTOM-2', name: 'Ca thứ hai', startMinute: 600, endMinute: 660
    }).expect(201);

    const response = await request(app).post('/api/employee-schedules/shifts').set(auth()).send({
      code: ' custom-2 ', name: 'Ca khác tên', startMinute: 700, endMinute: 760
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SCHEDULE_DUPLICATE');
  });
});
