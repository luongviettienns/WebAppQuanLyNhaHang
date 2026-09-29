import { beforeEach, describe, expect, it } from 'vitest';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee payroll schema API', () => {
  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

  beforeEach(async () => {
    await truncateAllTables();
  });

  async function createFixture() {
    const nonce = `${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 1_000)}`;
    const admin = await prismaTest.user.create({
      data: { username: `payroll-admin-${nonce}`, passwordHash: 'test-hash', name: 'Payroll Admin', role: 'ADMIN' }
    });
    const employee = await prismaTest.employee.create({
      data: { code: `NV-${nonce}`, attendanceCode: `CC-${nonce}`, name: 'Nguyễn An', phone: `09${Date.now()}` }
    });
    const batch = await prismaTest.employeePayrollBatch.create({
      data: {
        code: `BL-${nonce}`,
        name: 'Bảng lương tháng 9/2026',
        periodStart: day('2026-09-01'),
        periodEnd: day('2026-09-30'),
        createdByUserId: admin.id
      },
      include: { branch: true }
    });
    const line = await prismaTest.employeePayrollLine.create({
      data: {
        payrollBatchId: batch.id,
        employeeId: employee.id,
        employeeCode: employee.code,
        employeeName: employee.name,
        periodCalendarDays: 30,
        activeCalendarDays: 30,
        grossAmount: 12_000_000,
        netAmount: 12_000_000,
        remainingAmount: 12_000_000,
        warningCodes: ['UNSCHEDULED_ATTENDANCE'],
        sourceSnapshot: {
          compensationTerms: [{ id: 1, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: '2026-09-01' }],
          attendanceSessions: [{ id: 11, checkInAt: '2026-09-02T01:00:00.000Z', checkOutAt: '2026-09-02T05:00:00.000Z' }]
        },
        calculatedAt: new Date('2026-09-30T17:00:00.000Z')
      }
    });
    return { admin, employee, batch, line };
  }

  it('uses MAIN by default and round-trips frozen warning/source JSON', async () => {
    const { batch, line } = await createFixture();
    const stored = await prismaTest.employeePayrollLine.findUniqueOrThrow({ where: { id: line.id } });

    expect(batch.branch).toMatchObject({ id: 1, code: 'MAIN', isDefault: true });
    expect(stored.warningCodes).toEqual(['UNSCHEDULED_ATTENDANCE']);
    expect(stored.sourceSnapshot).toEqual({
      compensationTerms: [{ id: 1, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [{ id: 11, checkInAt: '2026-09-02T01:00:00.000Z', checkOutAt: '2026-09-02T05:00:00.000Z' }]
    });
  });

  it('rejects a duplicate employee line in the same payroll batch', async () => {
    const { batch, employee } = await createFixture();

    await expect(prismaTest.employeePayrollLine.create({
      data: {
        payrollBatchId: batch.id,
        employeeId: employee.id,
        employeeCode: employee.code,
        employeeName: employee.name,
        warningCodes: [],
        sourceSnapshot: {},
        calculatedAt: new Date()
      }
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('enforces ledger foreign keys instead of leaving orphan adjustments or payments', async () => {
    const { admin, employee, batch } = await createFixture();

    await expect(prismaTest.employeePayrollAdjustment.create({
      data: { payrollLineId: 999_999, type: 'BONUS', amount: 100_000, reason: 'Thưởng', createdByUserId: admin.id }
    })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prismaTest.employeePayrollPayment.create({
      data: {
        payrollBatchId: batch.id,
        payrollLineId: 999_999,
        employeeId: employee.id,
        amount: 100_000,
        method: 'CASH',
        paidAt: new Date(),
        createdByUserId: admin.id
      }
    })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces one idempotency key per actor and operation', async () => {
    const { admin, batch } = await createFixture();
    const record = {
      actorId: admin.id,
      operation: 'CREATE_BATCH',
      idempotencyKey: 'payroll-schema-key-001',
      requestDigest: 'a'.repeat(64),
      response: { ok: true },
      payrollBatchId: batch.id
    };

    await prismaTest.employeePayrollIdempotency.create({ data: record });
    await expect(prismaTest.employeePayrollIdempotency.create({ data: record })).rejects.toMatchObject({ code: 'P2002' });
  });
});
