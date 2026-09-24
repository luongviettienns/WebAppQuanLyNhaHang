import { getApiBaseUrl } from './config';
import { ApiErrorResponse, OrderInvoiceDetailDto, OrderInvoiceFilter, OrderInvoiceListDataDto } from './contracts';

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: 'Bearer ' + token } : {};
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || `${fallback} (${response.status})`);
}

export function buildOrderInvoiceQuery(filter: OrderInvoiceFilter = {}, includePagination = true): string {
  const params = new URLSearchParams();
  if (filter.search?.trim()) params.set('search', filter.search.trim());
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.statuses?.length) params.set('statuses', filter.statuses.join(','));
  if (filter.paymentStatuses?.length) params.set('paymentStatuses', filter.paymentStatuses.join(','));
  if (filter.orderTypes?.length) params.set('orderTypes', filter.orderTypes.join(','));
  if (includePagination && filter.page !== undefined) params.set('page', String(filter.page));
  if (includePagination && filter.pageSize !== undefined) params.set('pageSize', String(filter.pageSize));
  const query = params.toString();
  return query ? '?' + query : '';
}

export async function fetchOrderInvoicesApi(token: string | null, filter: OrderInvoiceFilter = {}): Promise<OrderInvoiceListDataDto> {
  const response = await fetch(getApiBaseUrl() + '/api/orders/invoices' + buildOrderInvoiceQuery(filter), { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải danh sách hóa đơn');
  return (await response.json() as { data: OrderInvoiceListDataDto }).data;
}

export async function fetchOrderInvoiceDetailApi(token: string | null, id: number): Promise<OrderInvoiceDetailDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/orders/invoices/${id}`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi tải chi tiết hóa đơn');
  return (await response.json() as { data: { invoice: OrderInvoiceDetailDto } }).data.invoice;
}

export async function downloadOrderInvoiceExportApi(token: string | null, filter: OrderInvoiceFilter = {}, format: 'csv' | 'xlsx' = 'xlsx'): Promise<Blob> {
  const query = buildOrderInvoiceQuery(filter, false);
  const separator = query ? '&' : '?';
  const response = await fetch(`${getApiBaseUrl()}/api/orders/invoices/export${query}${separator}format=${format}`, { headers: authHeaders(token) });
  if (!response.ok) await throwApiError(response, 'Lỗi xuất hóa đơn');
  return response.blob();
}
