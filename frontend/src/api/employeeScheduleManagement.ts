import { getApiBaseUrl } from './config';
import type { ApiErrorResponse, ErrorCode } from './contracts';

export type ScheduleRecurrenceType = 'ONCE' | 'WEEKLY';
export type ScheduleConflictCode = 'SCHEDULE_DUPLICATE' | 'SCHEDULE_OVERLAP';
export type ScheduleApiErrorCode = Extract<ErrorCode,
  | 'EMPLOYEE_NOT_FOUND' | 'EMPLOYEE_NOT_WORKING' | 'SHIFT_NOT_FOUND' | 'SHIFT_INACTIVE'
  | 'SCHEDULE_DATE_INVALID' | 'SCHEDULE_TIME_INVALID' | 'SCHEDULE_RECURRENCE_INVALID'
  | 'SCHEDULE_DUPLICATE' | 'SCHEDULE_OVERLAP' | 'SCHEDULE_IMPORT_FILE_INVALID'
  | 'SCHEDULE_IMPORT_FILE_TOO_LARGE' | 'SCHEDULE_IMPORT_FORMULA_NOT_ALLOWED'
  | 'SCHEDULE_IMPORT_ROW_LIMIT' | 'SCHEDULE_IMPORT_HEADERS_INVALID'
  | 'SCHEDULE_IMPORT_ROWS_INVALID' | 'SCHEDULE_IMPORT_EMPTY'
  | 'SCHEDULE_CALENDAR_CONFIRMATION_REQUIRED' | 'IDEMPOTENCY_KEY_REUSED'
>;
export type ScheduleEmployeeStatus = 'WORKING' | 'RESIGNED';
export type ScheduleCompensationStatus = 'ESTIMATED' | 'MONTHLY_NOT_ESTIMATED' | 'COMPENSATION_NOT_CONFIGURED';
export type ScheduleShiftDto = { id: number; code: string; name: string; startMinute: number; endMinute: number; isActive: boolean; createdAt?: string; updatedAt?: string };
export type ScheduleOccurrenceDto = {
  ruleId: number; employeeId: number; shiftId: number; recurrenceType: ScheduleRecurrenceType;
  workDate: string; ruleStartDate: string; ruleEndDate: string | null; dayOfWeek: number | null;
  shiftCode: string; shiftName: string; startMinute: number; endMinute: number;
};
export type ScheduleWeekEmployeeDto = {
  id: number; code: string; name: string; status: ScheduleEmployeeStatus;
  department: { id: number; name: string } | null; jobTitle: { id: number; name: string } | null;
  occurrences: ScheduleOccurrenceDto[];
  compensation: { amount: number | null; status: ScheduleCompensationStatus };
};
export type EmployeeScheduleWeekDto = {
  weekStart: string; weekEnd: string; employees: ScheduleWeekEmployeeDto[];
  calendarDays: ScheduleCalendarDayDto[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
};
export type ScheduleCalendarDayDto = {
  date: string; weekday: number; isWorkingDay: boolean; workweekPolicyVersionId: number; workweekRevision: number;
  holidays: Array<{ id: number; revision: number; name: string }>;
};
export type ScheduleCalendarWarningDto = {
  kind: 'NON_WORKING_DAY' | 'HOLIDAY'; firstAffectedDate: string; affectedCount: number | null;
  sampleDates: string[]; unbounded: boolean;
  source: { type: 'WORKWEEK_POLICY'; id: number; revision: number } | { type: 'HOLIDAY'; id: number; revision: number; name: string };
};
export type EmployeeScheduleWeekQuery = { weekStart: string; search?: string; departmentId?: number; page?: number; pageSize?: number };
export type CreateEmployeeScheduleBatchInput = {
  employeeIds: number[]; shiftIds: number[]; startDate: string; repeatWeekly: boolean; endDate?: string | null; calendarWarningAcknowledged?: boolean;
};
export type ScheduleMutationInput = { workDate: string; scope: 'occurrence' | 'following'; shiftIds: number[] };
export type ScheduleDeleteInput = { workDate: string; scope: 'occurrence' | 'following' };
export type ScheduleRuleMutationResultDto = { id: number; shiftId: number; recurrenceType: ScheduleRecurrenceType };
export type ScheduleMutationResultDto = { updated: true; createdCount: number; rules: ScheduleRuleMutationResultDto[] };
export type ScheduleDeleteResultDto = { deleted: true };
export type CreateScheduleBatchResultDto = {
  createdCount: number;
  rules: Array<{ id: number; employeeId: number; shiftId: number; recurrenceType: ScheduleRecurrenceType; startDate: string; endDate: string | null; dayOfWeek: number | null }>;
};
export type ScheduleImportRowDto = { rowNumber: number; employeeCode: string; shiftCode: string; workDate: string; repeatWeekly: boolean; endDate: string | null; calendarWarnings?: ScheduleCalendarWarningDto[] };
export type ScheduleImportErrorRowDto = Partial<ScheduleImportRowDto> & { error: string };
export type ScheduleImportPreviewDto = {
  fileName: string; totalRows: number; validRows: ScheduleImportRowDto[]; errorRows: ScheduleImportErrorRowDto[];
  warningRows?: ScheduleImportRowDto[]; canCommit: boolean;
};
export type ScheduleImportCommitDto = { createdCount: number; rules: CreateScheduleBatchResultDto['rules'] };
export type ScheduleExportFormat = 'csv' | 'xlsx';

export class ScheduleApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: ErrorCode, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ScheduleApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const authHeaders = (token: string | null, json = false, idempotencyKey?: string): Record<string, string> => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
});

