import { describe, expect, it } from 'vitest';
import {
  EmployeeSettingsDomainError,
  assertEffectiveDateAllowed,
  dateRangesOverlap,
  selectEffectiveVersion,
  validateAttendancePolicy,
  validateHolidayPeriod,
  validatePayrollPolicy,
  validateWorkweekPolicy
} from './employee-settings.domain';

describe('employee settings domain', () => {
  it('selects the latest policy effective on the business date', () => {
    const selected = selectEffectiveVersion([
      { effectiveFrom: '1970-01-01', revision: 1, label: 'baseline' },
      { effectiveFrom: '2026-10-01', revision: 2, label: 'october' },
      { effectiveFrom: '2026-11-01', revision: 3, label: 'november' }
    ], '2026-10-15');

    expect(selected).toEqual({ effectiveFrom: '2026-10-01', revision: 2, label: 'october' });
  });

  it('rejects an effective date before the current business date', () => {
    expect(() => assertEffectiveDateAllowed('2026-09-29', '2026-09-30')).toThrowError(
      expect.objectContaining({ code: 'EMPLOYEE_SETTINGS_EFFECTIVE_DATE_IN_PAST' })
    );
    expect(() => assertEffectiveDateAllowed('2026-09-30', '2026-09-30')).not.toThrow();
  });

  it.each([59, 1441])('rejects standard day minutes %s', standardDayMinutes => {
    expect(() => validateAttendancePolicy({
      attendanceMode: 'SHIFT', standardDayMinutes, lateThresholdMinutes: 0,
      earlyLeaveThresholdMinutes: 0, allowUnscheduledAttendance: true
    })).toThrowError(expect.objectContaining({ code: 'EMPLOYEE_SETTINGS_VALUE_INVALID' }));
  });

  it.each([-1, 721])('rejects attendance threshold %s', threshold => {
    expect(() => validateAttendancePolicy({
      attendanceMode: 'SHIFT', standardDayMinutes: 480, lateThresholdMinutes: threshold,
      earlyLeaveThresholdMinutes: threshold, allowUnscheduledAttendance: true
    })).toThrowError(expect.objectContaining({ code: 'EMPLOYEE_SETTINGS_VALUE_INVALID' }));
  });

  it('requires at least one workweek day', () => {
    expect(() => validateWorkweekPolicy({
      monday: false, tuesday: false, wednesday: false, thursday: false,
      friday: false, saturday: false, sunday: false
    })).toThrowError(expect.objectContaining({ code: 'EMPLOYEE_SETTINGS_WORKWEEK_EMPTY' }));
  });

  it('rejects invalid and overlapping holiday ranges', () => {
    expect(() => validateHolidayPeriod({ name: 'Tết', startDate: '2026-02-30', endDate: '2026-03-01' }))
      .toThrowError(expect.objectContaining({ code: 'EMPLOYEE_HOLIDAY_DATE_INVALID' }));
    expect(() => validateHolidayPeriod({ name: 'Tết', startDate: '2026-10-02', endDate: '2026-10-01' }))
      .toThrowError(expect.objectContaining({ code: 'EMPLOYEE_HOLIDAY_DATE_INVALID' }));
    expect(dateRangesOverlap('2026-10-01', '2026-10-03', '2026-10-03', '2026-10-05')).toBe(true);
    expect(dateRangesOverlap('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05')).toBe(false);
  });

  it('accepts only MONTHLY day 1 and ACTUAL_ATTENDANCE payroll policy', () => {
    expect(validatePayrollPolicy({
      frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE'
    })).toEqual({ frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE' });

    for (const invalid of [
      { frequency: 'WEEKLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE' },
      { frequency: 'MONTHLY', periodStartDay: 2, hourlyCalculationSource: 'ACTUAL_ATTENDANCE' },
      { frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'SCHEDULED_HOURS' }
    ]) {
      expect(() => validatePayrollPolicy(invalid as never)).toThrowError(
        expect.objectContaining({ code: 'EMPLOYEE_SETTINGS_CAPABILITY_UNSUPPORTED' })
      );
    }
  });

  it('exposes stable domain error instances', () => {
    const error = new EmployeeSettingsDomainError('EMPLOYEE_SETTINGS_VALUE_INVALID', 'invalid');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmployeeSettingsDomainError');
  });
});
