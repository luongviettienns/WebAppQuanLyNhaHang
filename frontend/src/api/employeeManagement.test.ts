import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendEmployeeCompensationApi,
  createEmployeeApi,
  fetchEmployeeApi,
  fetchEmployeeDepartmentsApi,
  fetchEmployeeJobTitlesApi,
  fetchEmployeesApi,
  fetchLinkableUsersApi,
  saveEmployeeDepartmentApi,
  saveEmployeeJobTitleApi,
  updateEmployeeApi,
  updateEmployeeStatusApi,
  uploadEmployeeAvatarApi
} from './employeeManagement';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown): Response => ({ ok: true, json: async () => ({ data }) }) as Response;

describe('employee management API', () => {
  it('encodes employee filters and preserves zero values', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ items: [], pagination: {}, summary: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchEmployeesApi('admin-token', { search: 'Nguyễn & An', status: 'WORKING', departmentId: 2, jobTitleId: 0, page: 1, pageSize: 25 });

    const [url, init] = fetchMock.mock.calls[0];
    const query = new URL(url as string).searchParams;
    expect(query.get('search')).toBe('Nguyễn & An');
    expect(query.get('status')).toBe('WORKING');
    expect(query.get('departmentId')).toBe('2');
    expect(query.get('jobTitleId')).toBe('0');
    expect(query.get('page')).toBe('1');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer admin-token');
  });

  it('sends bearer token on employee create requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ id: 1, name: 'Nguyễn An' }));
    vi.stubGlobal('fetch', fetchMock);
    await createEmployeeApi('admin-token', { name: 'Nguyễn An', phone: '0903000280' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/employees');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nguyễn An', phone: '0903000280' })
    });
  });

  it('propagates employee API errors from the server', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: 'CONFLICT', message: 'Tài khoản đã được liên kết' } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchEmployeeApi('admin-token', 9)).rejects.toThrow('Tài khoản đã được liên kết');
  });

  it('uses the server routes and methods for profile, salary, reference and avatar operations', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({}));
    vi.stubGlobal('fetch', fetchMock);
    await updateEmployeeApi('t', 7, { note: 'Bếp ca sáng' });
    await updateEmployeeStatusApi('t', 7, { status: 'RESIGNED', endDate: '2026-09-29' });
    await appendEmployeeCompensationApi('t', 7, { payBasis: 'MONTHLY', baseRate: 12000000, effectiveFrom: '2026-09-01' });
    await fetchEmployeeDepartmentsApi('t');
    await saveEmployeeDepartmentApi('t', null, { name: 'Bếp' });
    await saveEmployeeDepartmentApi('t', 2, { isActive: false });
    await fetchEmployeeJobTitlesApi('t');
    await saveEmployeeJobTitleApi('t', null, { name: 'Đầu bếp' });
    await saveEmployeeJobTitleApi('t', 3, { name: 'Bếp trưởng' });
    await fetchLinkableUsersApi('t', 'Nguyễn An');
    await uploadEmployeeAvatarApi('t', 'data:image/png;base64,AA==', 'anh.png');

    expect(fetchMock.mock.calls.map(([url, init]) => [String(url).replace('https://api.example.test/api/employees', ''), init?.method ?? 'GET'])).toEqual([
      ['/7', 'PATCH'], ['/7/status', 'PATCH'], ['/7/compensations', 'POST'], ['/departments', 'GET'], ['/departments', 'POST'],
      ['/departments/2', 'PATCH'], ['/job-titles', 'GET'], ['/job-titles', 'POST'], ['/job-titles/3', 'PATCH'],
      ['/linkable-users?search=Nguy%E1%BB%85n%20An', 'GET'], ['/avatar', 'POST']
    ]);
    expect(fetchMock.mock.calls[10][1]?.headers).toMatchObject({ Authorization: 'Bearer t', 'Content-Type': 'application/json' });
  });
});
