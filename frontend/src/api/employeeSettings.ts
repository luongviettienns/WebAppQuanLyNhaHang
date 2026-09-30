import { getApiBaseUrl } from './config';
import type { ApiErrorResponse, ErrorCode } from './contracts';

export type EmployeeSettingsArea = 'attendance' | 'payroll' | 'workweek' | 'holiday';
export type EmployeeSettingsDestination = 'employee-directory' | 'employee-settings-attendance' | 'employee-attendance' | 'employee-payroll';

export interface AttendancePolicyDto {
  id: number; branchId: number; effectiveFrom: string; revision: number; attendanceMode: 'SHIFT';
  standardDayMinutes: number; lateThresholdMinutes: number; earlyLeaveThresholdMinutes: number;
  allowUnscheduledAttendance: boolean; createdAt: string;
}
export interface PayrollPolicyDto {
  id: number; branchId: number; effectiveFrom: string; revision: number; frequency: 'MONTHLY';
  periodStartDay: 1; hourlyCalculationSource: 'ACTUAL_ATTENDANCE'; createdAt: string;
}
export interface WorkweekPolicyDto {
  id: number; branchId: number; effectiveFrom: string; revision: number;
  monday: boolean; tuesday: boolean; wednesday: boolean; thursday: boolean;
  friday: boolean; saturday: boolean; sunday: boolean; createdAt: string;
}
export interface EmployeeHolidayDto {
  id: number; branchId: number; name: string; startDate: string; endDate: string; note: string | null;
  revision: number; archivedAt: string | null; archivedByUserId?: number | null;
}
export interface EmployeeSettingsCapabilities {
  mobileAttendance: boolean; automaticAttendance: boolean; continuousShiftPunch: boolean;
  hourToDayConversion: boolean; automaticOvertime: boolean; scheduledHoursPayroll: boolean;
  automaticPayrollCreation: boolean; automaticPayrollRefresh: boolean; salaryTemplates: boolean;
  tax: boolean; insurance: boolean; hardwareTimeclock: boolean; zaloMiniApp: boolean;
}
export interface EmployeeSettingsChecklistStepDto {
  key: string; destination: EmployeeSettingsDestination; completed: boolean; count: number; total?: number;
}
export interface EmployeeSettingsWorkspaceDto {
  branch: { id: number; code: string; name: string };
  businessDate: string;
  revisions: Record<EmployeeSettingsArea, number>;
  effectivePolicies: { attendance: AttendancePolicyDto | null; payroll: PayrollPolicyDto | null; workweek: WorkweekPolicyDto | null };
  history: { attendance: AttendancePolicyDto[]; payroll: PayrollPolicyDto[]; workweek: WorkweekPolicyDto[] };
  holidays: EmployeeHolidayDto[];
  checklist: { completedCount: number; totalCount: number; steps: EmployeeSettingsChecklistStepDto[] };
  capabilities: EmployeeSettingsCapabilities;
}

export interface AttendancePolicyCreateInput {
  branchId: number; effectiveFrom: string; expectedAreaRevision: number; attendanceMode: 'SHIFT';
  standardDayMinutes: number; lateThresholdMinutes: number; earlyLeaveThresholdMinutes: number; allowUnscheduledAttendance: boolean;
}
export interface PayrollPolicyCreateInput {
  branchId: number; effectiveFrom: string; expectedAreaRevision: number; frequency: 'MONTHLY'; periodStartDay: 1;
  hourlyCalculationSource: 'ACTUAL_ATTENDANCE';
}
export interface WorkweekPolicyCreateInput {
  branchId: number; effectiveFrom: string; expectedAreaRevision: number; monday: boolean; tuesday: boolean;
  wednesday: boolean; thursday: boolean; friday: boolean; saturday: boolean; sunday: boolean;
}
export interface HolidayCreateInput {
  branchId: number; expectedHolidayRevision: number; name: string; startDate: string; endDate: string; note?: string | null;
}
export interface HolidayUpdateInput {
  branchId: number; expectedHolidayRevision: number; expectedRowRevision: number; name?: string;
  startDate?: string; endDate?: string; note?: string | null; reason?: string;
}
export interface HolidayArchiveInput {
  branchId: number; expectedHolidayRevision: number; expectedRowRevision: number; reason: string;
}
export interface HolidayListQuery { branchId: number; from?: string; to?: string; includeArchived?: boolean }

export class EmployeeSettingsApiError extends Error {
  constructor(message: string, readonly code: ErrorCode, readonly status: number, readonly details?: Record<string, unknown>) {
    super(message); this.name = 'EmployeeSettingsApiError'; Object.setPrototypeOf(this, new.target.prototype);
  }
}

const headers = (token: string | null, json = false): Record<string, string> => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'boolean') params.set(key, String(value));
    else if ((typeof value === 'string' || typeof value === 'number') && value !== '') params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

async function fail(response: Response): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new EmployeeSettingsApiError(
    payload?.error?.message || `Không thể xử lý thiết lập nhân viên (${response.status})`,
    payload?.error?.code || 'VALIDATION_ERROR',
    response.status,
    payload?.error?.details
  );
}

async function request<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/api/employee-settings${path}`, {
    method,
    headers: headers(token, body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) await fail(response);
  return (await response.json() as { data: T }).data;
}

export const fetchEmployeeSettingsApi = (token: string | null, branchId: number) =>
  request<EmployeeSettingsWorkspaceDto>(token, queryString({ branchId }));
export const fetchEmployeeHolidaysApi = (token: string | null, query: HolidayListQuery) =>
  request<{ holidays: EmployeeHolidayDto[] }>(token, `/holidays${queryString(query as unknown as Record<string, unknown>)}`).then(result => result.holidays);
export const createAttendancePolicyApi = (token: string | null, input: AttendancePolicyCreateInput) =>
  request<{ policy: AttendancePolicyDto }>(token, '/attendance-policies', 'POST', input).then(result => result.policy);
export const createPayrollPolicyApi = (token: string | null, input: PayrollPolicyCreateInput) =>
  request<{ policy: PayrollPolicyDto }>(token, '/payroll-policies', 'POST', input).then(result => result.policy);
export const createWorkweekPolicyApi = (token: string | null, input: WorkweekPolicyCreateInput) =>
  request<{ policy: WorkweekPolicyDto }>(token, '/workweek-policies', 'POST', input).then(result => result.policy);
export const createEmployeeHolidayApi = (token: string | null, input: HolidayCreateInput) =>
  request<{ holiday: EmployeeHolidayDto; collectionRevision: number }>(token, '/holidays', 'POST', input);
export const updateEmployeeHolidayApi = (token: string | null, holidayId: number, input: HolidayUpdateInput) =>
  request<{ holiday: EmployeeHolidayDto; collectionRevision: number }>(token, `/holidays/${holidayId}`, 'PATCH', input);
export const archiveEmployeeHolidayApi = (token: string | null, holidayId: number, input: HolidayArchiveInput) =>
  request<{ holiday: EmployeeHolidayDto; collectionRevision: number }>(token, `/holidays/${holidayId}/archive`, 'POST', input);
