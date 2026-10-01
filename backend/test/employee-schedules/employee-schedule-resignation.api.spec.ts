import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Server as SocketIOServer } from 'socket.io';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { AuditService } from '../../src/modules/audit/audit.service';
import { getSocketIO, setSocketIO } from '../../src/lib/socket';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee schedule resignation integration', () => {
  let token = '';
  let actorId = 0;
  let employeeId = 0;
  let weeklyRuleId = 0;
  let futureWeeklyRuleId = 0;
  let futureOnceRuleId = 0;
  let today = '';
  let emitted: Array<{ event: string; payload: unknown }> = [];
  const originalSocket = getSocketIO();

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const addDays = (value: string, count: number) => {
    const result = day(value);
    result.setUTCDate(result.getUTCDate() + count);
    return result.toISOString().slice(0, 10);
  };
  const nextMonday = (offset: number) => {
    const result = day(addDays(today, offset));
    result.setUTCDate(result.getUTCDate() + ((1 - (result.getUTCDay() || 7) + 7) % 7));
    return result.toISOString().slice(0, 10);
  };

  beforeEach(async () => {
    await truncateAllTables();
    emitted = [];
    setSocketIO({ emit: (event: string, payload: unknown) => emitted.push({ event, payload }) } as unknown as SocketIOServer);
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: env.BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const admin = await prismaTest.user.create({
      data: { username: `schedule-resign-admin-${Date.now()}`, passwordHash: 'test-hash', name: 'Schedule Admin', role: 'ADMIN' }
    });
    actorId = admin.id;
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    const employee = await prismaTest.employee.create({
      data: {
        code: `NVR${Date.now()}`, attendanceCode: `CCR${Date.now()}`, name: 'Nguyễn Minh Anh', phone: '0900000001',
        startDate: day('2026-09-01'), bankAccountNumber: '1234567890'
      }
    });
    employeeId = employee.id;
    const shifts = await Promise.all([
      prismaTest.workShift.create({ data: { code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720 } }),
      prismaTest.workShift.create({ data: { code: 'AFTERNOON', name: 'Ca chiều', startMinute: 780, endMinute: 1020 } }),
      prismaTest.workShift.create({ data: { code: 'EVENING', name: 'Ca tối', startMinute: 1080, endMinute: 1320 } })
    ]);
    const pastMonday = day('2026-09-07');
    weeklyRuleId = (await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: shifts[0].id, recurrenceType: 'WEEKLY', startDate: pastMonday, dayOfWeek: 1, createdByUserId: actorId }
    })).id;
    futureWeeklyRuleId = (await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: shifts[1].id, recurrenceType: 'WEEKLY', startDate: day(nextMonday(14)), dayOfWeek: 1, createdByUserId: actorId }
    })).id;
    futureOnceRuleId = (await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId: shifts[2].id, recurrenceType: 'ONCE', startDate: day(addDays(today, 2)), createdByUserId: actorId }
    })).id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setSocketIO(originalSocket);
  });

  it('caps started weekly rules and cancels future occurrences atomically on resignation', async () => {
    const response = await request(app).patch(`/api/employees/${employeeId}/status`).set(auth()).send({ status: 'RESIGNED', endDate: today });
    const weekly = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: weeklyRuleId } });
    const futureWeekly = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: futureWeeklyRuleId } });
    const futureOnce = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: futureOnceRuleId } });
    const auditRows = await prismaTest.auditLog.findMany({ where: { action: 'EMPLOYEE_SCHEDULE_AUTO_CAPPED', actorId } });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'RESIGNED', endDate: `${today}T00:00:00.000Z` });
    expect(weekly.endDate?.toISOString().slice(0, 10)).toBe(today);
    expect(futureWeekly.cancelledAt).not.toBeNull();
    expect(futureOnce.cancelledAt).not.toBeNull();
    expect(auditRows).toHaveLength(3);
    expect(auditRows.map(row => row.targetId).sort()).toEqual([weeklyRuleId, futureWeeklyRuleId, futureOnceRuleId].sort());
    expect(JSON.stringify(auditRows.map(row => row.metadata))).not.toContain('1234567890');
    expect(emitted.map(item => item.event).sort()).toEqual(['employee-schedules:changed', 'employees:changed']);
    expect(emitted.find(item => item.event === 'employee-schedules:changed')?.payload).toMatchObject({
      employeeIds: [employeeId], changedFrom: today, changedThrough: null
    });
  });

  it('does not reactivate cancelled future rules on rehire', async () => {
    await request(app).patch(`/api/employees/${employeeId}/status`).set(auth()).send({ status: 'RESIGNED', endDate: today });
    const cancelledBeforeRehire = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: futureOnceRuleId } });
    await request(app).patch(`/api/employees/${employeeId}/status`).set(auth()).send({ status: 'WORKING' });
    const afterRehire = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: futureOnceRuleId } });

    expect(cancelledBeforeRehire.cancelledAt).not.toBeNull();
    expect(afterRehire.cancelledAt).not.toBeNull();
    expect((await prismaTest.employee.findUniqueOrThrow({ where: { id: employeeId } })).endDate).toBeNull();
  });

  it('rolls back employee status, schedule rules, audits and events when an in-transaction audit fails', async () => {
    const originalLog = AuditService.logInTransaction;
    vi.spyOn(AuditService, 'logInTransaction').mockImplementation(async (tx, input) => {
      if (input.action === 'EMPLOYEE_STATUS_CHANGED') throw new Error('Injected status audit failure');
      return originalLog(tx, input);
    });
    emitted = [];

    const response = await request(app).patch(`/api/employees/${employeeId}/status`).set(auth()).send({ status: 'RESIGNED', endDate: today });
    const employee = await prismaTest.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const weekly = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: weeklyRuleId } });
    const scheduleAuditCount = await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_SCHEDULE_AUTO_CAPPED' } });

    expect(response.status).toBe(500);
    expect(employee.status).toBe('WORKING');
    expect(employee.endDate).toBeNull();
    expect(weekly.endDate).toBeNull();
    expect(scheduleAuditCount).toBe(0);
    expect(emitted).toEqual([]);
  });
});
