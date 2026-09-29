import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee schedule batch create API', () => {
  let token = '';
  let actorId = 0;
  let employees: Array<{ id: number; code: string }> = [];
  let shifts: Array<{ id: number; code: string }> = [];
  let sequence = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const createSchedule = (payload: Record<string, unknown>) => request(app)
    .post('/api/employee-schedules').set(auth()).send(payload);
  const once = (employeeIds: number[], shiftIds: number[], startDate = '2026-09-28') => ({
    employeeIds, shiftIds, startDate, repeatWeekly: false
  });

  beforeEach(async () => {
    await truncateAllTables();
    sequence = 0;
    const admin = await prismaTest.user.create({
      data: { username: `schedule-create-admin-${Date.now()}`, passwordHash: 'test-hash', name: 'Schedule Admin', role: 'ADMIN' }
    });
    actorId = admin.id;
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    employees = await Promise.all([createEmployee('Nguyễn Minh Anh'), createEmployee('Lê Quốc Bảo')]);
    shifts = await Promise.all([
      prismaTest.workShift.create({ data: { code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720 } }),
      prismaTest.workShift.create({ data: { code: 'AFTERNOON', name: 'Ca chiều', startMinute: 780, endMinute: 1020 } }),
      prismaTest.workShift.create({ data: { code: 'EVENING', name: 'Ca tối', startMinute: 1080, endMinute: 1320 } })
    ]);
  });

  async function createEmployee(name: string, overrides: Record<string, unknown> = {}) {
    sequence += 1;
    return prismaTest.employee.create({
      data: {
        code: `NVS${Date.now()}${sequence}`,
        attendanceCode: `CCS${Date.now()}${sequence}`,
        name,
        phone: `09000000${String(sequence).padStart(2, '0')}`,
        startDate: day('2026-09-01'),
        ...overrides
      },
      select: { id: true, code: true }
    });
  }

  it('creates the employee-by-shift Cartesian batch in one request and audits each rule', async () => {
    const response = await createSchedule(once([employees[0].id, employees[1].id], [shifts[0].id, shifts[1].id]));

    expect(response.status).toBe(201);
    expect(response.body.data.createdCount).toBe(4);
    expect(await prismaTest.employeeScheduleRule.count()).toBe(4);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_SCHEDULE_CREATED', actorId } })).toBe(4);
    expect(response.body.data.rules).toHaveLength(4);
    const mainBranch = await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } });
    const savedRules = await prismaTest.employeeScheduleRule.findMany({ select: { branchId: true } });
    expect(savedRules.every(rule => rule.branchId === mainBranch.id)).toBe(true);
  });

  it('creates a bounded weekly rule using the ISO weekday of its start date', async () => {
    const response = await createSchedule({
      employeeIds: [employees[0].id], shiftIds: [shifts[0].id], startDate: '2026-09-29',
      repeatWeekly: true, endDate: '2026-10-13'
    });

    expect(response.status).toBe(201);
    expect(response.body.data.rules[0]).toMatchObject({ recurrenceType: 'WEEKLY', startDate: '2026-09-29', endDate: '2026-10-13', dayOfWeek: 2 });
  });

  it('rolls back every employee rule and audit when a later employee is no longer working', async () => {
    const resigned = await prismaTest.employee.update({
      where: { id: employees[1].id }, data: { status: 'RESIGNED', endDate: day('2026-09-20') }
    });
    expect(resigned.status).toBe('RESIGNED');

    const response = await createSchedule(once([employees[0].id, employees[1].id], [shifts[0].id]));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMPLOYEE_NOT_WORKING');
    expect(response.body.error.details.employeeCode).toBe(employees[1].code);
    expect(await prismaTest.employeeScheduleRule.count()).toBe(0);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_SCHEDULE_CREATED' } })).toBe(0);
  });

  it('returns concrete not-found errors for an unknown employee or shift', async () => {
    const missingEmployee = await createSchedule(once([999999], [shifts[0].id]));
    const missingShift = await createSchedule(once([employees[0].id], [999999]));

    expect(missingEmployee.status).toBe(404);
    expect(missingEmployee.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    expect(missingShift.status).toBe(404);
    expect(missingShift.body.error.code).toBe('SHIFT_NOT_FOUND');
  });

  it('rejects inactive shifts and schedules outside employment dates', async () => {
    await prismaTest.workShift.update({ where: { id: shifts[0].id }, data: { isActive: false } });
    const inactive = await createSchedule(once([employees[0].id], [shifts[0].id]));
    const preEmployment = await createSchedule(once([employees[1].id], [shifts[1].id], '2026-08-31'));

    expect(inactive.status).toBe(409);
    expect(inactive.body.error.code).toBe('SHIFT_INACTIVE');
    expect(preEmployment.status).toBe(409);
    expect(preEmployment.body.error.code).toBe('EMPLOYEE_NOT_WORKING');
    expect(await prismaTest.employeeScheduleRule.count()).toBe(0);
  });

  it('rejects malformed dates and recurrence bounds with stable 400 codes', async () => {
    const malformedDate = await createSchedule(once([employees[0].id], [shifts[0].id], '2026-02-30'));
    const endBeforeStart = await createSchedule({
      employeeIds: [employees[0].id], shiftIds: [shifts[0].id], startDate: '2026-09-29',
      repeatWeekly: true, endDate: '2026-09-28'
    });
    const onceWithEnd = await createSchedule({ ...once([employees[0].id], [shifts[0].id]), endDate: '2026-10-01' });

    expect(malformedDate.status).toBe(400);
    expect(malformedDate.body.error.code).toBe('SCHEDULE_DATE_INVALID');
    expect(endBeforeStart.status).toBe(400);
    expect(endBeforeStart.body.error.code).toBe('SCHEDULE_DATE_INVALID');
    expect(onceWithEnd.status).toBe(400);
    expect(onceWithEnd.body.error.code).toBe('SCHEDULE_RECURRENCE_INVALID');
  });

  it('distinguishes exact duplicates from overlapping shifts and allows adjacent shifts', async () => {
    const first = await createSchedule(once([employees[0].id], [shifts[0].id]));
    const duplicate = await createSchedule(once([employees[0].id], [shifts[0].id]));
    const overlappingShift = await prismaTest.workShift.create({ data: { code: 'OVERLAP', name: 'Ca chồng', startMinute: 660, endMinute: 780 } });
    const overlap = await createSchedule(once([employees[0].id], [overlappingShift.id]));
    const adjacentShift = await prismaTest.workShift.create({ data: { code: 'ADJACENT', name: 'Ca liền kề', startMinute: 720, endMinute: 780 } });
    const adjacent = await createSchedule(once([employees[0].id], [adjacentShift.id]));

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('SCHEDULE_DUPLICATE');
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('SCHEDULE_OVERLAP');
    expect(overlap.body.error.details.workDate).toBe('2026-09-28');
    expect(adjacent.status).toBe(201);
    expect(await prismaTest.employeeScheduleRule.count()).toBe(2);
  });

  it('serializes concurrent overlapping requests so only one can commit', async () => {
    const results = await Promise.all([
      createSchedule(once([employees[0].id], [shifts[0].id])),
      createSchedule(once([employees[0].id], [shifts[0].id]))
    ]);

    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(results.find(result => result.status === 409)?.body.error.code).toBe('SCHEDULE_DUPLICATE');
    expect(await prismaTest.employeeScheduleRule.count()).toBe(1);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_SCHEDULE_CREATED' } })).toBe(1);
  });
});
