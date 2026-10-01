import { describe, expect, it } from 'vitest';
import {
  calculatePayrollLine,
  getPayrollMonthBounds,
  type PayrollCalculationInput
} from './employee-payroll.calculation';

const baseInput = (overrides: Partial<PayrollCalculationInput> = {}): PayrollCalculationInput => ({
  month: '2026-09',
  timeZone: 'Asia/Ho_Chi_Minh',
  employmentStartDate: '2026-09-01',
  employmentEndDate: null,
  compensationTerms: [{ id: 1, payBasis: 'MONTHLY', baseRate: 30_000_000, effectiveFrom: '2026-09-01' }],
  attendanceSessions: [],
  scheduledShiftCount: 0,
  confirmedAbsenceCount: 0,
  ...overrides
});

describe('payroll month and business-date boundaries', () => {
  it('returns inclusive calendar-month bounds including leap February', () => {
    expect(getPayrollMonthBounds('2028-02')).toEqual({
      periodStart: '2028-02-01',
      periodEnd: '2028-02-29',
      calendarDays: 29
    });
  });

  it.each(['2026-2', '2026-13', '2026-00', '26-02', '2026-02-01', ''])('rejects malformed payroll month %j', month => {
    expect(() => getPayrollMonthBounds(month)).toThrowError(expect.objectContaining({ code: 'PAYROLL_PERIOD_INVALID' }));
  });

  it('intersects active calendar days with mid-month hire and resignation dates', () => {
    const result = calculatePayrollLine(baseInput({
      employmentStartDate: '2026-09-10',
      employmentEndDate: '2026-09-20'
    }));

    expect(result.activeDays).toBe(11);
    expect(result.sourceSnapshot.employment).toEqual({ startDate: '2026-09-10', endDate: '2026-09-20' });
  });

  it('owns an overnight session by its Vietnam check-in business date', () => {
    const result = calculatePayrollLine(baseInput({
      month: '2026-09',
      compensationTerms: [{ id: 2, payBasis: 'HOURLY', baseRate: 60_000, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [{
        id: 21,
        checkInAt: new Date('2026-09-30T16:30:00.000Z'),
        checkOutAt: new Date('2026-09-30T18:30:00.000Z'),
        scheduleLinkStatus: 'SCHEDULED'
      }]
    }));

    expect(result.completedSessions).toBe(1);
    expect(result.actualMinutes).toBe(120);
    expect(result.grossAmount).toBe(120_000);
    expect(result.sourceSnapshot.attendanceSessions[0]?.businessDate).toBe('2026-09-30');
  });
});

describe('payroll MVP formulas', () => {
  const session = (id: number, checkInIso: string, minutes: number, scheduleLinkStatus: 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW' = 'SCHEDULED') => ({
    id,
    checkInAt: new Date(checkInIso),
    checkOutAt: new Date(new Date(checkInIso).getTime() + minutes * 60_000),
    scheduleLinkStatus
  });

  it('pays the unchanged monthly rate exactly for a full active month', () => {
    expect(calculatePayrollLine(baseInput()).grossAmount).toBe(30_000_000);
  });

  it('prorates monthly salary by active calendar days for a partial month', () => {
    const result = calculatePayrollLine(baseInput({
      employmentStartDate: '2026-09-10',
      employmentEndDate: '2026-09-20'
    }));

    expect(result.activeDays).toBe(11);
    expect(result.grossAmount).toBe(11_000_000);
  });

  it('uses the latest effective monthly rate for each active date', () => {
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [
        { id: 1, payBasis: 'MONTHLY', baseRate: 30_000_000, effectiveFrom: '2026-09-01' },
        { id: 2, payBasis: 'MONTHLY', baseRate: 60_000_000, effectiveFrom: '2026-09-16' }
      ]
    }));

    expect(result.grossAmount).toBe(45_000_000);
  });

  it('pays hourly compensation from completed actual minutes', () => {
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [{ id: 3, payBasis: 'HOURLY', baseRate: 60_000, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [session(31, '2026-09-12T01:00:00.000Z', 90)]
    }));

    expect(result.completedSessions).toBe(1);
    expect(result.actualMinutes).toBe(90);
    expect(result.grossAmount).toBe(90_000);
  });

  it('pays each valid completed session once for per-shift compensation', () => {
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [{ id: 4, payBasis: 'PER_SHIFT', baseRate: 250_000, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [
        session(41, '2026-09-12T01:00:00.000Z', 240),
        session(42, '2026-09-13T06:00:00.000Z', 180, 'UNSCHEDULED')
      ]
    }));

    expect(result.completedSessions).toBe(2);
    expect(result.grossAmount).toBe(500_000);
  });

  it('combines monthly, hourly and per-shift terms without double-counting', () => {
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [
        { id: 5, payBasis: 'MONTHLY', baseRate: 30_000_000, effectiveFrom: '2026-09-01' },
        { id: 6, payBasis: 'HOURLY', baseRate: 60_000, effectiveFrom: '2026-09-11' },
        { id: 7, payBasis: 'PER_SHIFT', baseRate: 250_000, effectiveFrom: '2026-09-20' }
      ],
      attendanceSessions: [
        session(51, '2026-09-12T01:00:00.000Z', 120),
        session(52, '2026-09-21T01:00:00.000Z', 240)
      ]
    }));

    expect(result.grossAmount).toBe(10_370_000);
  });

  it('rounds once to the nearest VND at employee-line level', () => {
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [{ id: 8, payBasis: 'HOURLY', baseRate: 1_001, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [session(61, '2026-09-12T01:00:00.000Z', 1)]
    }));

    expect(result.grossAmount).toBe(17);
  });

  it('clones optional settings metadata into the source snapshot without changing payroll totals', () => {
    const settingsSnapshot = {
      payrollPolicy: { id: 31, revision: 2, effectiveFrom: '2026-09-01', values: { frequency: 'MONTHLY', periodStartDay: 1 } },
      attendancePolicies: [{ id: 41, revision: 3, effectiveFrom: '2026-08-15', values: { lateThresholdMinutes: 5 } }],
      workweekPolicies: [{ id: 51, revision: 4, effectiveFrom: '2026-01-01', values: { monday: true, sunday: false } }],
      holidays: [{ id: 61, revision: 2, name: 'Quốc khánh', startDate: '2026-09-02', endDate: '2026-09-02', archivedAt: null }]
    };
    const baseline = calculatePayrollLine(baseInput());
    const result = calculatePayrollLine(baseInput({ settingsSnapshot }));

    expect(result.sourceSnapshot.settings).toEqual(settingsSnapshot);
    expect(result.sourceSnapshot.settings).not.toBe(settingsSnapshot);
    expect(result).toMatchObject({
      grossAmount: baseline.grossAmount,
      actualMinutes: baseline.actualMinutes,
      warningCodes: baseline.warningCodes
    });
    settingsSnapshot.holidays[0].name = 'Đã sửa phía caller';
    expect(result.sourceSnapshot.settings?.holidays[0].name).toBe('Quốc khánh');
  });

  it('keeps the legacy source snapshot shape when no settings metadata is provided', () => {
    expect(calculatePayrollLine(baseInput()).sourceSnapshot).not.toHaveProperty('settings');
  });
});

