export const ATTENDANCE_BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';

export type AttendanceTiming = 'EARLY' | 'ON_TIME' | 'LATE' | 'N/A';
export type AttendanceCheckoutTiming = 'LEFT_EARLY' | 'ON_TIME' | 'AFTER_SHIFT' | 'N/A';
export type AttendanceSessionStatus = 'OPEN' | 'COMPLETED' | 'MISSING_CHECK_OUT';
export type AttendanceLinkStatus = 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW';
export type AttendanceOccurrenceStatus = 'NOT_CLOCKED' | 'ABSENT' | 'ATTENDED';

export type AttendanceDomainErrorCode =
  | 'ATTENDANCE_DATE_INVALID'
  | 'SCHEDULE_NOT_AVAILABLE'
  | 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED';

export class AttendanceDomainError extends Error {
  constructor(public readonly code: AttendanceDomainErrorCode, message: string) {
    super(message);
    this.name = 'AttendanceDomainError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface AttendanceScheduleRule {
  id: number;
  employeeId: number;
  branchId: number;
  shiftId: number;
  recurrenceType: 'ONCE' | 'WEEKLY';
  startDate: string;
  endDate: string | null;
  dayOfWeek: number | null;
  cancelledAt: string | null;
  shift: { name: string; startMinute: number; endMinute: number };
}

export interface AttendanceScheduleException {
  scheduleRuleId: number;
  workDate: string;
  type: 'CANCELLED';
}

export interface AttendanceOccurrence {
  scheduleRuleId: number;
  employeeId: number;
  branchId: number;
  shiftId: number;
  scheduleDate: string;
  shiftName: string;
  plannedStartMinute: number;
  plannedEndMinute: number;
}

export type CheckInScheduleSelection =
  | { type: 'SCHEDULED'; scheduleRuleId: number; scheduleDate: string }
  | { type: 'OUTSIDE_SCHEDULE' };

export type ScheduleLinkDecision =
  | { status: 'AUTO_LINKED'; occurrence: AttendanceOccurrence }
  | { status: 'LINKED'; occurrence: AttendanceOccurrence }
  | { status: 'UNSCHEDULED'; occurrence: null }
  | { status: 'OUTSIDE_CONFIRMATION_REQUIRED'; occurrences: AttendanceOccurrence[] }
  | { status: 'SCHEDULE_SELECTION_REQUIRED'; occurrences: AttendanceOccurrence[] }
  | { status: 'SINGLE_SHIFT_CONFIRMATION_REQUIRED'; occurrences: AttendanceOccurrence[] };

export interface AttendanceClassification {
  sessionStatus: AttendanceSessionStatus;
  linkStatus: AttendanceLinkStatus;
  checkInTiming: AttendanceTiming;
  checkInAfterShiftEnd: boolean | null;
  checkInDeltaMinutes: number | null;
  checkOutTiming: AttendanceCheckoutTiming;
  checkOutDeltaMinutes: number | null;
  checkInAt: Date;
  checkOutAt: Date | null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): Date {
  const match = ISO_DATE.exec(value);
  if (!match) throw new AttendanceDomainError('ATTENDANCE_DATE_INVALID', 'Ngày phải theo định dạng YYYY-MM-DD');
  const [, yearText, monthText, dayText] = match;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new AttendanceDomainError('ATTENDANCE_DATE_INVALID', 'Ngày không hợp lệ');
  }
  return date;
}

