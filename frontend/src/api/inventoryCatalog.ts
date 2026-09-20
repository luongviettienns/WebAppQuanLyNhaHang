import { getApiBaseUrl } from './config';
import {
  ApiErrorResponse,
  InventoryCatalogDataDto,
  InventoryCatalogFilter,
  InventoryCatalogExportFormat
} from './contracts';

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || `${fallback} (${response.status})`);
}

function appendQuery(
  params: URLSearchParams,
  filter: InventoryCatalogFilter,
  includePagination: boolean
): void {
  const search = filter.search?.trim();
  if (search) params.set('search', search);
  if (filter.managementGroup) params.set('managementGroup', filter.managementGroup);
  if (filter.categoryId !== undefined) params.set('categoryId', String(filter.categoryId));
  if (filter.menuType) params.set('menuType', filter.menuType);
  if (filter.stockStatus && filter.stockStatus !== 'ALL') params.set('stockStatus', filter.stockStatus);
  if (filter.position?.trim()) params.set('position', filter.position.trim());
  if (filter.isActive && filter.isActive !== 'true') params.set('isActive', filter.isActive);

  if (includePagination) {
    if (filter.page !== undefined && filter.page !== 1) params.set('page', String(filter.page));
    if (filter.pageSize !== undefined && filter.pageSize !== 50) params.set('pageSize', String(filter.pageSize));
  }

  if (filter.sortBy && filter.sortBy !== 'sku') params.set('sortBy', filter.sortBy);
  if (filter.sortOrder && filter.sortOrder !== 'asc') params.set('sortOrder', filter.sortOrder);
}

function buildQuery(filter: InventoryCatalogFilter, includePagination: boolean, format?: InventoryCatalogExportFormat): string {
  const params = new URLSearchParams();
  if (format) params.set('format', format);
  appendQuery(params, filter, includePagination);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchInventoryCatalogApi(
  token: string | null,
  filter: InventoryCatalogFilter
): Promise<InventoryCatalogDataDto> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/inventory/catalog${buildQuery(filter, true)}`,
    { headers: authHeaders(token) }
  );
  if (!response.ok) await throwApiError(response, 'Lỗi tải danh sách kho hàng');
  return (await response.json() as { data: InventoryCatalogDataDto }).data;
}

export async function downloadInventoryCatalogExportApi(
  token: string | null,
  filter: InventoryCatalogFilter,
  format: InventoryCatalogExportFormat
): Promise<Blob> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/inventory/catalog/export${buildQuery(filter, false, format)}`,
    { headers: authHeaders(token) }
  );
  if (!response.ok) await throwApiError(response, 'Lỗi tải danh sách kho hàng');
  return response.blob();
}
