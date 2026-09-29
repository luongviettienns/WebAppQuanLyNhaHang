import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EmployeePayrollApiError,
  addEmployeePayrollAdjustmentApi,
  cancelEmployeePayrollApi,
  createEmployeePayrollApi,
  downloadEmployeePayrollApi,
  fetchEmployeePayrollDetailApi,
  fetchEmployeePayrollsApi,
  finalizeEmployeePayrollApi,
  recalculateEmployeePayrollApi,
  recordEmployeePayrollPaymentApi,
  reverseEmployeePayrollAdjustmentApi,
  reverseEmployeePayrollPaymentApi
} from './employeePayroll';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown): Response => ({
  ok: true, status: 200, json: async () => ({ data }), blob: async () => new Blob(['payroll'])
}) as Response;

describe('employee payroll API', () => {
  it('encodes list filters and authenticates list/detail requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ items: [], summary: {}, pagination: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchEmployeePayrollsApi('admin-token', {
      branchId: 1, search: 'tháng 9 & bếp', frequency: 'MONTHLY', status: ['DRAFT', 'FINALIZED'],
      periodMonth: '2026-09', page: 2, pageSize: 25
    });
    await fetchEmployeePayrollDetailApi('admin-token', 12);

    const listUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(listUrl.pathname).toBe('/api/employee-payrolls');
    expect(listUrl.searchParams.get('search')).toBe('tháng 9 & bếp');
    expect(listUrl.searchParams.get('status')).toBe('DRAFT,FINALIZED');
    expect(listUrl.searchParams.get('periodMonth')).toBe('2026-09');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/employee-payrolls/12');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer admin-token' });
  });

  it('sends exact JSON and Idempotency-Key only for retry-sensitive mutations', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await createEmployeePayrollApi('token', { branchId: 1, month: '2026-09', scope: 'CUSTOM', employeeIds: [2, 4] }, 'create-key');
    await recalculateEmployeePayrollApi('token', 9, 'recalc-key');
    await finalizeEmployeePayrollApi('token', 9, 'finalize-key');
    await cancelEmployeePayrollApi('token', 9, { reason: 'Tạo nhầm kỳ' });
    await addEmployeePayrollAdjustmentApi('token', 9, 3, { type: 'BONUS', amount: 500_000, reason: 'Thưởng' });
    await reverseEmployeePayrollAdjustmentApi('token', 9, 3, 7, { reason: 'Đảo thưởng' });
    await recordEmployeePayrollPaymentApi('token', 9, 3, { amount: 2_000_000, method: 'BANK_TRANSFER' }, 'pay-key');
    await reverseEmployeePayrollPaymentApi('token', 9, 3, 8, { reason: 'Đảo chi trả' }, 'reverse-pay-key');

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ branchId: 1, month: '2026-09', scope: 'CUSTOM', employeeIds: [2, 4] });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'Idempotency-Key': 'create-key' });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ 'Idempotency-Key': 'recalc-key' });
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({ 'Idempotency-Key': 'finalize-key' });
    expect(fetchMock.mock.calls[3][1]?.headers).not.toHaveProperty('Idempotency-Key');
    expect(fetchMock.mock.calls[6][1]?.headers).toMatchObject({ 'Idempotency-Key': 'pay-key' });
    expect(fetchMock.mock.calls[7][1]?.headers).toMatchObject({ 'Idempotency-Key': 'reverse-pay-key' });
  });

  it('downloads payroll blobs and preserves backend error code/status/details', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce({
        ok: false, status: 409,
        json: async () => ({ error: { code: 'PAYROLL_OVERLAP', message: 'Kỳ lương bị chồng', details: { employeeId: '4' } } })
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    expect(await downloadEmployeePayrollApi('token', 11, 'xlsx')).toBeInstanceOf(Blob);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/employee-payrolls/11/export?format=xlsx');
    await expect(fetchEmployeePayrollDetailApi('token', 11)).rejects.toMatchObject({
      constructor: EmployeePayrollApiError, code: 'PAYROLL_OVERLAP', status: 409, details: { employeeId: '4' }
    });
  });
});
