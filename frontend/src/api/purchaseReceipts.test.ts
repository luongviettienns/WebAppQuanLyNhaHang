import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPurchaseReceiptsApi,
  postPurchaseReceiptApi,
  previewPurchaseReceiptImportApi,
  savePurchaseReceiptDraftApi
} from './purchaseReceipts';
import { fetchSuppliersApi } from './suppliers';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('purchase receipt API helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('serializes receipt filters without undefined values', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { items: [] } }) });

    await fetchPurchaseReceiptsApi('token', { status: ['DRAFT', 'POSTED'], page: 2, pageSize: 50 });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('https://api.example.test/api/inventory/purchase-receipts?');
    expect(url).toContain('statuses=DRAFT%2CPOSTED');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=50');
    expect(url).not.toContain('undefined');
    expect(options).toEqual({ headers: { Authorization: 'Bearer token' } });
  });

  it('creates and updates a draft through the matching REST command', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: 12, status: 'DRAFT' } }) });
    const input = { supplierId: 4, paidAmount: 10_000, lines: [] };

    await savePurchaseReceiptDraftApi('token', null, input);
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.example.test/api/inventory/purchase-receipts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
        body: JSON.stringify(input)
      }
    ]);

    await savePurchaseReceiptDraftApi('token', 12, input);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/inventory/purchase-receipts/12');
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
  });

  it('posts a receipt and previews Excel without inventing cash state', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: 12, status: 'POSTED' } }) });

    await expect(postPurchaseReceiptApi('token', 12)).resolves.toMatchObject({ id: 12, status: 'POSTED' });
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.example.test/api/inventory/purchase-receipts/12/post',
      { method: 'POST', headers: { Authorization: 'Bearer token' } }
    ]);

    await previewPurchaseReceiptImportApi('token', 'import.xlsx', 'base64-data');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/inventory/purchase-receipts/import/preview');
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ fileName: 'import.xlsx', fileBase64: 'base64-data' }));
  });

  it('loads active suppliers with trimmed search and pagination', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { items: [] } }) });

    await fetchSuppliersApi('token', { search: '  hoàng  ', page: 2, pageSize: 20 });

    expect(fetchMock.mock.calls[0][0]).toContain('search=ho%C3%A0ng');
    expect(fetchMock.mock.calls[0][0]).toContain('page=2');
    expect(fetchMock.mock.calls[0][0]).toContain('pageSize=20');
  });
});
