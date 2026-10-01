import { getApiBaseUrl } from './config';

export type CommissionWorkspaceMode = 'ITEM' | 'EMPLOYEE';
export type CommissionPlanStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type CommissionRuleType = 'FIXED_PER_UNIT' | 'PERCENT_NET_REVENUE' | 'PERCENT_GROSS_PROFIT';

export interface CommissionRuleDto {
  id: number; planId: number; revision: number; type: CommissionRuleType;
  fixedAmount: number | null; rateBps: number | null; effectiveFrom: string; effectiveTo: string | null;
}
export interface CommissionPlanDto {
  id: number; branchId?: number; code: string; name: string; status: CommissionPlanStatus;
  effectiveFrom: string; effectiveTo: string | null; revision: number;
}
export interface CommissionItemRowDto {
  id: number; sku: string; name: string; basePrice: number; categoryId: number; categoryName: string;
  rules: Record<string, CommissionRuleDto>;
}
export interface CommissionEmployeeRowDto {
  id: number; code: string; name: string; status: string; departmentName: string | null;
  assignments: Array<{ id: number; planId: number; effectiveFrom: string; effectiveTo: string | null; autoAssignOwnPos: boolean }>;
}
export interface EmployeeCommissionWorkspaceDto {
  mode: CommissionWorkspaceMode; plans: CommissionPlanDto[];
  rows: Array<CommissionItemRowDto | CommissionEmployeeRowDto>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  issues: { openCount: number }; ledger: { total: number };
}
export interface CommissionWorkspaceQuery {
  branchId?: number; mode?: CommissionWorkspaceMode; search?: string; categoryId?: number;
  planIds?: number[]; page?: number; pageSize?: number;
}
export interface CommissionAssigneeDto { id: number; code: string; name: string }
export interface CommissionAssigneesDto { assignees: CommissionAssigneeDto[]; safeDefaultEmployeeId: number | null }
export type CommissionIssueType = 'UNASSIGNED_EMPLOYEE' | 'PLAN_MISSING' | 'PLAN_CONFLICT' | 'RULE_MISSING' | 'RULE_CONFLICT' | 'COST_MISSING' | 'LEDGER_CONFLICT';
export interface CommissionIssueDto {
  id: number; orderItemId: number; saleBasisId: number; type: CommissionIssueType; status: 'OPEN' | 'RESOLVED';
  diagnostic?: Record<string, unknown> | null; firstDetectedAt?: string; lastDetectedAt?: string;
}
export interface CommissionLedgerAllocationDto {
  id: number; type: 'RESERVED' | 'FINALIZED' | 'RELEASED'; allocatedAmount: number;
  payrollBatch: { id: number; code: string; status: string };
}
export interface CommissionLedgerRowDto {
  id: number; orderItemId: number; employeeId: number; type: string; commissionAmountDelta: number;
  accountingDate: string; employeeSnapshot: { id?: number; code?: string; name?: string };
  itemSnapshot: { id?: number; sku?: string; name?: string }; allocations: CommissionLedgerAllocationDto[];
}
export interface CommissionPlanInput { branchId: number; code: string; name: string; effectiveFrom: string; effectiveTo?: string | null }
export interface CommissionRuleInput { menuItemId: number; type: CommissionRuleType; fixedAmount?: number | null; rateBps?: number | null; effectiveFrom: string }
export interface CommissionEmployeeAssignmentInput { employeeId: number; effectiveFrom: string; effectiveTo?: string | null; autoAssignOwnPos: boolean }
export interface CommissionReassignInput { employeeId: number; reason: string; idempotencyKey: string }
export interface CommissionResolutionInput { type: 'COST_OVERRIDE' | 'RULE_OVERRIDE'; resolution: Record<string, unknown>; reason: string; idempotencyKey: string }

export class EmployeeCommissionApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number, readonly details?: Record<string, unknown>) {
    super(message); this.name = 'EmployeeCommissionApiError'; Object.setPrototypeOf(this, new.target.prototype);
  }
}

function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value) && value.length) params.set(key, value.join(','));
    else if ((typeof value === 'string' || typeof value === 'number') && value !== '') params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : '';
}

async function request<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/api/employee-commissions${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
    throw new EmployeeCommissionApiError(payload?.error?.message || `Không thể xử lý bảng hoa hồng (${response.status})`, payload?.error?.code || 'VALIDATION_ERROR', response.status, payload?.error?.details);
  }
  return (await response.json() as { data: T }).data;
}

export const fetchEmployeeCommissionWorkspaceApi = (token: string | null, query: CommissionWorkspaceQuery = {}) =>
  request<EmployeeCommissionWorkspaceDto>(token, `/workspace${queryString(query as Record<string, unknown>)}`);
export const fetchCommissionAssigneesApi = (token: string | null, branchId = 1) => request<CommissionAssigneesDto>(token, `/assignees?branchId=${branchId}`);
export const fetchCommissionIssuesApi = (token: string | null, query: Record<string, unknown> = {}) => request<{ rows: CommissionIssueDto[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(token, `/issues${queryString(query)}`);
export const fetchCommissionLedgerApi = (token: string | null, query: Record<string, unknown> = {}) => request<{ rows: CommissionLedgerRowDto[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(token, `/ledger${queryString(query)}`);
export const createCommissionPlanApi = (token: string | null, input: CommissionPlanInput) => request<{ plan: CommissionPlanDto }>(token, '/plans', 'POST', input);
export const updateCommissionPlanApi = (token: string | null, planId: number, input: { name: string }) => request<{ plan: CommissionPlanDto }>(token, `/plans/${planId}`, 'PATCH', input);
export const activateCommissionPlanApi = (token: string | null, planId: number) => request<{ plan: CommissionPlanDto }>(token, `/plans/${planId}/activate`, 'POST', {});
export const archiveCommissionPlanApi = (token: string | null, planId: number, reason: string) => request<{ plan: CommissionPlanDto }>(token, `/plans/${planId}/archive`, 'POST', { reason });
export const createCommissionRuleApi = (token: string | null, planId: number, input: CommissionRuleInput) => request<{ rule: CommissionRuleDto }>(token, `/plans/${planId}/rules`, 'POST', input);
export const createCommissionEmployeeAssignmentApi = (token: string | null, planId: number, input: CommissionEmployeeAssignmentInput) => request<{ assignment: unknown }>(token, `/plans/${planId}/employees`, 'POST', input);
export const assignCommissionOrderItemApi = (token: string | null, orderItemId: number, commissionEmployeeId: number | null) => request<{ orderItem: unknown }>(token, `/order-items/${orderItemId}/assignment`, 'PATCH', { commissionEmployeeId });
export const reassignCommissionOrderItemApi = (token: string | null, orderItemId: number, input: CommissionReassignInput) => request<unknown>(token, `/order-items/${orderItemId}/reassign`, 'POST', input);
export const retryCommissionIssueApi = (token: string | null, issueId: number, idempotencyKey: string) => request<unknown>(token, `/issues/${issueId}/retry`, 'POST', { idempotencyKey });
export const resolveCommissionSaleBasisApi = (token: string | null, saleBasisId: number, input: CommissionResolutionInput) => request<unknown>(token, `/sale-bases/${saleBasisId}/resolutions`, 'POST', input);
