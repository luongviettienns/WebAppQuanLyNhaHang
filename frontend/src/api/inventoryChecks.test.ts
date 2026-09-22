import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  balanceInventoryCheckApi,
  fetchInventoryCheckDetailApi,
  fetchInventoryChecksApi,
  saveInventoryCheckDraftApi
} from './inventoryChecks';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('inventory check API helpers', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { items: [] } }) });
  });

  it('builds a list query with status, date and pagination filters', async () => {
    await fetchInventoryChecksApi('token', { statuses: ['DRAFT', 'BALANCED'], from: '2026-09-01', to: '2026-09-30', search: 'KK', page: 2, pageSize: 20 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/inventory/checks?statuses=DRAFT%2CBALANCED&from=2026-09-01&to=2026-09-30&search=KK&page=2&pageSize=20');
  });

  it('uses the command endpoints for save, detail and balance', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { id: 12 } }) });
    await saveInventoryCheckDraftApi('token', null, { note: 'test', lines: [] });
    await fetchInventoryCheckDetailApi('token', 12);
    await balanceInventoryCheckApi('token', 12);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/inventory/checks');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/inventory/checks/12');
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.example.test/api/inventory/checks/12/balance');
  });
});
