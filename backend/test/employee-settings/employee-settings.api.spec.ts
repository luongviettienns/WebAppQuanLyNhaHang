import type { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { getSocketIO, setSocketIO } from '../../src/lib/socket';
import { AuditService } from '../../src/modules/audit/audit.service';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee settings API', () => {
  const originalSocket = getSocketIO();
  const baselineDate = new Date('1970-01-01T00:00:00.000Z');
  let adminToken = '';
  let cashierToken = '';
  let adminId = 0;
  let mainBranchId = 1;
  let emitted: Array<{ event: string; payload: any }> = [];

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });
  const sign = (user: { id: number; username: string; name: string; role: string }) => jwt.sign(
    { sub: String(user.id), username: user.username, name: user.name, role: user.role },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
  );
  const attendanceInput = (overrides: Record<string, unknown> = {}) => ({
    branchId: mainBranchId,
    effectiveFrom: '2099-01-01',
    expectedAreaRevision: 1,
    attendanceMode: 'SHIFT',
    standardDayMinutes: 480,
    lateThresholdMinutes: 5,
    earlyLeaveThresholdMinutes: 5,
    allowUnscheduledAttendance: true,
    ...overrides
  });
  const payrollInput = (overrides: Record<string, unknown> = {}) => ({
    branchId: mainBranchId,
    effectiveFrom: '2099-01-01',
    expectedAreaRevision: 1,
    frequency: 'MONTHLY',
    periodStartDay: 1,
    hourlyCalculationSource: 'ACTUAL_ATTENDANCE',
    ...overrides
  });

  beforeEach(async () => {
    await truncateAllTables();
    emitted = [];
    setSocketIO({ emit: (event: string, payload: unknown) => emitted.push({ event, payload }) } as unknown as SocketIOServer);
    const nonce = Date.now();
    const admin = await prismaTest.user.create({
      data: { username: `settings-admin-${nonce}`, passwordHash: 'hash', name: 'Settings Admin', role: 'ADMIN' }
    });
    const cashier = await prismaTest.user.create({
      data: { username: `settings-cashier-${nonce}`, passwordHash: 'hash', name: 'Settings Cashier', role: 'CASHIER' }
    });
    adminId = admin.id;
    adminToken = sign(admin);
    cashierToken = sign(cashier);
    mainBranchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    await prismaTest.branchEmployeeSettingsRevision.create({ data: { branchId: mainBranchId } });
    await prismaTest.branchAttendancePolicyVersion.create({ data: { branchId: mainBranchId, effectiveFrom: baselineDate, revision: 1 } });
    await prismaTest.branchPayrollPolicyVersion.create({ data: { branchId: mainBranchId, effectiveFrom: baselineDate, revision: 1 } });
    await prismaTest.branchWorkweekPolicyVersion.create({ data: { branchId: mainBranchId, effectiveFrom: baselineDate, revision: 1 } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setSocketIO(originalSocket);
  });

  it('returns effective policies, truthful capabilities and a derived five-step checklist', async () => {
    const employee = await prismaTest.employee.create({
      data: { code: 'NV-SETTINGS', attendanceCode: 'CC-SETTINGS', name: 'Nhân viên', phone: '0900000001' }
    });
    await prismaTest.workShift.create({ data: { code: 'SHIFT-SETTINGS', name: 'Ca chuẩn', startMinute: 480, endMinute: 720 } });
    await prismaTest.attendanceKioskSession.create({
      data: { branchId: mainBranchId, tokenHash: 'a'.repeat(64), createdByUserId: adminId, expiresAt: new Date('2099-12-31T00:00:00.000Z') }
    });
    await prismaTest.employeeCompensation.create({
      data: { employeeId: employee.id, payBasis: 'MONTHLY', baseRate: 10_000_000, effectiveFrom: baselineDate, createdByUserId: adminId }
    });
    await prismaTest.employeePayrollBatch.create({
      data: {
        code: 'BL-SETTINGS', name: 'Bảng lương', branchId: mainBranchId,
        periodStart: new Date('2026-09-01T00:00:00.000Z'), periodEnd: new Date('2026-09-30T00:00:00.000Z'),
        createdByUserId: adminId
      }
    });

    const response = await request(app).get(`/api/employee-settings?branchId=${mainBranchId}`).set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.revisions).toEqual({ attendance: 1, payroll: 1, workweek: 1, holiday: 0 });
    expect(response.body.data.effectivePolicies.attendance).toMatchObject({ revision: 1, standardDayMinutes: 480 });
    expect(response.body.data.checklist).toMatchObject({ completedCount: 5, totalCount: 5 });
    expect(response.body.data.checklist.steps).toHaveLength(5);
    expect(Object.values(response.body.data.capabilities).every(value => value === false)).toBe(true);
  });

  it('allows only Admin JWT credentials and rejects another branch server-side', async () => {
    const guest = await request(app).get(`/api/employee-settings?branchId=${mainBranchId}`);
    const cashier = await request(app).get(`/api/employee-settings?branchId=${mainBranchId}`)
      .set('Authorization', `Bearer ${cashierToken}`);
    const other = await prismaTest.branch.create({ data: { code: 'OTHER-SETTINGS', name: 'Chi nhánh khác' } });
    const forbidden = await request(app).get(`/api/employee-settings?branchId=${other.id}`).set(auth());

    expect(guest.status).toBe(401);
    expect(cashier.status).toBe(403);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('BRANCH_ACCESS_DENIED');
  });

  it('creates a future policy with audit and emits only after commit', async () => {
    const response = await request(app).post('/api/employee-settings/attendance-policies').set(auth()).send(attendanceInput());

    expect(response.status).toBe(201);
    expect(response.body.data.policy).toMatchObject({ revision: 2, standardDayMinutes: 480 });
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_ATTENDANCE_POLICY_CREATED', actorId: adminId } })).toBe(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ event: 'employee-settings:changed', payload: { branchId: mainBranchId, settingsArea: 'attendance', revision: 2 } });
  });

  it('rolls back policy and suppresses realtime when audit storage fails', async () => {
    vi.spyOn(AuditService, 'logInTransaction').mockRejectedValueOnce(new Error('Injected audit failure'));
    const response = await request(app).post('/api/employee-settings/attendance-policies').set(auth()).send(attendanceInput());

    expect(response.status).toBe(500);
    expect(await prismaTest.branchAttendancePolicyVersion.count({ where: { branchId: mainBranchId } })).toBe(1);
    expect((await prismaTest.branchEmployeeSettingsRevision.findUniqueOrThrow({ where: { branchId: mainBranchId } })).attendanceRevision).toBe(1);
    expect(emitted).toEqual([]);
  });

  it('serializes same-area writes but allows different areas to commit independently', async () => {
    const sameArea = await Promise.all([
      request(app).post('/api/employee-settings/attendance-policies').set(auth()).send(attendanceInput({ effectiveFrom: '2099-01-01' })),
      request(app).post('/api/employee-settings/attendance-policies').set(auth()).send(attendanceInput({ effectiveFrom: '2099-02-01' }))
    ]);
    expect(sameArea.map(item => item.status).sort()).toEqual([201, 409]);
    expect(sameArea.find(item => item.status === 409)?.body.error.code).toBe('EMPLOYEE_SETTINGS_REVISION_CONFLICT');

    const crossArea = await Promise.all([
      request(app).post('/api/employee-settings/payroll-policies').set(auth()).send(payrollInput({ effectiveFrom: '2099-03-01' })),
      request(app).post('/api/employee-settings/workweek-policies').set(auth()).send({
        branchId: mainBranchId, effectiveFrom: '2099-03-01', expectedAreaRevision: 1,
        monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false
      })
    ]);
    expect(crossArea.map(item => item.status)).toEqual([201, 201]);
  });

  it('rejects duplicate policy dates with a stable conflict', async () => {
    expect((await request(app).post('/api/employee-settings/payroll-policies').set(auth()).send(payrollInput())).status).toBe(201);
    const duplicate = await request(app).post('/api/employee-settings/payroll-policies').set(auth())
      .send(payrollInput({ expectedAreaRevision: 2 }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMPLOYEE_SETTINGS_VERSION_DUPLICATE');
  });

  it('creates, updates and archives future holidays without hard delete', async () => {
    const created = await request(app).post('/api/employee-settings/holidays').set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 0, name: 'Kỳ nghỉ tương lai',
      startDate: '2099-04-01', endDate: '2099-04-03'
    });
    expect(created.status).toBe(201);
    const id = created.body.data.holiday.id;
    const updated = await request(app).patch(`/api/employee-settings/holidays/${id}`).set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 1, expectedRowRevision: 1,
      name: 'Kỳ nghỉ đã đổi tên', startDate: '2099-04-02', endDate: '2099-04-04'
    });
    expect(updated.status).toBe(200);
    const archived = await request(app).post(`/api/employee-settings/holidays/${id}/archive`).set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 2, expectedRowRevision: 2, reason: 'Không còn áp dụng'
    });
    expect(archived.status).toBe(200);
    expect(await prismaTest.branchHolidayPeriod.count({ where: { id } })).toBe(1);
    expect((await prismaTest.branchHolidayPeriod.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();
  });

  it('rejects overlapping holidays and concurrent collection writes', async () => {
    expect((await request(app).post('/api/employee-settings/holidays').set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 0, name: 'Kỳ một', startDate: '2099-05-01', endDate: '2099-05-03'
    })).status).toBe(201);
    const overlap = await request(app).post('/api/employee-settings/holidays').set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 1, name: 'Kỳ chồng', startDate: '2099-05-03', endDate: '2099-05-05'
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('EMPLOYEE_HOLIDAY_OVERLAP');

    const concurrent = await Promise.all([
      request(app).post('/api/employee-settings/holidays').set(auth()).send({
        branchId: mainBranchId, expectedHolidayRevision: 1, name: 'Kỳ hai', startDate: '2099-06-01', endDate: '2099-06-01'
      }),
      request(app).post('/api/employee-settings/holidays').set(auth()).send({
        branchId: mainBranchId, expectedHolidayRevision: 1, name: 'Kỳ ba', startDate: '2099-06-02', endDate: '2099-06-02'
      })
    ]);
    expect(concurrent.map(item => item.status).sort()).toEqual([201, 409]);
  });

  it('locks historical holiday dates/archive but permits an audited name correction with reason', async () => {
    const created = await request(app).post('/api/employee-settings/holidays').set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 0, name: 'Ngày lễ cũ',
      startDate: '2020-01-01', endDate: '2020-01-01'
    });
    const id = created.body.data.holiday.id;
    const dateChange = await request(app).patch(`/api/employee-settings/holidays/${id}`).set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 1, expectedRowRevision: 1,
      startDate: '2020-01-02', endDate: '2020-01-02', reason: 'Thử đổi lịch sử'
    });
    const archive = await request(app).post(`/api/employee-settings/holidays/${id}/archive`).set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 1, expectedRowRevision: 1, reason: 'Thử lưu trữ lịch sử'
    });
    const correction = await request(app).patch(`/api/employee-settings/holidays/${id}`).set(auth()).send({
      branchId: mainBranchId, expectedHolidayRevision: 1, expectedRowRevision: 1,
      name: 'Ngày lễ đã hiệu chỉnh', reason: 'Sửa tên theo văn bản chính thức'
    });

    expect(dateChange.status).toBe(409);
    expect(dateChange.body.error.code).toBe('EMPLOYEE_HOLIDAY_HISTORY_LOCKED');
    expect(archive.status).toBe(409);
    expect(correction.status).toBe(200);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_HOLIDAY_CORRECTED', targetId: id } })).toBe(1);
  });
});
