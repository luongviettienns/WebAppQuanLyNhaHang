import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EndOfDayReportResponse } from '../../api/endOfDayReports';
vi.mock('../../api/config', () => ({ getApiBaseUrl: () => 'https://report.test' }));
vi.mock('../../api/endOfDayReports', async importOriginal => ({ ...await importOriginal<object>(), fetchEndOfDayReportApi: vi.fn() }));
import { fetchEndOfDayReportApi } from '../../api/endOfDayReports';
import { useEndOfDayReport } from './useEndOfDayReport';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const report: EndOfDayReportResponse = {
  metadata: { date: '2026-10-03', from: '2026-10-02T17:00:00Z', to: '2026-10-03T17:00:00Z', timezone: 'Asia/Ho_Chi_Minh', asOf: '2026-10-03T12:00:00Z', generatedAt: '2026-10-03T12:00:01Z', concern: 'SALES', view: 'VERTICAL', operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true } },
  hasData: true, rows: [], pagination: { page: 1, pageSize: 50, totalRows: 1, totalPages: 1 }, filterOptions: {},
  summary: { completedInvoiceCount: 1, grossInvoiceValue: 125000, salesReturnValue: 0, netInvoiceValue: 125000, goodsAmount: 125000, discountAmount: 0, vatAmount: 0, deliveryFee: 0, invariantCounters: { totalRows: 1 } }
};
let state: ReturnType<typeof useEndOfDayReport>;
let renderer: ReactTestRenderer & { unmount: () => void };
function Harness() { state = useEndOfDayReport('admin'); return null; }
async function mount() { await act(async () => { renderer = create(<Harness />) as typeof renderer; }); }
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); vi.resetAllMocks(); });
const query = { date: '2026-10-03', concern: 'SALES' as const };
describe('atomic end-of-day requests', () => {
  it('keeps the last snapshot and generatedAt when same-query refresh fails', async () => {
    vi.mocked(fetchEndOfDayReportApi).mockResolvedValueOnce(report).mockRejectedValueOnce(new Error('Offline'));
    await mount(); await act(async () => { await state.load({ ...query, paymentMethods: ['CASH', 'BANK_TRANSFER'] }); });
    await act(async () => { await state.load({ ...query, view: 'VERTICAL', page: 1, pageSize: 50, paymentMethods: ['BANK_TRANSFER', 'CASH'] }); });
    expect(state.snapshot).toBe(report); expect(state.snapshot?.metadata.generatedAt).toBe('2026-10-03T12:00:01Z');
    expect(state.stale).toBe(true); expect(state.error).toContain('Offline'); expect(state.refreshAttemptedAt).toBeTruthy();
  });
  it.each([0, null, { ...report, rows: undefined }, { ...report, rows: [{}] }, { ...report, summary: {} }, { ...report, summary: { ...report.summary, netInvoiceValue: null } }])('does not replace a valid snapshot with malformed response %j', async bad => {
    vi.mocked(fetchEndOfDayReportApi).mockResolvedValueOnce(report).mockResolvedValueOnce(bad as EndOfDayReportResponse);
    await mount(); await act(async () => { await state.load(query); }); await act(async () => { await state.refresh(); });
    expect(state.snapshot).toBe(report); expect(state.stale).toBe(true); expect(state.error).toBeTruthy();
  });
  it('clears the previous query snapshot when a changed-query request fails and retries the failed query', async () => {
    vi.mocked(fetchEndOfDayReportApi).mockResolvedValueOnce(report).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ ...report, metadata: { ...report.metadata, date: '2026-10-04' } });
    await mount(); await act(async () => { await state.load(query); }); await act(async () => { await state.load({ ...query, date: '2026-10-04' }); });
    expect(state.snapshot).toBeNull(); expect(state.stale).toBe(false);
    await act(async () => { await state.refresh(); }); expect(state.snapshot?.metadata.date).toBe('2026-10-04');
  });
  it('rejects incomplete breakdown entries without discarding the last cashflow snapshot', async () => {
    const cashflow: EndOfDayReportResponse = { ...report, metadata: { ...report.metadata, concern: 'CASHFLOW' }, summary: { totalReceipts: 100, totalPayments: 100, netCashFlow: 0, unreconciledCount: 0, byPaymentMethod: [], byAccount: [], byCategory: [], bySource: [], invariantCounters: { totalRows: 2 } } };
    vi.mocked(fetchEndOfDayReportApi).mockResolvedValueOnce(cashflow).mockResolvedValueOnce({ ...cashflow, summary: { ...cashflow.summary, bySource: [null] } } as unknown as EndOfDayReportResponse);
    await mount(); await act(async () => { await state.load({ ...query, concern: 'CASHFLOW' }); }); await act(async () => { await state.refresh(); });
    expect(state.snapshot).toBe(cashflow); expect(state.stale).toBe(true);
  });
  it('ignores an older response that resolves after a newer query', async () => {
    let resolveOld!: (response: EndOfDayReportResponse) => void;
    vi.mocked(fetchEndOfDayReportApi).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce({ ...report, metadata: { ...report.metadata, date: '2026-10-04' } });
    await mount(); let old!: Promise<void>;
    await act(async () => { old = state.load(query); }); await act(async () => { await state.load({ ...query, date: '2026-10-04' }); });
    await act(async () => { resolveOld(report); await old; }); expect(state.snapshot?.metadata.date).toBe('2026-10-04'); expect(state.error).toBeNull();
  });
  it('atomically replaces a stale snapshot on recovery and accepts valid zero aggregates', async () => {
    const zero = { ...report, summary: { ...report.summary, netInvoiceValue: 0 }, metadata: { ...report.metadata, generatedAt: '2026-10-03T13:00:00Z' } } as EndOfDayReportResponse;
    vi.mocked(fetchEndOfDayReportApi).mockResolvedValueOnce(report).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(zero);
    await mount(); await act(async () => { await state.load(query); }); await act(async () => { await state.refresh(); }); await act(async () => { await state.refresh(); });
    expect(state.snapshot).toBe(zero); expect(state.stale).toBe(false); expect(state.error).toBeNull(); expect(state.loading).toBe(false);
  });
});
