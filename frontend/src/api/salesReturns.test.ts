import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSalesReturnCandidatesApi, fetchSalesReturnsApi } from './salesReturns';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('sales return API helpers', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

  it('serializes return list filters with pagination', async () => {
    const data = { items: [], pagination: { page: 2, pageSize: 20, totalRows: 0, totalPages: 1 }, summary: { totalRefundDue: 0, totalRefunded: 0 } };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });
    await expect(fetchSalesReturnsApi('token', { search: ' THD01 ', from: '2026-09-01', to: '2026-09-30', statuses: ['COMPLETED'], tableId: 7, page: 2, pageSize: 20 })).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/orders/returns?search=THD01&from=2026-09-01&to=2026-09-30&statuses=COMPLETED&tableId=7&page=2&pageSize=20',
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('loads eligible paid invoice candidates without status filters', async () => {
    const data = { items: [], pagination: { page: 1, pageSize: 50, totalRows: 0, totalPages: 1 } };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });
    await expect(fetchSalesReturnCandidatesApi(null, { search: 'HD0001', page: 1, pageSize: 50 })).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/orders/returns/candidates?search=HD0001&page=1&pageSize=50', { headers: {} });
  });
});
