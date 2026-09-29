import { describe, expect, it, vi } from 'vitest';
import { EmployeeAttendanceAdminService } from './employee-attendance-admin.service';

const now = new Date('2026-09-29T05:30:00.000Z');
const occurrence = {
  scheduleRuleId: 11, employeeId: 4, branchId: 1, shiftId: 3, scheduleDate: '2026-09-29',
  shiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720
};
const employee = { id: 4, status: 'WORKING' as const, startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: null };
const openSession = {
  id: 30, employeeId: 4, branchId: 1, scheduleRuleId: 11, scheduleDate: new Date('2026-09-29T00:00:00.000Z'),
  checkInAt: new Date('2026-09-29T01:00:00.000Z'), checkOutAt: null,
  checkInSource: 'KIOSK', checkOutSource: null, checkInKioskSessionId: 3, checkOutKioskSessionId: null,
  scheduleLinkStatus: 'SCHEDULED', plannedBranchId: 1, plannedWorkDate: new Date('2026-09-29T00:00:00.000Z'),
  plannedShiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720
};
const actor = { id: 7, name: 'Admin' };

function makeAdminStore(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const tx = {
    lockEmployee: vi.fn(async () => { calls.push('lock'); }),
    getEmployee: vi.fn(async () => employee),
    getBranch: vi.fn(async () => ({ id: 1, isActive: true })),
    getOccurrenceOwner: vi.fn(async () => ({ employeeId: 4 })),
    getOccurrence: vi.fn(async () => occurrence),
    findOpenSession: vi.fn(async () => null),
    findSession: vi.fn(async () => openSession),
    findSessionForOccurrence: vi.fn(async () => null),
    findDispositionForOccurrence: vi.fn(async () => null),
    findDisposition: vi.fn(async () => null),
    createSession: vi.fn(async (data: Record<string, unknown>) => ({ id: 80, ...data })),
    updateSession: vi.fn(async (_id: number, data: Record<string, unknown>) => ({ ...openSession, ...data })),
    createDisposition: vi.fn(async (data: Record<string, unknown>) => ({ id: 90, createdAt: now, revokedAt: null, revokedByUserId: null, ...data })),
    updateDisposition: vi.fn(async (_id: number, data: Record<string, unknown>) => ({
      id: 90, branchId: 1, employeeId: 4, scheduleRuleId: 11, workDate: new Date('2026-09-29T00:00:00.000Z'),
      type: 'ABSENT' as const, reason: 'Đã báo nghỉ', actorId: 7, createdAt: now, revokedAt: null, revokedByUserId: null, ...data
    })),
    audit: vi.fn(async (input: { action: string }) => { calls.push(`audit:${input.action}`); }),
    ...overrides
  };
  const store = {
    transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => {
      const result = await work(tx);
      calls.push('commit');
      return result;
    })
  };
  return { store: store as never, tx, calls };
}

