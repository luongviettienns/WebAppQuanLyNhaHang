import { describe, expect, it, vi } from 'vitest';
import { EmployeeAttendanceService } from './employee-attendance.service';

const weekStart = '2026-09-28';
const branchId = 1;
const adminNow = new Date('2026-09-29T05:30:00.000Z');
const employeeA = { id: 4, code: 'NV000004', name: 'An', department: { name: 'Bếp' }, jobTitle: { name: 'Đầu bếp' } };
const rule = {
  id: 11, employeeId: employeeA.id, branchId, shiftId: 3, recurrenceType: 'ONCE' as const,
  startDate: new Date('2026-09-29T00:00:00.000Z'), endDate: null, dayOfWeek: null, cancelledAt: null,
  shift: { name: 'Ca sáng', startMinute: 480, endMinute: 720 }, employee: employeeA,
  exceptions: [] as Array<{ scheduleRuleId: number; workDate: Date; type: 'CANCELLED' }>
};

function makePrisma(options: {
  rules?: unknown[];
  sessions?: unknown[];
  dispositions?: unknown[];
} = {}) {
  const client = {
    branch: { findUnique: vi.fn().mockResolvedValue({ id: branchId, code: 'MAIN', isActive: true }) },
    employeeScheduleRule: { findMany: vi.fn().mockResolvedValue(options.rules ?? [rule]) },
    employeeAttendanceSession: { findMany: vi.fn().mockResolvedValue(options.sessions ?? []) },
    employeeAttendanceDisposition: { findMany: vi.fn().mockResolvedValue(options.dispositions ?? []) }
  };
  return { client: client as never, raw: client };
}

