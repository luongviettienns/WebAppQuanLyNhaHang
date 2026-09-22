import { getApiBaseUrl } from './config';
import {
  ApiErrorResponse,
  PriceFormulaOperation,
  PriceListDataDto,
  PriceListImportCommitDto,
  PriceListImportPreviewDto,
  PriceListItemDto
} from './contracts';

function jsonHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || `${fallback} (${response.status})`);
}

export async function fetchGeneralPriceListApi(token: string | null): Promise<PriceListDataDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/price-lists/general`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải bảng giá');
  return (await response.json() as { data: PriceListDataDto }).data;
}

export async function updatePriceListItemApi(
  token: string | null,
  priceListId: number,
  menuItemId: number,
  salePrice: number,
  expectedVersion: number
): Promise<{ item: PriceListItemDto }> {
  const response = await fetch(`${getApiBaseUrl()}/api/price-lists/${priceListId}/items/${menuItemId}`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify({ salePrice, expectedVersion })
  });
  if (!response.ok) await throwApiError(response, 'Lỗi cập nhật giá bán');
  return (await response.json() as { data: { item: PriceListItemDto } }).data;
}

export async function bulkUpdatePriceListApi(
  token: string | null,
  priceListId: number,
  menuItemIds: number[],
  operation: PriceFormulaOperation
): Promise<{ updatedCount: number; menuItemIds: number[] }> {
  const response = await fetch(`${getApiBaseUrl()}/api/price-lists/${priceListId}/items/bulk`, {
    method: 'PATCH',
    headers: jsonHeaders(token),
    body: JSON.stringify({ menuItemIds, operation })
  });
  if (!response.ok) await throwApiError(response, 'Lỗi cập nhật giá hàng loạt');
  return (await response.json() as { data: { updatedCount: number; menuItemIds: number[] } }).data;
}

export async function previewPriceListImportApi(token: string | null, priceListId: number, fileName: string, fileBase64: string): Promise<PriceListImportPreviewDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/price-lists/${priceListId}/import/preview`, {
    method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ fileName, fileBase64 })
  });
  if (!response.ok) await throwApiError(response, 'Lỗi đối soát bảng giá');
  return (await response.json() as { data: PriceListImportPreviewDto }).data;
}

export async function commitPriceListImportApi(token: string | null, priceListId: number, fileName: string, fileBase64: string): Promise<PriceListImportCommitDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/price-lists/${priceListId}/import/commit`, {
    method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ fileName, fileBase64 })
  });
  if (!response.ok) await throwApiError(response, 'Lỗi ghi bảng giá từ file');
  return (await response.json() as { data: PriceListImportCommitDto }).data;
}

export async function downloadPriceListExportApi(token: string | null, priceListId: number): Promise<Blob> {
  const response = await fetch(`${getApiBaseUrl()}/api/price-lists/${priceListId}/export`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải bảng giá');
  return response.blob();
}
