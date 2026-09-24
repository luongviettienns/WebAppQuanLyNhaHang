import { ApiErrorResponse, DiningTableDto } from './contracts';
import { getApiBaseUrl } from './config';

export type TableAreaDto = { id: number; name: string; displayOrder: number; isActive: boolean };
export type ManagedTableDto = DiningTableDto & { displayName: string; areaId: number | null; area: { id: number; name: string } | null; displayOrder: number; note: string | null; isActive: boolean; seatCount: number; qrCodeToken: string };
export type ManagedTableInput = { displayName: string; areaId?: number | null; seatCount?: number; displayOrder?: number; note?: string | null; tableNumber?: number };
export type ManagedTableFilter = { search?: string; areaId?: number; isActive?: 'true' | 'false' | 'all'; page?: number; pageSize?: number };
export type ManagedTableList = { items: ManagedTableDto[]; pagination: { page: number; pageSize: number; totalRows: number; totalPages: number } };
export type TableImportPreview = { fileName: string; totalRows: number; validRows: Array<{ rowNumber: number; data: ManagedTableInput }>; errorRows: Array<{ rowNumber: number; name: string; error: string }> };

const auth = (token?: string | null): Record<string, string> => token ? { Authorization: `Bearer ${token}` } : {};
const headers = (token?: string | null): Record<string, string> => ({ 'Content-Type': 'application/json', ...auth(token) });
async function fail(response: Response, fallback: string): Promise<never> { const body = await response.json().catch(() => null) as ApiErrorResponse | null; throw new Error(body?.error?.message || `${fallback} (${response.status})`); }
function query(filter: ManagedTableFilter) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(filter)) if (value !== undefined && value !== null && value !== '') params.set(key, String(value)); return params.toString(); }
async function request<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<T> { const response = await fetch(`${getApiBaseUrl()}/api/tables${path ? `/${path}` : ''}`, { method, headers: headers(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); if (!response.ok) await fail(response, 'Không thể xử lý phòng/bàn'); return (await response.json() as { data: T }).data; }

export const fetchManagedTablesApi = (token: string | null, filter: ManagedTableFilter = {}) => request<ManagedTableList>(token, `manage${query(filter) ? `?${query(filter)}` : ''}`);
export const fetchTableAreasApi = (token: string | null) => request<TableAreaDto[]>(token, 'areas');
export const saveTableAreaApi = (token: string | null, id: number | null, input: { name: string; displayOrder?: number; isActive?: boolean }) => request<TableAreaDto>(token, `areas${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', input);
export const createManagedTableApi = (token: string | null, input: ManagedTableInput) => request<ManagedTableDto>(token, '', 'POST', input);
export const updateManagedTableApi = (token: string | null, id: number, input: Partial<ManagedTableInput> & { isActive?: boolean }) => request<ManagedTableDto>(token, String(id), 'PATCH', input);
export const previewTableImportApi = (token: string | null, fileName: string, fileBase64: string) => request<TableImportPreview>(token, 'manage/import/preview', 'POST', { fileName, fileBase64 });
export const commitTableImportApi = (token: string | null, rows: ManagedTableInput[]) => request<{ createdCount: number }>(token, 'manage/import/commit', 'POST', { rows });
export async function downloadTablesApi(token: string | null, filter: ManagedTableFilter = {}, format: 'csv' | 'xlsx' = 'xlsx', template = false) { const path = template ? 'manage/import/template' : `manage/export?${query(filter)}&format=${format}`; const response = await fetch(`${getApiBaseUrl()}/api/tables/${path}`, { headers: auth(token) }); if (!response.ok) await fail(response, 'Không thể xuất danh sách phòng/bàn'); return response.blob(); }
