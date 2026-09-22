import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkUpdatePriceListApi, fetchGeneralPriceListApi, updatePriceListItemApi } from './priceList';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('price list API helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('loads general price list with admin token', async () => {
    const data = { priceList: { id: 1 }, items: [] };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data }) });

    await expect(fetchGeneralPriceListApi('token')).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/price-lists/general', {
      headers: { Authorization: 'Bearer token' }
    });
  });

  it('updates one row with optimistic version', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { item: { id: 3 } } }) });

    await expect(updatePriceListItemApi('token', 1, 22, 30_000, 2)).resolves.toEqual({ item: { id: 3 } });
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/price-lists/1/items/22', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ salePrice: 30_000, expectedVersion: 2 })
    });
  });

  it('sends a bulk formula operation', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { updatedCount: 2 } }) });
    await expect(bulkUpdatePriceListApi('token', 1, [22, 23], { mode: 'percent', value: 10, rounding: 1000 })).resolves.toEqual({ updatedCount: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/price-lists/1/items/bulk');
  });
});