describe('Admin attendance mutations', () => {
  it('creates a reasoned manual session with actual times and frozen schedule snapshot in one transaction', async () => {
    const { store, tx, calls } = makeAdminStore();
    const emitChanged = vi.fn(() => { calls.push('emit'); });
    const service = new EmployeeAttendanceAdminService(store, () => now, emitChanged);

    const result = await service.createManualSession({
      employeeId: 4, branchId: 1, checkInAt: '2026-09-29T08:07:00+07:00',
      scheduleRuleId: 11, scheduleDate: '2026-09-29', reason: 'Kiosk mất kết nối'
    }, actor);

    expect(result.id).toBe(80);
    expect(tx.lockEmployee).toHaveBeenCalledWith(4);
    expect(tx.createSession).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 4, branchId: 1, checkInAt: new Date('2026-09-29T01:07:00.000Z'),
      checkInSource: 'ADMIN_MANUAL', scheduleRuleId: 11, scheduleDate: new Date('2026-09-29T00:00:00.000Z'),
      plannedShiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720
    }));
    expect(tx.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMPLOYEE_ATTENDANCE_MANUAL_CREATED', targetType: 'EmployeeAttendanceSession', actorId: actor.id,
      metadata: expect.objectContaining({ reason: 'Kiosk mất kết nối', before: null, after: expect.objectContaining({ checkInAt: '2026-09-29T01:07:00.000Z' }) })
    }));
    expect(calls.indexOf('commit')).toBeLessThan(calls.indexOf('emit'));
    expect(emitChanged).toHaveBeenCalledWith(expect.objectContaining({ branchId: 1, changedFrom: '2026-09-29' }));
  });

  it('blocks manual creation while an employee has an open session', async () => {
    const { store, tx } = makeAdminStore({ findOpenSession: vi.fn(async () => ({ id: 31 })) });
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    await expect(service.createManualSession({
      employeeId: 4, branchId: 1, checkInAt: '2026-09-29T08:07:00+07:00', reason: 'Bổ sung giờ vào'
    }, actor)).rejects.toMatchObject({ code: 'ATTENDANCE_SESSION_ALREADY_OPEN' });
    expect(tx.createSession).not.toHaveBeenCalled();
  });

  it('rejects an Admin punch date outside the employee employment period', async () => {
    const { store, tx } = makeAdminStore();
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    await expect(service.createManualSession({
      employeeId: 4, branchId: 1, checkInAt: '2025-12-31T08:00:00+07:00', reason: 'Bổ sung giờ vào'
    }, actor)).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_WORKING' });
    expect(tx.createSession).not.toHaveBeenCalled();
  });

  it('validates the employee employment period again when an existing actual time is corrected', async () => {
    const { store, tx } = makeAdminStore();
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    await expect(service.updateSession(30, {
      checkInAt: '2025-12-31T08:00:00+07:00', reason: 'Sửa giờ vào'
    }, actor)).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_WORKING' });
    expect(tx.updateSession).not.toHaveBeenCalled();
  });

  it('corrects actual checkout time while retaining the planned snapshot and auditing both versions', async () => {
    const { store, tx } = makeAdminStore();
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    await service.updateSession(30, {
      checkOutAt: '2026-09-29T12:03:00+07:00', reason: 'Kiosk không ghi nhận giờ ra'
    }, actor);

    expect(tx.updateSession).toHaveBeenCalledWith(30, expect.objectContaining({
      checkInAt: openSession.checkInAt, checkOutAt: new Date('2026-09-29T05:03:00.000Z'),
      checkOutSource: 'ADMIN_MANUAL', checkOutKioskSessionId: null
    }));
    expect(tx.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMPLOYEE_ATTENDANCE_SESSION_UPDATED',
      metadata: expect.objectContaining({
        reason: 'Kiosk không ghi nhận giờ ra',
        before: expect.objectContaining({ checkOutAt: null, plannedShiftName: 'Ca sáng' }),
        after: expect.objectContaining({ checkOutAt: '2026-09-29T05:03:00.000Z', plannedShiftName: 'Ca sáng' })
      })
    }));
  });

  it('clears all schedule snapshot fields together when Admin unlinks an attendance session', async () => {
    const { store, tx } = makeAdminStore();
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    await service.updateSession(30, { scheduleRuleId: null, scheduleDate: null, reason: 'Ca được gán nhầm' }, actor);

    expect(tx.updateSession).toHaveBeenCalledWith(30, expect.objectContaining({
      scheduleRuleId: null, scheduleDate: null, scheduleLinkStatus: 'UNSCHEDULED',
      plannedBranchId: null, plannedWorkDate: null, plannedShiftName: null,
      plannedStartMinute: null, plannedEndMinute: null
    }));
  });

  it('marks an ended occurrence absent without creating a fake attendance session', async () => {
    const { store, tx } = makeAdminStore();
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    const result = await service.markAbsent(11, '2026-09-29', {
      branchId: 1, reason: 'Đã xác minh với quản lý'
    }, actor);

    expect(result).toMatchObject({ id: 90, type: 'ABSENT', employeeId: 4, scheduleRuleId: 11 });
    expect(tx.createDisposition).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 1, employeeId: 4, scheduleRuleId: 11, workDate: new Date('2026-09-29T00:00:00.000Z'),
      reason: 'Đã xác minh với quản lý', actorId: actor.id
    }));
    expect(tx.createSession).not.toHaveBeenCalled();
  });

  it('does not allow absence to be confirmed before the scheduled shift has ended', async () => {
    const { store, tx } = makeAdminStore();
    const service = new EmployeeAttendanceAdminService(store, () => new Date('2026-09-29T04:59:59.999Z'), vi.fn());

    await expect(service.markAbsent(11, '2026-09-29', {
      branchId: 1, reason: 'Đã xác minh với quản lý'
    }, actor)).rejects.toMatchObject({ code: 'ATTENDANCE_SHIFT_NOT_ENDED' });
    expect(tx.createDisposition).not.toHaveBeenCalled();
  });

  it('rejects a second effective absence disposition for the same occurrence', async () => {
    const activeDisposition = {
      id: 90, branchId: 1, employeeId: 4, scheduleRuleId: 11, workDate: new Date('2026-09-29T00:00:00.000Z'),
      type: 'ABSENT' as const, reason: 'Đã báo nghỉ', actorId: 7, createdAt: now, revokedAt: null, revokedByUserId: null
    };
    const { store, tx } = makeAdminStore({ findDispositionForOccurrence: vi.fn(async () => activeDisposition) });
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    await expect(service.markAbsent(11, '2026-09-29', {
      branchId: 1, reason: 'Đã xác minh lại'
    }, actor)).rejects.toMatchObject({ code: 'ATTENDANCE_ABSENCE_ALREADY_CONFIRMED' });
    expect(tx.createDisposition).not.toHaveBeenCalled();
    expect(tx.updateDisposition).not.toHaveBeenCalled();
  });

  it('revokes an absence only when a real attendance session creates an explicit conflict', async () => {
    const disposition = {
      id: 90, branchId: 1, employeeId: 4, scheduleRuleId: 11, workDate: new Date('2026-09-29T00:00:00.000Z'),
      type: 'ABSENT', reason: 'Đã báo nghỉ', actorId: 7, createdAt: now, revokedAt: null, revokedByUserId: null
    };
    const { store, tx } = makeAdminStore({
      findDisposition: vi.fn(async () => disposition),
      findSessionForOccurrence: vi.fn(async () => openSession)
    });
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    const result = await service.resolveAbsenceConflict(90, { reason: 'Có giờ vào kiosk thực tế' }, actor);

    expect(result.revokedAt).toEqual(now);
    expect(tx.updateDisposition).toHaveBeenCalledWith(90, expect.objectContaining({ revokedAt: now, revokedByUserId: actor.id }));
    expect(tx.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMPLOYEE_ATTENDANCE_ABSENCE_REVOKED', metadata: expect.objectContaining({ reason: 'Có giờ vào kiosk thực tế' })
    }));
  });

  it('does not resolve an absence when no actual attendance session exists', async () => {
    const disposition = {
      id: 90, branchId: 1, employeeId: 4, scheduleRuleId: 11, workDate: new Date('2026-09-29T00:00:00.000Z'),
      type: 'ABSENT', reason: 'Đã báo nghỉ', actorId: 7, createdAt: now, revokedAt: null, revokedByUserId: null
    };
    const { store, tx } = makeAdminStore({ findDisposition: vi.fn(async () => disposition) });
    const service = new EmployeeAttendanceAdminService(store, () => now, vi.fn());

    await expect(service.resolveAbsenceConflict(90, { reason: 'Kiểm tra lại' }, actor))
      .rejects.toMatchObject({ code: 'ATTENDANCE_DISPOSITION_HAS_NO_SESSION' });
    expect(tx.updateDisposition).not.toHaveBeenCalled();
  });

  it('does not emit realtime when the audit write fails', async () => {
    const { store } = makeAdminStore({ audit: vi.fn(async () => { throw new Error('audit unavailable'); }) });
    const emitChanged = vi.fn();
    const service = new EmployeeAttendanceAdminService(store, () => now, emitChanged);

    await expect(service.createManualSession({
      employeeId: 4, branchId: 1, checkInAt: '2026-09-29T08:07:00+07:00', reason: 'Bổ sung giờ vào'
    }, actor)).rejects.toThrow('audit unavailable');
    expect(emitChanged).not.toHaveBeenCalled();
  });
});
