import { describe, expect, it } from 'vitest';
import {
  buildScheduleCalendarMetadata,
  estimateWeeklyCompensation,
  expandRulesForWeek,
  findScheduleOccurrenceWarnings,
  findRuleConflict,
  validateScheduleRule,
  type ScheduleRule
} from './schedule-domain';

const monday = '2026-09-28';

const rule = (overrides: Partial<ScheduleRule> = {}): ScheduleRule => ({
  id: 1,
  employeeId: 10,
  shiftId: 1,
  recurrenceType: 'ONCE',
  startDate: monday,
  endDate: null,
  dayOfWeek: null,
  cancelledAt: null,
  shift: { code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720 },
  ...overrides
});

describe('schedule date and recurrence domain', () => {
  it('expands a one-time rule only on its date and keeps date-only arithmetic stable across month boundaries', () => {
    const once = rule({ startDate: '2026-10-04' });
    const expanded = expandRulesForWeek({ weekStart: monday, rules: [once], exceptions: [] });

    expect(expanded.map(item => item.workDate)).toEqual(['2026-10-04']);
  });

  it('expands weekly rules on the matching ISO weekday through an inclusive end date', () => {
    const weekly = rule({ recurrenceType: 'WEEKLY', dayOfWeek: 1, endDate: '2026-10-12' });
    const expanded = expandRulesForWeek({ weekStart: monday, rules: [weekly], exceptions: [] });

    expect(expanded.map(item => item.workDate)).toEqual([monday]);
  });

  it('expands an open-ended weekly rule for the selected week', () => {
    const weekly = rule({ recurrenceType: 'WEEKLY', dayOfWeek: 1 });
    const expanded = expandRulesForWeek({ weekStart: '2026-10-05', rules: [weekly], exceptions: [] });

    expect(expanded.map(item => item.workDate)).toEqual(['2026-10-05']);
  });

  it('omits a cancelled occurrence exception but leaves other occurrences intact', () => {
    const weekly = rule({ recurrenceType: 'WEEKLY', dayOfWeek: 1 });
    const expanded = expandRulesForWeek({
      weekStart: monday,
      rules: [weekly],
      exceptions: [{ scheduleRuleId: weekly.id, workDate: monday, type: 'CANCELLED' }]
    });

    expect(expanded).toEqual([]);
  });

  it('does not expand a rule that has been cancelled', () => {
    const cancelled = rule({ cancelledAt: '2026-09-27T17:00:00.000Z' });

    expect(expandRulesForWeek({ weekStart: monday, rules: [cancelled], exceptions: [] })).toEqual([]);
  });

  it('rejects impossible calendar dates instead of normalizing them', () => {
    expect(() => validateScheduleRule({ recurrenceType: 'ONCE', startDate: '2026-02-30' }))
      .toThrowError(expect.objectContaining({ code: 'SCHEDULE_DATE_INVALID' }));
  });

  it('rejects an end date before the weekly rule start date', () => {
    expect(() => validateScheduleRule({
      recurrenceType: 'WEEKLY', startDate: monday, dayOfWeek: 1, endDate: '2026-09-27'
    })).toThrowError(expect.objectContaining({ code: 'SCHEDULE_DATE_INVALID' }));
  });

  it('rejects a weekly weekday that differs from the start date weekday', () => {
    expect(() => validateScheduleRule({
      recurrenceType: 'WEEKLY', startDate: monday, dayOfWeek: 2, endDate: null
    })).toThrowError(expect.objectContaining({ code: 'SCHEDULE_RECURRENCE_INVALID' }));
  });

  it('rejects recurrence fields on a one-time rule', () => {
    expect(() => validateScheduleRule({
      recurrenceType: 'ONCE', startDate: monday, dayOfWeek: 1, endDate: '2026-10-05'
    })).toThrowError(expect.objectContaining({ code: 'SCHEDULE_RECURRENCE_INVALID' }));
  });
});

