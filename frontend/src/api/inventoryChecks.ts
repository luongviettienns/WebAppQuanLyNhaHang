import { getApiBaseUrl } from './config';
import {
  ApiErrorResponse,
  InventoryCheckDetailDto,
  InventoryCheckDraftInput,
  InventoryCheckExportFormat,
  InventoryCheckImportPreviewDto,
  InventoryCheckListDataDto,
  InventoryCheckListFilter
} from './contracts';

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

function buildListQuery(filter: InventoryCheckListFilter): string {
  const params = new URLSearchParams();
  if (filter.statuses?.length) params.set('statuses', filter.statuses.join(','));
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.search?.trim()) params.set('search', filter.search.trim());
  if (filter.page !== undefined) params.set('page', String(filter.page));
  if (filter.pageSize !== undefined) params.set('pageSize', String(filter.pageSize));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchInventoryChecksApi(token: string | null, filter: InventoryCheckListFilter = {}): Promise<InventoryCheckListDataDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/checks${buildListQuery(filter)}`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải phiếu kiểm kho');
  return (await response.json() as { data: InventoryCheckListDataDto }).data;
}

export async function fetchInventoryCheckDetailApi(token: string | null, id: number): Promise<InventoryCheckDetailDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/checks/${id}`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải chi tiết phiếu kiểm kho');
  return (await response.json() as { data: InventoryCheckDetailDto }).data;
}

export async function saveInventoryCheckDraftApi(token: string | null, id: number | null, input: InventoryCheckDraftInput): Promise<InventoryCheckDetailDto> {
  const endpoint = id === null ? `${getApiBaseUrl()}/api/inventory/checks` : `${getApiBaseUrl()}/api/inventory/checks/${id}`;
  const response = await fetch(endpoint, { method: id === null ? 'POST' : 'PATCH', headers: jsonHeaders(token), body: JSON.stringify(input) });
  if (!response.ok) await throwApiError(response, 'Lỗi lưu phiếu kiểm kho tạm');
  return (await response.json() as { data: InventoryCheckDetailDto }).data;
}

export async function balanceInventoryCheckApi(token: string | null, id: number): Promise<InventoryCheckDetailDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/checks/${id}/balance`, { method: 'POST', headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi cân bằng kho');
  return (await response.json() as { data: InventoryCheckDetailDto }).data;
}

export async function cancelInventoryCheckApi(token: string | null, id: number): Promise<InventoryCheckDetailDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/checks/${id}/cancel`, { method: 'POST', headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi hủy phiếu kiểm kho');
  return (await response.json() as { data: InventoryCheckDetailDto }).data;
}

export async function previewInventoryCheckImportApi(token: string | null, fileName: string, fileBase64: string): Promise<InventoryCheckImportPreviewDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/checks/import/preview`, { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ fileName, fileBase64 }) });
  if (!response.ok) await throwApiError(response, 'Lỗi đối soát Excel kiểm kho');
  return (await response.json() as { data: InventoryCheckImportPreviewDto }).data;
}

export async function downloadInventoryCheckExportApi(token: string | null, filter: InventoryCheckListFilter = {}, format: InventoryCheckExportFormat = 'xlsx'): Promise<Blob> {
  const query = buildListQuery(filter);
  const separator = query ? '&' : '?';
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/checks/export${query}${separator}format=${format}`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi xuất phiếu kiểm kho');
  return response.blob();
}
