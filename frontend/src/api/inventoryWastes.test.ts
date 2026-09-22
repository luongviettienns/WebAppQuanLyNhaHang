import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeInventoryWasteApi,
  fetchInventoryWastesApi,
  saveInventoryWasteDraftApi
} from './inventoryWastes';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('inventory waste API helpers', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { items: [] } }) });
  });

  it('builds a filtered waste list query', async () => {
    await fetchInventoryWastesApi('token', {
      statuses: ['DRAFT', 'COMPLETED'],
      from: '2026-09-01',
      to: '2026-09-30',
      search: 'XH',
      page: 2,
      pageSize: 20
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/inventory/wastes?statuses=DRAFT%2CCOMPLETED&from=2026-09-01&to=2026-09-30&search=XH&page=2&pageSize=20');
  });

  it('uses the waste draft and completion command endpoints', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: 12 } }) });

    await saveInventoryWasteDraftApi('token', null, {
      note: 'Hàng hỏng',
      lines: [{ ingredientId: 2, quantity: 1 }]
    });
    await completeInventoryWasteApi('token', 12);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/inventory/wastes');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/inventory/wastes/12/complete');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });
});
