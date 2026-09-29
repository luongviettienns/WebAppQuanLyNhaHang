import * as XLSX from 'xlsx';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { findRuleConflict, isValidScheduleDate, ScheduleDomainError, validateScheduleRule, type ScheduleRule } from './schedule-domain';
import { EmployeeSchedulesService } from './employee-schedules.service';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const importHeaders = ['employeeCode', 'shiftCode', 'workDate', 'repeatWeekly', 'endDate'] as const;
const exportHeaders = ['employeeCode', 'employeeName', 'shiftCode', 'shiftName', 'workDate', 'startTime', 'endTime', 'repeatWeekly'] as const;
const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('vi').replace(/[ _-]/g, '');
const dateText = (date: Date) => date.toISOString().slice(0, 10);
const minuteText = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

interface ImportRow {
  rowNumber?: number;
  employeeCode: string;
  shiftCode: string;
  workDate: string;
  repeatWeekly: boolean;
  endDate: string | null;
}

interface ImportErrorRow extends Partial<ImportRow> { error: string }

function excelDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const result = `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    return isValidScheduleDate(result) ? result : null;
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (isValidScheduleDate(text)) return text;
  const localized = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  if (!localized) return null;
  const result = `${localized[3]}-${localized[2].padStart(2, '0')}-${localized[1].padStart(2, '0')}`;
  return isValidScheduleDate(result) ? result : null;
}

function parseRepeat(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value ?? '').trim().toLocaleLowerCase('vi');
  if (['true', '1', 'yes', 'có', 'co', 'weekly', 'lặp'].includes(text)) return true;
  if (['false', '0', 'no', 'không', 'khong', 'once', 'một lần', 'mot lan'].includes(text)) return false;
  return null;
}

function readRows(fileName: string, fileBase64: string): unknown[][] {
  if (!/\.(csv|xlsx)$/i.test(fileName)) throw ApiError.badRequest('Chỉ hỗ trợ file CSV hoặc XLSX', {}, 'SCHEDULE_IMPORT_FILE_INVALID');
  const buffer = Buffer.from(fileBase64, 'base64');
  if (buffer.length > MAX_BYTES) throw ApiError.badRequest('File import tối đa 5 MB', {}, 'SCHEDULE_IMPORT_FILE_TOO_LARGE');
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: 'buffer', raw: true, cellFormula: true, sheetRows: MAX_ROWS + 2 }); }
  catch { throw ApiError.badRequest('Không thể đọc file. Vui lòng dùng mẫu XLSX hoặc CSV.', {}, 'SCHEDULE_IMPORT_FILE_INVALID'); }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw ApiError.badRequest('File không có dữ liệu', {}, 'SCHEDULE_IMPORT_FILE_INVALID');
  if (Object.entries(sheet).some(([key, cell]) => !key.startsWith('!') && cell?.f)) {
    throw ApiError.badRequest('File nhập phải chứa giá trị, không chứa công thức', {}, 'SCHEDULE_IMPORT_FORMULA_NOT_ALLOWED');
  }
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
  if (range.e.r > MAX_ROWS) throw ApiError.badRequest('Tối đa 1000 dòng lịch mỗi lần nhập', {}, 'SCHEDULE_IMPORT_ROW_LIMIT');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  if (rows.length === 0) throw ApiError.badRequest('File không có dòng tiêu đề', {}, 'SCHEDULE_IMPORT_HEADERS_INVALID');
  const headers = rows[0].map(normalizeHeader);
  const positions = importHeaders.map(header => headers.indexOf(normalizeHeader(header)));
  if (positions.some(position => position < 0)) {
    throw ApiError.badRequest(`File thiếu cột bắt buộc: ${importHeaders.filter((_, index) => positions[index] < 0).join(', ')}`, {}, 'SCHEDULE_IMPORT_HEADERS_INVALID');
  }
  return rows.slice(1).map(row => positions.map(position => row[position] ?? ''));
}

function parseRows(rows: unknown[][]): { candidates: ImportRow[]; errors: ImportErrorRow[]; totalRows: number } {
  const candidates: ImportRow[] = [];
  const errors: ImportErrorRow[] = [];
  let nonEmptyRows = 0;
  rows.forEach((row, index) => {
    if (row.every(value => String(value ?? '').trim() === '')) return;
    nonEmptyRows += 1;
    const [employeeValue, shiftValue, dateValue, repeatValue, endDateValue] = row;
    const employeeCode = String(employeeValue ?? '').trim().toUpperCase();
    const shiftCode = String(shiftValue ?? '').trim().toUpperCase();
    const workDate = excelDate(dateValue);
    const repeatWeekly = parseRepeat(repeatValue);
    const endDate = String(endDateValue ?? '').trim() ? excelDate(endDateValue) : null;
    const rowNumber = index + 2;
    const partial = { rowNumber, employeeCode, shiftCode, ...(workDate ? { workDate } : {}) };
    const messages: string[] = [];
    if (!employeeCode) messages.push('Thiếu mã nhân viên');
    if (!shiftCode) messages.push('Thiếu mã ca làm');
    if (!workDate) messages.push('Ngày làm việc không hợp lệ');
    if (repeatWeekly === null) messages.push('Giá trị lặp hàng tuần không hợp lệ');
    if (repeatWeekly === true && String(endDateValue ?? '').trim() && !endDate) messages.push('Ngày kết thúc không hợp lệ');
    if (repeatWeekly === false && String(endDateValue ?? '').trim()) messages.push('Lịch một lần không nhận ngày kết thúc');
    if (workDate && repeatWeekly !== null) {
      const weekday = new Date(`${workDate}T00:00:00.000Z`).getUTCDay();
      try {
        validateScheduleRule({
          recurrenceType: repeatWeekly ? 'WEEKLY' : 'ONCE', startDate: workDate,
          endDate,
          dayOfWeek: repeatWeekly ? (weekday === 0 ? 7 : weekday) : null
        });
      } catch (error) { if (error instanceof ScheduleDomainError) messages.push(error.message); else throw error; }
    }
    if (messages.length) errors.push({ ...partial, error: messages.join('; ') });
    else candidates.push({ rowNumber, employeeCode, shiftCode, workDate: workDate!, repeatWeekly: repeatWeekly!, endDate: repeatWeekly ? endDate : null });
  });
  if (nonEmptyRows > MAX_ROWS) throw ApiError.badRequest('Tối đa 1000 dòng lịch mỗi lần nhập', {}, 'SCHEDULE_IMPORT_ROW_LIMIT');
  return { candidates, errors, totalRows: nonEmptyRows };
}

function asScheduleRule(rule: {
  id: number; employeeId: number; shiftId: number; recurrenceType: 'ONCE' | 'WEEKLY'; startDate: Date; endDate: Date | null; dayOfWeek: number | null; cancelledAt: Date | null;
  shift: { code: string; name: string; startMinute: number; endMinute: number };
  exceptions: Array<{ workDate: Date; type: 'CANCELLED' }>;
}): ScheduleRule {
  return {
    id: rule.id, employeeId: rule.employeeId, shiftId: rule.shiftId, recurrenceType: rule.recurrenceType,
    startDate: dateText(rule.startDate), endDate: rule.endDate ? dateText(rule.endDate) : null, dayOfWeek: rule.dayOfWeek,
    cancelledAt: rule.cancelledAt?.toISOString() ?? null, shift: rule.shift,
    exceptions: rule.exceptions.map(exception => ({ workDate: dateText(exception.workDate), type: exception.type }))
  };
}

function ruleError(conflictCode: string) {
  return conflictCode === 'SCHEDULE_DUPLICATE' ? 'Lịch bị trùng với lịch hiện có hoặc dòng khác trong file' : 'Ca làm bị chồng giờ với lịch hiện có hoặc dòng khác trong file';
}

export class EmployeeScheduleTransferService {
  static template() {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[...importHeaders]]), 'Lich_lam_viec');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  static async preview(fileName: string, fileBase64: string) {
    const parsed = parseRows(readRows(fileName, fileBase64));
    const employeeCodes = [...new Set(parsed.candidates.map(row => row.employeeCode))];
    const shiftCodes = [...new Set(parsed.candidates.map(row => row.shiftCode))];
    const [employees, shifts] = await Promise.all([
      prisma.employee.findMany({ where: { code: { in: employeeCodes } }, select: { id: true, code: true, name: true, status: true, startDate: true, endDate: true, scheduleRules: {
        where: { branch: { code: 'MAIN' } },
        include: { shift: { select: { code: true, name: true, startMinute: true, endMinute: true } }, exceptions: { select: { workDate: true, type: true } } }
      } } }),
      prisma.workShift.findMany({ where: { code: { in: shiftCodes } }, select: { id: true, code: true, name: true, startMinute: true, endMinute: true, isActive: true } })
    ]);
    const employeeByCode = new Map(employees.map(employee => [employee.code.toUpperCase(), employee]));
    const shiftByCode = new Map(shifts.map(shift => [shift.code.toUpperCase(), shift]));
    const acceptedRules: ScheduleRule[] = [];
    const acceptedRows: ImportRow[] = [];
    const errorRows = [...parsed.errors];
    for (const row of parsed.candidates) {
      const employee = employeeByCode.get(row.employeeCode);
      const shift = shiftByCode.get(row.shiftCode);
      if (!employee) { errorRows.push({ ...row, error: 'Mã nhân viên không tồn tại' }); continue; }
      if (employee.status !== 'WORKING') { errorRows.push({ ...row, error: 'Nhân viên không còn làm việc' }); continue; }
      if (!shift) { errorRows.push({ ...row, error: 'Mã ca làm không tồn tại' }); continue; }
      if (!shift.isActive) { errorRows.push({ ...row, error: 'Ca làm đã ngừng hoạt động' }); continue; }
      if ((employee.startDate && new Date(`${row.workDate}T00:00:00.000Z`) < employee.startDate)
        || (employee.endDate && new Date(`${row.workDate}T00:00:00.000Z`) > employee.endDate)
        || (employee.endDate && row.repeatWeekly && (!row.endDate || row.endDate > dateText(employee.endDate)))) {
        errorRows.push({ ...row, error: 'Ngày lịch không nằm trong thời gian làm việc của nhân viên' }); continue;
      }
      const weekday = new Date(`${row.workDate}T00:00:00.000Z`).getUTCDay();
      const candidate: ScheduleRule = {
        id: -(acceptedRules.length + 1), employeeId: employee.id, shiftId: shift.id,
        recurrenceType: row.repeatWeekly ? 'WEEKLY' : 'ONCE', startDate: row.workDate,
        endDate: row.repeatWeekly ? row.endDate : null, dayOfWeek: row.repeatWeekly ? (weekday === 0 ? 7 : weekday) : null,
        cancelledAt: null, shift: { code: shift.code, name: shift.name, startMinute: shift.startMinute, endMinute: shift.endMinute }, exceptions: []
      };
      const existingRules = employee.scheduleRules.map(asScheduleRule);
      const conflict = findRuleConflict(candidate, [...existingRules, ...acceptedRules.filter(rule => rule.employeeId === employee.id)]);
      if (conflict) { errorRows.push({ ...row, error: ruleError(conflict.code) }); continue; }
      acceptedRows.push(row);
      acceptedRules.push(candidate);
    }
    errorRows.sort((left, right) => (left.rowNumber ?? 0) - (right.rowNumber ?? 0));
    const validRows = acceptedRows.map(({ rowNumber, employeeCode, shiftCode, workDate, repeatWeekly, endDate }) => ({ rowNumber, employeeCode, shiftCode, workDate, repeatWeekly, endDate }));
    return { fileName, totalRows: parsed.totalRows, validRows, errorRows, canCommit: validRows.length > 0 && errorRows.length === 0 };
  }

  static async commit(rows: ImportRow[], actor: { id: number; name: string }) {
    return EmployeeSchedulesService.importBatch(rows, actor);
  }

  static async export(weekStart: string, format: 'csv' | 'xlsx') {
    const weekEnd = new Date(`${weekStart}T00:00:00.000Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndText = dateText(weekEnd);
    let page = 1;
    let totalPages = 1;
    const rows: Array<Array<string | number | boolean>> = [[...exportHeaders]];
    do {
      const result = await EmployeeSchedulesService.getWeek({ weekStart, page, pageSize: 100 });
      for (const employee of result.employees) {
        for (const occurrence of employee.occurrences) {
          if (occurrence.workDate < weekStart || occurrence.workDate > weekEndText) continue;
          rows.push([employee.code, employee.name, occurrence.shiftCode, occurrence.shiftName, occurrence.workDate, minuteText(occurrence.startMinute), minuteText(occurrence.endMinute), occurrence.recurrenceType === 'WEEKLY']);
        }
      }
      totalPages = result.pagination.totalPages;
      page += 1;
    } while (page <= totalPages);
    if (format === 'csv') return Buffer.from(`\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Lich_lam_viec');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
