import { afterEach, describe, expect, it, vi } from 'vitest';
import { KioskPunchRetryState, punchAttendanceKioskApi } from './employeeAttendanceKiosk';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

describe('employee attendance kiosk API', () => {
  it('sends the kiosk credential only in its dedicated header and never attaches an Admin bearer token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true, json: async () => ({ data: { action: 'CHECK_IN', employeeName: 'An', recordedAt: '2026-09-29T01:00:00.000Z', state: 'OPEN', linkStatus: 'UNSCHEDULED', shiftName: null } })
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      attendanceCode: 'NV000004', action: 'CHECK_IN' as const, idempotencyKey: 'punch-20260929-0001'
    };

    await punchAttendanceKioskApi('kiosk-secret-value', input);

    const [url, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(url).toBe('https://api.example.test/api/attendance-kiosk/punch');
    expect(headers['x-kiosk-credential']).toBe('kiosk-secret-value');
    expect(headers.Authorization).toBeUndefined();
    expect(String(url)).not.toContain('kiosk-secret-value');
    expect(String(init?.body)).not.toContain('kiosk-secret-value');
    expect(JSON.parse(String(init?.body))).toEqual(input);
  });

  it('keeps a retry key for the same final payload and rotates it when the choice changes', () => {
    const keys = ['retry-key-0001', 'retry-key-0002'];
    const state = new KioskPunchRetryState(() => keys.shift()!);
    const checkIn = { attendanceCode: 'NV000004', action: 'CHECK_IN' as const };

    const first = state.prepare(checkIn);
    const retry = state.prepare(checkIn);
    const confirmedShift = state.prepare({ ...checkIn, scheduleRuleId: 11, scheduleDate: '2026-09-29' });

    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
    expect(confirmedShift.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('clears the pending retry identity only after confirmed success', () => {
    const keys = ['retry-key-0001', 'retry-key-0002'];
    const state = new KioskPunchRetryState(() => keys.shift()!);
    const payload = { attendanceCode: 'NV000004', action: 'CHECK_OUT' as const };
    const first = state.prepare(payload);

    expect(state.prepare(payload).idempotencyKey).toBe(first.idempotencyKey);
    state.confirmSuccess();
    expect(state.prepare(payload).idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it('does not retain secrets inside serialized error details', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ error: { code: 'ATTENDANCE_CREDENTIAL_INVALID', message: 'Invalid NV000004 via kiosk-secret-value' } })
    } as Response));

    let caught: unknown;
    try {
      await punchAttendanceKioskApi('kiosk-secret-value', {
        attendanceCode: 'NV000004', action: 'CHECK_IN', idempotencyKey: 'retry-key-0001'
      });
    } catch (error) { caught = error; }
    expect(JSON.stringify(caught)).not.toContain('kiosk-secret-value');
    expect(JSON.stringify(caught)).not.toContain('NV000004');
  });
});
