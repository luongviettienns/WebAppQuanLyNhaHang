import { describe, expect, it, vi } from 'vitest';
import { EmployeeAttendancePunchService } from './employee-attendance-punch.service';
import { createAttendancePunchDigest } from './attendance-idempotency';

const now = new Date('2026-09-29T10:07:00.000Z');
const kiosk = { id: 8, branchId: 3 };
const employee = { id: 21, name: 'Nguyễn Minh Anh', status: 'WORKING' as const };
const attendancePolicy = {
  id: 77,
  standardDayMinutes: 480,
  lateThresholdMinutes: 5,
  earlyLeaveThresholdMinutes: 7,
  allowUnscheduledAttendance: true
};

function buildClient(options: {
  employeeLookup?: { id: number; name: string; status: 'WORKING' | 'RESIGNED' } | null;
  transaction?: Record<string, unknown>;
  transactionCommit?: () => void;
} = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    employee: {
      findFirst: vi.fn().mockResolvedValue(employee)
    },
    attendanceKioskSession: {
      findUnique: vi.fn().mockResolvedValue({ id: kiosk.id, branchId: kiosk.branchId, expiresAt: new Date('2026-09-29T11:00:00.000Z'), revokedAt: null }),
      update: vi.fn().mockResolvedValue({})
    },
    attendanceKioskIdempotency: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({})
    },
    employeeScheduleRule: {
      findMany: vi.fn().mockResolvedValue([])
    },
    branchAttendancePolicyVersion: {
      findFirst: vi.fn().mockResolvedValue(attendancePolicy)
    },
    employeeAttendanceSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 51 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    }
  };
  Object.assign(tx, options.transaction ?? {});
  const client = {
    employee: { findUnique: vi.fn().mockResolvedValue(options.employeeLookup === undefined ? employee : options.employeeLookup) },
    attendanceKioskIdempotency: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async callback => {
      const result = await callback(tx);
      options.transactionCommit?.();
      return result;
    })
  };
  return { client: client as never, tx, outer: client };
}

