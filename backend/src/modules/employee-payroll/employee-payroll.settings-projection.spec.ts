import { describe, expect, it, vi } from 'vitest';
import { buildPayrollSettingsProjection } from './employee-payroll.settings-projection';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('buildPayrollSettingsProjection', () => {
  it('keeps only the policy intervals and holidays that can affect the payroll period', async () => {
    const db = {
      branchPayrollPolicyVersion: {
        findMany: vi.fn().mockResolvedValue([
          { id: 3, revision: 3, effectiveFrom: day('2026-10-01'), frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE' },
          { id: 2, revision: 2, effectiveFrom: day('2026-09-01'), frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE' },
          { id: 1, revision: 1, effectiveFrom: day('1970-01-01'), frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE' }
        ])
      },
      branchAttendancePolicyVersion: {
        findMany: vi.fn().mockResolvedValue([
          { id: 12, revision: 12, effectiveFrom: day('2026-09-15'), attendanceMode: 'SHIFT', standardDayMinutes: 480, lateThresholdMinutes: 5, earlyLeaveThresholdMinutes: 5, allowUnscheduledAttendance: true },
          { id: 11, revision: 11, effectiveFrom: day('2026-09-01'), attendanceMode: 'SHIFT', standardDayMinutes: 480, lateThresholdMinutes: 0, earlyLeaveThresholdMinutes: 0, allowUnscheduledAttendance: true }
        ])
      },
      branchWorkweekPolicyVersion: {
        findMany: vi.fn().mockResolvedValue([
          { id: 23, revision: 3, effectiveFrom: day('2026-10-01'), monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: false, sunday: false },
          { id: 22, revision: 2, effectiveFrom: day('2026-09-16'), monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false },
          { id: 21, revision: 1, effectiveFrom: day('1970-01-01'), monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true }
        ])
      },
      branchHolidayPeriod: {
        findMany: vi.fn().mockResolvedValue([
          { id: 33, revision: 1, name: 'Ngoài kỳ', startDate: day('2026-10-01'), endDate: day('2026-10-02'), archivedAt: null },
          { id: 32, revision: 2, name: 'Quốc khánh điều chỉnh', startDate: day('2026-09-02'), endDate: day('2026-09-02'), archivedAt: new Date('2026-09-03T01:00:00.000Z') },
          { id: 31, revision: 1, name: 'Quốc khánh', startDate: day('2026-09-01'), endDate: day('2026-09-02'), archivedAt: null }
        ])
      }
    };

    const projection = await buildPayrollSettingsProjection(
      db as never,
      1,
      '2026-09-01',
      '2026-09-30',
      [{ attendancePolicyVersionId: 12 }, { attendancePolicyVersionId: 11 }, { attendancePolicyVersionId: 12 }]
    );

    expect(projection.payrollPolicy).toMatchObject({ id: 2, revision: 2, effectiveFrom: '2026-09-01' });
    expect(projection.attendancePolicies.map(item => item.id)).toEqual([11, 12]);
    expect(projection.workweekPolicies.map(item => item.id)).toEqual([21, 22]);
    expect(projection.holidays.map(item => item.id)).toEqual([31, 32]);
    expect(projection.holidays[1]).toMatchObject({ archivedAt: '2026-09-03T01:00:00.000Z' });
  });

  it('fails closed when the payroll baseline is missing', async () => {
    const db = {
      branchPayrollPolicyVersion: { findMany: vi.fn().mockResolvedValue([]) },
      branchAttendancePolicyVersion: { findMany: vi.fn().mockResolvedValue([]) },
      branchWorkweekPolicyVersion: { findMany: vi.fn().mockResolvedValue([]) },
      branchHolidayPeriod: { findMany: vi.fn().mockResolvedValue([]) }
    };

    await expect(buildPayrollSettingsProjection(db as never, 1, '2026-09-01', '2026-09-30', []))
      .rejects.toMatchObject({ code: 'EMPLOYEE_SETTINGS_BASELINE_MISSING', statusCode: 409 });
  });
});
