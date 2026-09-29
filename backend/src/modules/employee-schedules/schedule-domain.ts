export type ScheduleRecurrenceType = 'ONCE' | 'WEEKLY';
export type ScheduleDomainErrorCode = 'SCHEDULE_DATE_INVALID' | 'SCHEDULE_TIME_INVALID' | 'SCHEDULE_RECURRENCE_INVALID';
export type ScheduleConflictCode = 'SCHEDULE_DUPLICATE' | 'SCHEDULE_OVERLAP';
export type SchedulePayBasis = 'MONTHLY' | 'HOURLY' | 'PER_SHIFT';

export class ScheduleDomainError extends Error {
  constructor(public readonly code: ScheduleDomainErrorCode, message: string) {
    super(message);
    this.name = 'ScheduleDomainError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ScheduleShift {
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
}

export interface ScheduleException {
  scheduleRuleId: number;
  workDate: string;
  type: 'CANCELLED';
}

export interface ScheduleRule {
  id: number;
  employeeId: number;
  shiftId: number;
  recurrenceType: ScheduleRecurrenceType;
  startDate: string;
  endDate: string | null;
  dayOfWeek: number | null;
  cancelledAt: string | null;
  shift: ScheduleShift;
  exceptions?: Array<Pick<ScheduleException, 'workDate' | 'type'>>;
}

export interface ScheduleOccurrence {
  ruleId: number;
  employeeId: number;
  shiftId: number;
  recurrenceType: ScheduleRecurrenceType;
  workDate: string;
  ruleStartDate: string;
  ruleEndDate: string | null;
  dayOfWeek: number | null;
  shiftCode: string;
  shiftName: string;
  startMinute: number;
  endMinute: number;
}

export interface ValidatedScheduleRule {
  recurrenceType: ScheduleRecurrenceType;
  startDate: string;
  endDate: string | null;
  dayOfWeek: number | null;
  startMinute?: number;
  endMinute?: number;
}

export interface ScheduleConflict {
  code: ScheduleConflictCode;
  workDate: string;
  employeeId: number;
  conflictingRuleId: number;
  conflictingShiftId: number;
}

export interface WeeklyCompensationInput {
  employeeId: number;
  workDate: string;
  startMinute: number;
  endMinute: number;
}

export interface CompensationTerm {
  employeeId: number;
  payBasis: SchedulePayBasis;
  baseRate: number;
  effectiveFrom: string;
}

export interface WeeklyCompensationProjection {
  employeeId: number;
  amount: number | null;
  status: 'ESTIMATED' | 'MONTHLY_NOT_ESTIMATED' | 'COMPENSATION_NOT_CONFIGURED';
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateToUtc(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export function isValidScheduleDate(value: string): boolean {
  return dateToUtc(value) !== null;
}

function requireDate(value: string, field: string): Date {
  const date = dateToUtc(value);
  if (!date) throw new ScheduleDomainError('SCHEDULE_DATE_INVALID', `${field} phải có định dạng YYYY-MM-DD và là ngày hợp lệ`);
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function isoWeekday(date: Date): number {
  const weekday = date.getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function firstDateForWeekday(onOrAfter: Date, weekday: number): Date {
  const difference = (weekday - isoWeekday(onOrAfter) + 7) % 7;
  return addDays(onOrAfter, difference);
}

export function validateScheduleRule(input: {
  recurrenceType: ScheduleRecurrenceType;
  startDate: string;
  endDate?: string | null;
  dayOfWeek?: number | null;
  startMinute?: number;
  endMinute?: number;
}): ValidatedScheduleRule {
  const start = requireDate(input.startDate, 'Ngày bắt đầu');
  const endDate = input.endDate ?? null;
  const dayOfWeek = input.dayOfWeek ?? null;
  if (endDate !== null) {
    const end = requireDate(endDate, 'Ngày kết thúc');
    if (end < start) throw new ScheduleDomainError('SCHEDULE_DATE_INVALID', 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu');
  }

  if (input.recurrenceType === 'ONCE') {
    if (endDate !== null || dayOfWeek !== null) {
      throw new ScheduleDomainError('SCHEDULE_RECURRENCE_INVALID', 'Lịch một lần không nhận ngày kết thúc hoặc thứ lặp');
    }
  } else if (input.recurrenceType === 'WEEKLY') {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek! < 1 || dayOfWeek! > 7 || dayOfWeek !== isoWeekday(start)) {
      throw new ScheduleDomainError('SCHEDULE_RECURRENCE_INVALID', 'Thứ lặp phải khớp thứ của ngày bắt đầu theo ISO 1–7');
    }
  } else {
    throw new ScheduleDomainError('SCHEDULE_RECURRENCE_INVALID', 'Loại lặp lịch không hợp lệ');
  }

  const hasStartMinute = input.startMinute !== undefined;
  const hasEndMinute = input.endMinute !== undefined;
  if (hasStartMinute !== hasEndMinute) {
    throw new ScheduleDomainError('SCHEDULE_TIME_INVALID', 'Cần cung cấp cả giờ bắt đầu và giờ kết thúc');
  }
  if (hasStartMinute && hasEndMinute) {
    if (!Number.isInteger(input.startMinute) || !Number.isInteger(input.endMinute)
      || input.startMinute! < 0 || input.startMinute! > 1439
      || input.endMinute! < 1 || input.endMinute! > 1440
      || input.startMinute! >= input.endMinute!) {
      throw new ScheduleDomainError('SCHEDULE_TIME_INVALID', 'Khung giờ phải hợp lệ trong cùng một ngày và giờ kết thúc phải sau giờ bắt đầu');
    }
  }

  return {
    recurrenceType: input.recurrenceType,
    startDate: input.startDate,
    endDate,
    dayOfWeek,
    ...(hasStartMinute && hasEndMinute ? { startMinute: input.startMinute, endMinute: input.endMinute } : {})
  };
}

export function expandRulesForWeek(input: {
  weekStart: string;
  rules: ScheduleRule[];
  exceptions: ScheduleException[];
}): ScheduleOccurrence[] {
  const monday = requireDate(input.weekStart, 'Ngày đầu tuần');
  if (isoWeekday(monday) !== 1) {
    throw new ScheduleDomainError('SCHEDULE_DATE_INVALID', 'Ngày đầu tuần phải là thứ Hai');
  }
  const weekEnd = addDays(monday, 6);
  const exceptions = new Set(input.exceptions
    .filter(exception => exception.type === 'CANCELLED')
    .map(exception => `${exception.scheduleRuleId}:${exception.workDate}`));
  const occurrences: ScheduleOccurrence[] = [];

  for (const rule of input.rules) {
    if (rule.cancelledAt) continue;
    const start = requireDate(rule.startDate, 'Ngày bắt đầu quy tắc');
    const end = rule.endDate ? requireDate(rule.endDate, 'Ngày kết thúc quy tắc') : null;
    const lowerBound = start > monday ? start : monday;
    const upperBound = end && end < weekEnd ? end : weekEnd;
    if (lowerBound > upperBound) continue;

    const dates: Date[] = [];
    if (rule.recurrenceType === 'ONCE') {
      if (start >= monday && start <= weekEnd) dates.push(start);
    } else {
      const weekday = rule.dayOfWeek ?? isoWeekday(start);
      let current = firstDateForWeekday(lowerBound, weekday);
      while (current <= upperBound) {
        dates.push(current);
        current = addDays(current, 7);
      }
    }

    for (const date of dates) {
      const workDate = formatDate(date);
      const cancelledByException = exceptions.has(`${rule.id}:${workDate}`)
        || rule.exceptions?.some(exception => exception.workDate === workDate && exception.type === 'CANCELLED');
      if (cancelledByException) continue;
      occurrences.push({
        ruleId: rule.id,
        employeeId: rule.employeeId,
        shiftId: rule.shiftId,
        recurrenceType: rule.recurrenceType,
        workDate,
        ruleStartDate: rule.startDate,
        ruleEndDate: rule.endDate,
        dayOfWeek: rule.dayOfWeek,
        shiftCode: rule.shift.code,
        shiftName: rule.shift.name,
        startMinute: rule.shift.startMinute,
        endMinute: rule.shift.endMinute
      });
    }
  }

  return occurrences.sort((left, right) => left.workDate.localeCompare(right.workDate)
    || left.employeeId - right.employeeId
    || left.startMinute - right.startMinute
    || left.shiftId - right.shiftId);
}

function isWeeklyOccurrence(rule: ScheduleRule, workDate: string): boolean {
  if (rule.cancelledAt || workDate < rule.startDate || (rule.endDate && workDate > rule.endDate)) return false;
  if (rule.recurrenceType === 'ONCE') return workDate === rule.startDate;
  const date = dateToUtc(workDate);
  return date !== null && isoWeekday(date) === (rule.dayOfWeek ?? isoWeekday(requireDate(rule.startDate, 'Ngày bắt đầu quy tắc')));
}

function* sharedOccurrenceDates(left: ScheduleRule, right: ScheduleRule): Generator<string> {
  const leftStart = requireDate(left.startDate, 'Ngày bắt đầu quy tắc');
  const rightStart = requireDate(right.startDate, 'Ngày bắt đầu quy tắc');

  if (left.recurrenceType === 'ONCE') {
    const date = left.startDate;
    if (isWeeklyOccurrence(right, date) && isWeeklyOccurrence(left, date)) yield date;
    return;
  }
  if (right.recurrenceType === 'ONCE') {
    const date = right.startDate;
    if (isWeeklyOccurrence(left, date) && isWeeklyOccurrence(right, date)) yield date;
    return;
  }

  const leftWeekday = left.dayOfWeek ?? isoWeekday(leftStart);
  const rightWeekday = right.dayOfWeek ?? isoWeekday(rightStart);
  if (leftWeekday !== rightWeekday) return;

  const lower = leftStart > rightStart ? leftStart : rightStart;
  const leftEnd = left.endDate ? requireDate(left.endDate, 'Ngày kết thúc quy tắc') : null;
  const rightEnd = right.endDate ? requireDate(right.endDate, 'Ngày kết thúc quy tắc') : null;
  const upper = leftEnd && rightEnd ? (leftEnd < rightEnd ? leftEnd : rightEnd) : leftEnd ?? rightEnd;
  if (upper && lower > upper) return;

  let date = firstDateForWeekday(lower, leftWeekday);
  while (!upper || date <= upper) {
    yield formatDate(date);
    date = addDays(date, 7);
  }
}

export function findRuleConflict(candidate: ScheduleRule, existingRules: ScheduleRule[]): ScheduleConflict | null {
  for (const existing of existingRules) {
    if (candidate.employeeId !== existing.employeeId || candidate.cancelledAt || existing.cancelledAt) continue;

    const candidateExceptions = new Set(candidate.exceptions?.map(exception => exception.workDate) ?? []);
    const existingExceptions = new Set(existing.exceptions?.map(exception => exception.workDate) ?? []);
    for (const workDate of sharedOccurrenceDates(candidate, existing)) {
      if (candidateExceptions.has(workDate) || existingExceptions.has(workDate)) continue;
      const sameShift = candidate.shiftId === existing.shiftId;
      const overlaps = candidate.shift.startMinute < existing.shift.endMinute
        && existing.shift.startMinute < candidate.shift.endMinute;
      if (!sameShift && !overlaps) continue;
      return {
        code: sameShift ? 'SCHEDULE_DUPLICATE' : 'SCHEDULE_OVERLAP',
        workDate,
        employeeId: candidate.employeeId,
        conflictingRuleId: existing.id,
        conflictingShiftId: existing.shiftId
      };
    }
  }
  return null;
}

export function estimateWeeklyCompensation(
  occurrences: WeeklyCompensationInput[],
  compensations: CompensationTerm[]
): WeeklyCompensationProjection[] {
  const employeeIds = [...new Set(occurrences.map(occurrence => occurrence.employeeId))].sort((a, b) => a - b);
  return employeeIds.map(employeeId => {
    const employeeOccurrences = occurrences.filter(occurrence => occurrence.employeeId === employeeId);
    let total = 0;
    let monthlyNotEstimated = false;
    let compensationMissing = false;

    for (const occurrence of employeeOccurrences) {
      const effectiveTerm = compensations
        .filter(term => term.employeeId === employeeId && term.effectiveFrom <= occurrence.workDate)
        .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
      if (!effectiveTerm) {
        compensationMissing = true;
        continue;
      }
      if (effectiveTerm.payBasis === 'MONTHLY') {
        monthlyNotEstimated = true;
        continue;
      }
      if (effectiveTerm.payBasis === 'PER_SHIFT') {
        total += effectiveTerm.baseRate;
        continue;
      }
      total += effectiveTerm.baseRate * (occurrence.endMinute - occurrence.startMinute) / 60;
    }

    if (compensationMissing) return { employeeId, amount: null, status: 'COMPENSATION_NOT_CONFIGURED' };
    if (monthlyNotEstimated) return { employeeId, amount: null, status: 'MONTHLY_NOT_ESTIMATED' };
    return { employeeId, amount: Math.round(total), status: 'ESTIMATED' };
  });
}