describe('Admin weekly attendance read model', () => {
  it('joins actual timestamps to an occurrence while classifying against its frozen schedule snapshot', async () => {
    const actualCheckIn = new Date('2026-09-29T02:01:00.000Z');
    const session = {
      id: 31, employeeId: employeeA.id, branchId, scheduleRuleId: rule.id,
      scheduleDate: new Date('2026-09-29T00:00:00.000Z'), checkInAt: actualCheckIn,
      checkOutAt: null, scheduleLinkStatus: 'SCHEDULED' as const,
      plannedBranchId: branchId, plannedWorkDate: new Date('2026-09-29T00:00:00.000Z'),
      plannedShiftName: 'Ca sáng cũ', plannedStartMinute: 540, plannedEndMinute: 780,
      employee: employeeA
    };
    const { client, raw } = makePrisma({ sessions: [session] });
    const service = new EmployeeAttendanceService(client, () => adminNow);

    const result = await service.getWeek({ weekStart, branchId, view: 'shift', page: 1, pageSize: 100 });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: 'schedule:11:2026-09-29', kind: 'SCHEDULED', scheduleRuleId: 11, scheduleDate: '2026-09-29', occurrenceStatus: 'ATTENDED',
      shift: { name: 'Ca sáng cũ', plannedStartMinute: 540, plannedEndMinute: 780 },
      sessions: [{ id: 31, checkInAt: actualCheckIn.toISOString(), plannedShiftName: 'Ca sáng cũ' }]
    });
    expect(result.rows[0].classification?.checkInDeltaMinutes).toBe(1);
    expect(raw.employeeAttendanceSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branchId, OR: expect.any(Array) })
    }));
  });

  it('keeps NOT_CLOCKED distinct from Admin ABSENT and marks session/disposition conflicts', async () => {
    const secondRule = { ...rule, id: 12, employeeId: 5, employee: { ...employeeA, id: 5, code: 'NV000005', name: 'Bình' } };
    const disposition = {
      id: 8, branchId, employeeId: 5, scheduleRuleId: 12,
      workDate: new Date('2026-09-29T00:00:00.000Z'), type: 'ABSENT' as const,
      reason: 'Đã gọi xác nhận', createdAt: adminNow, revokedAt: null,
      employee: secondRule.employee
    };
    const actualSession = {
      id: 32, employeeId: 5, branchId, scheduleRuleId: 12,
      scheduleDate: new Date('2026-09-29T00:00:00.000Z'), checkInAt: adminNow, checkOutAt: null,
      scheduleLinkStatus: 'SCHEDULED' as const, plannedBranchId: branchId,
      plannedWorkDate: new Date('2026-09-29T00:00:00.000Z'), plannedShiftName: 'Ca sáng',
      plannedStartMinute: 480, plannedEndMinute: 720, employee: secondRule.employee
    };
    const { client } = makePrisma({ rules: [rule, secondRule], sessions: [actualSession], dispositions: [disposition] });
    const service = new EmployeeAttendanceService(client, () => adminNow);

    const result = await service.getWeek({ weekStart, branchId, view: 'employee', page: 1, pageSize: 100 });

    expect(result.rows.find(row => row.id === 'schedule:11:2026-09-29')?.occurrenceStatus).toBe('NOT_CLOCKED');
    expect(result.rows.find(row => row.id === 'schedule:12:2026-09-29')).toMatchObject({
      occurrenceStatus: 'ATTENDED', reviewConflict: true, disposition: { id: 8, type: 'ABSENT', reason: 'Đã gọi xác nhận' }
    });
  });

  it('keeps unlinked sessions visible and marks their actual-vs-plan timing N/A', async () => {
    const outside = {
      id: 39, employeeId: employeeA.id, branchId, scheduleRuleId: null, scheduleDate: null,
      checkInAt: adminNow, checkOutAt: null, scheduleLinkStatus: 'UNSCHEDULED' as const,
      plannedBranchId: null, plannedWorkDate: null, plannedShiftName: null,
      plannedStartMinute: null, plannedEndMinute: null, employee: employeeA
    };
    const { client } = makePrisma({ rules: [], sessions: [outside] });
    const service = new EmployeeAttendanceService(client, () => adminNow);

    const result = await service.getWeek({ weekStart, branchId, view: 'shift', page: 1, pageSize: 100 });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ kind: 'UNSCHEDULED', occurrenceStatus: 'ATTENDED', shift: null });
    expect(result.rows[0].classification?.checkInTiming).toBe('N/A');
  });

  it('returns stable identical row identities in both views and sorts by the requested grouping', async () => {
    const laterRule = { ...rule, id: 12, employeeId: 5, employee: { ...employeeA, id: 5, code: 'NV000005', name: 'Bình' } };
    const { client } = makePrisma({ rules: [rule, laterRule] });
    const service = new EmployeeAttendanceService(client, () => adminNow);

    const byShift = await service.getWeek({ weekStart, branchId, view: 'shift', page: 1, pageSize: 100 });
    const byEmployee = await service.getWeek({ weekStart, branchId, view: 'employee', page: 1, pageSize: 100 });

    expect(byShift.rows.map(row => row.id).sort()).toEqual(byEmployee.rows.map(row => row.id).sort());
    expect(byEmployee.rows[0].employee.name).toBe('An');
  });

  it('returns only actionable attendance exceptions in the open queue', async () => {
    const secondRule = { ...rule, id: 12, employeeId: 5, employee: { ...employeeA, id: 5, code: 'NV000005', name: 'Bình' } };
    const futureRule = {
      ...rule, id: 13, startDate: new Date('2026-09-30T00:00:00.000Z'),
      employee: { ...employeeA, id: 6, code: 'NV000006', name: 'Chi' }
    };
    const missingCheckout = {
      id: 40, employeeId: employeeA.id, branchId, scheduleRuleId: rule.id,
      scheduleDate: new Date('2026-09-29T00:00:00.000Z'), checkInAt: new Date('2026-09-29T01:00:00.000Z'),
      checkOutAt: null, scheduleLinkStatus: 'SCHEDULED' as const, plannedBranchId: branchId,
      plannedWorkDate: new Date('2026-09-29T00:00:00.000Z'), plannedShiftName: 'Ca sáng',
      plannedStartMinute: 480, plannedEndMinute: 720, employee: employeeA
    };
    const { client } = makePrisma({ rules: [rule, secondRule, futureRule], sessions: [missingCheckout] });
    const service = new EmployeeAttendanceService(client, () => adminNow);

    const result = await service.getExceptions({ weekStart, branchId, status: 'OPEN', page: 1, pageSize: 100 });

    expect(result.rows.map(row => [row.id, row.exceptionType])).toEqual([
      ['schedule:11:2026-09-29', 'MISSING_CHECK_OUT'],
      ['schedule:12:2026-09-29', 'NOT_CLOCKED']
    ]);
  });

  it('returns an Admin-confirmed absence as resolved rather than a fabricated session', async () => {
    const disposition = {
      id: 18, branchId, employeeId: employeeA.id, scheduleRuleId: rule.id,
      workDate: new Date('2026-09-29T00:00:00.000Z'), type: 'ABSENT' as const,
      reason: 'Đã xác nhận với quản lý', createdAt: adminNow, revokedAt: null, employee: employeeA
    };
    const { client } = makePrisma({ dispositions: [disposition] });
    const service = new EmployeeAttendanceService(client, () => adminNow);

    const result = await service.getExceptions({ weekStart, branchId, status: 'RESOLVED', page: 1, pageSize: 100 });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: 'schedule:11:2026-09-29', exceptionType: 'ABSENT_CONFIRMED', status: 'RESOLVED',
      occurrenceStatus: 'ABSENT', sessions: []
    });
  });
});