describe('workweek and holiday schedule metadata', () => {
  const workweeks = [
    { id: 10, revision: 1, effectiveFrom: '2026-01-01', workingWeekdays: [1, 2, 3, 4, 5, 6] },
    { id: 11, revision: 2, effectiveFrom: '2026-10-01', workingWeekdays: [1, 2, 3, 4, 5] }
  ];
  const holidays = [
    { id: 20, revision: 3, name: 'Quốc khánh bù', startDate: '2026-09-29', endDate: '2026-09-30' },
    { id: 21, revision: 1, name: 'Kỳ nghỉ tháng 10', startDate: '2026-10-12', endDate: '2026-10-12' }
  ];

  it('marks all seven calendar days with the effective workweek revision and holiday labels', () => {
    const days = buildScheduleCalendarMetadata({ weekStart: monday, workweekVersions: workweeks, holidays });

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ date: '2026-09-28', weekday: 1, isWorkingDay: true, workweekPolicyVersionId: 10, workweekRevision: 1 });
    expect(days[1].holidays).toEqual([{ id: 20, revision: 3, name: 'Quốc khánh bù' }]);
    expect(days[5]).toMatchObject({ date: '2026-10-03', weekday: 6, isWorkingDay: false, workweekPolicyVersionId: 11, workweekRevision: 2 });
    expect(days[6]).toMatchObject({ date: '2026-10-04', weekday: 7, isWorkingDay: false });
  });

  it('warns for the actual one-time occurrence rather than unrelated dates', () => {
    const warnings = findScheduleOccurrenceWarnings({
      rule: { recurrenceType: 'ONCE', startDate: '2026-09-29', endDate: null, dayOfWeek: null },
      workweekVersions: workweeks,
      holidays
    });

    expect(warnings).toEqual([expect.objectContaining({
      kind: 'HOLIDAY', firstAffectedDate: '2026-09-29', affectedCount: 1,
      sampleDates: ['2026-09-29'], unbounded: false,
      source: { type: 'HOLIDAY', id: 20, revision: 3, name: 'Quốc khánh bù' }
    })]);
  });

  it('checks every bounded weekly occurrence across workweek intervals and holidays after start date', () => {
    const warnings = findScheduleOccurrenceWarnings({
      rule: { recurrenceType: 'WEEKLY', startDate: '2026-09-28', endDate: '2026-10-19', dayOfWeek: 1 },
      workweekVersions: workweeks,
      holidays
    });

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'HOLIDAY', firstAffectedDate: '2026-10-12', affectedCount: 1,
        sampleDates: ['2026-10-12'], source: { type: 'HOLIDAY', id: 21, revision: 1, name: 'Kỳ nghỉ tháng 10' }
      })
    ]));
    expect(warnings.find(item => item.kind === 'NON_WORKING_DAY')).toBeUndefined();
  });

  it('summarizes an open-ended weekly rule without enumerating forever', () => {
    const sundayWorkweeks = [
      { id: 30, revision: 4, effectiveFrom: '2026-01-01', workingWeekdays: [1, 2, 3, 4, 5, 6, 7] },
      { id: 31, revision: 5, effectiveFrom: '2026-10-01', workingWeekdays: [1, 2, 3, 4, 5, 6] }
    ];
    const warnings = findScheduleOccurrenceWarnings({
      rule: { recurrenceType: 'WEEKLY', startDate: '2026-09-27', endDate: null, dayOfWeek: 7 },
      workweekVersions: sundayWorkweeks,
      holidays: [{ id: 40, revision: 2, name: 'Nghỉ Chủ nhật đặc biệt', startDate: '2026-10-18', endDate: '2026-10-18' }]
    });

    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'NON_WORKING_DAY', firstAffectedDate: '2026-10-04', affectedCount: null,
        sampleDates: ['2026-10-04'], unbounded: true,
        source: { type: 'WORKWEEK_POLICY', id: 31, revision: 5 }
      }),
      expect.objectContaining({
        kind: 'HOLIDAY', firstAffectedDate: '2026-10-18', affectedCount: 1,
        sampleDates: ['2026-10-18'], unbounded: false,
        source: { type: 'HOLIDAY', id: 40, revision: 2, name: 'Nghỉ Chủ nhật đặc biệt' }
      })
    ]));
  });
});

