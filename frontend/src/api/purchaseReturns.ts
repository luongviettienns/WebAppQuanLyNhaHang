import { getApiBaseUrl } from './config';
import type { ApiErrorResponse, PurchaseReturnDetailDto, PurchaseReturnDraftInput, PurchaseReturnImportPreviewDto, PurchaseReturnListDataDto, PurchaseReturnListFilter } from './contracts';

function authHeaders(token?: string | null): Record<string, string> { return token ? { Authorization: 'Bearer ' + token } : {}; }
function jsonHeaders(token?: string | null): Record<string, string> { return { 'Content-Type': 'application/json', ...authHeaders(token) }; }
async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || fallback + ' (' + response.status + ')');
}
function query(filter: PurchaseReturnListFilter): string {
  const params = new URLSearchParams();
  if (filter.statuses?.length) params.set('statuses', filter.statuses.join(','));
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.search?.trim()) params.set('search', filter.search.trim());
  if (filter.supplierId) params.set('supplierId', String(filter.supplierId));
  if (filter.page) params.set('page', String(filter.page));
  if (filter.pageSize) params.set('pageSize', String(filter.pageSize));
  const value = params.toString(); return value ? '?' + value : '';
}
export async function fetchPurchaseReturnsApi(token: string | null, filter: PurchaseReturnListFilter = {}): Promise<PurchaseReturnListDataDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/purchase-returns' + query(filter), { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải phiếu trả hàng nhập');
  return (await response.json() as { data: PurchaseReturnListDataDto }).data;
}
export async function fetchPurchaseReturnDetailApi(token: string | null, id: number): Promise<PurchaseReturnDetailDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/purchase-returns/' + id, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải chi tiết phiếu trả hàng nhập');
  return (await response.json() as { data: PurchaseReturnDetailDto }).data;
}
export async function savePurchaseReturnDraftApi(token: string | null, id: number | null, input: PurchaseReturnDraftInput): Promise<PurchaseReturnDetailDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/purchase-returns' + (id === null ? '' : '/' + id), { method: id === null ? 'POST' : 'PATCH', headers: jsonHeaders(token), body: JSON.stringify(input) });
  if (!response.ok) await throwApiError(response, 'Lỗi lưu phiếu trả hàng nhập');
  return (await response.json() as { data: PurchaseReturnDetailDto }).data;
}
export async function completePurchaseReturnApi(token: string | null, id: number, expectedVersion: number): Promise<PurchaseReturnDetailDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/purchase-returns/' + id + '/complete', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ expectedVersion }) });
  if (!response.ok) await throwApiError(response, 'Lỗi hoàn thành phiếu trả hàng nhập');
  return (await response.json() as { data: PurchaseReturnDetailDto }).data;
}
export async function cancelPurchaseReturnApi(token: string | null, id: number, expectedVersion: number): Promise<PurchaseReturnDetailDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/purchase-returns/' + id + '/cancel', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ expectedVersion }) });
  if (!response.ok) await throwApiError(response, 'Lỗi hủy phiếu trả hàng nhập');
  return (await response.json() as { data: PurchaseReturnDetailDto }).data;
}
export async function downloadPurchaseReturnExportApi(token: string | null, filter: PurchaseReturnListFilter = {}, format: 'csv' | 'xlsx' = 'xlsx'): Promise<Blob> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/purchase-returns/export' + query(filter) + (query(filter) ? '&' : '?') + 'format=' + format, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi xuất phiếu trả hàng nhập');
  return response.blob();
}
export async function previewPurchaseReturnImportApi(token: string | null, fileName: string, fileBase64: string): Promise<PurchaseReturnImportPreviewDto> {
  const response = await fetch(getApiBaseUrl() + '/api/inventory/purchase-returns/import/preview', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ fileName, fileBase64 }) });
  if (!response.ok) await throwApiError(response, 'Lỗi đối soát Excel phiếu trả hàng nhập');
  return (await response.json() as { data: PurchaseReturnImportPreviewDto }).data;
}
