import { ATTENDANCE_BUSINESS_TIMEZONE, businessDateAt } from '../employee-attendance/attendance-domain';

export type PayrollPayBasis = 'MONTHLY' | 'HOURLY' | 'PER_SHIFT';
export type PayrollScheduleLinkStatus = 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW';
export type PayrollCalculationStatus = 'READY' | 'REVIEW_REQUIRED';
export type PayrollWarningCode =
  | 'COMPENSATION_MISSING'
  | 'MISSING_CHECK_OUT'
  | 'ATTENDANCE_NEEDS_REVIEW'
  | 'INVALID_ATTENDANCE_DURATION'
  | 'UNSCHEDULED_ATTENDANCE'
  | 'CONFIRMED_ABSENCE';

const WARNING_ORDER: PayrollWarningCode[] = [
  'COMPENSATION_MISSING',
  'MISSING_CHECK_OUT',
  'ATTENDANCE_NEEDS_REVIEW',
  'INVALID_ATTENDANCE_DURATION',
  'UNSCHEDULED_ATTENDANCE',
  'CONFIRMED_ABSENCE'
];

const FINALIZATION_BLOCKERS = new Set<PayrollWarningCode>([
  'COMPENSATION_MISSING',
  'MISSING_CHECK_OUT',
  'ATTENDANCE_NEEDS_REVIEW',
  'INVALID_ATTENDANCE_DURATION'
]);

export class PayrollCalculationError extends Error {
  constructor(public readonly code: 'PAYROLL_PERIOD_INVALID', message: string) {
    super(message);
    this.name = 'PayrollCalculationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface PayrollCompensationTermInput {
  id: number;
  payBasis: PayrollPayBasis;
  baseRate: number;
  effectiveFrom: string;
}

export interface PayrollAttendanceSessionInput {
  id: number;
  checkInAt: Date;
  checkOutAt: Date | null;
  scheduleLinkStatus: PayrollScheduleLinkStatus;
  scheduleRuleId?: number | null;
  scheduleDate?: string | null;
  plannedShiftName?: string | null;
  plannedStartMinute?: number | null;
  plannedEndMinute?: number | null;
}

export interface PayrollPolicySnapshot {
  id: number;
  revision: number;
  effectiveFrom: string;
  values: Record<string, string | number | boolean | null>;
}

export interface PayrollHolidaySnapshot {
  id: number;
  revision: number;
  name: string;
  startDate: string;
  endDate: string;
  archivedAt: string | null;
}

export interface PayrollSettingsSnapshot {
  payrollPolicy: PayrollPolicySnapshot;
  attendancePolicies: PayrollPolicySnapshot[];
  workweekPolicies: PayrollPolicySnapshot[];
  holidays: PayrollHolidaySnapshot[];
}

export interface PayrollCalculationInput {
  month: string;
  timeZone?: string;
  employmentStartDate: string | null;
  employmentEndDate: string | null;
  compensationTerms: PayrollCompensationTermInput[];
  attendanceSessions: PayrollAttendanceSessionInput[];
  scheduledShiftCount: number;
  confirmedAbsenceCount: number;
  settingsSnapshot?: PayrollSettingsSnapshot;
}

export interface PayrollCalculationResult {
  periodStart: string;
  periodEnd: string;
  periodCalendarDays: number;
  activeDays: number;
  scheduledShifts: number;
  completedSessions: number;
  actualMinutes: number;
  confirmedAbsences: number;
  missingCheckouts: number;
  reviewRequiredCount: number;
  grossAmount: number;
  warningCodes: PayrollWarningCode[];
  calculationStatus: PayrollCalculationStatus;
  sourceSnapshot: {
    employment: { startDate: string | null; endDate: string | null };
    compensationTerms: PayrollCompensationTermInput[];
    attendanceSessions: Array<PayrollAttendanceSessionInput & { businessDate: string }>;
    settings?: PayrollSettingsSnapshot;
  };
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new PayrollCalculationError('PAYROLL_PERIOD_INVALID', 'Ngày tính lương không hợp lệ');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new PayrollCalculationError('PAYROLL_PERIOD_INVALID', 'Ngày tính lương không hợp lệ');
  }
  return parsed;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function eachDate(start: string, end: string): string[] {
  const cursor = parseDate(start);
  const last = parseDate(end);
  const result: string[] = [];
  while (cursor <= last) {
    result.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function getPayrollMonthBounds(month: string): { periodStart: string; periodEnd: string; calendarDays: number } {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new PayrollCalculationError('PAYROLL_PERIOD_INVALID', 'Kỳ lương phải theo định dạng YYYY-MM');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new PayrollCalculationError('PAYROLL_PERIOD_INVALID', 'Tháng tính lương không hợp lệ');
  }
  const calendarDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    periodStart: `${month}-01`,
    periodEnd: `${month}-${String(calendarDays).padStart(2, '0')}`,
    calendarDays
  };
}

function latestTermAt(terms: PayrollCompensationTermInput[], date: string): PayrollCompensationTermInput | null {
  return terms
    .filter(term => term.effectiveFrom <= date)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom) || right.id - left.id)[0] ?? null;
}