describe('schedule time and conflict domain', () => {
  it('rejects invalid minute ranges and overnight shifts', () => {
    expect(() => validateScheduleRule({
      recurrenceType: 'ONCE', startDate: monday, startMinute: 1320, endMinute: 120
    })).toThrowError(expect.objectContaining({ code: 'SCHEDULE_TIME_INVALID' }));
  });

  it('rejects a duplicate employee, shift, and date', () => {
    const existing = rule();
    const conflict = findRuleConflict(existing, [existing]);

    expect(conflict).toMatchObject({ code: 'SCHEDULE_DUPLICATE', workDate: monday, employeeId: 10 });
  });

  it('rejects overlapping shifts for the same employee and date', () => {
    const existing = rule();
    const candidate = rule({
      id: 2,
      shiftId: 2,
      shift: { code: 'CUSTOM', name: 'Ca tùy chỉnh', startMinute: 660, endMinute: 780 }
    });

    expect(findRuleConflict(candidate, [existing])).toMatchObject({ code: 'SCHEDULE_OVERLAP', workDate: monday });
  });

  it('allows adjacent shifts because schedule intervals are half-open', () => {
    const existing = rule();
    const candidate = rule({
      id: 2,
      shiftId: 2,
      shift: { code: 'AFTERNOON', name: 'Ca chiều', startMinute: 720, endMinute: 960 }
    });

    expect(findRuleConflict(candidate, [existing])).toBeNull();
  });

  it('terminates when open-ended weekly rules have no overlapping hours', () => {
    const existing = rule({ recurrenceType: 'WEEKLY', dayOfWeek: 1 });
    const candidate = rule({
      id: 2,
      recurrenceType: 'WEEKLY',
      dayOfWeek: 1,
      shiftId: 2,
      shift: { code: 'AFTERNOON', name: 'Ca chiều', startMinute: 720, endMinute: 960 }
    });

    expect(findRuleConflict(candidate, [existing])).toBeNull();
  });

  it('detects a one-time occurrence that collides with an open-ended weekly rule', () => {
    const weekly = rule({ recurrenceType: 'WEEKLY', dayOfWeek: 1 });
    const once = rule({ id: 2, startDate: '2026-10-05', shiftId: 2 });

    expect(findRuleConflict(once, [weekly])).toMatchObject({ code: 'SCHEDULE_OVERLAP', workDate: '2026-10-05' });
  });

  it('detects weekly rules with a common ISO weekday inside their effective ranges', () => {
    const existing = rule({ recurrenceType: 'WEEKLY', dayOfWeek: 1, endDate: '2026-10-12' });
    const candidate = rule({
      id: 2,
      recurrenceType: 'WEEKLY',
      dayOfWeek: 1,
      startDate: '2026-10-05',
      shiftId: 2,
      shift: { code: 'CUSTOM', name: 'Ca tùy chỉnh', startMinute: 600, endMinute: 750 }
    });

    expect(findRuleConflict(candidate, [existing])).toMatchObject({ code: 'SCHEDULE_OVERLAP', workDate: '2026-10-05' });
  });

  it('ignores an existing exception when searching for the first recurring conflict', () => {
    const existing = rule({
      recurrenceType: 'WEEKLY',
      dayOfWeek: 1,
      exceptions: [{ workDate: '2026-10-05', type: 'CANCELLED' }]
    });
    const candidate = rule({
      id: 2,
      recurrenceType: 'WEEKLY',
      dayOfWeek: 1,
      startDate: '2026-10-05',
      shiftId: 2,
      shift: { code: 'CUSTOM', name: 'Ca tùy chỉnh', startMinute: 600, endMinute: 750 }
    });

    expect(findRuleConflict(candidate, [existing])).toMatchObject({ code: 'SCHEDULE_OVERLAP', workDate: '2026-10-12' });
  });

  it('does not report conflicts across different employees', () => {
    expect(findRuleConflict(rule(), [rule({ employeeId: 11 })])).toBeNull();
  });
});

describe('weekly compensation projection', () => {
  const occurrence = { employeeId: 10, workDate: monday, startMinute: 480, endMinute: 720 };

  it('uses compensation effective on each shift and rounds the weekly hourly total to VND', () => {
    const projection = estimateWeeklyCompensation(
      [occurrence, { ...occurrence, workDate: '2026-09-29', endMinute: 721 }],
      [
        { employeeId: 10, payBasis: 'HOURLY', baseRate: 101, effectiveFrom: '2026-01-01' },
        { employeeId: 10, payBasis: 'HOURLY', baseRate: 121, effectiveFrom: '2026-09-29' }
      ]
    );

    expect(projection).toEqual([{ employeeId: 10, amount: 890, status: 'ESTIMATED' }]);
  });

  it('projects per-shift wages without recording a payroll amount', () => {
    expect(estimateWeeklyCompensation([occurrence], [
      { employeeId: 10, payBasis: 'PER_SHIFT', baseRate: 150_000, effectiveFrom: '2026-01-01' }
    ])).toEqual([{ employeeId: 10, amount: 150_000, status: 'ESTIMATED' }]);
  });

  it('does not estimate monthly wages from scheduled shifts', () => {
    expect(estimateWeeklyCompensation([occurrence], [
      { employeeId: 10, payBasis: 'MONTHLY', baseRate: 8_000_000, effectiveFrom: '2026-01-01' }
    ])).toEqual([{ employeeId: 10, amount: null, status: 'MONTHLY_NOT_ESTIMATED' }]);
  });

  it('marks the projection unavailable when no compensation is effective on the occurrence date', () => {
    expect(estimateWeeklyCompensation([occurrence], [
      { employeeId: 10, payBasis: 'HOURLY', baseRate: 100, effectiveFrom: '2026-10-01' }
    ])).toEqual([{ employeeId: 10, amount: null, status: 'COMPENSATION_NOT_CONFIGURED' }]);
  });
});
