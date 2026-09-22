import { getApiBaseUrl } from './config';
import type { ApiErrorResponse, SalesReturnCandidateDataDto, SalesReturnCreateInput, SalesReturnFilter, SalesReturnListDataDto, SalesReturnDto } from './contracts';

function authHeaders(token?: string | null): Record<string, string> { return token ? { Authorization: 'Bearer ' + token } : {}; }
async function throwApiError(response: Response, fallback: string): Promise<never> { const payload = await response.json().catch(() => null) as ApiErrorResponse | null; throw new Error(payload?.error?.message || `${fallback} (${response.status})`); }

export function buildSalesReturnQuery(filter: SalesReturnFilter = {}, includePagination = true): string {
  const params = new URLSearchParams();
  if (filter.search?.trim()) params.set('search', filter.search.trim());
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.statuses?.length) params.set('statuses', filter.statuses.join(','));
  if (filter.tableId) params.set('tableId', String(filter.tableId));
  if (includePagination && filter.page !== undefined) params.set('page', String(filter.page));
  if (includePagination && filter.pageSize !== undefined) params.set('pageSize', String(filter.pageSize));
  const query = params.toString(); return query ? '?' + query : '';
}

export async function fetchSalesReturnsApi(token: string | null, filter: SalesReturnFilter = {}): Promise<SalesReturnListDataDto> {
  const response = await fetch(getApiBaseUrl() + '/api/orders/returns' + buildSalesReturnQuery(filter), { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải danh sách phiếu trả hàng');
  return (await response.json() as { data: SalesReturnListDataDto }).data;
}

export async function fetchSalesReturnCandidatesApi(token: string | null, filter: Omit<SalesReturnFilter, 'statuses' | 'tableId'> = {}): Promise<SalesReturnCandidateDataDto> {
  const response = await fetch(getApiBaseUrl() + '/api/orders/returns/candidates' + buildSalesReturnQuery(filter), { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải hóa đơn được phép trả hàng');
  return (await response.json() as { data: SalesReturnCandidateDataDto }).data;
}

export async function createSalesReturnApi(token: string | null, input: SalesReturnCreateInput): Promise<SalesReturnDto> {
  const response = await fetch(getApiBaseUrl() + '/api/orders/returns', { method: 'POST', headers: { ...authHeaders(token), 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) await throwApiError(response, 'Lỗi tạo phiếu trả hàng');
  return (await response.json() as { data: SalesReturnDto }).data;
}

export async function fetchSalesReturnDetailApi(token: string | null, id: number): Promise<SalesReturnDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/orders/returns/${id}`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải chi tiết phiếu trả hàng');
  return (await response.json() as { data: SalesReturnDto }).data;
}

export async function downloadSalesReturnExportApi(token: string | null, filter: SalesReturnFilter = {}, format: 'csv' | 'xlsx' = 'xlsx'): Promise<Blob> {
  const query = buildSalesReturnQuery(filter, false); const separator = query ? '&' : '?';
  const response = await fetch(`${getApiBaseUrl()}/api/orders/returns/export${query}${separator}format=${format}`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi xuất phiếu trả hàng'); return response.blob();
}
