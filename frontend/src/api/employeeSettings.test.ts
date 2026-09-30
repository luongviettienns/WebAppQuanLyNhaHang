import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EmployeeSettingsApiError,
  archiveEmployeeHolidayApi,
  createAttendancePolicyApi,
  createEmployeeHolidayApi,
  createPayrollPolicyApi,
  createWorkweekPolicyApi,
  fetchEmployeeHolidaysApi,
  fetchEmployeeSettingsApi,
  updateEmployeeHolidayApi
} from './employeeSettings';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown): Response => ({ ok: true, status: 200, json: async () => ({ data }) }) as Response;

describe('employee settings API', () => {
  it('encodes authenticated workspace and holiday queries', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchEmployeeSettingsApi('admin-token', 7);
    await fetchEmployeeHolidaysApi('admin-token', { branchId: 7, from: '2026-09-01', to: '2026-09-30', includeArchived: true });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/employee-settings?branchId=7');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/employee-settings/holidays?branchId=7&from=2026-09-01&to=2026-09-30&includeArchived=true');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer admin-token' });
  });

  it('sends strict versioned policy and holiday mutation bodies', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ policy: { id: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    await createAttendancePolicyApi('token', { branchId: 1, effectiveFrom: '2026-10-01', expectedAreaRevision: 1, attendanceMode: 'SHIFT', standardDayMinutes: 480, lateThresholdMinutes: 5, earlyLeaveThresholdMinutes: 5, allowUnscheduledAttendance: true });
    await createPayrollPolicyApi('token', { branchId: 1, effectiveFrom: '2026-10-01', expectedAreaRevision: 1, frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE' });
    await createWorkweekPolicyApi('token', { branchId: 1, effectiveFrom: '2026-10-01', expectedAreaRevision: 1, monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false });
    await createEmployeeHolidayApi('token', { branchId: 1, expectedHolidayRevision: 0, name: 'Tết', startDate: '2027-02-06', endDate: '2027-02-10', note: null });
    await updateEmployeeHolidayApi('token', 9, { branchId: 1, expectedHolidayRevision: 1, expectedRowRevision: 1, name: 'Tết Nguyên đán' });
    await archiveEmployeeHolidayApi('token', 9, { branchId: 1, expectedHolidayRevision: 2, expectedRowRevision: 2, reason: 'Kỳ nghỉ tạo nhầm' });

    expect(fetchMock.mock.calls.map(call => [String(call[0]), call[1]?.method])).toEqual([
      ['https://api.example.test/api/employee-settings/attendance-policies', 'POST'],
      ['https://api.example.test/api/employee-settings/payroll-policies', 'POST'],
      ['https://api.example.test/api/employee-settings/workweek-policies', 'POST'],
      ['https://api.example.test/api/employee-settings/holidays', 'POST'],
      ['https://api.example.test/api/employee-settings/holidays/9', 'PATCH'],
      ['https://api.example.test/api/employee-settings/holidays/9/archive', 'POST']
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).toEqual({ branchId: 1, expectedHolidayRevision: 1, expectedRowRevision: 1, name: 'Tết Nguyên đán' });
  });

  it('preserves branch access and revision conflict details', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ error: { code: 'EMPLOYEE_SETTINGS_REVISION_CONFLICT', message: 'Dữ liệu đã đổi', details: { currentRevision: '3' } } })
    } as Response));

    await expect(fetchEmployeeSettingsApi('token', 2)).rejects.toMatchObject({
      constructor: EmployeeSettingsApiError,
      code: 'EMPLOYEE_SETTINGS_REVISION_CONFLICT',
      status: 409,
      details: { currentRevision: '3' }
    });
  });
});
