import type {
  AttendanceClassificationDto,
  AttendanceWeekDto,
  AttendanceWeekRowDto,
  AttendanceView
} from '../../api/employeeAttendance';

const weekdays = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'] as const;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Ngày phải theo định dạng YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) throw new RangeError('Ngày không hợp lệ');
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildAttendanceWeekDays(weekStart: string) {
  const start = parseDate(weekStart);
  if (start.getUTCDay() !== 1) throw new RangeError('Tuần phải bắt đầu vào thứ Hai');
  return weekdays.map((label, index) => {
    const date = addDays(start, index);
    const isoDate = date.toISOString().slice(0, 10);
    return { date: isoDate, label, dayNumber: date.getUTCDate(), isWeekend: index >= 5 };
  });
}

export function formatAttendanceTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get('hour')}:${values.get('minute')}`;
}

export function formatAttendanceDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0 phút';
  return `${value > 0 ? '+' : ''}${value} phút`;
}

function timeRange(start: number, end: number): string {
  const asTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  return `${asTime(start)}–${asTime(end)}`;
}

function primaryStatus(row: AttendanceWeekRowDto): string {
  if (row.reviewConflict || row.kind === 'NEEDS_REVIEW') return 'Cần đối chiếu';
  if (row.occurrenceStatus === 'ABSENT') return 'Vắng mặt';
  if (row.occurrenceStatus === 'NOT_CLOCKED') return 'Chưa chấm công';
  if (row.sessions.some(session => session.classification.sessionStatus === 'MISSING_CHECK_OUT')) return 'Thiếu giờ ra / Cần xem xét';
  if (row.sessions.some(session => session.linkStatus === 'UNSCHEDULED')) return 'Ngoài lịch';
  return row.sessions.some(session => session.checkOutAt) ? 'Đã chấm công' : 'Đang trong ca';
}

function secondaryStatuses(row: AttendanceWeekRowDto): string[] {
  const labels: string[] = [];
  if (row.reviewConflict) labels.push('Xung đột dữ liệu cần Admin xử lý');
  const classifications = row.sessions.map(session => session.classification);
  if (classifications.some(item => item.sessionStatus === 'MISSING_CHECK_OUT') && primaryStatus(row) !== 'Thiếu giờ ra / Cần xem xét') {
    labels.push('Thiếu giờ ra / Cần xem xét');
  }
  if (classifications.some(item => item.checkInTiming === 'LATE')) labels.push('Đi muộn');
  if (classifications.some(item => item.checkOutTiming === 'LEFT_EARLY')) labels.push('Về sớm');
  return labels;
}

export interface AttendanceScreenRowModel {
  id: string;
  workDate: string;
  employeeName: string;
  employeeCode: string;
  departmentName: string | null;
  shiftName: string;
  shiftTime: string;
  checkIn: string;
  checkOut: string;
  deviation: string;
  primaryStatus: string;
  secondaryStatuses: string[];
  occurrenceStatus: AttendanceWeekRowDto['occurrenceStatus'];
  linkStatus: AttendanceWeekRowDto['kind'];
  reviewConflict: boolean;
  raw: AttendanceWeekRowDto;
}

function firstClassification(row: AttendanceWeekRowDto): AttendanceClassificationDto | null {
  return row.sessions[0]?.classification ?? row.classification;
}

function rowToModel(row: AttendanceWeekRowDto): AttendanceScreenRowModel {
  const classification = firstClassification(row);
  const actualSession = row.sessions[0];
  const shiftName = actualSession?.plannedShiftName ?? row.shift?.name ?? 'Ngoài lịch';
  const hasSessionSnapshot = actualSession?.plannedStartMinute !== null && actualSession?.plannedStartMinute !== undefined
    && actualSession.plannedEndMinute !== null && actualSession.plannedEndMinute !== undefined;
  const shiftTime = hasSessionSnapshot
    ? timeRange(actualSession.plannedStartMinute!, actualSession.plannedEndMinute!)
    : row.shift ? timeRange(row.shift.plannedStartMinute, row.shift.plannedEndMinute) : '—';
  return {
    id: row.id, workDate: row.workDate, employeeName: row.employee.name, employeeCode: row.employee.code,
    departmentName: row.employee.departmentName, shiftName, shiftTime,
    checkIn: formatAttendanceTime(actualSession?.checkInAt ?? null),
    checkOut: formatAttendanceTime(actualSession?.checkOutAt ?? null),
    deviation: formatAttendanceDelta(classification?.checkInDeltaMinutes ?? null),
    primaryStatus: primaryStatus(row), secondaryStatuses: secondaryStatuses(row),
    occurrenceStatus: row.occurrenceStatus, linkStatus: row.kind,
    reviewConflict: row.reviewConflict, raw: row
  };
}

export interface AttendanceScreenGroup { key: string; title: string; detail: string; rows: AttendanceScreenRowModel[] }

function compareRows(view: AttendanceView, left: AttendanceScreenRowModel, right: AttendanceScreenRowModel) {
  const employeeCompare = left.employeeName.localeCompare(right.employeeName, 'vi') || left.employeeCode.localeCompare(right.employeeCode);
  const dateCompare = left.workDate.localeCompare(right.workDate);
  const shiftCompare = left.shiftName.localeCompare(right.shiftName, 'vi') || left.shiftTime.localeCompare(right.shiftTime);
  return view === 'employee'
    ? employeeCompare || dateCompare || shiftCompare || left.id.localeCompare(right.id)
    : dateCompare || shiftCompare || employeeCompare || left.id.localeCompare(right.id);
}

export function buildAttendanceScreenModel(data: AttendanceWeekDto) {
  const rows = data.rows.map(rowToModel).sort((left, right) => compareRows(data.view, left, right));
  const groups = new Map<string, AttendanceScreenGroup>();
  for (const row of rows) {
    const key = data.view === 'employee'
      ? `employee:${row.raw.employee.id}`
      : `shift:${row.shiftName}:${row.shiftTime}`;
    const existing = groups.get(key);
    if (existing) existing.rows.push(row);
    else groups.set(key, {
      key,
      title: data.view === 'employee' ? row.employeeName : row.shiftName,
      detail: data.view === 'employee' ? row.employeeCode : row.shiftTime,
      rows: [row]
    });
  }
  return {
    branchCode: data.branch.code, weekStart: data.weekStart, weekEnd: data.weekEnd,
    view: data.view, days: buildAttendanceWeekDays(data.weekStart), rows, groups: [...groups.values()],
    pagination: data.pagination
  };
}
