import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee schedule week API', () => {
  let token = '';
  let employeeId = 0;
  let morningShiftId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `schedule-week-admin-${Date.now()}`, passwordHash: 'test-hash', name: 'Schedule Admin', role: 'ADMIN' }
    });
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    const employee = await prismaTest.employee.create({
      data: { code: `NVW${Date.now()}`, attendanceCode: `CCW${Date.now()}`, name: 'Nguyễn Minh Anh', phone: '0900000001', startDate: day('2026-09-01') }
    });
    employeeId = employee.id;
    const shift = await prismaTest.workShift.create({ data: { code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720 } });
    morningShiftId = shift.id;
  });

  it('expands weekly, open-ended, inclusive-end, and one-time rules after date exceptions', async () => {
    const creator = Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub);
    const mondayRule = await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: morningShiftId, recurrenceType: 'WEEKLY', startDate: day('2026-09-07'), endDate: null, dayOfWeek: 1, createdByUserId: creator }
    });
    await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: morningShiftId, recurrenceType: 'WEEKLY', startDate: day('2026-09-04'), endDate: null, dayOfWeek: 5, createdByUserId: creator }
    });
    await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: morningShiftId, recurrenceType: 'WEEKLY', startDate: day('2026-09-08'), endDate: day('2026-09-29'), dayOfWeek: 2, createdByUserId: creator }
    });
    await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: morningShiftId, recurrenceType: 'ONCE', startDate: day('2026-10-04'), dayOfWeek: null, createdByUserId: creator }
    });
    await prismaTest.employeeScheduleException.create({
      data: { scheduleRuleId: mondayRule.id, workDate: day('2026-09-28'), createdByUserId: creator }
    });
    await prismaTest.employeeCompensation.create({
      data: { employeeId, payBasis: 'PER_SHIFT', baseRate: 350000, effectiveFrom: day('2026-09-01') }
    });

    const response = await request(app).get('/api/employee-schedules/week?weekStart=2026-09-28').set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.weekStart).toBe('2026-09-28');
    expect(response.body.data.employees).toHaveLength(1);
    expect(response.body.data.employees[0].occurrences.map((item: { workDate: string }) => item.workDate)).toEqual(['2026-09-29', '2026-10-02', '2026-10-04']);
    expect(response.body.data.employees[0].compensation).toEqual({ amount: 1050000, status: 'ESTIMATED' });
    expect(response.body.data.employees[0].compensation).not.toHaveProperty('baseRate');
  });

  it('requires a valid Monday date and bounds pagination inputs', async () => {
    const notMonday = await request(app).get('/api/employee-schedules/week?weekStart=2026-09-29').set(auth());
    const malformed = await request(app).get('/api/employee-schedules/week?weekStart=2026-02-30').set(auth());
    const badPage = await request(app).get('/api/employee-schedules/week?weekStart=2026-09-28&page=0').set(auth());
    const oversizedPage = await request(app).get('/api/employee-schedules/week?weekStart=2026-09-28&pageSize=101').set(auth());

    expect(notMonday.status).toBe(400);
    expect(notMonday.body.error.code).toBe('SCHEDULE_DATE_INVALID');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('SCHEDULE_DATE_INVALID');
    expect(badPage.status).toBe(400);
    expect(oversizedPage.status).toBe(400);
  });

  it('filters employees by code or name and returns bounded pagination', async () => {
    await prismaTest.employee.create({ data: { code: `NVO${Date.now()}`, attendanceCode: `CCO${Date.now()}`, name: 'Lê Quốc Bảo', phone: '0900000002' } });

    const response = await request(app).get('/api/employee-schedules/week?weekStart=2026-09-28&search=Minh&page=1&pageSize=1').set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.employees.map((employee: { id: number }) => employee.id)).toEqual([employeeId]);
    expect(response.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, totalRows: 1, totalPages: 1 });
  });
});
