import { describe, expect, it } from 'vitest';
import {
  businessDateAt,
  expandAttendanceOccurrences,
  getBusinessWeekBounds,
  getBusinessWeekUtcBounds,
  hasOpenAttendanceSession,
  classifyAttendanceSession,
  projectOccurrenceAttendance,
  resolveCheckInSchedule,
  type AttendanceOccurrence,
  type AttendanceScheduleRule
} from './attendance-domain';

const rule = (overrides: Partial<AttendanceScheduleRule> = {}): AttendanceScheduleRule => ({
  id: 1,
  employeeId: 10,
  branchId: 1,
  shiftId: 3,
  recurrenceType: 'ONCE',
  startDate: '2026-09-29',
  endDate: null,
  dayOfWeek: null,
  cancelledAt: null,
  shift: { name: 'Ca sáng', startMinute: 480, endMinute: 720 },
  ...overrides
});

const occurrence = (overrides: Partial<AttendanceOccurrence> = {}): AttendanceOccurrence => ({
  scheduleRuleId: 1,
  employeeId: 10,
  branchId: 1,
  shiftId: 3,
  scheduleDate: '2026-09-29',
  shiftName: 'Ca sáng',
  plannedStartMinute: 480,
  plannedEndMinute: 720,
  ...overrides
});

describe('attendance business dates and schedule occurrences', () => {
  it('uses the Vietnam business date rather than the UTC date', () => {
    expect(businessDateAt(new Date('2026-09-28T18:00:00.000Z'))).toBe('2026-09-29');
  });

  it('returns the Monday-to-Sunday business week around a date', () => {
    expect(getBusinessWeekBounds('2026-10-04')).toEqual({ weekStart: '2026-09-28', weekEnd: '2026-10-04' });
  });

  it('returns UTC half-open bounds for the Asia/Ho_Chi_Minh business week', () => {
    expect(getBusinessWeekUtcBounds('2026-09-28')).toEqual({
      startInclusive: new Date('2026-09-27T17:00:00.000Z'),
      endExclusive: new Date('2026-10-04T17:00:00.000Z')
    });
    expect(() => getBusinessWeekUtcBounds('2026-09-29')).toThrowError();
  });

  it('expands once and weekly rules while omitting canceled dates and foreign branches/employees', () => {
    const expanded = expandAttendanceOccurrences({
      weekStart: '2026-09-28',
      branchId: 1,
      employeeId: 10,
      rules: [
        rule({ id: 1, recurrenceType: 'WEEKLY', startDate: '2026-09-29', endDate: '2026-10-06', dayOfWeek: 2 }),
        rule({ id: 2, recurrenceType: 'ONCE', startDate: '2026-10-02', shift: { name: 'Ca chiều', startMinute: 780, endMinute: 1020 } }),
        rule({ id: 3, branchId: 2 }),
        rule({ id: 4, employeeId: 11 }),
        rule({ id: 5, cancelledAt: '2026-09-28T10:00:00.000Z' })
      ],
      exceptions: [{ scheduleRuleId: 1, workDate: '2026-09-29', type: 'CANCELLED' }]
    });

    expect(expanded).toEqual([
      {
        scheduleRuleId: 2, employeeId: 10, branchId: 1, shiftId: 3, scheduleDate: '2026-10-02',
        shiftName: 'Ca chiều', plannedStartMinute: 780, plannedEndMinute: 1020
      }
    ]);
  });

  it('rejects malformed week dates instead of normalizing them', () => {
    expect(() => getBusinessWeekBounds('2026-02-30')).toThrowError();
  });
});

