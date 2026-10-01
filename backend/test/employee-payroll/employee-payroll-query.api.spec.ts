import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('employee payroll query API', () => {
  let token = '';
  let batchId = 0;
  let employeeId = 0;

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `payroll-admin-${Date.now()}`, passwordHash: 'hash', name: 'Payroll Admin', role: 'ADMIN' }
    });
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    const branch = await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } });
    const [employee, secondEmployee] = await Promise.all([
      prismaTest.employee.create({
        data: {
          code: 'NV-PAY-001', attendanceCode: 'CC-PAY-001', name: 'Nguyễn Minh Anh', phone: '0900000001',
          nationalId: '079123456789', bankName: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN MINH ANH'
        }
      }),
      prismaTest.employee.create({
        data: { code: 'NV-PAY-002', attendanceCode: 'CC-PAY-002', name: 'Lê Quốc Bảo', phone: '0900000002' }
      })
    ]);
    employeeId = employee.id;
    const calculatedAt = new Date('2026-09-30T08:00:00.000Z');
    const created = await prismaTest.employeePayrollBatch.create({
      data: {
        code: 'BL202609001', name: 'Bảng lương tháng 9/2026', branchId: branch.id,
        periodStart: day('2026-09-01'), periodEnd: day('2026-09-30'), status: 'CALCULATED',
        totalGrossAmount: 20_000_000, totalAdjustmentAmount: 500_000, totalNetAmount: 20_500_000,
        totalPaidAmount: 2_500_000, totalRemainingAmount: 18_000_000,
        createdByUserId: admin.id, calculatedByUserId: admin.id, calculatedAt,
        lines: {
          create: [
            {
              employeeId: employee.id, employeeCode: employee.code, employeeName: employee.name,
              bankName: employee.bankName, bankAccountNumber: employee.bankAccountNumber, bankAccountName: employee.bankAccountName,
              activeCalendarDays: 30, periodCalendarDays: 30, completedSessions: 20, actualMinutes: 9_600,
              grossAmount: 12_000_000, bonusAmount: 500_000, netAmount: 12_500_000,
              paidAmount: 2_500_000, remainingAmount: 10_000_000, warningCodes: [], sourceSnapshot: { compensationTerms: [], attendanceSessions: [] }, calculatedAt
            },
            {
              employeeId: secondEmployee.id, employeeCode: secondEmployee.code, employeeName: secondEmployee.name,
              activeCalendarDays: 30, periodCalendarDays: 30, completedSessions: 18, actualMinutes: 8_640,
              grossAmount: 8_000_000, netAmount: 8_000_000, remainingAmount: 8_000_000,
              warningCodes: ['UNSCHEDULED_ATTENDANCE'], sourceSnapshot: { compensationTerms: [], attendanceSessions: [] }, calculatedAt
            }
          ]
        }
      }
    });
    batchId = created.id;
    await prismaTest.employeePayrollBatch.create({
      data: {
        code: 'BL202608001', name: 'Bảng lương tháng 8/2026', branchId: branch.id,
        periodStart: day('2026-08-01'), periodEnd: day('2026-08-31'), status: 'FINALIZED',
        totalGrossAmount: 10_000_000, totalNetAmount: 10_000_000, totalRemainingAmount: 10_000_000,
        createdByUserId: admin.id, calculatedAt, finalizedAt: calculatedAt, finalizedByUserId: admin.id
      }
    });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('filters list rows and returns totals for all matching batches, not just the page', async () => {
    const response = await request(app)
      .get('/api/employee-payrolls?status=CALCULATED,FINALIZED&page=1&pageSize=1')
      .set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
    expect(response.body.data.summary).toMatchObject({
      totalGrossAmount: 30_000_000,
      totalNetAmount: 30_500_000,
      totalPaidAmount: 2_500_000,
      totalRemainingAmount: 28_000_000
    });
    expect(JSON.stringify(response.body.data)).not.toContain('079123456789');
    expect(JSON.stringify(response.body.data)).not.toContain('CC-PAY-001');
  });

  it('returns Admin detail snapshots and detects source edits only on a non-finalized batch', async () => {
    await prismaTest.employee.update({
      where: { id: employeeId },
      data: { note: 'Nguồn đã đổi sau khi tính', updatedAt: new Date('2026-10-01T00:00:00.000Z') }
    });
    const response = await request(app).get(`/api/employee-payrolls/${batchId}`).set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ code: 'BL202609001', sourceStale: true });
    expect(response.body.data.lines).toHaveLength(2);
    expect(response.body.data.lines[0]).toHaveProperty('sourceSnapshot');
    expect(response.body.data.lines[0]).toHaveProperty('bankAccountNumber');
    expect(JSON.stringify(response.body.data)).not.toContain('079123456789');
    expect(JSON.stringify(response.body.data)).not.toContain('CC-PAY-001');
  });

  it('exports every line from the selected batch', async () => {
    const response = await request(app).get(`/api/employee-payrolls/${batchId}/export?format=csv`).set(auth());

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('BL202609001.csv');
    expect(response.text).toContain('NV-PAY-001');
    expect(response.text).toContain('NV-PAY-002');
    expect(response.text).not.toContain('079123456789');
    expect(response.text).not.toContain('CC-PAY-001');
  });
});
