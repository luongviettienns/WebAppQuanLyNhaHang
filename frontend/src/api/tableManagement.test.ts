import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManagedTableApi, fetchManagedTablesApi } from './tableManagement';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

describe('table management API', () => {
  it('serializes management filters without dropping inactive selection', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [], pagination: {} } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await fetchManagedTablesApi('token', { search: 'VIP & 1', areaId: 2, isActive: 'false', page: 3 });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/tables/manage');
    expect(url.searchParams.get('search')).toBe('VIP & 1');
    expect(url.searchParams.get('areaId')).toBe('2');
    expect(url.searchParams.get('isActive')).toBe('false');
    expect(url.searchParams.get('page')).toBe('3');
  });

  it('creates a table using the admin endpoint and bearer token', async () => {
    const input = { displayName: 'Bàn cửa sổ', areaId: 4, seatCount: 6, displayOrder: 2, note: null };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 1, ...input } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await createManagedTableApi('secret', input);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: JSON.stringify(input)
    });
  });
});
