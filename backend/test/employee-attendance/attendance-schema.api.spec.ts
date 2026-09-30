import { beforeEach, describe, expect, it } from 'vitest';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee attendance schema API', () => {
  let branchId = 0;
  let adminId = 0;
  let employeeId = 0;
  let shiftId = 0;
  let scheduleRuleId = 0;
  let kioskSessionId = 0;

  const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

  beforeEach(async () => {
    await truncateAllTables();
    const branch = await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } });
    branchId = branch.id;
    const admin = await prismaTest.user.create({
      data: { username: `attendance-schema-admin-${Date.now()}`, passwordHash: 'test-hash', name: 'Attendance Admin', role: 'ADMIN' }
    });
    adminId = admin.id;
    const employee = await prismaTest.employee.create({
      data: { code: `NV-A${Date.now()}`, attendanceCode: `CC-A${Date.now()}`, name: 'Nguyễn Minh Anh', phone: '0900000001' }
    });
    employeeId = employee.id;
    const shift = await prismaTest.workShift.create({ data: { code: `M-${Date.now()}`, name: `Ca sáng ${Date.now()}`, startMinute: 480, endMinute: 720 } });
    shiftId = shift.id;
    const rule = await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId, recurrenceType: 'ONCE', startDate: day('2026-09-29'), createdByUserId: adminId }
    });
    scheduleRuleId = rule.id;
  });

  it('seeds MAIN as the sole default and attaches legacy-compatible schedule creation to it', async () => {
    const branch = await prismaTest.branch.findUniqueOrThrow({ where: { id: branchId } });
    const rule = await prismaTest.employeeScheduleRule.findUniqueOrThrow({ where: { id: scheduleRuleId }, include: { branch: true } });

    expect(branch).toMatchObject({ id: 1, code: 'MAIN', isActive: true, isDefault: true });
    expect(await prismaTest.branch.count({ where: { isDefault: true } })).toBe(1);
    expect(rule.branchId).toBe(branchId);
    expect(rule.branch.code).toBe('MAIN');
    const otherBranch = await prismaTest.branch.create({ data: { code: 'OTHER', name: 'Chi nhánh khác' } });
    const sameShiftAtOtherBranch = await prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId, branchId: otherBranch.id, recurrenceType: 'ONCE', startDate: day('2026-09-29'), createdByUserId: adminId }
    });
    expect(sameShiftAtOtherBranch.branchId).toBe(otherBranch.id);
    await expect(prismaTest.employeeScheduleRule.create({
      data: { employeeId, shiftId, branchId: 999999, recurrenceType: 'ONCE', startDate: day('2026-09-30'), createdByUserId: adminId }
    })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces unique kiosk token hashes and idempotency keys per kiosk', async () => {
    const kiosk = await prismaTest.attendanceKioskSession.create({
      data: { branchId, tokenHash: 'a'.repeat(64), createdByUserId: adminId, expiresAt: new Date('2026-09-30T00:00:00.000Z') }
    });
    kioskSessionId = kiosk.id;
    await expect(prismaTest.attendanceKioskSession.create({
      data: { branchId, tokenHash: 'a'.repeat(64), createdByUserId: adminId, expiresAt: new Date('2026-09-30T00:00:00.000Z') }
    })).rejects.toMatchObject({ code: 'P2002' });

    const idempotency = {
      kioskSessionId, idempotencyKey: 'attendance-schema-key-001', requestDigest: 'b'.repeat(64), response: { ok: true }
    };
    await prismaTest.attendanceKioskIdempotency.create({ data: idempotency });
    await expect(prismaTest.attendanceKioskIdempotency.create({ data: idempotency })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('stores actual timestamps separately from a frozen schedule snapshot and rejects duplicate occurrence dispositions', async () => {
    const kiosk = await prismaTest.attendanceKioskSession.create({
      data: { branchId, tokenHash: 'c'.repeat(64), createdByUserId: adminId, expiresAt: new Date('2026-09-30T00:00:00.000Z') }
    });
    const actualCheckIn = new Date('2026-09-29T01:07:00.000Z');
    const policy = await prismaTest.branchAttendancePolicyVersion.create({
      data: {
        branchId,
        effectiveFrom: day('2026-01-01'),
        revision: 1,
        standardDayMinutes: 450,
        lateThresholdMinutes: 5,
        earlyLeaveThresholdMinutes: 7,
        allowUnscheduledAttendance: false,
        createdByUserId: adminId
      }
    });
    const session = await prismaTest.employeeAttendanceSession.create({
      data: {
        employeeId, branchId, scheduleRuleId, scheduleDate: day('2026-09-29'), checkInAt: actualCheckIn,
        checkInSource: 'KIOSK', checkInKioskSessionId: kiosk.id, scheduleLinkStatus: 'SCHEDULED', plannedBranchId: branchId,
        plannedWorkDate: day('2026-09-29'), plannedShiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720,
        attendancePolicyVersionId: policy.id,
        standardDayMinutesSnapshot: policy.standardDayMinutes,
        lateThresholdMinutesSnapshot: policy.lateThresholdMinutes,
        earlyLeaveThresholdMinutesSnapshot: policy.earlyLeaveThresholdMinutes,
        allowUnscheduledAttendanceSnapshot: policy.allowUnscheduledAttendance
      }
    });
    expect(session.checkInAt.toISOString()).toBe(actualCheckIn.toISOString());
    expect(session.plannedStartMinute).toBe(480);
    expect(session).toMatchObject({
      attendancePolicyVersionId: policy.id,
      standardDayMinutesSnapshot: 450,
      lateThresholdMinutesSnapshot: 5,
      earlyLeaveThresholdMinutesSnapshot: 7,
      allowUnscheduledAttendanceSnapshot: false
    });

    const disposition = {
      branchId, employeeId, scheduleRuleId, workDate: day('2026-09-29'), reason: 'Đã xác nhận vắng mặt', actorId: adminId
    };
    await prismaTest.employeeAttendanceDisposition.create({ data: disposition });
    await expect(prismaTest.employeeAttendanceDisposition.create({ data: disposition })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('stores rate buckets using unique opaque hashes and expiry metadata', async () => {
    const bucket = {
      bucketHash: 'd'.repeat(64), bucketType: 'ATTENDANCE_CODE' as const,
      requestCount: 1, windowStartedAt: new Date('2026-09-29T01:00:00.000Z'), expiresAt: new Date('2026-09-29T01:05:00.000Z')
    };
    await prismaTest.attendanceKioskRateLimitBucket.create({ data: bucket });
    await expect(prismaTest.attendanceKioskRateLimitBucket.create({ data: bucket })).rejects.toMatchObject({ code: 'P2002' });
  });
});
