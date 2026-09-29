import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('employee payroll lifecycle API', () => {
  let token = '';
  let branchId = 0;
  let employeeId = 0;
  let adminId = 0;

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `payroll-life-${Date.now()}`, passwordHash: 'hash', name: 'Payroll Admin', role: 'ADMIN' }
    });
    adminId = admin.id;
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    branchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    const employee = await prismaTest.employee.create({
      data: { code: 'NV-LIFE-001', attendanceCode: 'CC-LIFE-001', name: 'Nhân viên', phone: '0900000301', startDate: day('2026-01-01') }
    });
    employeeId = employee.id;
    await prismaTest.employeeCompensation.create({
      data: { employeeId, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: day('2026-01-01'), createdByUserId: admin.id }
    });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  async function create(month = '2026-09') {
    return request(app).post('/api/employee-payrolls').set(auth()).set('Idempotency-Key', `create-${month}-lifecycle`).send({
      branchId, month, scope: 'CUSTOM', employeeIds: [employeeId]
    });
  }

  it('adds/reverses adjustments, then freezes adjustment actions after finalization', async () => {
    const created = await create();
    const line = await prismaTest.employeePayrollLine.findFirstOrThrow({ where: { payrollBatchId: created.body.data.id } });
    const added = await request(app)
      .post(`/api/employee-payrolls/${created.body.data.id}/lines/${line.id}/adjustments`)
      .set(auth()).send({ type: 'BONUS', amount: 500_000, reason: 'Thưởng hiệu suất' });
    expect(added.status).toBe(201);
    expect((await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: created.body.data.id } })).totalNetAmount).toBe(12_500_000);

    const reversed = await request(app)
      .post(`/api/employee-payrolls/${created.body.data.id}/lines/${line.id}/adjustments/${added.body.data.id}/reverse`)
      .set(auth()).send({ reason: 'Thưởng nhập nhầm' });
    expect(reversed.status).toBe(200);
    expect((await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: created.body.data.id } })).totalNetAmount).toBe(12_000_000);

    const finalized = await request(app).post(`/api/employee-payrolls/${created.body.data.id}/finalize`)
      .set(auth()).set('Idempotency-Key', 'finalize-lifecycle-001').send({});
    expect(finalized.status).toBe(200);
    const blocked = await request(app)
      .post(`/api/employee-payrolls/${created.body.data.id}/lines/${line.id}/adjustments`)
      .set(auth()).send({ type: 'BONUS', amount: 1_000, reason: 'Không hợp lệ' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PAYROLL_STATE_INVALID');
  });

  it('allows cancelling finalized-unpaid history but rejects finalized batches with a successful payment', async () => {
    const unpaid = await create('2026-08');
    await request(app).post(`/api/employee-payrolls/${unpaid.body.data.id}/finalize`)
      .set(auth()).set('Idempotency-Key', 'finalize-unpaid-cancel').send({});
    const cancelled = await request(app).post(`/api/employee-payrolls/${unpaid.body.data.id}/cancel`)
      .set(auth()).send({ reason: 'Hủy bảng chưa chi trả' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Hủy bảng chưa chi trả' });
    expect(await prismaTest.employeePayrollLine.count({ where: { payrollBatchId: unpaid.body.data.id } })).toBe(1);

    const paid = await create('2026-09');
    await request(app).post(`/api/employee-payrolls/${paid.body.data.id}/finalize`)
      .set(auth()).set('Idempotency-Key', 'finalize-paid-cancel').send({});
    const paidLine = await prismaTest.employeePayrollLine.findFirstOrThrow({ where: { payrollBatchId: paid.body.data.id } });
    await prismaTest.employeePayrollPayment.create({
      data: {
        payrollBatchId: paid.body.data.id, payrollLineId: paidLine.id, employeeId, amount: 100_000,
        method: 'CASH', status: 'SUCCESS', paidAt: new Date(), createdByUserId: adminId
      }
    });
    const rejected = await request(app).post(`/api/employee-payrolls/${paid.body.data.id}/cancel`)
      .set(auth()).send({ reason: 'Không được hủy' });
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('PAYROLL_STATE_INVALID');
    expect((await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: paid.body.data.id } })).status).toBe('FINALIZED');
  });
});
