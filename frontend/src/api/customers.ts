import { getApiBaseUrl } from './config';
import type { ApiErrorResponse } from './contracts';

export type CustomerGroupDto = { id: number; code: string; name: string; description?: string | null; isActive: boolean };
export type CustomerDto = {
  id: number; code: string; name: string; phone: string | null; email?: string | null;
  type: 'INDIVIDUAL' | 'COMPANY'; gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
  birthDate?: string | null; province?: string | null; address?: string | null; groupId: number | null;
  group: CustomerGroupDto | null; isActive: boolean; createdAt: string;
  totalSales: number; netSales: number; outstandingDebt: number; lastTransactionAt: string | null;
};
export type CustomerInput = {
  name: string; phone?: string | null; email?: string | null; type?: 'INDIVIDUAL' | 'COMPANY';
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null; birthDate?: string | null; province?: string | null; address?: string | null; groupId?: number | null;
};
export type SelectableCustomerDto = { id: number; code: string; name: string; phone: string | null; groupId: number | null; group: { id: number; name: string } | null };
export type CustomerFilter = {
  search?: string; isActive?: 'true' | 'false' | 'all'; groupId?: number; type?: 'INDIVIDUAL' | 'COMPANY';
  gender?: 'MALE' | 'FEMALE' | 'OTHER'; province?: string; createdFrom?: string; createdTo?: string; birthDateFrom?: string; birthDateTo?: string;
  minSales?: number; maxSales?: number; minDebt?: number; maxDebt?: number; page?: number; pageSize?: number;
};
export type CustomerListData = {
  items: CustomerDto[]; pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  summary: { totalSales: number; netSales: number; outstandingDebt: number };
};

const headers = (token: string | null, json = false): Record<string, string> => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) });
async function request<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T> {
  const route = path.startsWith('?') ? path : path ? `/${path}` : '';
  const response = await fetch(`${getApiBaseUrl()}/api/customers${route}`, {
    method, headers: headers(token, body !== undefined), ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
    throw new Error(payload?.error?.message || `Không thể xử lý khách hàng (${response.status})`);
  }
  return (await response.json() as { data: T }).data;
}
function toQuery(filter: CustomerFilter) {
  const query = new URLSearchParams();
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return query.toString();
}

export const fetchCustomersApi = (token: string | null, filter: CustomerFilter = {}) => {
  const query = toQuery(filter);
  return request<CustomerListData>(token, query ? `?${query}` : '');
};
export const fetchCustomerGroupsApi = (token: string | null) => request<CustomerGroupDto[]>(token, 'groups');
export const fetchSelectableCustomersApi = (token: string | null, search = '') => request<SelectableCustomerDto[]>(token, `selectable${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export const createCustomerApi = (token: string | null, input: CustomerInput) => request<CustomerDto>(token, '', 'POST', input);
export const createCustomerGroupApi = (token: string | null, input: Pick<CustomerGroupDto, 'code' | 'name'>) => request<CustomerGroupDto>(token, 'groups', 'POST', input);