async function fail(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new ScheduleApiError(
    body?.error?.message || `${fallback} (${response.status})`,
    body?.error?.code || 'VALIDATION_ERROR', response.status, body?.error?.details
  );
}

async function request<T>(token: string | null, path: string, method = 'GET', body?: unknown, idempotencyKey?: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/api/employee-schedules${path}`, {
    method, headers: authHeaders(token, body !== undefined, idempotencyKey), ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) await fail(response, 'Không thể xử lý lịch làm việc');
  return (await response.json() as { data: T }).data;
}

function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export const fetchEmployeeScheduleWeekApi = (token: string | null, filter: EmployeeScheduleWeekQuery) =>
  request<EmployeeScheduleWeekDto>(token, `/week?${query(filter)}`);
export const fetchEmployeeScheduleShiftsApi = async (token: string | null) =>
  (await request<{ shifts: ScheduleShiftDto[] }>(token, '/shifts')).shifts;
export const createWorkShiftApi = (token: string | null, input: Omit<ScheduleShiftDto, 'id' | 'isActive' | 'createdAt' | 'updatedAt'>) =>
  request<ScheduleShiftDto>(token, '/shifts', 'POST', input);
export const createEmployeeScheduleBatchApi = (token: string | null, input: CreateEmployeeScheduleBatchInput, idempotencyKey: string) =>
  request<CreateScheduleBatchResultDto>(token, '', 'POST', input, idempotencyKey);
export const patchEmployeeScheduleRuleApi = (token: string | null, ruleId: number, input: ScheduleMutationInput) =>
  request<ScheduleMutationResultDto>(token, `/${ruleId}`, 'PATCH', input);
export const deleteEmployeeScheduleRuleApi = (token: string | null, ruleId: number, input: ScheduleDeleteInput) =>
  request<ScheduleDeleteResultDto>(token, `/${ruleId}?${query(input)}`, 'DELETE');
export const previewEmployeeScheduleImportApi = (token: string | null, fileName: string, fileBase64: string) =>
  request<ScheduleImportPreviewDto>(token, '/import/preview', 'POST', { fileName, fileBase64 });
export const commitEmployeeScheduleImportApi = (token: string | null, rows: ScheduleImportRowDto[], calendarWarningAcknowledged: boolean, idempotencyKey: string) =>
  request<ScheduleImportCommitDto>(token, '/import/commit', 'POST', { rows, calendarWarningAcknowledged }, idempotencyKey);

export async function downloadEmployeeScheduleExportApi(token: string | null, weekStart: string, format: ScheduleExportFormat = 'xlsx'): Promise<Blob> {
  const response = await fetch(`${getApiBaseUrl()}/api/employee-schedules/export?${query({ weekStart, format })}`, { headers: authHeaders(token) });
  if (!response.ok) await fail(response, 'Không thể xuất lịch làm việc');
  return response.blob();
}

export async function downloadEmployeeScheduleTemplateApi(token: string | null): Promise<Blob> {
  const response = await fetch(`${getApiBaseUrl()}/api/employee-schedules/import/template`, { headers: authHeaders(token) });
  if (!response.ok) await fail(response, 'Không thể tải mẫu lịch làm việc');
  return response.blob();
}