describe('payroll warnings and finalization readiness', () => {
  const session = (overrides: Partial<PayrollCalculationInput['attendanceSessions'][number]> = {}): PayrollCalculationInput['attendanceSessions'][number] => ({
    id: 71,
    checkInAt: new Date('2026-09-12T01:00:00.000Z'),
    checkOutAt: new Date('2026-09-12T05:00:00.000Z'),
    scheduleLinkStatus: 'SCHEDULED',
    ...overrides
  });

  it('blocks finalization when an active date has no effective compensation', () => {
    const result = calculatePayrollLine(baseInput({ compensationTerms: [] }));

    expect(result.warningCodes).toEqual(['COMPENSATION_MISSING']);
    expect(result.calculationStatus).toBe('REVIEW_REQUIRED');
  });

  it('blocks an in-period session that is missing checkout without inventing actual minutes', () => {
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [{ id: 9, payBasis: 'HOURLY', baseRate: 60_000, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [session({ checkOutAt: null })]
    }));

    expect(result.missingCheckouts).toBe(1);
    expect(result.completedSessions).toBe(0);
    expect(result.actualMinutes).toBe(0);
    expect(result.warningCodes).toEqual(['MISSING_CHECK_OUT']);
    expect(result.calculationStatus).toBe('REVIEW_REQUIRED');
  });

  it('blocks review-required and non-positive attendance and excludes both from pay', () => {
    const checkInAt = new Date('2026-09-13T01:00:00.000Z');
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [{ id: 10, payBasis: 'HOURLY', baseRate: 60_000, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [
        session({ id: 72, scheduleLinkStatus: 'NEEDS_REVIEW' }),
        session({ id: 73, checkInAt, checkOutAt: new Date(checkInAt) })
      ]
    }));

    expect(result.reviewRequiredCount).toBe(1);
    expect(result.completedSessions).toBe(0);
    expect(result.grossAmount).toBe(0);
    expect(result.warningCodes).toEqual(['ATTENDANCE_NEEDS_REVIEW', 'INVALID_ATTENDANCE_DURATION']);
    expect(result.calculationStatus).toBe('REVIEW_REQUIRED');
  });

  it('keeps unscheduled completed attendance payable but informational', () => {
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [{ id: 11, payBasis: 'PER_SHIFT', baseRate: 250_000, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [session({ scheduleLinkStatus: 'UNSCHEDULED' })]
    }));

    expect(result.grossAmount).toBe(250_000);
    expect(result.warningCodes).toEqual(['UNSCHEDULED_ATTENDANCE']);
    expect(result.calculationStatus).toBe('READY');
  });

  it('shows confirmed absence without deducting monthly salary or blocking finalization', () => {
    const result = calculatePayrollLine(baseInput({ confirmedAbsenceCount: 2 }));

    expect(result.confirmedAbsences).toBe(2);
    expect(result.grossAmount).toBe(30_000_000);
    expect(result.warningCodes).toEqual(['CONFIRMED_ABSENCE']);
    expect(result.calculationStatus).toBe('READY');
  });

  it('returns warning codes in stable severity order without duplicates', () => {
    const checkInAt = new Date('2026-09-14T01:00:00.000Z');
    const result = calculatePayrollLine(baseInput({
      compensationTerms: [],
      confirmedAbsenceCount: 1,
      attendanceSessions: [
        session({ id: 74, checkOutAt: null }),
        session({ id: 75, scheduleLinkStatus: 'NEEDS_REVIEW' }),
        session({ id: 76, checkInAt, checkOutAt: new Date(checkInAt) }),
        session({ id: 77, scheduleLinkStatus: 'UNSCHEDULED' })
      ]
    }));

    expect(result.warningCodes).toEqual([
      'COMPENSATION_MISSING',
      'MISSING_CHECK_OUT',
      'ATTENDANCE_NEEDS_REVIEW',
      'INVALID_ATTENDANCE_DURATION',
      'UNSCHEDULED_ATTENDANCE',
      'CONFIRMED_ABSENCE'
    ]);
  });
});
