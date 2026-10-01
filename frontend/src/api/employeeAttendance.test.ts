import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAttendanceKioskSessionApi,
  createManualAttendanceSessionApi,
  fetchAttendanceExceptionsApi,
  fetchAttendanceWeekApi,
  revokeAttendanceKioskSessionApi,
  resolveAttendanceAbsenceConflictApi,
  updateAttendanceSessionApi,
  AttendanceApiError
} from './employeeAttendance';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown): Response => ({ ok: true, json: async () => ({ data }) }) as Response;

describe('employee attendance Admin API', () => {
  it('serializes week and exception filters without changing business-date strings', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ rows: [], pagination: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchAttendanceWeekApi('admin-token', {
      weekStart: '2026-09-28', branchId: 1, view: 'employee', search: 'An & Bình', page: 2, pageSize: 25
    });
    await fetchAttendanceExceptionsApi('admin-token', {
      weekStart: '2026-09-28', branchId: 1, status: 'RESOLVED', page: 1, pageSize: 10
    });

    const weekUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(weekUrl.pathname).toBe('/api/employee-attendance/week');
    expect(weekUrl.searchParams.get('weekStart')).toBe('2026-09-28');
    expect(weekUrl.searchParams.get('view')).toBe('employee');
    expect(weekUrl.searchParams.get('search')).toBe('An & Bình');
    const exceptionUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(exceptionUrl.pathname).toBe('/api/employee-attendance/exceptions');
    expect(exceptionUrl.searchParams.get('status')).toBe('RESOLVED');
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer admin-token');
  });

  it('sends the reason and exact values for kiosk provisioning, manual attendance, corrections and conflict resolution', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ id: 1, secret: 'once-only' }));
    vi.stubGlobal('fetch', fetchMock);

    await createAttendanceKioskSessionApi('admin-token', { branchId: 1, expiresInMinutes: 480, deviceName: 'Cửa vào' });
    await revokeAttendanceKioskSessionApi('admin-token', 2);
    await createManualAttendanceSessionApi('admin-token', {
      employeeId: 4, branchId: 1, checkInAt: '2026-09-29T08:00:00+07:00', reason: 'Kiosk hỏng'
    });
    await updateAttendanceSessionApi('admin-token', 3, { checkOutAt: '2026-09-29T12:03:00+07:00', reason: 'Bổ sung giờ ra' });
    await resolveAttendanceAbsenceConflictApi('admin-token', 9, { reason: 'Đối chiếu được giờ vào' });

    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'https://api.example.test/api/employee-attendance/kiosk-sessions',
      'https://api.example.test/api/employee-attendance/kiosk-sessions/2/revoke',
      'https://api.example.test/api/employee-attendance/sessions/manual',
      'https://api.example.test/api/employee-attendance/sessions/3',
      'https://api.example.test/api/employee-attendance/dispositions/9/resolve-conflict'
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({ reason: 'Kiosk hỏng', employeeId: 4 });
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({ checkOutAt: '2026-09-29T12:03:00+07:00', reason: 'Bổ sung giờ ra' });
    expect(fetchMock.mock.calls[4][1]?.method).toBe('POST');
  });

  it('maps API errors into a typed attendance error without losing code or status', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 409,
      json: async () => ({ error: { code: 'ATTENDANCE_SHIFT_NOT_ENDED', message: 'Ca chưa kết thúc' } })
    } as Response));

    await expect(fetchAttendanceWeekApi('admin-token', { weekStart: '2026-09-28', branchId: 1 }))
      .rejects.toMatchObject({ constructor: AttendanceApiError, code: 'ATTENDANCE_SHIFT_NOT_ENDED', status: 409 });
  });
});