export function isValidAttendanceDate(value: string): boolean {
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

function addDays(value: Date, amount: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isoWeekday(value: Date): number {
  const weekday = value.getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function partsInTimezone(instant: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function businessDateAt(instant: Date, timeZone = ATTENDANCE_BUSINESS_TIMEZONE): string {
  if (Number.isNaN(instant.getTime())) throw new AttendanceDomainError('ATTENDANCE_DATE_INVALID', 'Thời điểm chấm công không hợp lệ');
  const parts = partsInTimezone(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getBusinessWeekBounds(workDate: string): { weekStart: string; weekEnd: string } {
  const date = parseDate(workDate);
  const monday = addDays(date, -((isoWeekday(date) + 6) % 7));
  return { weekStart: formatDate(monday), weekEnd: formatDate(addDays(monday, 6)) };
}

export function getBusinessWeekUtcBounds(
  weekStart: string,
  timeZone = ATTENDANCE_BUSINESS_TIMEZONE
): { startInclusive: Date; endExclusive: Date } {
  const monday = parseDate(weekStart);
  if (isoWeekday(monday) !== 1) throw new AttendanceDomainError('ATTENDANCE_DATE_INVALID', 'Ngày đầu tuần phải là thứ Hai');
  return {
    startInclusive: localDateMinuteToInstant(weekStart, 0, timeZone),
    endExclusive: localDateMinuteToInstant(formatDate(addDays(monday, 7)), 0, timeZone)
  };
}

function validateShiftMinutes(startMinute: number, endMinute: number): void {
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 || startMinute > 1439 || endMinute < 1 || endMinute > 1440 || startMinute >= endMinute) {
    throw new AttendanceDomainError('SCHEDULE_NOT_AVAILABLE', 'Ca làm việc không có khung giờ hợp lệ');
  }
}

export function expandAttendanceOccurrences(input: {
  weekStart: string;
  rules: AttendanceScheduleRule[];
  exceptions: AttendanceScheduleException[];
  branchId: number;
  employeeId?: number;
}): AttendanceOccurrence[] {
  const monday = parseDate(input.weekStart);
  if (isoWeekday(monday) !== 1) throw new AttendanceDomainError('ATTENDANCE_DATE_INVALID', 'Ngày đầu tuần phải là thứ Hai');
  const weekEnd = addDays(monday, 6);
  const canceled = new Set(input.exceptions
    .filter(exception => exception.type === 'CANCELLED')
    .map(exception => `${exception.scheduleRuleId}:${exception.workDate}`));
  const occurrences: AttendanceOccurrence[] = [];

  for (const rule of input.rules) {
    if (rule.branchId !== input.branchId || (input.employeeId !== undefined && rule.employeeId !== input.employeeId) || rule.cancelledAt) continue;
    const start = parseDate(rule.startDate);
    const end = rule.endDate === null ? null : parseDate(rule.endDate);
    validateShiftMinutes(rule.shift.startMinute, rule.shift.endMinute);
    const dates: Date[] = [];

    if (rule.recurrenceType === 'ONCE') {
      if (start >= monday && start <= weekEnd) dates.push(start);
    } else if (rule.recurrenceType === 'WEEKLY') {
      const weekday = rule.dayOfWeek;
      if (!weekday || weekday < 1 || weekday > 7 || !Number.isInteger(weekday) || weekday !== isoWeekday(start)) {
        throw new AttendanceDomainError('SCHEDULE_NOT_AVAILABLE', 'Quy tắc lặp lịch không hợp lệ');
      }
      for (let current = monday; current <= weekEnd; current = addDays(current, 1)) {
        if (current >= start && (!end || current <= end) && isoWeekday(current) === weekday) dates.push(current);
      }
    } else {
      throw new AttendanceDomainError('SCHEDULE_NOT_AVAILABLE', 'Loại lịch làm việc không hợp lệ');
    }

    for (const date of dates) {
      const scheduleDate = formatDate(date);
      if (canceled.has(`${rule.id}:${scheduleDate}`)) continue;
      occurrences.push({
        scheduleRuleId: rule.id,
        employeeId: rule.employeeId,
        branchId: rule.branchId,
        shiftId: rule.shiftId,
        scheduleDate,
        shiftName: rule.shift.name,
        plannedStartMinute: rule.shift.startMinute,
        plannedEndMinute: rule.shift.endMinute
      });
    }
  }

  return occurrences.sort((left, right) => left.scheduleDate.localeCompare(right.scheduleDate)
    || left.plannedStartMinute - right.plannedStartMinute
    || left.employeeId - right.employeeId
    || left.scheduleRuleId - right.scheduleRuleId);
}

function localDateMinuteToInstant(workDate: string, minuteOfDay: number, timeZone: string): Date {
  const baseDate = parseDate(workDate);
  const dateOffset = Math.floor(minuteOfDay / 1440);
  const minute = minuteOfDay - dateOffset * 1440;
  const targetDate = addDays(baseDate, dateOffset);
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth() + 1;
  const day = targetDate.getUTCDate();
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;
  const guess = Date.UTC(year, month - 1, day, hour, minutePart);
  const local = partsInTimezone(new Date(guess), timeZone);
  const representedAsUtc = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute));
  const offset = representedAsUtc - guess;
  return new Date(guess - offset);
}

function occurrenceEndAt(occurrence: AttendanceOccurrence, timeZone: string): Date {
  return localDateMinuteToInstant(occurrence.scheduleDate, occurrence.plannedEndMinute, timeZone);
}

export function resolveCheckInSchedule(input: {
  occurrences: AttendanceOccurrence[];
  serverNow: Date;
  selection?: CheckInScheduleSelection;
  employeeId?: number;
  branchId?: number;
  scheduleDate?: string;
  timeZone?: string;
}): ScheduleLinkDecision {
  const timeZone = input.timeZone ?? ATTENDANCE_BUSINESS_TIMEZONE;
  const selection = input.selection;
  const candidates = input.occurrences.filter(occurrence =>
    (input.employeeId === undefined || occurrence.employeeId === input.employeeId)
    && (input.branchId === undefined || occurrence.branchId === input.branchId)
    && (input.scheduleDate === undefined || occurrence.scheduleDate === input.scheduleDate));

  if (selection?.type === 'OUTSIDE_SCHEDULE') {
    return { status: 'UNSCHEDULED', occurrence: null };
  }

  if (selection?.type === 'SCHEDULED') {
    const selected = candidates.find(candidate => candidate.scheduleRuleId === selection.scheduleRuleId
      && candidate.scheduleDate === selection.scheduleDate);
    if (!selected) throw new AttendanceDomainError('SCHEDULE_NOT_AVAILABLE', 'Ca đã chọn không còn khả dụng cho nhân viên hoặc chi nhánh này');
    return { status: 'LINKED', occurrence: selected };
  }

  if (candidates.length === 0) return { status: 'OUTSIDE_CONFIRMATION_REQUIRED', occurrences: [] };
  if (candidates.length > 1) return { status: 'SCHEDULE_SELECTION_REQUIRED', occurrences: candidates };
  const only = candidates[0];
  if (input.serverNow.getTime() >= occurrenceEndAt(only, timeZone).getTime()) {
    return { status: 'SINGLE_SHIFT_CONFIRMATION_REQUIRED', occurrences: candidates };
  }
  return { status: 'AUTO_LINKED', occurrence: only };
}

function deltaMinutes(actual: Date, planned: Date | null): number | null {
  return planned === null ? null : Math.round((actual.getTime() - planned.getTime()) / 60000);
}

export function classifyAttendanceSession(input: {
  checkInAt: Date;
  checkOutAt?: Date | null;
  plannedStartAt?: Date | null;
  plannedEndAt?: Date | null;
  now: Date;
  linkStatus?: AttendanceLinkStatus;
}): AttendanceClassification {
  const checkOutAt = input.checkOutAt ?? null;
  const plannedStartAt = input.plannedStartAt ?? null;
  const plannedEndAt = input.plannedEndAt ?? null;
  const linkStatus = input.linkStatus ?? (plannedStartAt && plannedEndAt ? 'SCHEDULED' : 'UNSCHEDULED');
  const isScheduled = linkStatus === 'SCHEDULED' && plannedStartAt !== null && plannedEndAt !== null;
  const sessionStatus: AttendanceSessionStatus = checkOutAt
    ? 'COMPLETED'
    : isScheduled && input.now.getTime() > plannedEndAt!.getTime() ? 'MISSING_CHECK_OUT' : 'OPEN';
  const checkInTiming: AttendanceTiming = !isScheduled
    ? 'N/A'
    : input.checkInAt.getTime() < plannedStartAt!.getTime() ? 'EARLY'
      : input.checkInAt.getTime() === plannedStartAt!.getTime() ? 'ON_TIME' : 'LATE';
  const checkOutTiming: AttendanceCheckoutTiming = !checkOutAt || !isScheduled
    ? 'N/A'
    : checkOutAt.getTime() < plannedEndAt!.getTime() ? 'LEFT_EARLY'
      : checkOutAt.getTime() === plannedEndAt!.getTime() ? 'ON_TIME' : 'AFTER_SHIFT';

  return {
    sessionStatus,
    linkStatus,
    checkInTiming,
    checkInAfterShiftEnd: isScheduled ? input.checkInAt.getTime() >= plannedEndAt!.getTime() : null,
    checkInDeltaMinutes: isScheduled ? deltaMinutes(input.checkInAt, plannedStartAt) : null,
    checkOutTiming,
    checkOutDeltaMinutes: checkOutAt && isScheduled ? deltaMinutes(checkOutAt, plannedEndAt) : null,
    checkInAt: input.checkInAt,
    checkOutAt
  };
}

export function hasOpenAttendanceSession(sessions: Array<{ checkInAt: Date; checkOutAt: Date | null }>): boolean {
  return sessions.some(session => session.checkOutAt === null);
}

export function projectOccurrenceAttendance(input: {
  occurrence: AttendanceOccurrence;
  session: {
    checkInAt: Date;
    checkOutAt: Date | null;
    linkStatus: AttendanceLinkStatus;
    plannedWorkDate?: string | null;
    plannedStartMinute?: number | null;
    plannedEndMinute?: number | null;
  } | null;
  disposition?: 'ABSENT' | null;
  now: Date;
  timeZone?: string;
}): {
  occurrenceStatus: AttendanceOccurrenceStatus;
  reviewConflict: boolean;
  classification: AttendanceClassification | null;
} {
  const reviewConflict = Boolean(input.session && input.disposition === 'ABSENT');
  if (!input.session) {
    return {
      occurrenceStatus: input.disposition === 'ABSENT' ? 'ABSENT' : 'NOT_CLOCKED',
      reviewConflict: false,
      classification: null
    };
  }
  const timeZone = input.timeZone ?? ATTENDANCE_BUSINESS_TIMEZONE;
  const snapshotDate = input.session.plannedWorkDate ?? input.occurrence.scheduleDate;
  const snapshotStartMinute = input.session.plannedStartMinute ?? input.occurrence.plannedStartMinute;
  const snapshotEndMinute = input.session.plannedEndMinute ?? input.occurrence.plannedEndMinute;
  return {
    occurrenceStatus: 'ATTENDED',
    reviewConflict,
    classification: classifyAttendanceSession({
      checkInAt: input.session.checkInAt,
      checkOutAt: input.session.checkOutAt,
      plannedStartAt: localDateMinuteToInstant(snapshotDate, snapshotStartMinute, timeZone),
      plannedEndAt: localDateMinuteToInstant(snapshotDate, snapshotEndMinute, timeZone),
      now: input.now,
      linkStatus: input.session.linkStatus
    })
  };
}
