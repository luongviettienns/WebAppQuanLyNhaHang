import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  commitEmployeeScheduleImportApi,
  createEmployeeScheduleBatchApi,
  createWorkShiftApi,
  deleteEmployeeScheduleRuleApi,
  downloadEmployeeScheduleExportApi,
  downloadEmployeeScheduleTemplateApi,
  fetchEmployeeScheduleShiftsApi,
  fetchEmployeeScheduleWeekApi,
  patchEmployeeScheduleRuleApi,
  previewEmployeeScheduleImportApi,
  ScheduleApiError
} from './employeeScheduleManagement';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown): Response => ({ ok: true, json: async () => ({ data }), blob: async () => new Blob(['schedule']) }) as Response;

describe('employee schedule API', () => {
  it('serializes week filters and preserves date-only values and zero-valued paging', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ weekStart: '2026-09-28', employees: [], pagination: { page: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchEmployeeScheduleWeekApi('admin-token', { weekStart: '2026-09-28', search: 'Nguyễn & An', departmentId: 0, page: 1, pageSize: 100 });

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/api/employee-schedules/week');
    expect(parsed.searchParams.get('weekStart')).toBe('2026-09-28');
    expect(parsed.searchParams.get('search')).toBe('Nguyễn & An');
    expect(parsed.searchParams.get('departmentId')).toBe('0');
    expect(parsed.searchParams.get('page')).toBe('1');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer admin-token');
  });

  it('keeps employeeIds, shiftIds and recurrence fields intact for create, patch and delete scopes', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ createdCount: 2, rules: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const create = { employeeIds: [4, 8], shiftIds: [2, 3], startDate: '2026-09-29', repeatWeekly: true, endDate: '2026-10-27' };
    const edit = { workDate: '2026-10-06', scope: 'following' as const, shiftIds: [3] };
    await createEmployeeScheduleBatchApi('admin-token', create, 'schedule-create-key');
    await patchEmployeeScheduleRuleApi('admin-token', 91, edit);
    await deleteEmployeeScheduleRuleApi('admin-token', 92, { workDate: '2026-10-07', scope: 'occurrence' });
    await fetchEmployeeScheduleShiftsApi('admin-token');
    await createWorkShiftApi('admin-token', { code: 'LATE', name: 'Ca muộn', startMinute: 1320, endMinute: 1440 });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(create);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'Idempotency-Key': 'schedule-create-key' });
    expect(fetchMock.mock.calls[1]).toMatchObject([expect.stringContaining('/api/employee-schedules/91'), { method: 'PATCH' }]);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(edit);
    expect(String(fetchMock.mock.calls[2][0])).toContain('workDate=2026-10-07');
    expect(String(fetchMock.mock.calls[2][0])).toContain('scope=occurrence');
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).toEqual({ code: 'LATE', name: 'Ca muộn', startMinute: 1320, endMinute: 1440 });
  });

  it('sends import preview/commit payloads and downloads weekly export and template blobs', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ validRows: [], errorRows: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const rows = [{ employeeCode: 'NV001', shiftCode: 'MORNING', workDate: '2026-10-05', repeatWeekly: false, endDate: null, rowNumber: 2 }];
    await previewEmployeeScheduleImportApi('admin-token', 'lich.csv', 'YQ==');
    await commitEmployeeScheduleImportApi('admin-token', rows, false, 'schedule-import-key');
    await downloadEmployeeScheduleExportApi('admin-token', '2026-09-28', 'xlsx');
    await downloadEmployeeScheduleTemplateApi('admin-token');

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ fileName: 'lich.csv', fileBase64: 'YQ==' });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ rows, calendarWarningAcknowledged: false });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ 'Idempotency-Key': 'schedule-import-key' });
    expect(String(fetchMock.mock.calls[2][0])).toContain('/export?weekStart=2026-09-28&format=xlsx');
    expect(String(fetchMock.mock.calls[3][0])).toContain('/import/template');
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({ Authorization: 'Bearer admin-token' });
  });

  it('preserves structured calendar warnings for confirmation flows', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ error: { code: 'SCHEDULE_CALENDAR_CONFIRMATION_REQUIRED', message: 'Cần xác nhận', details: { warnings: [{ kind: 'HOLIDAY', firstAffectedDate: '2027-01-01', affectedCount: 1, sampleDates: ['2027-01-01'], unbounded: false, source: { type: 'HOLIDAY', id: 2, revision: 1, name: 'Tết' } }] } } })
    } as Response));
    await expect(createEmployeeScheduleBatchApi('token', {
      employeeIds: [1], shiftIds: [2], startDate: '2027-01-01', repeatWeekly: false, endDate: null
    }, 'warning-key')).rejects.toMatchObject({
      code: 'SCHEDULE_CALENDAR_CONFIRMATION_REQUIRED',
      details: { warnings: [expect.objectContaining({ kind: 'HOLIDAY', firstAffectedDate: '2027-01-01' })] }
    });
  });

  it('maps backend error code, status and details into a typed schedule error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ error: { code: 'SCHEDULE_OVERLAP', message: 'Ca làm bị chồng giờ', details: { employeeCode: 'NV001', rowNumber: '4' } } })
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    let caught: unknown;
    try { await fetchEmployeeScheduleWeekApi('admin-token', { weekStart: '2026-09-28' }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ScheduleApiError);
    expect(caught).toMatchObject({ code: 'SCHEDULE_OVERLAP', status: 409, details: { employeeCode: 'NV001', rowNumber: '4' }, message: 'Ca làm bị chồng giờ' });
  });
});
