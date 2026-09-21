import { getApiBaseUrl } from './config';
import {
  ApiErrorResponse,
  PurchaseReceiptDetailDto,
  PurchaseReceiptDraftInput,
  PurchaseReceiptImportPreviewDto,
  PurchaseReceiptListDataDto,
  PurchaseReceiptListFilter
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

function buildListQuery(filter: PurchaseReceiptListFilter): string {
  const params = new URLSearchParams();
  if (filter.status?.length) params.set('statuses', filter.status.join(','));
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.search?.trim()) params.set('search', filter.search.trim());
  if (filter.page !== undefined) params.set('page', String(filter.page));
  if (filter.pageSize !== undefined) params.set('pageSize', String(filter.pageSize));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchPurchaseReceiptsApi(
  token: string | null,
  filter: PurchaseReceiptListFilter = {}
): Promise<PurchaseReceiptListDataDto> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/inventory/purchase-receipts${buildListQuery(filter)}`,
    { headers: authHeaders(token) }
  );
  if (!response.ok) await throwApiError(response, 'Lỗi tải phiếu nhập hàng');
  return (await response.json() as { data: PurchaseReceiptListDataDto }).data;
}

export async function fetchPurchaseReceiptDetailApi(
  token: string | null,
  id: number
): Promise<PurchaseReceiptDetailDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/purchase-receipts/${id}`, {
    headers: authHeaders(token)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi tải chi tiết phiếu nhập');
  return (await response.json() as { data: PurchaseReceiptDetailDto }).data;
}

export async function savePurchaseReceiptDraftApi(
  token: string | null,
  id: number | null,
  input: PurchaseReceiptDraftInput
): Promise<PurchaseReceiptDetailDto> {
  const endpoint = id === null
    ? `${getApiBaseUrl()}/api/inventory/purchase-receipts`
    : `${getApiBaseUrl()}/api/inventory/purchase-receipts/${id}`;
  const response = await fetch(endpoint, {
    method: id === null ? 'POST' : 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify(input)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi lưu phiếu nhập tạm');
  return (await response.json() as { data: PurchaseReceiptDetailDto }).data;
}

export async function postPurchaseReceiptApi(
  token: string | null,
  id: number
): Promise<PurchaseReceiptDetailDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/purchase-receipts/${id}/post`, {
    method: 'POST',
    headers: authHeaders(token)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi hoàn thành phiếu nhập');
  return (await response.json() as { data: PurchaseReceiptDetailDto }).data;
}

export async function previewPurchaseReceiptImportApi(
  token: string | null,
  fileName: string,
  fileBase64: string
): Promise<PurchaseReceiptImportPreviewDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/purchase-receipts/import/preview`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ fileName, fileBase64 })
  });
  if (!response.ok) await throwApiError(response, 'Lỗi đối soát Excel phiếu nhập');
  return (await response.json() as { data: PurchaseReceiptImportPreviewDto }).data;
}

export async function downloadPurchaseReceiptExportApi(
  token: string | null,
  filter: PurchaseReceiptListFilter = {},
  format: 'csv' | 'xlsx' = 'xlsx'
): Promise<Blob> {
  const query = buildListQuery(filter);
  const separator = query ? '&' : '?';
  const response = await fetch(
    `${getApiBaseUrl()}/api/inventory/purchase-receipts/export${query}${separator}format=${format}`,
    { headers: authHeaders(token) }
  );
  if (!response.ok) await throwApiError(response, 'Lỗi xuất phiếu nhập hàng');
  return response.blob();
}
