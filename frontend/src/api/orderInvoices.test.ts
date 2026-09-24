import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadOrderInvoiceExportApi, fetchOrderInvoicesApi } from './orderInvoices';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('order invoice API helpers', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

  it('serializes invoice filters and pagination deterministically', async () => {
    const data = { items: [], pagination: {}, summary: {} };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });
    await expect(fetchOrderInvoicesApi('token', { search: ' HD01 ', from: '2026-09-01', to: '2026-09-30', statuses: ['COMPLETED'], paymentStatuses: ['PAID'], page: 2, pageSize: 20 })).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/orders/invoices?search=HD01&from=2026-09-01&to=2026-09-30&statuses=COMPLETED&paymentStatuses=PAID&page=2&pageSize=20',
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('exports with filters but never sends pagination', async () => {
    const blob = new Blob(['invoice']); fetchMock.mockResolvedValue({ ok: true, blob: async () => blob });
    await expect(downloadOrderInvoiceExportApi(null, { paymentStatuses: ['PAID'], page: 4, pageSize: 10 }, 'csv')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/orders/invoices/export?paymentStatuses=PAID&format=csv', { headers: {} });
  });
});
