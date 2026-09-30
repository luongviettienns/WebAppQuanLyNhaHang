import { beforeEach, describe, expect, it } from 'vitest';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee settings schema API', () => {
  const baselineDate = new Date('1970-01-01T00:00:00.000Z');

  beforeEach(async () => {
    await truncateAllTables();
  });

  async function createPolicyFixtures() {
    const secondBranch = await prismaTest.branch.create({
      data: { code: `SETTINGS-${Date.now()}`, name: 'Chi nhánh thứ hai', isActive: true }
    });
    const branches = await prismaTest.branch.findMany({ orderBy: { id: 'asc' } });

    await prismaTest.branchEmployeeSettingsRevision.createMany({
      data: branches.map(branch => ({ branchId: branch.id }))
    });
    await prismaTest.branchAttendancePolicyVersion.createMany({
      data: branches.map(branch => ({ branchId: branch.id, effectiveFrom: baselineDate, revision: 1 }))
    });
    await prismaTest.branchPayrollPolicyVersion.createMany({
      data: branches.map(branch => ({ branchId: branch.id, effectiveFrom: baselineDate, revision: 1 }))
    });
    await prismaTest.branchWorkweekPolicyVersion.createMany({
      data: branches.map(branch => ({ branchId: branch.id, effectiveFrom: baselineDate, revision: 1 }))
    });
    return { branches, secondBranch };
  }

  it('records the guarded employee settings migration in TEST database', async () => {
    const rows = await prismaTest.$queryRawUnsafe<Array<{ finished_at: Date | null; rolled_back_at: Date | null }>>(
      `SELECT finished_at, rolled_back_at FROM _prisma_migrations
       WHERE migration_name = '20260930160000_employee_settings'`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].finished_at).not.toBeNull();
    expect(rows[0].rolled_back_at).toBeNull();
  });

  it('supports exactly one independent baseline and revision row per existing branch', async () => {
    const { branches } = await createPolicyFixtures();

    const revisionRows = await prismaTest.branchEmployeeSettingsRevision.findMany({ orderBy: { branchId: 'asc' } });
    const attendanceRows = await prismaTest.branchAttendancePolicyVersion.findMany({ orderBy: { branchId: 'asc' } });
    const payrollRows = await prismaTest.branchPayrollPolicyVersion.findMany({ orderBy: { branchId: 'asc' } });
    const workweekRows = await prismaTest.branchWorkweekPolicyVersion.findMany({ orderBy: { branchId: 'asc' } });
    for (const rows of [revisionRows, attendanceRows, payrollRows, workweekRows]) {
      expect(rows.map(row => row.branchId)).toEqual(branches.map(branch => branch.id));
    }

    await expect(prismaTest.branchAttendancePolicyVersion.create({
      data: { branchId: branches[0].id, effectiveFrom: baselineDate, revision: 2 }
    })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prismaTest.branchPayrollPolicyVersion.create({
      data: { branchId: branches[0].id, effectiveFrom: new Date('2026-10-01T00:00:00.000Z'), revision: 1 }
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('persists attendance policy defaults and keeps actual/planned evidence unchanged', async () => {
    const { branches } = await createPolicyFixtures();
    const policy = await prismaTest.branchAttendancePolicyVersion.findUniqueOrThrow({
      where: { branchId_effectiveFrom: { branchId: branches[0].id, effectiveFrom: baselineDate } }
    });
    const nonce = Date.now();
    const employee = await prismaTest.employee.create({
      data: {
        code: `NV-${nonce}`,
        attendanceCode: `CC-${nonce}`,
        name: 'Nhân viên migration',
        phone: '0900000000'
      }
    });
    const session = await prismaTest.employeeAttendanceSession.create({
      data: {
        employeeId: employee.id,
        branchId: branches[0].id,
        scheduleDate: new Date('2026-09-30T00:00:00.000Z'),
        checkInAt: new Date('2026-09-30T01:07:00.000Z'),
        checkOutAt: new Date('2026-09-30T05:03:00.000Z'),
        checkInSource: 'ADMIN_MANUAL',
        checkOutSource: 'ADMIN_MANUAL',
        scheduleLinkStatus: 'SCHEDULED',
        plannedBranchId: branches[0].id,
        plannedWorkDate: new Date('2026-09-30T00:00:00.000Z'),
        plannedShiftName: 'Ca sáng',
        plannedStartMinute: 480,
        plannedEndMinute: 720,
        attendancePolicyVersionId: policy.id
      }
    });

    expect(policy).toMatchObject({
      standardDayMinutes: 480,
      lateThresholdMinutes: 0,
      earlyLeaveThresholdMinutes: 0,
      allowUnscheduledAttendance: true
    });
    expect(session).toMatchObject({
      plannedShiftName: 'Ca sáng',
      plannedStartMinute: 480,
      plannedEndMinute: 720,
      attendancePolicyVersionId: policy.id,
      standardDayMinutesSnapshot: 480,
      lateThresholdMinutesSnapshot: 0,
      earlyLeaveThresholdMinutesSnapshot: 0,
      allowUnscheduledAttendanceSnapshot: true
    });
    expect(session.checkInAt.toISOString()).toBe('2026-09-30T01:07:00.000Z');
    expect(session.checkOutAt?.toISOString()).toBe('2026-09-30T05:03:00.000Z');
  });

  it('enforces actor-scoped schedule idempotency and restrictive branch references', async () => {
    const { secondBranch } = await createPolicyFixtures();
    const admin = await prismaTest.user.create({
      data: { username: `settings-${Date.now()}`, passwordHash: 'test-hash', name: 'Settings Admin', role: 'ADMIN' }
    });
    const record = {
      actorId: admin.id,
      operation: 'CREATE_SCHEDULE_BATCH',
      idempotencyKey: 'settings-schema-key-001',
      requestDigest: 'a'.repeat(64),
      response: { ok: true }
    };
    await prismaTest.employeeScheduleIdempotency.create({ data: record });
    await expect(prismaTest.employeeScheduleIdempotency.create({ data: record })).rejects.toMatchObject({ code: 'P2002' });

    await expect(prismaTest.branch.delete({ where: { id: secondBranch.id } })).rejects.toMatchObject({ code: 'P2003' });
  });
});
