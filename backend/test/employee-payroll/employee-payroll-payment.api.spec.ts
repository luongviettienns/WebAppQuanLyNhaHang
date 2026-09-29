import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('employee payroll payment API', () => {
  let token = '';
  let batchId = 0;
  let lineId = 0;

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `pay-api-${Date.now()}`, passwordHash: 'hash', name: 'Payroll Admin', role: 'ADMIN' }
    });
    token = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    const branchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    const employee = await prismaTest.employee.create({
      data: { code: 'NV-PAYAPI-001', attendanceCode: 'CC-PAYAPI-001', name: 'Nhân viên', phone: '0900000501', startDate: day('2026-01-01') }
    });
    await prismaTest.employeeCompensation.create({
      data: { employeeId: employee.id, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: day('2026-01-01'), createdByUserId: admin.id }
    });
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(app).post('/api/employee-payrolls').set(auth).set('Idempotency-Key', 'payment-api-create').send({
      branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [employee.id]
    });
    batchId = created.body.data.id;
    lineId = (await prismaTest.employeePayrollLine.findFirstOrThrow({ where: { payrollBatchId: batchId } })).id;
    const finalized = await request(app).post(`/api/employee-payrolls/${batchId}/finalize`)
      .set(auth).set('Idempotency-Key', 'payment-api-finalize').send({});
    expect(finalized.status).toBe(200);
  });

  const payment = (key: string, amount: number) => request(app)
    .post(`/api/employee-payrolls/${batchId}/lines/${lineId}/payments`)
    .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key)
    .send({ amount, method: 'CASH' });

  it('serializes concurrent payments so committed totals never overpay or become negative', async () => {
    const responses = await Promise.all([
      payment('concurrent-payment-a', 8_000_000),
      payment('concurrent-payment-b', 7_000_000)
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409)?.body.error.code).toBe('PAYROLL_PAYMENT_EXCEEDS_REMAINING');
    const line = await prismaTest.employeePayrollLine.findUniqueOrThrow({ where: { id: lineId } });
    const batch = await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect([7_000_000, 8_000_000]).toContain(line.paidAmount);
    expect(line.remainingAmount).toBe(12_000_000 - line.paidAmount);
    expect(line.remainingAmount).toBeGreaterThanOrEqual(0);
    expect(batch.totalPaidAmount).toBe(line.paidAmount);
    expect(batch.totalRemainingAmount).toBe(line.remainingAmount);
    expect(await prismaTest.employeePayrollPayment.count({ where: { status: 'SUCCESS' } })).toBe(1);
  });

  it('records and reverses a payment with required idempotency identities and audit history', async () => {
    const recorded = await payment('payment-api-record', 2_000_000);
    expect(recorded.status).toBe(201);
    expect(recorded.body.data).toMatchObject({ amount: 2_000_000, linePaidAmount: 2_000_000, lineRemainingAmount: 10_000_000 });

    const reversed = await request(app)
      .post(`/api/employee-payrolls/${batchId}/lines/${lineId}/payments/${recorded.body.data.id}/reverse`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'payment-api-reverse')
      .send({ reason: 'Hoàn tác giao dịch nhập nhầm' });
    expect(reversed.status).toBe(200);
    expect(reversed.body.data).toMatchObject({ status: 'REVERSED', linePaidAmount: 0, lineRemainingAmount: 12_000_000 });
    expect(await prismaTest.employeePayrollPayment.count()).toBe(1);
    expect(await prismaTest.auditLog.count({ where: { action: { in: ['EMPLOYEE_PAYROLL_PAYMENT_RECORDED', 'EMPLOYEE_PAYROLL_PAYMENT_REVERSED'] } } })).toBe(2);

    const missingKey = await request(app)
      .post(`/api/employee-payrolls/${batchId}/lines/${lineId}/payments`)
      .set('Authorization', `Bearer ${token}`).send({ amount: 1_000, method: 'CASH' });
    expect(missingKey.status).toBe(400);
  });
});