describe('kiosk schedule choice', () => {
  it('requires explicit outside-schedule confirmation when no shift exists', () => {
    const noShifts = resolveCheckInSchedule({ occurrences: [], serverNow: new Date('2026-09-29T01:00:00.000Z') });
    expect(noShifts.status).toBe('OUTSIDE_CONFIRMATION_REQUIRED');
    expect(resolveCheckInSchedule({
      occurrences: [], serverNow: new Date('2026-09-29T01:00:00.000Z'), selection: { type: 'OUTSIDE_SCHEDULE' }
    }).status).toBe('UNSCHEDULED');
  });

  it('auto-links the only occurrence before its planned end', () => {
    const result = resolveCheckInSchedule({ occurrences: [occurrence()], serverNow: new Date('2026-09-29T01:00:00.000Z') });
    expect(result.status).toBe('AUTO_LINKED');
    if (result.status !== 'AUTO_LINKED') throw new Error('Expected single-shift auto-link');
    expect(result.occurrence.scheduleRuleId).toBe(1);
  });

  it('asks between linking the only shift and outside-schedule at the exact planned end', () => {
    const atEnd = new Date('2026-09-29T05:00:00.000Z');
    expect(resolveCheckInSchedule({ occurrences: [occurrence()], serverNow: atEnd }).status).toBe('SINGLE_SHIFT_CONFIRMATION_REQUIRED');
    expect(resolveCheckInSchedule({
      occurrences: [occurrence()], serverNow: atEnd, selection: { type: 'SCHEDULED', scheduleRuleId: 1, scheduleDate: '2026-09-29' }
    }).status).toBe('LINKED');
    expect(resolveCheckInSchedule({
      occurrences: [occurrence()], serverNow: atEnd, selection: { type: 'OUTSIDE_SCHEDULE' }
    }).status).toBe('UNSCHEDULED');
  });

  it('requires a choice among multiple shifts and honors the selected rule instead of picking the nearest', () => {
    const morning = occurrence({ scheduleRuleId: 1, shiftId: 3, shiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720 });
    const afternoon = occurrence({ scheduleRuleId: 2, shiftId: 4, shiftName: 'Ca chiều', plannedStartMinute: 780, plannedEndMinute: 1020 });
    expect(resolveCheckInSchedule({ occurrences: [morning, afternoon], serverNow: new Date('2026-09-29T05:30:00.000Z') }).status).toBe('SCHEDULE_SELECTION_REQUIRED');
    const chosen = resolveCheckInSchedule({
      occurrences: [morning, afternoon], serverNow: new Date('2026-09-29T05:30:00.000Z'),
      selection: { type: 'SCHEDULED', scheduleRuleId: 1, scheduleDate: '2026-09-29' }
    });
    expect(chosen.status).toBe('LINKED');
    if (chosen.status !== 'LINKED') throw new Error('Expected selected schedule link');
    expect(chosen.occurrence.scheduleRuleId).toBe(1);
  });

  it('rejects a stale or foreign employee/branch/date occurrence selection', () => {
    expect(() => resolveCheckInSchedule({
      occurrences: [occurrence()], serverNow: new Date('2026-09-29T01:00:00.000Z'),
      selection: { type: 'SCHEDULED', scheduleRuleId: 99, scheduleDate: '2026-09-29' }
    })).toThrowError(expect.objectContaining({ code: 'SCHEDULE_NOT_AVAILABLE' }));
    expect(() => resolveCheckInSchedule({
      occurrences: [occurrence()], serverNow: new Date('2026-09-29T01:00:00.000Z'),
      selection: { type: 'SCHEDULED', scheduleRuleId: 1, scheduleDate: '2026-09-30' }
    })).toThrowError(expect.objectContaining({ code: 'SCHEDULE_NOT_AVAILABLE' }));
  });
});