describe('transactional kiosk attendance punches', () => {
  it('returns a generic credential error for an unknown attendance code without opening a transaction', async () => {
    const { client, outer } = buildClient({ employeeLookup: null });
    const service = new EmployeeAttendancePunchService(client, () => now);

    await expect(service.punch({ attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0001' }, kiosk))
      .rejects.toMatchObject({ code: 'ATTENDANCE_CREDENTIAL_INVALID' });
    expect(outer.$transaction).not.toHaveBeenCalled();
  });

  it('returns the same generic credential error for a resigned employee without recording a punch', async () => {
    const { client, tx, outer } = buildClient({
      employeeLookup: { ...employee, status: 'RESIGNED' },
      transaction: { employee: { findFirst: vi.fn().mockResolvedValue({ ...employee, status: 'RESIGNED' }) } }
    });
    const service = new EmployeeAttendancePunchService(client, () => now);

    await expect(service.punch({ attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0001' }, kiosk))
      .rejects.toMatchObject({ code: 'ATTENDANCE_CREDENTIAL_INVALID' });
    expect(outer.$transaction).toHaveBeenCalledOnce();
    expect(tx.employeeAttendanceSession.create).not.toHaveBeenCalled();
    expect(tx.attendanceKioskIdempotency.create).not.toHaveBeenCalled();
  });

  it('stores actual server time and kiosk branch with an immutable planned snapshot, then emits after commit', async () => {
    let committed = false;
    const shiftRule = {
      id: 42, employeeId: employee.id, branchId: kiosk.branchId, shiftId: 5,
      recurrenceType: 'ONCE' as const, startDate: new Date('2026-09-29T00:00:00.000Z'), endDate: null,
      dayOfWeek: null, cancelledAt: null,
      shift: { name: 'Ca chiều', startMinute: 960, endMinute: 1080 }, exceptions: []
    };
    const { client, tx } = buildClient({
      transaction: {
        employeeScheduleRule: { findMany: vi.fn().mockResolvedValue([shiftRule]) }
      },
      transactionCommit: () => { committed = true; }
    });
    const emit = vi.fn(() => expect(committed).toBe(true));
    const service = new EmployeeAttendancePunchService(client, () => now, emit);

    const result = await service.punch({ attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0002' }, kiosk);

    expect(result).toMatchObject({ action: 'CHECK_IN', employeeName: employee.name, recordedAt: now.toISOString(), linkStatus: 'SCHEDULED', shiftName: 'Ca chiều' });
    expect(tx.employeeAttendanceSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        employeeId: employee.id, branchId: kiosk.branchId, checkInAt: now, checkInSource: 'KIOSK',
        checkInKioskSessionId: kiosk.id, scheduleRuleId: shiftRule.id, scheduleDate: shiftRule.startDate,
        plannedBranchId: kiosk.branchId, plannedShiftName: 'Ca chiều', plannedStartMinute: 960, plannedEndMinute: 1080,
        attendancePolicyVersionId: attendancePolicy.id,
        standardDayMinutesSnapshot: attendancePolicy.standardDayMinutes,
        lateThresholdMinutesSnapshot: attendancePolicy.lateThresholdMinutes,
        earlyLeaveThresholdMinutesSnapshot: attendancePolicy.earlyLeaveThresholdMinutes,
        allowUnscheduledAttendanceSnapshot: attendancePolicy.allowUnscheduledAttendance
      })
    }));
    expect(JSON.stringify(tx.attendanceKioskIdempotency.create.mock.calls[0][0])).not.toContain('secret-code');
    expect(emit).toHaveBeenCalledOnce();
  });

  it('replays a committed result before rejecting a changed employee state or current open-session state', async () => {
    const priorResponse = { action: 'CHECK_IN', employeeName: employee.name, recordedAt: now.toISOString(), state: 'OPEN', linkStatus: 'UNSCHEDULED' };
    const transaction = {
      employee: { findFirst: vi.fn().mockResolvedValue({ ...employee, status: 'RESIGNED' }) },
      attendanceKioskIdempotency: { findUnique: vi.fn().mockResolvedValue({
        requestDigest: createAttendancePunchDigest({ employeeId: employee.id, action: 'CHECK_IN' }), response: priorResponse
      }) },
      employeeAttendanceSession: {
        findMany: vi.fn().mockResolvedValue([{ id: 88, checkOutAt: null }])
      }
    };
    const { client, tx } = buildClient({ employeeLookup: { ...employee, status: 'RESIGNED' }, transaction });
    const service = new EmployeeAttendancePunchService(client, () => now);

    const result = await service.punch({ attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0003' }, kiosk);

    expect(result).toEqual(priorResponse);
    expect(tx.employeeAttendanceSession.findMany).not.toHaveBeenCalled();
  });

  it('returns schedule-choice instructions without creating attendance or idempotency rows', async () => {
    const { client, tx } = buildClient();
    const service = new EmployeeAttendancePunchService(client, () => now);

    const result = await service.punch({ attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0004' }, kiosk);

    expect(result).toMatchObject({ selectionRequired: true, code: 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED' });
    expect(tx.employeeAttendanceSession.create).not.toHaveBeenCalled();
    expect(tx.attendanceKioskIdempotency.create).not.toHaveBeenCalled();
  });

  it('rejects an unscheduled check-in when the effective policy requires a schedule', async () => {
    const { client, tx } = buildClient({ transaction: {
      branchAttendancePolicyVersion: {
        findFirst: vi.fn().mockResolvedValue({ ...attendancePolicy, id: 78, allowUnscheduledAttendance: false })
      }
    } });
    const service = new EmployeeAttendancePunchService(client, () => now);

    await expect(service.punch({
      attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-policy-0001'
    }, kiosk)).rejects.toMatchObject({ code: 'ATTENDANCE_SCHEDULE_REQUIRED' });
    expect(tx.employeeAttendanceSession.create).not.toHaveBeenCalled();
    expect(tx.attendanceKioskIdempotency.create).not.toHaveBeenCalled();
  });

  it('requires an explicit scheduled-versus-outside choice when a single shift already ended', async () => {
    const endedShift = {
      id: 43, employeeId: employee.id, branchId: kiosk.branchId, shiftId: 6,
      recurrenceType: 'ONCE' as const, startDate: new Date('2026-09-29T00:00:00.000Z'), endDate: null,
      dayOfWeek: null, cancelledAt: null,
      shift: { name: 'Ca sáng', startMinute: 480, endMinute: 720 }, exceptions: []
    };
    const { client, tx } = buildClient({ transaction: {
      employeeScheduleRule: { findMany: vi.fn().mockResolvedValue([endedShift]) }
    } });
    const service = new EmployeeAttendancePunchService(client, () => now);

    const result = await service.punch({ attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0005' }, kiosk);

    expect(result).toMatchObject({ selectionRequired: true, code: 'SCHEDULE_SELECTION_REQUIRED', allowOutsideSchedule: true });
    expect(tx.employeeAttendanceSession.create).not.toHaveBeenCalled();
  });

  it('allows a confirmed outside-schedule check-in without copying a schedule snapshot', async () => {
    const endedShift = {
      id: 43, employeeId: employee.id, branchId: kiosk.branchId, shiftId: 6,
      recurrenceType: 'ONCE' as const, startDate: new Date('2026-09-29T00:00:00.000Z'), endDate: null,
      dayOfWeek: null, cancelledAt: null,
      shift: { name: 'Ca sáng', startMinute: 480, endMinute: 720 }, exceptions: []
    };
    const { client, tx } = buildClient({ transaction: {
      employeeScheduleRule: { findMany: vi.fn().mockResolvedValue([endedShift]) }
    } });
    const service = new EmployeeAttendancePunchService(client, () => now);

    const result = await service.punch({
      attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0006', outsideScheduleConfirmation: true
    }, kiosk);

    expect(result).toMatchObject({ action: 'CHECK_IN', linkStatus: 'UNSCHEDULED', shiftName: null });
    expect(tx.employeeAttendanceSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        checkInAt: now, branchId: kiosk.branchId, scheduleRuleId: null, plannedBranchId: null,
        plannedShiftName: null, plannedStartMinute: null, plannedEndMinute: null
      })
    }));
  });

  it('closes only the existing branch-matched session and stores server checkout time', async () => {
    const openSession = {
      id: 70, branchId: kiosk.branchId, checkInAt: new Date('2026-09-29T00:55:00.000Z'), checkOutAt: null,
      scheduleLinkStatus: 'SCHEDULED' as const, scheduleDate: new Date('2026-09-29T00:00:00.000Z'),
      plannedWorkDate: new Date('2026-09-29T00:00:00.000Z'), plannedShiftName: 'Ca sáng'
    };
    const { client, tx } = buildClient({ transaction: {
      employeeAttendanceSession: {
        findMany: vi.fn().mockResolvedValue([openSession]),
        create: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    } });
    const service = new EmployeeAttendancePunchService(client, () => now);

    const result = await service.punch({ attendanceCode: 'secret-code', action: 'CHECK_OUT', idempotencyKey: 'punch-key-0007' }, kiosk);

    expect(result).toMatchObject({ action: 'CHECK_OUT', recordedAt: now.toISOString(), state: 'COMPLETED', shiftName: 'Ca sáng' });
    expect(tx.employeeAttendanceSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: openSession.id, checkOutAt: null },
      data: { checkOutAt: now, checkOutSource: 'KIOSK', checkOutKioskSessionId: kiosk.id }
    }));
    expect(tx.branchAttendancePolicyVersion.findFirst).not.toHaveBeenCalled();
    expect(tx.employeeAttendanceSession.create).not.toHaveBeenCalled();
  });

  it('refuses check-out when the open session belongs to a different branch', async () => {
    const { client, tx } = buildClient({ transaction: {
      employeeAttendanceSession: {
        findMany: vi.fn().mockResolvedValue([{ id: 70, branchId: 99, checkInAt: now, checkOutAt: null, scheduleLinkStatus: 'SCHEDULED', plannedShiftName: 'Ca sáng' }]),
        updateMany: vi.fn()
      }
    } });
    const service = new EmployeeAttendancePunchService(client, () => now);

    await expect(service.punch({ attendanceCode: 'secret-code', action: 'CHECK_OUT', idempotencyKey: 'punch-key-0008' }, kiosk))
      .rejects.toMatchObject({ code: 'ATTENDANCE_BRANCH_MISMATCH' });
    expect(tx.employeeAttendanceSession.updateMany).not.toHaveBeenCalled();
  });

  it('keeps a prior-day open session blocking new check-in rather than auto-closing it', async () => {
    const oldOpenSession = { id: 12, branchId: kiosk.branchId, checkInAt: new Date('2026-09-28T01:00:00.000Z'), checkOutAt: null };
    const { client, tx } = buildClient({ transaction: {
      employeeAttendanceSession: { findMany: vi.fn().mockResolvedValue([oldOpenSession]), updateMany: vi.fn() }
    } });
    const service = new EmployeeAttendancePunchService(client, () => now);

    await expect(service.punch({ attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0009' }, kiosk))
      .rejects.toMatchObject({ code: 'ATTENDANCE_SESSION_ALREADY_OPEN' });
    expect(tx.employeeAttendanceSession.updateMany).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different resolved payload', async () => {
    const { client, tx } = buildClient({ transaction: {
      attendanceKioskIdempotency: {
        findUnique: vi.fn().mockResolvedValue({ requestDigest: 'f'.repeat(64), response: { action: 'CHECK_IN' } })
      }
    } });
    const service = new EmployeeAttendancePunchService(client, () => now);

    await expect(service.punch({ attendanceCode: 'secret-code', action: 'CHECK_IN', idempotencyKey: 'punch-key-0010' }, kiosk))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(tx.employeeAttendanceSession.findMany).not.toHaveBeenCalled();
  });
});
