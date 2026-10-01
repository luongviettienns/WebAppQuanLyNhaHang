import { ApiErrorResponse, DeliveryPartnerType } from './contracts';
import { getApiBaseUrl } from './config';

export type DeliveryPartnerDto = {
  id: number; code: string; name: string; phone: string | null; email: string | null; partnerType: DeliveryPartnerType;
  address: string | null; province: string | null; district: string | null; ward: string | null; note: string | null; groupId: number | null; isActive: boolean;
  group: { id: number; name: string } | null; totalOrders: number; totalDeliveryFee: number; outstandingAmount: number;
};
export type DeliveryPartnerGroupDto = { id: number; name: string };
export type DeliveryPartnerInput = { code?: string; name: string; phone?: string | null; email?: string | null; partnerType?: DeliveryPartnerType; address?: string | null; province?: string | null; district?: string | null; ward?: string | null; note?: string | null; groupId?: number | null; };
export type DeliveryPartnerFilter = { search?: string; isActive?: 'true' | 'false' | 'all'; groupId?: number; from?: string; to?: string; minDeliveryFee?: number; maxDeliveryFee?: number; minDebt?: number; maxDebt?: number; page?: number; pageSize?: number; ids?: number[]; };
export type DeliveryPartnerListData = { items: DeliveryPartnerDto[]; pagination: { page: number; pageSize: number; totalRows: number; totalPages: number }; summary: { totalOrders: number; totalDeliveryFee: number; outstandingAmount: number } };
export type DeliveryPartnerImportPreview = { fileName: string; totalRows: number; validRows: Array<{ rowNumber: number; data: DeliveryPartnerInput }>; errorRows: Array<{ rowNumber: number; name: string; error: string }> };

const auth = (token?: string | null): Record<string, string> => token ? { Authorization: `Bearer ${token}` } : {};
const headers = (token?: string | null): Record<string, string> => ({ 'Content-Type': 'application/json', ...auth(token) });
async function fail(response: Response, fallback: string): Promise<never> { const body = await response.json().catch(() => null) as ApiErrorResponse | null; throw new Error(body?.error?.message || `${fallback} (${response.status})`); }
function query(filter: DeliveryPartnerFilter) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(filter)) { if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue; params.set(key, Array.isArray(value) ? value.join(',') : String(value)); } return params.toString(); }
async function request<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T> { const response = await fetch(`${getApiBaseUrl()}/api/orders/${path}`, { method, headers: headers(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); if (!response.ok) await fail(response, 'Không thể xử lý đối tác giao hàng'); return (await response.json() as { data: T }).data; }

export const fetchDeliveryPartnersApi = (token: string | null, filter: DeliveryPartnerFilter = {}) => request<DeliveryPartnerListData>(token, `delivery-partners${query(filter) ? `?${query(filter)}` : ''}`);
export const fetchSelectableDeliveryPartnersApi = (token: string | null, search = '') => request<DeliveryPartnerDto[]>(token, `delivery-partners/selectable${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export const fetchDeliveryPartnerGroupsApi = (token: string | null) => request<DeliveryPartnerGroupDto[]>(token, 'delivery-partner-groups');
export const saveDeliveryPartnerGroupApi = (token: string | null, id: number | null, name: string) => request<DeliveryPartnerGroupDto>(token, `delivery-partner-groups${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', { name });
export const createDeliveryPartnerApi = (token: string | null, input: DeliveryPartnerInput) => request<DeliveryPartnerDto>(token, 'delivery-partners', 'POST', input);
export const updateDeliveryPartnerApi = (token: string | null, id: number, input: Partial<DeliveryPartnerInput> & { isActive?: boolean }) => request<DeliveryPartnerDto>(token, `delivery-partners/${id}`, 'PATCH', input);
export async function downloadDeliveryPartnersApi(token: string | null, filter: DeliveryPartnerFilter = {}, format: 'csv' | 'xlsx' = 'xlsx', template = false) { const path = template ? 'delivery-partners/import/template' : `delivery-partners/export?${query(filter)}&format=${format}`; const response = await fetch(`${getApiBaseUrl()}/api/orders/${path}`, { headers: auth(token) }); if (!response.ok) await fail(response, 'Không thể xuất đối tác giao hàng'); return response.blob(); }
export const previewDeliveryPartnerImportApi = (token: string | null, fileName: string, fileBase64: string) => request<DeliveryPartnerImportPreview>(token, 'delivery-partners/import/preview', 'POST', { fileName, fileBase64 });
export const commitDeliveryPartnerImportApi = (token: string | null, rows: DeliveryPartnerInput[]) => request<{ createdCount: number }>(token, 'delivery-partners/import/commit', 'POST', { rows });
