import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadInventoryCatalogExportApi,
  fetchInventoryCatalogApi
} from './inventoryCatalog';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('inventory catalog API helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('serializes non-default filters and pagination deterministically', async () => {
    const data = { rows: [], summary: {}, pagination: {} };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });

    await expect(fetchInventoryCatalogApi('token', {
      search: '  gà  ',
      managementGroup: 'SELLABLE',
      categoryId: 4,
      menuType: 'FOOD',
      stockStatus: 'LOW',
      position: 'B1',
      isActive: 'all',
      page: 2,
      pageSize: 25,
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    })).resolves.toEqual(data);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/inventory/catalog?search=g%C3%A0&managementGroup=SELLABLE&categoryId=4&menuType=FOOD&stockStatus=LOW&position=B1&isActive=all&page=2&pageSize=25&sortBy=updatedAt&sortOrder=desc',
      { headers: { Authorization: 'Bearer token' } }
    );
  });

  it('omits empty/default query values and downloads the requested export format', async () => {
    const blob = new Blob(['catalog']);
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob });

    await expect(downloadInventoryCatalogExportApi(null, {
      search: ' ',
      stockStatus: 'ALL',
      isActive: 'true',
      page: 1,
      pageSize: 50,
      sortBy: 'sku',
      sortOrder: 'asc'
    }, 'csv')).resolves.toBe(blob);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/inventory/catalog/export?format=csv',
      { headers: {} }
    );
  });

  it('surfaces the backend error envelope', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Chỉ ADMIN mới có quyền truy cập' } })
    });

    await expect(fetchInventoryCatalogApi('cashier', {})).rejects.toThrow('Chỉ ADMIN mới có quyền truy cập');
  });
});
