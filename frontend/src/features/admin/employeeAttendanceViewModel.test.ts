import { describe, expect, it } from 'vitest';
import { buildAttendanceScreenModel, formatAttendanceDelta } from './employeeAttendanceViewModel';
import type { AttendanceWeekDto, AttendanceWeekRowDto } from '../../api/employeeAttendance';

const classification = {
  sessionStatus: 'MISSING_CHECK_OUT' as const, linkStatus: 'SCHEDULED' as const,
  checkInTiming: 'LATE' as const, checkInAfterShiftEnd: false, checkInDeltaMinutes: 7,
  checkOutTiming: 'N/A' as const, checkOutDeltaMinutes: null,
  checkInAt: '2026-09-29T01:07:00.000Z', checkOutAt: null
};

function row(overrides: Partial<AttendanceWeekRowDto> = {}): AttendanceWeekRowDto {
  return {
    id: 'schedule:11:2026-09-29', kind: 'SCHEDULED', workDate: '2026-09-29',
    scheduleRuleId: 11, scheduleDate: '2026-09-29',
    employee: { id: 4, code: 'NV000004', name: 'An', departmentName: 'Bếp', jobTitleName: 'Đầu bếp' },
    shift: { name: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720 },
    occurrenceStatus: 'ATTENDED', reviewConflict: false, disposition: null,
    classification, sessions: [{ id: 1, checkInAt: '2026-09-29T01:07:00.000Z', checkOutAt: null,
      linkStatus: 'SCHEDULED', plannedShiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720, classification }],
    ...overrides
  };
}

function week(rows: AttendanceWeekRowDto[], view: 'shift' | 'employee' = 'shift'): AttendanceWeekDto {
  return { branch: { id: 1, code: 'MAIN' }, weekStart: '2026-09-28', weekEnd: '2026-10-04', view, rows,
    pagination: { page: 1, pageSize: 100, total: rows.length, totalPages: 1 } };
}

describe('employee attendance view model', () => {
  it('builds date-safe business weekdays and groups the same stable rows by shift or employee', () => {
    const first = row();
    const second = row({ id: 'schedule:12:2026-09-29', employee: { ...first.employee, id: 5, code: 'NV000005', name: 'Bình' } });
    const byShift = buildAttendanceScreenModel(week([first, second], 'shift'));
    const byEmployee = buildAttendanceScreenModel(week([first, second], 'employee'));

    expect(byShift.days.map(day => day.date)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'
    ]);
    expect(byShift.groups[0].title).toBe('Ca sáng');
    expect(byEmployee.groups.map(group => group.title)).toEqual(['An', 'Bình']);
    expect(byShift.rows.map(item => item.id).sort()).toEqual(byEmployee.rows.map(item => item.id).sort());
  });

  it('keeps absence, missing checkout, outside schedule and conflict as separate truthful statuses', () => {
    const notClocked = row({ occurrenceStatus: 'NOT_CLOCKED', classification: null, sessions: [] });
    const absent = row({ id: 'schedule:12:2026-09-29', scheduleRuleId: 12, occurrenceStatus: 'ABSENT', classification: null, sessions: [],
      disposition: { id: 8, type: 'ABSENT', reason: 'Đã xác minh', createdAt: '2026-09-29T05:30:00.000Z' } });
    const outside = row({ id: 'session:3', kind: 'UNSCHEDULED', scheduleRuleId: null, scheduleDate: null, shift: null,
      sessions: [{ id: 3, checkInAt: '2026-09-29T02:00:00.000Z', checkOutAt: null, linkStatus: 'UNSCHEDULED',
        plannedShiftName: null, plannedStartMinute: null, plannedEndMinute: null,
        classification: { ...classification, sessionStatus: 'OPEN', linkStatus: 'UNSCHEDULED', checkInTiming: 'N/A', checkInDeltaMinutes: null } }],
      classification: { ...classification, sessionStatus: 'OPEN', linkStatus: 'UNSCHEDULED', checkInTiming: 'N/A', checkInDeltaMinutes: null } });
    const conflict = row({ id: 'schedule:13:2026-09-29', scheduleRuleId: 13, reviewConflict: true });
    const model = buildAttendanceScreenModel(week([notClocked, absent, outside, conflict]));

    expect(model.rows.map(item => item.primaryStatus)).toEqual([
      'Chưa chấm công', 'Vắng mặt', 'Cần đối chiếu', 'Ngoài lịch'
    ]);
    expect(model.rows[0].deviation).toBe('—');
    expect(model.rows.find(item => item.id === 'session:3')?.deviation).toBe('—');
    expect(model.rows.find(item => item.id === 'schedule:13:2026-09-29')?.secondaryStatuses).toContain('Thiếu giờ ra / Cần xem xét');
  });

  it('formats signed deviations and never introduces payroll or overtime projections', () => {
    const model = buildAttendanceScreenModel(week([row()]));
    expect(formatAttendanceDelta(7)).toBe('+7 phút');
    expect(formatAttendanceDelta(-3)).toBe('-3 phút');
    expect(JSON.stringify(model)).not.toMatch(/salary|payroll|overtime|lương|tăng ca/i);
  });

  it('shows the frozen shift snapshot for an existing attendance session after the schedule rule changes', () => {
    const changedRule = row({
      shift: { name: 'Ca chiều mới', plannedStartMinute: 780, plannedEndMinute: 1020 },
      sessions: [{ ...row().sessions[0], plannedShiftName: 'Ca sáng tại thời điểm check-in', plannedStartMinute: 480, plannedEndMinute: 720 }]
    });

    const model = buildAttendanceScreenModel(week([changedRule]));
    expect(model.rows[0].shiftName).toBe('Ca sáng tại thời điểm check-in');
    expect(model.rows[0].shiftTime).toBe('08:00–12:00');
  });
});