describe('actual attendance classification', () => {
  const plannedStartAt = new Date('2026-09-29T01:00:00.000Z');
  const plannedEndAt = new Date('2026-09-29T05:00:00.000Z');

  it.each([
    ['at shift start', '2026-09-29T01:00:00.000Z', 'ON_TIME', 0, false],
    ['one minute after start', '2026-09-29T01:01:00.000Z', 'LATE', 1, false],
    ['exactly at shift end', '2026-09-29T05:00:00.000Z', 'LATE', 240, true],
    ['one minute after shift end', '2026-09-29T05:01:00.000Z', 'LATE', 241, true]
  ] as const)('classifies check-in %s without grace', (_label, instant, timing, delta, afterEnd) => {
    const result = classifyAttendanceSession({
      checkInAt: new Date(instant), plannedStartAt, plannedEndAt, now: new Date('2026-09-29T06:00:00.000Z')
    });
    expect(result.checkInTiming).toBe(timing);
    expect(result.checkInDeltaMinutes).toBe(delta);
    expect(result.checkInAfterShiftEnd).toBe(afterEnd);
  });

  it.each([
    ['one minute early', '2026-09-29T04:59:00.000Z', 'LEFT_EARLY', -1],
    ['at shift end', '2026-09-29T05:00:00.000Z', 'ON_TIME', 0],
    ['two minutes after end', '2026-09-29T05:02:00.000Z', 'AFTER_SHIFT', 2]
  ] as const)('classifies check-out %s as actual time only', (_label, instant, timing, delta) => {
    const result = classifyAttendanceSession({
      checkInAt: plannedStartAt, checkOutAt: new Date(instant), plannedStartAt, plannedEndAt,
      now: new Date('2026-09-29T06:00:00.000Z')
    });
    expect(result.checkOutTiming).toBe(timing);
    expect(result.checkOutDeltaMinutes).toBe(delta);
    expect(result.checkOutAt?.toISOString()).toBe(instant);
  });

  it('marks an open scheduled session missing checkout only after planned end', () => {
    const atEnd = classifyAttendanceSession({ checkInAt: plannedStartAt, plannedStartAt, plannedEndAt, now: plannedEndAt });
    const afterEnd = classifyAttendanceSession({ checkInAt: plannedStartAt, plannedStartAt, plannedEndAt, now: new Date('2026-09-29T05:00:01.000Z') });
    expect(atEnd.sessionStatus).toBe('OPEN');
    expect(afterEnd.sessionStatus).toBe('MISSING_CHECK_OUT');
    expect(afterEnd.checkOutAt).toBeNull();
  });

  it('keeps unscheduled sessions independent from shift timing', () => {
    const result = classifyAttendanceSession({ checkInAt: plannedStartAt, now: plannedStartAt, linkStatus: 'UNSCHEDULED' });
    expect(result.linkStatus).toBe('UNSCHEDULED');
    expect(result.checkInTiming).toBe('N/A');
    expect(result.checkInDeltaMinutes).toBeNull();
    expect(result.sessionStatus).toBe('OPEN');
  });

  it('projects no-punch and Admin absence separately, and preserves conflict when actual attendance exists', () => {
    const scheduled = occurrence();
    expect(projectOccurrenceAttendance({ occurrence: scheduled, session: null, now: plannedEndAt }).occurrenceStatus).toBe('NOT_CLOCKED');
    expect(projectOccurrenceAttendance({ occurrence: scheduled, session: null, disposition: 'ABSENT', now: plannedEndAt }).occurrenceStatus).toBe('ABSENT');
    const conflict = projectOccurrenceAttendance({
      occurrence: scheduled,
      session: { checkInAt: plannedStartAt, checkOutAt: null, linkStatus: 'SCHEDULED' },
      disposition: 'ABSENT', now: plannedStartAt
    });
    expect(conflict.occurrenceStatus).toBe('ATTENDED');
    expect(conflict.reviewConflict).toBe(true);
  });

  it('classifies actual punches against the frozen schedule snapshot, not a later-edited shift rule', () => {
    const actualCheckIn = new Date('2026-09-29T02:01:00.000Z');
    const projection = projectOccurrenceAttendance({
      occurrence: occurrence({ plannedStartMinute: 480, plannedEndMinute: 720 }),
      session: {
        checkInAt: actualCheckIn,
        checkOutAt: null,
        linkStatus: 'SCHEDULED',
        plannedWorkDate: '2026-09-29',
        plannedStartMinute: 540,
        plannedEndMinute: 780
      },
      now: actualCheckIn
    });

    expect(projection.classification?.checkInDeltaMinutes).toBe(1);
    expect(projection.classification?.checkInTiming).toBe('LATE');
  });

  it('treats an open session from a prior business date as a blocking session', () => {
    expect(hasOpenAttendanceSession([{ checkInAt: new Date('2026-09-28T01:00:00.000Z'), checkOutAt: null }])).toBe(true);
    expect(hasOpenAttendanceSession([{ checkInAt: plannedStartAt, checkOutAt: new Date('2026-09-29T05:00:00.000Z') }])).toBe(false);
  });
});
