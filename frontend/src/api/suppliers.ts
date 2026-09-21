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
}

export interface SupplierInput {
  code?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxCode?: string;
  note?: string;
}

export async function fetchSuppliersApi(
  token: string | null,
  filter: SupplierListFilter = {}
): Promise<SupplierListDataDto> {
  const params = new URLSearchParams();
  const search = filter.search?.trim();
  if (search) params.set('search', search);
  if (filter.isActive && filter.isActive !== 'true') params.set('isActive', filter.isActive);
  if (filter.page !== undefined) params.set('page', String(filter.page));
  if (filter.pageSize !== undefined) params.set('pageSize', String(filter.pageSize));

  const query = params.toString();
  const response = await fetch(`${getApiBaseUrl()}/api/inventory/suppliers${query ? `?${query}` : ''}`, {
    headers: authHeaders(token)
  });
  if (!response.ok) await throwApiError(response, 'Lỗi tải nhà cung cấp');
  return (await response.json() as { data: SupplierListDataDto }).data;
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