export function calculatePayrollLine(input: PayrollCalculationInput): PayrollCalculationResult {
  const bounds = getPayrollMonthBounds(input.month);
  const activeStart = input.employmentStartDate && input.employmentStartDate > bounds.periodStart
    ? input.employmentStartDate
    : bounds.periodStart;
  const activeEnd = input.employmentEndDate && input.employmentEndDate < bounds.periodEnd
    ? input.employmentEndDate
    : bounds.periodEnd;
  const activeDates = activeStart <= activeEnd ? eachDate(activeStart, activeEnd) : [];
  const activeDateSet = new Set(activeDates);
  const timeZone = input.timeZone ?? ATTENDANCE_BUSINESS_TIMEZONE;
  const snapshottedSessions = input.attendanceSessions.map(session => ({
    ...session,
    businessDate: businessDateAt(session.checkInAt, timeZone)
  }));
  const relevantSessions = snapshottedSessions.filter(session =>
    session.businessDate >= bounds.periodStart
    && session.businessDate <= bounds.periodEnd
    && activeDateSet.has(session.businessDate));
  const payableSessions = relevantSessions.filter(session =>
    session.checkOutAt !== null
    && session.checkOutAt.getTime() > session.checkInAt.getTime()
    && session.scheduleLinkStatus !== 'NEEDS_REVIEW');
  const missingCheckouts = relevantSessions.filter(session => session.checkOutAt === null).length;
  const reviewRequiredCount = relevantSessions.filter(session => session.scheduleLinkStatus === 'NEEDS_REVIEW').length;
  const warnings = new Set<PayrollWarningCode>();
  if (activeDates.some(activeDate => latestTermAt(input.compensationTerms, activeDate) === null)) warnings.add('COMPENSATION_MISSING');
  if (missingCheckouts > 0) warnings.add('MISSING_CHECK_OUT');
  if (reviewRequiredCount > 0) warnings.add('ATTENDANCE_NEEDS_REVIEW');
  if (relevantSessions.some(session => session.checkOutAt !== null && session.checkOutAt.getTime() <= session.checkInAt.getTime())) {
    warnings.add('INVALID_ATTENDANCE_DURATION');
  }
  if (relevantSessions.some(session => session.scheduleLinkStatus === 'UNSCHEDULED')) warnings.add('UNSCHEDULED_ATTENDANCE');
  if (input.confirmedAbsenceCount > 0) warnings.add('CONFIRMED_ABSENCE');
  const warningCodes = WARNING_ORDER.filter(code => warnings.has(code));
  let actualMinutes = 0;
  let gross = 0;
  for (const activeDate of activeDates) {
    const term = latestTermAt(input.compensationTerms, activeDate);
    if (term?.payBasis === 'MONTHLY') gross += term.baseRate / bounds.calendarDays;
  }
  for (const session of payableSessions) {
    const minutes = Math.round((session.checkOutAt!.getTime() - session.checkInAt.getTime()) / 60_000);
    actualMinutes += minutes;
    const term = latestTermAt(input.compensationTerms, session.businessDate);
    if (term?.payBasis === 'HOURLY') gross += term.baseRate * minutes / 60;
    if (term?.payBasis === 'PER_SHIFT') gross += term.baseRate;
  }

  return {
    periodStart: bounds.periodStart,
    periodEnd: bounds.periodEnd,
    periodCalendarDays: bounds.calendarDays,
    activeDays: activeDates.length,
    scheduledShifts: input.scheduledShiftCount,
    completedSessions: payableSessions.length,
    actualMinutes,
    confirmedAbsences: input.confirmedAbsenceCount,
    missingCheckouts,
    reviewRequiredCount,
    grossAmount: Math.round(gross),
    warningCodes,
    calculationStatus: warningCodes.some(code => FINALIZATION_BLOCKERS.has(code)) ? 'REVIEW_REQUIRED' : 'READY',
    sourceSnapshot: {
      employment: { startDate: input.employmentStartDate, endDate: input.employmentEndDate },
      compensationTerms: [...input.compensationTerms],
      attendanceSessions: snapshottedSessions,
      ...(input.settingsSnapshot
        ? { settings: JSON.parse(JSON.stringify(input.settingsSnapshot)) as PayrollSettingsSnapshot }
        : {})
    }
  };
}
