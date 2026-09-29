import type {
  ScheduleCompensationStatus,
  ScheduleOccurrenceDto,
  ScheduleWeekEmployeeDto
} from '../../api/employeeScheduleManagement';

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'] as const;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function dateFromParts(value: string): Date {
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError('Ngày phải có định dạng YYYY-MM-DD');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.toISOString().slice(0, 10) !== value) throw new RangeError('Ngày lịch không hợp lệ');
  return date;
}

function dateToIso(date: Date): string { return date.toISOString().slice(0, 10); }

export function getBusinessDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function isScheduleDateInPast(workDate: string, today: string): boolean {
  return dateToIso(dateFromParts(workDate)) < dateToIso(dateFromParts(today));
}

function addDays(value: string, count: number): string {
  const date = dateFromParts(value);
  date.setUTCDate(date.getUTCDate() + count);
  return dateToIso(date);
}

export function getMondayWeekStart(value: string): string {
  const date = dateFromParts(value);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return dateToIso(date);
}

export function addWeeksToWeekStart(weekStart: string, offset: number): string {
  if (!Number.isInteger(offset)) throw new RangeError('Số tuần phải là số nguyên');
  const monday = getMondayWeekStart(weekStart);
  return addDays(monday, offset * 7);
}

export function buildWeekDays(weekStart: string, today?: string) {
  const monday = getMondayWeekStart(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const parsed = dateFromParts(date);
    return {
      date,
      label: WEEKDAY_LABELS[parsed.getUTCDay()],
      dayNumber: Number(date.slice(-2)),
      isToday: today === date,
      isWeekend: parsed.getUTCDay() === 0 || parsed.getUTCDay() === 6
    };
  });
}

export function formatShiftTime(startMinute: number, endMinute: number): string {
  if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) {
    throw new RangeError('Khung giờ ca làm không hợp lệ');
  }
  const format = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  return `${format(startMinute)} - ${format(endMinute)}`;
}

export function formatScheduleVnd(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return `${Math.round(amount).toLocaleString('vi-VN')} đ`;
}

export function formatCompensationProjection(projection: { amount: number | null; status: ScheduleCompensationStatus }): string {
  if (projection.status === 'MONTHLY_NOT_ESTIMATED') return 'Lương tháng — chưa ước tính';
  if (projection.status === 'COMPENSATION_NOT_CONFIGURED' || projection.amount === null) return 'Chưa thiết lập lương';
  return formatScheduleVnd(projection.amount);
}

export function toScheduleCellModel(occurrence: ScheduleOccurrenceDto) {
  return {
    key: `${occurrence.ruleId}:${occurrence.workDate}`,
    ruleId: occurrence.ruleId,
    employeeId: occurrence.employeeId,
    shiftId: occurrence.shiftId,
    workDate: occurrence.workDate,
    title: occurrence.shiftName,
    time: formatShiftTime(occurrence.startMinute, occurrence.endMinute),
    recurrenceLabel: occurrence.recurrenceType === 'WEEKLY' ? 'Lặp hàng tuần' : 'Một lần'
  };
}

export type ScheduleScreenState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'ready'; employees: ScheduleWeekEmployeeDto[] };

export function buildScheduleScreenState(input: { loading: boolean; error?: string | null; employees: ScheduleWeekEmployeeDto[] }): ScheduleScreenState {
  if (input.loading) return { kind: 'loading' };
  if (input.error) return { kind: 'error', message: input.error };
  if (input.employees.length === 0) return { kind: 'empty' };
  return { kind: 'ready', employees: input.employees };
}
