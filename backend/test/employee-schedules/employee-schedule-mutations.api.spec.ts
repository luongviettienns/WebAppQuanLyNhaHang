import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Server as SocketIOServer } from 'socket.io';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { getSocketIO, setSocketIO } from '../../src/lib/socket';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee schedule mutation API', () => {
  let token = '';
  let actorId = 0;
  let employeeId = 0;
  let shifts: Array<{ id: number; code: string }> = [];
  let firstMonday = '';
  let emitted: Array<{ event: string; payload: unknown }> = [];
  const originalSocket = getSocketIO();

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const addDays = (value: string, count: number) => {
    const result = day(value);
    result.setUTCDate(result.getUTCDate() + count);
    return result.toISOString().slice(0, 10);
  };
  const nextDate = (offset: number) => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: env.BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const result = day(today);
    result.setUTCDate(result.getUTCDate() + offset);
    result.setUTCDate(result.getUTCDate() + ((1 - (result.getUTCDay() || 7) + 7) % 7));
    return result.toISOString().slice(0, 10);
  };
  const createWeekly = (endDate: string | null = null) => prismaTest.employeeScheduleRule.create({
    data: {
      employeeId, shiftId: shifts[0].id, recurrenceType: 'WEEKLY', startDate: day(firstMonday), endDate: endDate ? day(endDate) : null,
      dayOfWeek: 1, createdByUserId: actorId
    }
  });
  const week = (weekStart: string) => request(app).get(`/api/employee-schedules/week?weekStart=${weekStart}`).set(auth());

  beforeEach(async () => {
    await truncateAllTables();
    emitted = [];
    setSocketIO({ emit: (event: string, payload: unknown) => emitted.push({ event, payload }) } as unknown as SocketIOServer);
    const admin = await prismaTest.user.create({
      data: { username: `schedule-mutation-admin-${Date.now()}`, passwordHash: 'test-hash', name: 'Schedule Admin', role: 'ADMIN' }
    });
    actorId = admin.id;
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    const employee = await prismaTest.employee.create({
      data: { code: `NVM${Date.now()}`, attendanceCode: `CCM${Date.now()}`, name: 'Nguyễn Minh Anh', phone: '0900000001', startDate: day('2026-09-01') }
    });
    employeeId = employee.id;
    shifts = await Promise.all([
      prismaTest.workShift.create({ data: { code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720 } }),
      prismaTest.workShift.create({ data: { code: 'EVENING', name: 'Ca tối', startMinute: 1080, endMinute: 1320 } })
    ]);
    const main = await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } });
    await prismaTest.branchWorkweekPolicyVersion.create({
      data: {
        branchId: main.id, effectiveFrom: day('1970-01-01'), revision: 1,
        monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true,
        createdByUserId: actorId
      }
    });
    firstMonday = nextDate(14);
  });

  afterEach(() => setSocketIO(originalSocket));

  it('edits one occurrence by exception plus a one-time replacement', async () => {
    const rule = await createWeekly(addDays(firstMonday, 21));
    const workDate = addDays(firstMonday, 7);

    const response = await request(app).patch(`/api/employee-schedules/${rule.id}`).set(auth()).send({
      workDate, scope: 'occurrence', shiftIds: [shifts[1].id]
    });
    const saved = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: rule.id } });
    const replacement = await prismaTest.employeeScheduleRule.findFirstOrThrow({
      where: { employeeId, shiftId: shifts[1].id, recurrenceType: 'ONCE', startDate: day(workDate) }
    });

    expect(response.status).toBe(200);
    expect(await prismaTest.employeeScheduleException.findFirst({ where: { scheduleRuleId: rule.id, workDate: day(workDate) } })).not.toBeNull();
    expect(saved.endDate?.toISOString().slice(0, 10)).toBe(addDays(firstMonday, 21));
    expect(replacement).toMatchObject({ recurrenceType: 'ONCE', dayOfWeek: null });
    expect((await week(workDate)).body.data.employees[0].occurrences.map((item: { shiftCode: string }) => item.shiftCode)).toEqual(['EVENING']);
  });

  it('deletes one occurrence without changing adjacent weekly dates', async () => {
    const rule = await createWeekly(addDays(firstMonday, 21));
    const workDate = addDays(firstMonday, 7);

    const response = await request(app).delete(`/api/employee-schedules/${rule.id}?workDate=${workDate}&scope=occurrence`).set(auth());

    expect(response.status).toBe(200);
    expect((await week(firstMonday)).body.data.employees[0].occurrences.map((item: { workDate: string }) => item.workDate)).toEqual([firstMonday]);
    expect((await week(workDate)).body.data.employees[0].occurrences).toEqual([]);
    expect((await week(addDays(workDate, 7))).body.data.employees[0].occurrences.map((item: { workDate: string }) => item.workDate)).toEqual([addDays(workDate, 7)]);
  });

  it('deletes a one-time future rule by marking it cancelled instead of removing history', async () => {
    const workDate = addDays(firstMonday, 30);
    const rule = await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: shifts[1].id, recurrenceType: 'ONCE', startDate: day(workDate), createdByUserId: actorId }
    });

    const response = await request(app).delete(`/api/employee-schedules/${rule.id}?workDate=${workDate}&scope=occurrence`).set(auth());
    const saved = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: rule.id } });

    expect(response.status).toBe(200);
    expect(saved.cancelledAt).not.toBeNull();
    expect(await prismaTest.employeeScheduleException.count({ where: { scheduleRuleId: rule.id } })).toBe(0);
  });

  it('edits from a selected occurrence onward while preserving earlier occurrences', async () => {
    const rule = await createWeekly(addDays(firstMonday, 28));
    const workDate = addDays(firstMonday, 14);

    const response = await request(app).patch(`/api/employee-schedules/${rule.id}`).set(auth()).send({
      workDate, scope: 'following', shiftIds: [shifts[1].id]
    });
    const capped = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: rule.id } });
    const replacement = await prismaTest.employeeScheduleRule.findFirstOrThrow({
      where: { employeeId, shiftId: shifts[1].id, recurrenceType: 'WEEKLY', startDate: day(workDate) }
    });

    expect(response.status).toBe(200);
    expect(capped.endDate?.toISOString().slice(0, 10)).toBe(addDays(workDate, -1));
    expect(replacement.endDate?.toISOString().slice(0, 10)).toBe(addDays(firstMonday, 28));
    expect((await week(firstMonday)).body.data.employees[0].occurrences).toHaveLength(1);
    expect((await week(workDate)).body.data.employees[0].occurrences.map((item: { shiftCode: string }) => item.shiftCode)).toEqual(['EVENING']);
    expect((await week(addDays(workDate, 7))).body.data.employees[0].occurrences.map((item: { shiftCode: string }) => item.shiftCode)).toEqual(['EVENING']);
  });

  it('deletes from a selected occurrence onward and keeps the previous schedule history', async () => {
    const rule = await createWeekly(null);
    const workDate = addDays(firstMonday, 14);

    const response = await request(app).delete(`/api/employee-schedules/${rule.id}?workDate=${workDate}&scope=following`).set(auth());
    const capped = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: rule.id } });

    expect(response.status).toBe(200);
    expect(capped.endDate?.toISOString().slice(0, 10)).toBe(addDays(workDate, -1));
    expect((await week(firstMonday)).body.data.employees[0].occurrences).toHaveLength(1);
    expect((await week(workDate)).body.data.employees[0].occurrences).toEqual([]);
    expect((await week(addDays(workDate, 7))).body.data.employees[0].occurrences).toEqual([]);
  });

  it('rejects past dates, non-occurrences and missing recurrence scope', async () => {
    const rule = await createWeekly(null);
    const pastRule = await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: shifts[0].id, recurrenceType: 'ONCE', startDate: day('2020-01-06'), createdByUserId: actorId }
    });
    const past = await request(app).delete(`/api/employee-schedules/${pastRule.id}?workDate=2020-01-06&scope=occurrence`).set(auth());
    const nonOccurrence = await request(app).delete(`/api/employee-schedules/${rule.id}?workDate=${addDays(firstMonday, 1)}&scope=occurrence`).set(auth());
    const missingScope = await request(app).patch(`/api/employee-schedules/${rule.id}`).set(auth()).send({ workDate: firstMonday, shiftIds: [shifts[1].id] });

    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('SCHEDULE_DATE_INVALID');
    expect(nonOccurrence.status).toBe(400);
    expect(nonOccurrence.body.error.code).toBe('SCHEDULE_RECURRENCE_INVALID');
    expect(missingScope.status).toBe(400);
    expect(await prismaTest.employeeScheduleRule.count()).toBe(2);
  });

  it('does not preserve an exception, audit or socket event when a replacement overlaps another rule', async () => {
    const originalRule = await createWeekly(addDays(firstMonday, 21));
    const conflictingShift = await prismaTest.workShift.create({
      data: { code: 'OVERLAP', name: 'Ca chồng giờ', startMinute: 600, endMinute: 660 }
    });
    const replacementShift = await prismaTest.workShift.create({
      data: { code: 'REPLACE', name: 'Ca thay thế chồng giờ', startMinute: 630, endMinute: 690 }
    });
    await prismaTest.employeeScheduleRule.create({
      data: {
        employeeId, shiftId: conflictingShift.id, recurrenceType: 'WEEKLY', startDate: day(firstMonday),
        endDate: day(addDays(firstMonday, 21)), dayOfWeek: 1, createdByUserId: actorId
      }
    });
    emitted = [];

    const response = await request(app).patch(`/api/employee-schedules/${originalRule.id}`).set(auth()).send({
      workDate: firstMonday, scope: 'occurrence', shiftIds: [replacementShift.id]
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SCHEDULE_OVERLAP');
    expect(await prismaTest.employeeScheduleException.count({ where: { scheduleRuleId: originalRule.id } })).toBe(0);
    expect(await prismaTest.employeeScheduleRule.count({ where: { recurrenceType: 'ONCE' } })).toBe(0);
    expect(await prismaTest.auditLog.count({ where: { action: { startsWith: 'EMPLOYEE_SCHEDULE_' } } })).toBe(0);
    expect(emitted).toEqual([]);
  });

  it('audits and emits only after a successful commit', async () => {
    const rule = await createWeekly(null);
    const workDate = addDays(firstMonday, 7);
    emitted = [];

    const response = await request(app).delete(`/api/employee-schedules/${rule.id}?workDate=${workDate}&scope=occurrence`).set(auth());
    const audit = await prismaTest.auditLog.findFirst({ where: { action: 'EMPLOYEE_SCHEDULE_EXCEPTION_CREATED', targetId: rule.id } });
    const payload = emitted.find(item => item.event === 'employee-schedules:changed')?.payload as { employeeIds: number[]; changedFrom: string; changedThrough: string };

    expect(response.status).toBe(200);
    expect(audit?.actorId).toBe(actorId);
    expect(audit?.metadata).toMatchObject({ employeeId, workDate, scope: 'occurrence' });
    expect(JSON.stringify(audit?.metadata)).not.toContain('0900000001');
    expect(payload).toMatchObject({ employeeIds: [employeeId], changedFrom: workDate, changedThrough: workDate });
    expect(emitted.map(item => item.event)).toEqual(['employee-schedules:changed']);
  });
});
