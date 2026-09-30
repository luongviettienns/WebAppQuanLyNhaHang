import { getApiBaseUrl } from './config';
import type { ApiErrorResponse, ErrorCode } from './contracts';

export type PayrollFrequency = 'MONTHLY';
export type PayrollBatchStatus = 'DRAFT' | 'CALCULATED' | 'FINALIZED' | 'CANCELLED';
export type PayrollCalculationStatus = 'READY' | 'REVIEW_REQUIRED';
export type PayrollPayBasis = 'MONTHLY' | 'HOURLY' | 'PER_SHIFT';
export type PayrollWarningCode =
  | 'COMPENSATION_MISSING' | 'MISSING_CHECK_OUT' | 'ATTENDANCE_NEEDS_REVIEW'
  | 'INVALID_ATTENDANCE_DURATION' | 'UNSCHEDULED_ATTENDANCE' | 'CONFIRMED_ABSENCE';

export interface EmployeePayrollListQuery {
  branchId?: number; search?: string; frequency?: PayrollFrequency; status?: PayrollBatchStatus[];
  periodMonth?: string; page?: number; pageSize?: number;
}
export interface EmployeePayrollListItemDto {
  id: number; code: string; name: string; branchId: number; frequency: PayrollFrequency;
  periodStart: string; periodEnd: string; status: PayrollBatchStatus; employeeCount: number;
  totalGrossAmount: number; totalAdjustmentAmount: number; totalNetAmount: number;
  totalPaidAmount: number; totalRemainingAmount: number; createdAt: string; updatedAt: string;
}
export interface EmployeePayrollListDto {
  items: EmployeePayrollListItemDto[];
  summary: { totalGrossAmount: number; totalAdjustmentAmount: number; totalNetAmount: number; totalPaidAmount: number; totalRemainingAmount: number };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
export interface EmployeePayrollAdjustmentDto {
  id: number; type: 'BONUS' | 'DEDUCTION'; amount: number; reason: string; createdAt: string;
  reversedAt: string | null; reverseReason: string | null; createdBy?: { id: number; name: string }; reversedBy?: { id: number; name: string } | null;
}
export interface EmployeePayrollPaymentDto {
  id: number; amount: number; method: 'CASH' | 'BANK_TRANSFER' | 'OTHER'; status: 'SUCCESS' | 'REVERSED';
  externalReference: string | null; note: string | null; paidAt: string; createdAt?: string;
  reversedAt: string | null; reverseReason: string | null; createdBy?: { id: number; name: string }; reversedBy?: { id: number; name: string } | null;
}
export interface EmployeePayrollLineDto {
  id: number; employeeId: number; employeeCode: string; employeeName: string;
  departmentName: string | null; jobTitleName: string | null; bankName: string | null;
  bankAccountNumber: string | null; bankAccountName: string | null;
  activeCalendarDays: number; periodCalendarDays: number; scheduledShifts: number; completedSessions: number;
  actualMinutes: number; confirmedAbsences: number; missingCheckouts: number; reviewRequiredCount: number;
  grossAmount: number; bonusAmount: number; deductionAmount: number; netAmount: number; paidAmount: number; remainingAmount: number;
  calculationStatus: PayrollCalculationStatus; warningCodes: PayrollWarningCode[]; sourceSnapshot: Record<string, unknown>;
  calculatedAt: string; adjustments: EmployeePayrollAdjustmentDto[]; payments: EmployeePayrollPaymentDto[];
}
export interface EmployeePayrollDetailDto extends Omit<EmployeePayrollListItemDto, 'branchId' | 'employeeCount'> {
  branch: { id: number; code: string; name: string }; version: number; sourceStale: boolean;
  createdBy: { id: number; name: string }; calculatedBy: { id: number; name: string } | null;
  finalizedBy: { id: number; name: string } | null; cancelledBy: { id: number; name: string } | null;
  calculatedAt: string | null; finalizedAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  lines: EmployeePayrollLineDto[];
}
export interface EmployeePayrollMutationDto {
  id: number; code: string; name: string; status: PayrollBatchStatus; periodStart: string; periodEnd: string;
  employeeCount: number; totalGrossAmount: number; totalNetAmount: number; totalRemainingAmount: number; version: number; cancelReason?: string | null;
}
export interface CreateEmployeePayrollInput { branchId: number; month: string; scope: 'ALL' | 'CUSTOM'; employeeIds?: number[] }
export interface PayrollReasonInput { reason: string }
export interface PayrollAdjustmentInput extends PayrollReasonInput { type: 'BONUS' | 'DEDUCTION'; amount: number }
export interface PayrollPaymentInput { amount: number; method: 'CASH' | 'BANK_TRANSFER' | 'OTHER'; externalReference?: string; note?: string; paidAt?: string }

export class EmployeePayrollApiError extends Error {
  constructor(message: string, readonly code: ErrorCode, readonly status: number, readonly details?: Record<string, unknown>) {
    super(message); this.name = 'EmployeePayrollApiError'; Object.setPrototypeOf(this, new.target.prototype);
  }
}

const headers = (token: string | null, json = false, idempotencyKey?: string): Record<string, string> => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
});

