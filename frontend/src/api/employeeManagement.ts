import { getApiBaseUrl } from './config';
import type { ApiErrorResponse, Role } from './contracts';

export type EmployeeStatus = 'WORKING' | 'RESIGNED';
export type EmployeeGender = 'MALE' | 'FEMALE' | 'OTHER';
export type EmployeePayBasis = 'MONTHLY' | 'HOURLY' | 'PER_SHIFT';
export type EmployeeReferenceDto = { id: number; name: string; isActive: boolean; createdAt?: string; updatedAt?: string };
export type EmployeeUserDto = { id: number; username: string; name: string; role: Role };
export type EmployeeCompensationDto = {
  id: number; employeeId: number; payBasis: EmployeePayBasis; baseRate: number; effectiveFrom: string;
  note: string | null; createdByUserId?: number | null; createdAt?: string;
};

export type EmployeeListItemDto = {
  id: number; code: string; attendanceCode: string; name: string; phone: string; status: EmployeeStatus;
  nationalId: string | null; note: string | null; department: EmployeeReferenceDto | null;
  jobTitle: EmployeeReferenceDto | null; debtAdvance: null; createdAt: string; updatedAt: string;
};
export type EmployeeDetailDto = Omit<EmployeeListItemDto, 'nationalId' | 'debtAdvance'> & {
  nationalId: string | null; userId: number | null; avatarUrl: string | null; departmentId: number | null;
  jobTitleId: number | null; startDate: string | null; endDate: string | null; birthDate: string | null;
  gender: EmployeeGender | null; address: string | null; province: string | null; ward: string | null;
  email: string | null; facebook: string | null; bankName: string | null; bankAccountNumber: string | null;
  bankAccountName: string | null; user: EmployeeUserDto | null; compensations: EmployeeCompensationDto[];
};
export type EmployeeListData = {
  items: EmployeeListItemDto[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  summary: { totalCount: number; workingCount: number; resignedCount: number };
};
export type EmployeeFilter = {
  search?: string; status?: EmployeeStatus; departmentId?: number; jobTitleId?: number; page?: number; pageSize?: number;
};
export type EmployeeCompensationInput = { payBasis: EmployeePayBasis; baseRate: number; effectiveFrom: string; note?: string | null };
export type EmployeeInput = {
  name: string; phone: string; userId?: number | null; avatarUrl?: string | null; departmentId?: number | null;
  jobTitleId?: number | null; startDate?: string | null; note?: string | null; nationalId?: string | null;
  birthDate?: string | null; gender?: EmployeeGender | null; address?: string | null; province?: string | null;
  ward?: string | null; email?: string | null; facebook?: string | null; bankName?: string | null;
  bankAccountNumber?: string | null; bankAccountName?: string | null; initialCompensation?: EmployeeCompensationInput;
};
export type EmployeeProfileInput = Omit<EmployeeInput, 'initialCompensation'>;
export type EmployeeUpdateInput = Partial<EmployeeProfileInput>;
export type EmployeeAvatarUploadResult = { avatarUrl: string; fileName: string };

const headers = (token: string | null, json = false): Record<string, string> => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

async function request<T>(token: string | null, route: string, method = 'GET', body?: unknown): Promise<T> {
  const normalizedRoute = route.startsWith('?') ? route : route ? `/${route}` : '';
  const response = await fetch(`${getApiBaseUrl()}/api/employees${normalizedRoute}`, {
    method,
    headers: headers(token, body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
    throw new Error(payload?.error?.message || `Không thể xử lý hồ sơ nhân viên (${response.status})`);
  }
  return (await response.json() as { data: T }).data;
}

function toQuery(filter: EmployeeFilter): string {
  const query = new URLSearchParams();
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return query.toString();
}

export const fetchEmployeesApi = (token: string | null, filter: EmployeeFilter = {}) => {
  const query = toQuery(filter);
  return request<EmployeeListData>(token, query ? `?${query}` : '');
};
export const fetchEmployeeApi = (token: string | null, id: number) => request<EmployeeDetailDto>(token, String(id));
export const createEmployeeApi = (token: string | null, input: EmployeeInput) => request<EmployeeDetailDto>(token, '', 'POST', input);
export const updateEmployeeApi = (token: string | null, id: number, input: EmployeeUpdateInput) => request<EmployeeDetailDto>(token, String(id), 'PATCH', input);
export const updateEmployeeStatusApi = (token: string | null, id: number, input: { status: EmployeeStatus; endDate?: string | null }) => request<EmployeeDetailDto>(token, `${id}/status`, 'PATCH', input);
export const appendEmployeeCompensationApi = (token: string | null, id: number, input: EmployeeCompensationInput) => request<EmployeeCompensationDto>(token, `${id}/compensations`, 'POST', input);
export const fetchEmployeeDepartmentsApi = (token: string | null) => request<EmployeeReferenceDto[]>(token, 'departments');
export const saveEmployeeDepartmentApi = (token: string | null, id: number | null, input: { name?: string; isActive?: boolean }) => request<EmployeeReferenceDto>(token, `departments${id === null ? '' : `/${id}`}`, id === null ? 'POST' : 'PATCH', input);
export const fetchEmployeeJobTitlesApi = (token: string | null) => request<EmployeeReferenceDto[]>(token, 'job-titles');
export const saveEmployeeJobTitleApi = (token: string | null, id: number | null, input: { name?: string; isActive?: boolean }) => request<EmployeeReferenceDto>(token, `job-titles${id === null ? '' : `/${id}`}`, id === null ? 'POST' : 'PATCH', input);
export const fetchLinkableUsersApi = (token: string | null, search = '') => request<EmployeeUserDto[]>(token, `linkable-users${search ? `?search=${encodeURIComponent(search)}` : ''}`);
export const uploadEmployeeAvatarApi = (token: string | null, dataUrl: string, fileName?: string) => request<EmployeeAvatarUploadResult>(token, 'avatar', 'POST', { dataUrl, ...(fileName ? { fileName } : {}) });
