import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('employee payroll create and recalculate API', () => {
  let token = '';
  let branchId = 0;
  let employeeId = 0;
  let hourlyEmployeeId = 0;
  let adminId = 0;

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `payroll-create-${Date.now()}`, passwordHash: 'hash', name: 'Payroll Admin', role: 'ADMIN' }
    });
    adminId = admin.id;
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    branchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    const employee = await prismaTest.employee.create({
      data: { code: 'NV-API-001', attendanceCode: 'CC-API-001', name: 'Nhân viên tháng', phone: '0900000201', startDate: day('2026-01-01') }
    });
    const hourlyEmployee = await prismaTest.employee.create({
      data: { code: 'NV-API-002', attendanceCode: 'CC-API-002', name: 'Nhân viên giờ', phone: '0900000202', startDate: day('2026-01-01') }
    });
    employeeId = employee.id;
    hourlyEmployeeId = hourlyEmployee.id;
    await prismaTest.employeeCompensation.createMany({ data: [
      { employeeId, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: day('2026-01-01'), createdByUserId: admin.id },
      { employeeId: hourlyEmployeeId, payBasis: 'HOURLY', baseRate: 60_000, effectiveFrom: day('2026-01-01'), createdByUserId: admin.id }
    ] });
  });

  const postCreate = (key: string, body: object) => request(app)
    .post('/api/employee-payrolls')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send(body);

  it('rolls back batch, lines and audit when one custom employee is invalid', async () => {
    const response = await postCreate('api-create-invalid', {
      branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [employeeId, 999_999]
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    expect(await prismaTest.employeePayrollBatch.count()).toBe(0);
    expect(await prismaTest.employeePayrollLine.count()).toBe(0);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_PAYROLL_CREATED' } })).toBe(0);
  });

  it('freezes month-boundary attendance by Asia/Ho_Chi_Minh check-in date and changes only on explicit recalculate', async () => {
    await prismaTest.employeeAttendanceSession.createMany({ data: [
      {
        employeeId: hourlyEmployeeId, branchId,
        checkInAt: new Date('2026-09-30T16:30:00.000Z'), checkOutAt: new Date('2026-09-30T19:30:00.000Z'),
        checkInSource: 'ADMIN_MANUAL', checkOutSource: 'ADMIN_MANUAL', scheduleLinkStatus: 'UNSCHEDULED'
      },
      {
        employeeId: hourlyEmployeeId, branchId,
        checkInAt: new Date('2026-09-30T17:30:00.000Z'), checkOutAt: new Date('2026-09-30T18:30:00.000Z'),
        checkInSource: 'ADMIN_MANUAL', checkOutSource: 'ADMIN_MANUAL', scheduleLinkStatus: 'UNSCHEDULED'
      }
    ] });
    const created = await postCreate('api-create-boundary', {
      branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [hourlyEmployeeId]
    });

    expect(created.status).toBe(201);
    const initial = await prismaTest.employeePayrollLine.findFirstOrThrow({ where: { payrollBatchId: created.body.data.id } });
    expect(initial).toMatchObject({ completedSessions: 1, actualMinutes: 180, grossAmount: 180_000 });
    const frozen = initial.sourceSnapshot;
    await prismaTest.employeeAttendanceSession.updateMany({
      where: { employeeId: hourlyEmployeeId }, data: { checkOutAt: new Date('2026-09-30T20:30:00.000Z') }
    });
    expect((await prismaTest.employeePayrollLine.findUniqueOrThrow({ where: { id: initial.id } })).sourceSnapshot).toEqual(frozen);

    const recalculated = await request(app)
      .post(`/api/employee-payrolls/${created.body.data.id}/recalculate`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'api-recalc-boundary')
      .send({});
    expect(recalculated.status).toBe(200);
    expect((await prismaTest.employeePayrollLine.findUniqueOrThrow({ where: { id: initial.id } })).actualMinutes).toBe(240);
  });

  it('serializes concurrent overlapping creates so only one batch and audit survive', async () => {
    const body = { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [employeeId] };
    const responses = await Promise.all([
      postCreate('api-concurrent-create-a', body),
      postCreate('api-concurrent-create-b', body)
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409)?.body.error.code).toBe('PAYROLL_OVERLAP');
    expect(await prismaTest.employeePayrollBatch.count()).toBe(1);
    expect(await prismaTest.employeePayrollLine.count()).toBe(1);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_PAYROLL_CREATED' } })).toBe(1);
    expect(await prismaTest.employeePayrollIdempotency.count()).toBe(1);
  });
});
