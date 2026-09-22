import { getApiBaseUrl } from './config';
import { ApiErrorResponse, SupplierDto, SupplierListDataDto } from './contracts';

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(token?: string | null): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders(token) };
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || `${fallback} (${response.status})`);
}

export interface SupplierListFilter {
  search?: string;
  isActive?: 'true' | 'false' | 'all';
  page?: number;
  pageSize?: number;
  groupId?: number;
  from?: string;
  to?: string;
  minPurchase?: number;
  maxPurchase?: number;
  minDebt?: number;
  maxDebt?: number;
  ids?: number[];
}

export interface SupplierInput {
  code?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxCode?: string | null;
  note?: string | null;
  identityNumber?: string | null;
  province?: string | null;
  district?: string | null;
  ward?: string | null;
  companyName?: string | null;
  groupId?: number | null;
}

export interface SupplierGroupDto { id: number; name: string }
export interface SupplierImportPreview {
  fileName: string;
  totalRows: number;
  validRows: Array<{ rowNumber: number; data: SupplierInput }>;
  errorRows: Array<{ rowNumber: number; name: string; error: string }>;
}
export interface SupplierReceiptHistory {
  items: Array<{ id: number; receiptCode: string; receivedAt: string; status: 'DRAFT' | 'POSTED' | 'CANCELLED'; payableAmount: number; paidAmount: number }>;
  pagination: SupplierListDataDto['pagination'];
}

function filterQuery(filter: SupplierListFilter) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
    const text = typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.join(',') : String(value);
    if (text) params.set(key, text);
  }
  return params.toString();
}

export async function fetchSuppliersApi(
  token: string | null,
  filter: SupplierListFilter = {}
): Promise<SupplierListDataDto> {
  const query = filterQuery(filter);
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/suppliers${query ? `?${query}` : ''}`, {
    headers: authHeaders(token)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi tải nhà cung cấp');
  return (await response.json() as { data: SupplierListDataDto }).data;
}

async function supplierRequest<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/' + path, {
    method, headers: jsonHeaders(token), ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) await throwApiError(response, 'Không thể xử lý nhà cung cấp');
  return (await response.json() as { data: T }).data;
}
export const fetchSupplierGroupsApi = (token: string | null) => supplierRequest<SupplierGroupDto[]>(token, 'supplier-groups');
export const saveSupplierGroupApi = (token: string | null, id: number | null, name: string) => supplierRequest<SupplierGroupDto>(token, 'supplier-groups' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', { name });
export const fetchSupplierDetailApi = (token: string | null, id: number) => supplierRequest<SupplierDto>(token, 'suppliers/' + id);
export const fetchSupplierReceiptsApi = (token: string | null, id: number, page = 1) => supplierRequest<SupplierReceiptHistory>(token, 'suppliers/' + id + '/receipts?page=' + page + '&pageSize=10');
export const previewSupplierImportApi = (token: string | null, fileName: string, fileBase64: string) => supplierRequest<SupplierImportPreview>(token, 'suppliers/import/preview', 'POST', { fileName, fileBase64 });
export const commitSupplierImportApi = (token: string | null, rows: SupplierInput[]) => supplierRequest<{ createdCount: number }>(token, 'suppliers/import/commit', 'POST', { rows });
export async function downloadSuppliersApi(token: string | null, filter: SupplierListFilter = {}, format: 'csv' | 'xlsx' = 'xlsx', template = false) {
  const path = template ? 'suppliers/import/template' : 'suppliers/export?' + filterQuery(filter) + '&format=' + format;
  const response = await fetch(getApiBaseUrl() + '/api/inventory/' + path, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Không thể tải file nhà cung cấp');
  return response.blob();
}

export async function createSupplierApi(token: string | null, input: SupplierInput): Promise<SupplierDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/suppliers`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(input)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi tạo nhà cung cấp');
  return (await response.json() as { data: SupplierDto }).data;
}

export async function updateSupplierApi(
  token: string | null,
  id: number,
  input: Partial<Omit<SupplierInput, 'code'>> & { isActive?: boolean }
): Promise<SupplierDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/suppliers/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(input)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi cập nhật nhà cung cấp');
  return (await response.json() as { data: SupplierDto }).data;
}
