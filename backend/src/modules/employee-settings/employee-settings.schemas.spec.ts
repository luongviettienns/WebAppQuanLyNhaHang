import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/api-error';
import {
  parseAttendancePolicyCreateInput,
  parseEmployeeSettingsQuery,
  parseHolidayArchiveInput,
  parseHolidayCreateInput,
  parseHolidayListQuery,
  parseHolidayUpdateInput,
  parsePayrollPolicyCreateInput,
  parseWorkweekPolicyCreateInput
} from './employee-settings.schemas';

const currentDate = '2026-09-30';

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error('Expected parser to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
  }
}

describe('employee settings request schemas', () => {
  it('parses a strict positive branch query and rejects unknown fields', () => {
    expect(parseEmployeeSettingsQuery({ branchId: '1' })).toEqual({ branchId: 1 });
    expect(() => parseEmployeeSettingsQuery({ branchId: '1', role: 'ADMIN' })).toThrow();
  });

  it('accepts current/future attendance versions with supported ranges', () => {
    expect(parseAttendancePolicyCreateInput({
      branchId: 1,
      effectiveFrom: currentDate,
      expectedAreaRevision: 1,
      attendanceMode: 'SHIFT',
      standardDayMinutes: 480,
      lateThresholdMinutes: 5,
      earlyLeaveThresholdMinutes: 10,
      allowUnscheduledAttendance: true
    }, currentDate)).toMatchObject({ effectiveFrom: currentDate, lateThresholdMinutes: 5 });
  });

  it('rejects the migration-only baseline and unsupported attendance options', () => {
    expectCode(() => parseAttendancePolicyCreateInput({
      branchId: 1,
      effectiveFrom: '1970-01-01', expectedAreaRevision: 1, attendanceMode: 'SHIFT',
      standardDayMinutes: 480, lateThresholdMinutes: 0, earlyLeaveThresholdMinutes: 0,
      allowUnscheduledAttendance: true
    }, currentDate), 'EMPLOYEE_SETTINGS_EFFECTIVE_DATE_IN_PAST');
    expectCode(() => parseAttendancePolicyCreateInput({
      branchId: 1,
      effectiveFrom: currentDate, expectedAreaRevision: 1, attendanceMode: 'FREE',
      standardDayMinutes: 480, lateThresholdMinutes: 0, earlyLeaveThresholdMinutes: 0,
      allowUnscheduledAttendance: true
    }, currentDate), 'EMPLOYEE_SETTINGS_CAPABILITY_UNSUPPORTED');
  });

  it('only accepts the truthful MVP payroll values and rejects extra fields', () => {
    const valid = {
      branchId: 1,
      effectiveFrom: '2026-10-01', expectedAreaRevision: 2, frequency: 'MONTHLY',
      periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE'
    };
    expect(parsePayrollPolicyCreateInput(valid, currentDate)).toEqual(valid);
    expectCode(() => parsePayrollPolicyCreateInput({ ...valid, periodStartDay: 15 }, currentDate), 'EMPLOYEE_SETTINGS_CAPABILITY_UNSUPPORTED');
    expect(() => parsePayrollPolicyCreateInput({ ...valid, autoCreatePayroll: true }, currentDate)).toThrow();
  });

  it('requires at least one workweek day and an area revision', () => {
    const input = {
      branchId: 1,
      effectiveFrom: currentDate,
      expectedAreaRevision: 1,
      monday: false, tuesday: false, wednesday: false, thursday: false,
      friday: false, saturday: false, sunday: false
    };
    expectCode(() => parseWorkweekPolicyCreateInput(input, currentDate), 'EMPLOYEE_SETTINGS_WORKWEEK_EMPTY');
    expect(() => parseWorkweekPolicyCreateInput({ ...input, monday: true, expectedAreaRevision: undefined }, currentDate)).toThrow();
  });

  it('parses holiday create with collection revision and validates the date range', () => {
    expect(parseHolidayCreateInput({
      branchId: 1,
      expectedHolidayRevision: 0,
      name: 'Tết Dương lịch', startDate: '2027-01-01', endDate: '2027-01-01', note: 'Nghỉ lễ'
    })).toMatchObject({ name: 'Tết Dương lịch', note: 'Nghỉ lễ' });
    expectCode(() => parseHolidayCreateInput({
      branchId: 1,
      expectedHolidayRevision: 0,
      name: 'Sai', startDate: '2027-01-02', endDate: '2027-01-01'
    }), 'EMPLOYEE_HOLIDAY_DATE_INVALID');
  });

  it('requires both collection and row revisions for holiday updates', () => {
    expect(parseHolidayUpdateInput({
      branchId: 1,
      expectedHolidayRevision: 2,
      expectedRowRevision: 1,
      name: 'Tên hiệu chỉnh',
      reason: 'Sửa tên theo quyết định mới'
    })).toMatchObject({ expectedHolidayRevision: 2, expectedRowRevision: 1 });
    expect(() => parseHolidayUpdateInput({ branchId: 1, expectedHolidayRevision: 2, name: 'Thiếu row revision' })).toThrow();
    expect(() => parseHolidayUpdateInput({ branchId: 1, expectedHolidayRevision: 2, expectedRowRevision: 1 })).toThrow();
  });

  it('requires revisions and a reason to archive without accepting invented flags', () => {
    expect(parseHolidayArchiveInput({
      branchId: 1,
      expectedHolidayRevision: 2, expectedRowRevision: 1, reason: 'Lịch nghỉ không còn áp dụng'
    })).toMatchObject({ expectedHolidayRevision: 2, expectedRowRevision: 1 });
    expect(() => parseHolidayArchiveInput({
      branchId: 1,
      expectedHolidayRevision: 2, expectedRowRevision: 1, reason: 'Đủ dài', hardDelete: true
    })).toThrow();
  });

  it('requires complete valid holiday list bounds', () => {
    expect(parseHolidayListQuery({ branchId: '1', from: '2026-09-01', to: '2026-09-30' }))
      .toEqual({ branchId: 1, from: '2026-09-01', to: '2026-09-30', includeArchived: false });
    expectCode(() => parseHolidayListQuery({ branchId: '1', from: '2026-10-01', to: '2026-09-30' }), 'EMPLOYEE_HOLIDAY_DATE_INVALID');
    expect(() => parseHolidayListQuery({ branchId: '1', from: '2026-09-01' })).toThrow();
  });
});
