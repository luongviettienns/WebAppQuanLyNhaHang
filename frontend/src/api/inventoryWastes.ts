import { getApiBaseUrl } from './config';
import {
  ApiErrorResponse,
  InventoryWasteDetailDto,
  InventoryWasteDraftInput,
  InventoryWasteExportFormat,
  InventoryWasteImportPreviewDto,
  InventoryWasteListDataDto,
  InventoryWasteListFilter
} from './contracts';

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: 'Bearer ' + token } : {};
}

function jsonHeaders(token?: string | null): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders(token) };
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || fallback + ' (' + response.status + ')');
}

function buildListQuery(filter: InventoryWasteListFilter): string {
  const params = new URLSearchParams();
  if (filter.statuses?.length) params.set('statuses', filter.statuses.join(','));
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.search?.trim()) params.set('search', filter.search.trim());
  if (filter.page !== undefined) params.set('page', String(filter.page));
  if (filter.pageSize !== undefined) params.set('pageSize', String(filter.pageSize));
  const query = params.toString();
  return query ? '?' + query : '';
}

export async function fetchInventoryWastesApi(token: string | null, filter: InventoryWasteListFilter = {}): Promise<InventoryWasteListDataDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/wastes' + buildListQuery(filter), { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải phiếu xuất hủy');
  return (await response.json() as { data: InventoryWasteListDataDto }).data;
}

export async function fetchInventoryWasteDetailApi(token: string | null, id: number): Promise<InventoryWasteDetailDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/wastes/' + id, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải chi tiết phiếu xuất hủy');
  return (await response.json() as { data: InventoryWasteDetailDto }).data;
}

export async function saveInventoryWasteDraftApi(token: string | null, id: number | null, input: InventoryWasteDraftInput): Promise<InventoryWasteDetailDto> {
  const endpoint = id === null
    ? getApiBaseUrl() + '/api/inventory/wastes'
    : getApiBaseUrl() + '/api/inventory/wastes/' + id;
  const response = await fetch(endpoint, {
    method: id === null ? 'POST' : 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(input)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi lưu phiếu xuất hủy tạm');
  return (await response.json() as { data: InventoryWasteDetailDto }).data;
}

export async function completeInventoryWasteApi(token: string | null, id: number): Promise<InventoryWasteDetailDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/wastes/' + id + '/complete', {
    method: 'POST',
    headers: authHeaders(token)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi hoàn thành phiếu xuất hủy');
  return (await response.json() as { data: InventoryWasteDetailDto }).data;
}

export async function cancelInventoryWasteApi(token: string | null, id: number): Promise<InventoryWasteDetailDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/wastes/' + id + '/cancel', {
    method: 'POST',
    headers: authHeaders(token)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi hủy phiếu xuất hủy');
  return (await response.json() as { data: InventoryWasteDetailDto }).data;
}

export async function previewInventoryWasteImportApi(token: string | null, fileName: string, fileBase64: string): Promise<InventoryWasteImportPreviewDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/wastes/import/preview', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ fileName, fileBase64 })
  });
  if (!response.ok) await throwApiError(response, 'Lỗi đối soát Excel xuất hủy');
  return (await response.json() as { data: InventoryWasteImportPreviewDto }).data;
}

export async function downloadInventoryWasteExportApi(token: string | null, filter: InventoryWasteListFilter = {}, format: InventoryWasteExportFormat = 'xlsx'): Promise<Blob> {
  const query = buildListQuery(filter);
  const separator = query ? '&' : '?';
  const response = await fetch(
    getApiBaseUrl() + '/api/inventory/wastes/export' + query + separator + 'format=' + format,
    { headers: authHeaders(token) }
  );
  if (!response.ok) await throwApiError(response, 'Lỗi xuất phiếu xuất hủy');
  return response.blob();
}
