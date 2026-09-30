import { getApiBaseUrl } from './config';
import type { ApiErrorResponse, ErrorCode } from './contracts';

export type AttendanceView = 'shift' | 'employee';
export type AttendanceExceptionState = 'OPEN' | 'RESOLVED';
export type AttendanceSessionStatus = 'OPEN' | 'COMPLETED' | 'MISSING_CHECK_OUT';
export type AttendanceLinkStatus = 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW';
export type AttendanceTiming = 'EARLY' | 'ON_TIME' | 'LATE' | 'N/A';
export type AttendanceCheckoutTiming = 'LEFT_EARLY' | 'ON_TIME' | 'AFTER_SHIFT' | 'N/A';

export interface AttendanceClassificationDto {
  sessionStatus: AttendanceSessionStatus;
  linkStatus: AttendanceLinkStatus;
  checkInTiming: AttendanceTiming;
  checkInAfterShiftEnd: boolean | null;
  checkInDeltaMinutes: number | null;
  checkOutTiming: AttendanceCheckoutTiming;
  checkOutDeltaMinutes: number | null;
  checkInAt: string;
  checkOutAt: string | null;
}

export interface AttendanceWeekEmployeeDto {
  id: number; code: string; name: string; departmentName: string | null; jobTitleName: string | null;
}

export interface AttendanceWeekSessionDto {
  id: number; checkInAt: string; checkOutAt: string | null; linkStatus: AttendanceLinkStatus;
  plannedShiftName: string | null; plannedStartMinute: number | null; plannedEndMinute: number | null;
  classification: AttendanceClassificationDto;
}

export interface AttendanceWeekRowDto {
  id: string; kind: 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW'; workDate: string;
  scheduleRuleId: number | null; scheduleDate: string | null;
  employee: AttendanceWeekEmployeeDto;
  shift: { name: string; plannedStartMinute: number; plannedEndMinute: number } | null;
  occurrenceStatus: 'NOT_CLOCKED' | 'ABSENT' | 'ATTENDED'; reviewConflict: boolean;
  disposition: { id: number; type: 'ABSENT'; reason: string; createdAt: string } | null;
  classification: AttendanceClassificationDto | null; sessions: AttendanceWeekSessionDto[];
}

export interface AttendanceWeekDto {
  branch: { id: number; code: string }; weekStart: string; weekEnd: string; view: AttendanceView;
  rows: AttendanceWeekRowDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AttendanceExceptionRowDto extends AttendanceWeekRowDto {
  exceptionType: 'NOT_CLOCKED' | 'MISSING_CHECK_OUT' | 'REVIEW_CONFLICT' | 'ABSENT_CONFIRMED';
  status: AttendanceExceptionState;
}

export interface AttendanceExceptionQuery {
  weekStart: string; branchId: number; status?: AttendanceExceptionState; search?: string;
  employeeId?: number; page?: number; pageSize?: number;
}

export interface AttendanceExceptionListDto {
  branch: { id: number; code: string }; weekStart: string; weekEnd: string; status: AttendanceExceptionState;
  rows: AttendanceExceptionRowDto[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AttendanceWeekQuery {
  weekStart: string; branchId: number; view?: AttendanceView; search?: string;
  employeeId?: number; page?: number; pageSize?: number;
}

export interface KioskSessionDto {
  id: number; branchId: number; branchCode: string; deviceName: string | null;
  createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null;
}

export interface CreatedKioskSessionDto { session: KioskSessionDto; secret: string }
export interface CreateKioskSessionInput { branchId: number; expiresInMinutes: number; deviceName?: string }
export interface ManualAttendanceSessionInput {
  employeeId: number; branchId: number; checkInAt: string; checkOutAt?: string;
  scheduleRuleId?: number; scheduleDate?: string; reason: string;
}
export interface AttendanceSessionUpdateInput {
  checkInAt?: string; checkOutAt?: string; scheduleRuleId?: number | null; scheduleDate?: string | null; reason: string;
}
export interface AttendanceReasonInput { reason: string }
export interface MarkAttendanceAbsentInput extends AttendanceReasonInput { branchId: number }

export class AttendanceApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: ErrorCode, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AttendanceApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const headers = (token: string | null, json = false): Record<string, string> => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

function toQuery(values: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if ((typeof value === 'string' || typeof value === 'number') && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

async function fail(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new AttendanceApiError(
    body?.error?.message || `${fallback} (${response.status})`,
    body?.error?.code || 'VALIDATION_ERROR', response.status, body?.error?.details
  );
}

async function request<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/api/employee-attendance${path}`, {
    method, headers: headers(token, body !== undefined), ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) await fail(response, 'Không thể xử lý chấm công');
  return (await response.json() as { data: T }).data;
}

export const fetchAttendanceWeekApi = (token: string | null, query: AttendanceWeekQuery) =>
  request<AttendanceWeekDto>(token, `/week?${toQuery(query)}`);

export const fetchAttendanceExceptionsApi = (token: string | null, query: AttendanceExceptionQuery) =>
  request<AttendanceExceptionListDto>(token, `/exceptions?${toQuery(query)}`);

export const fetchAttendanceKioskSessionsApi = async (token: string | null, branchId: number) =>
  (await request<{ sessions: KioskSessionDto[] }>(token, `/kiosk-sessions?${toQuery({ branchId })}`)).sessions;

export const createAttendanceKioskSessionApi = (token: string | null, input: CreateKioskSessionInput) =>
  request<CreatedKioskSessionDto>(token, '/kiosk-sessions', 'POST', input);

export const revokeAttendanceKioskSessionApi = (token: string | null, sessionId: number) =>
  request<{ session: KioskSessionDto }>(token, `/kiosk-sessions/${sessionId}/revoke`, 'POST');

export const createManualAttendanceSessionApi = (token: string | null, input: ManualAttendanceSessionInput) =>
  request<AttendanceWeekSessionDto>(token, '/sessions/manual', 'POST', input);

export const updateAttendanceSessionApi = (token: string | null, sessionId: number, input: AttendanceSessionUpdateInput) =>
  request<AttendanceWeekSessionDto>(token, `/sessions/${sessionId}`, 'PATCH', input);

export const markAttendanceAbsentApi = (token: string | null, scheduleRuleId: number, workDate: string, input: MarkAttendanceAbsentInput) =>
  request<unknown>(token, `/occurrences/${scheduleRuleId}/${encodeURIComponent(workDate)}/absent`, 'POST', input);

export const resolveAttendanceAbsenceConflictApi = (token: string | null, dispositionId: number, input: AttendanceReasonInput) =>
  request<unknown>(token, `/dispositions/${dispositionId}/resolve-conflict`, 'POST', input);
