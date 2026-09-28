import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCustomerGroupsApi, fetchCustomersApi, fetchSelectableCustomersApi } from './customers';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

describe('customer management API', () => {
  it('sends staff credentials and preserves zero-valued filters', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [], pagination: {}, summary: {} } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await fetchCustomersApi('staff-token', { search: 'Hải & An', groupId: 0, minSales: 0, isActive: 'false', page: 2 });
    const [url, init] = fetchMock.mock.calls[0];
    const query = new URL(url as string).searchParams;
    expect(query.get('search')).toBe('Hải & An');
    expect(query.get('groupId')).toBe('0');
    expect(query.get('minSales')).toBe('0');
    expect(query.get('isActive')).toBe('false');
    expect(query.get('page')).toBe('2');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer staff-token');
  });

  it('loads active groups and posts newly entered reservation details', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 1, code: 'VIP', name: 'Khách VIP' }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 4, code: 'KH000004', name: 'Nguyễn An' } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchCustomerGroupsApi('token')).resolves.toEqual([{ id: 1, code: 'VIP', name: 'Khách VIP' }]);
    await expect((await import('./customers')).createCustomerApi('token', { name: 'Nguyễn An', phone: '0903000280' })).resolves.toMatchObject({ id: 4 });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/customers');
  });

  it('looks up customers for POS without losing Unicode search text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await fetchSelectableCustomersApi('cashier-token', 'Nguyễn An');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/customers/selectable?search=Nguy%E1%BB%85n%20An');
  });
});