function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value) && value.length) params.set(key, value.join(','));
    else if ((typeof value === 'string' || typeof value === 'number') && value !== '') params.set(key, String(value));
  }
  const value = params.toString();
  return value ? `?${value}` : '';
}

async function fail(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new EmployeePayrollApiError(payload?.error?.message || `${fallback} (${response.status})`, payload?.error?.code || 'VALIDATION_ERROR', response.status, payload?.error?.details);
}

async function request<T>(token: string | null, path: string, method = 'GET', body?: unknown, idempotencyKey?: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/api/employee-payrolls${path}`, {
    method, headers: headers(token, body !== undefined, idempotencyKey), ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) await fail(response, 'Không thể xử lý bảng lương');
  return (await response.json() as { data: T }).data;
}

export const fetchEmployeePayrollsApi = (token: string | null, query: EmployeePayrollListQuery = {}) => request<EmployeePayrollListDto>(token, queryString(query as Record<string, unknown>));
export const fetchEmployeePayrollDetailApi = (token: string | null, batchId: number) => request<EmployeePayrollDetailDto>(token, `/${batchId}`);
export const createEmployeePayrollApi = (token: string | null, input: CreateEmployeePayrollInput, key: string) => request<EmployeePayrollMutationDto>(token, '', 'POST', input, key);
export const recalculateEmployeePayrollApi = (token: string | null, batchId: number, key: string) => request<EmployeePayrollMutationDto>(token, `/${batchId}/recalculate`, 'POST', {}, key);
export const finalizeEmployeePayrollApi = (token: string | null, batchId: number, key: string) => request<EmployeePayrollMutationDto>(token, `/${batchId}/finalize`, 'POST', {}, key);
export const cancelEmployeePayrollApi = (token: string | null, batchId: number, input: PayrollReasonInput) => request<EmployeePayrollMutationDto>(token, `/${batchId}/cancel`, 'POST', input);
export const addEmployeePayrollAdjustmentApi = (token: string | null, batchId: number, lineId: number, input: PayrollAdjustmentInput) => request<EmployeePayrollAdjustmentDto>(token, `/${batchId}/lines/${lineId}/adjustments`, 'POST', input);
export const reverseEmployeePayrollAdjustmentApi = (token: string | null, batchId: number, lineId: number, adjustmentId: number, input: PayrollReasonInput) => request<EmployeePayrollAdjustmentDto>(token, `/${batchId}/lines/${lineId}/adjustments/${adjustmentId}/reverse`, 'POST', input);
export const recordEmployeePayrollPaymentApi = (token: string | null, batchId: number, lineId: number, input: PayrollPaymentInput, key: string) => request<EmployeePayrollPaymentDto>(token, `/${batchId}/lines/${lineId}/payments`, 'POST', input, key);
export const reverseEmployeePayrollPaymentApi = (token: string | null, batchId: number, lineId: number, paymentId: number, input: PayrollReasonInput, key: string) => request<EmployeePayrollPaymentDto>(token, `/${batchId}/lines/${lineId}/payments/${paymentId}/reverse`, 'POST', input, key);

export async function downloadEmployeePayrollApi(token: string | null, batchId: number, format: 'csv' | 'xlsx') {
  const response = await fetch(`${getApiBaseUrl()}/api/employee-payrolls/${batchId}/export?format=${format}`, { headers: headers(token) });
  if (!response.ok) await fail(response, 'Không thể xuất bảng lương');
  return response.blob();
}
