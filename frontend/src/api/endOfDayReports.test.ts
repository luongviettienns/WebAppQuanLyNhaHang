import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEndOfDayReportQuery, downloadEndOfDayReportApi, fetchEndOfDayReportApi } from './endOfDayReports';
import type { EndOfDayReportResponse, SalesReportRow, SalesSummary } from './endOfDayReports';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('end-of-day report API', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it('serializes arrays and both time bounds without adding unsupported keys', () => {
    expect(buildEndOfDayReportQuery({ date: '2026-10-03', concern: 'CASHFLOW', view: 'HORIZONTAL', fromTime: '08:00', toTime: '22:00', paymentMethods: ['CASH', 'BANK_TRANSFER'], recordTypes: ['MANUAL', 'REVERSAL'], creatorUserId: 7, customerId: undefined, search: ' HD 01 ', page: 2, pageSize: 50, sortBy: 'amount', sortOrder: 'asc' })).toBe('?date=2026-10-03&fromTime=08%3A00&toTime=22%3A00&concern=CASHFLOW&view=HORIZONTAL&creatorUserId=7&paymentMethods=CASH%2CBANK_TRANSFER&recordTypes=MANUAL%2CREVERSAL&search=+HD+01+&page=2&pageSize=50&sortBy=amount&sortOrder=asc');
    expect(buildEndOfDayReportQuery({ concern: 'CANCELLED_ITEMS', delivery: false, receiverEmployeeId: 4, cancelReason: 'Hết món' })).toBe('?concern=CANCELLED_ITEMS&receiverEmployeeId=4&delivery=false&cancelReason=H%E1%BA%BFt+m%C3%B3n');
    expect(buildEndOfDayReportQuery({})).toBe('');
  });

  it('returns the response envelope data and preserves independently sampled metadata', async () => {
    const data: EndOfDayReportResponse<SalesReportRow, SalesSummary & { invariantCounters: Record<string, number> }> = {
      metadata: { date: '2026-10-03', from: '2026-10-02T17:00:00.000Z', to: '2026-10-03T17:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh', asOf: '2026-10-03T12:00:00.000Z', generatedAt: '2026-10-03T12:00:01.000Z', concern: 'SALES', view: 'VERTICAL', operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true } },
      hasData: false, rows: [],
      summary: { completedInvoiceCount: 0, grossInvoiceValue: 0, salesReturnValue: 0, netInvoiceValue: 0, goodsAmount: 0, discountAmount: 0, vatAmount: 0, deliveryFee: 0, invariantCounters: { totalRows: 0, completedInvoiceCount: 0, salesReturnCount: 0, legacyPaymentMethodFallbackRows: 0 } },
      pagination: { page: 1, pageSize: 50, totalRows: 0, totalPages: 0 }, filterOptions: {}
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });
    await expect(fetchEndOfDayReportApi('token', { concern: 'SALES' })).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/reports/end-of-day?concern=SALES', { headers: { Authorization: 'Bearer token' } });
  });

  it('unwraps VALIDATION_ERROR and REPORT_EXPORT_TOO_LARGE messages', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Phải chọn cả giờ bắt đầu và giờ kết thúc', details: { issues: [{ path: ['fromTime'] }] } } }) });
    await expect(fetchEndOfDayReportApi(null, { fromTime: '08:00' })).rejects.toMatchObject({ message: 'Phải chọn cả giờ bắt đầu và giờ kết thúc', code: 'VALIDATION_ERROR', status: 400, details: { issues: [{ path: ['fromTime'] }] } });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 413, json: async () => ({ error: { code: 'REPORT_EXPORT_TOO_LARGE', message: 'Thu hẹp bộ lọc để xuất báo cáo', details: { maxRows: 100000 } } }) });
    await expect(downloadEndOfDayReportApi(null, {})).rejects.toMatchObject({ message: 'Thu hẹp bộ lọc để xuất báo cáo', code: 'REPORT_EXPORT_TOO_LARGE', status: 413, details: { maxRows: 100000 } });
  });

  it('downloads XLSX with the same filter query and without screen pagination', async () => {
    const blob = new Blob(['xlsx']);
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob });
    await expect(downloadEndOfDayReportApi('token', { date: '2026-10-03', fromTime: '08:00', toTime: '22:00', concern: 'GOODS', view: 'VERTICAL', recordTypes: ['STOCK_IN', 'SALES_RETURN'], page: 3, pageSize: 20, sortBy: 'quantity', sortOrder: 'desc' })).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/reports/end-of-day/export?date=2026-10-03&fromTime=08%3A00&toTime=22%3A00&concern=GOODS&view=VERTICAL&recordTypes=STOCK_IN%2CSALES_RETURN&sortBy=quantity&sortOrder=desc&format=xlsx', { headers: { Authorization: 'Bearer token' } });
  });
});
