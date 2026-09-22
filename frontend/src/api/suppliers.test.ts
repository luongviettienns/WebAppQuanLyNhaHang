import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSuppliersApi } from './suppliers';
vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());
describe('supplier filters', () => {
  it('preserves zero monetary and ungrouped filters and encodes search safely', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [] } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await fetchSuppliersApi('token', { search: 'A & B', groupId: 0, minPurchase: 0, maxDebt: 100, from: '2026-09-22' });
    const query = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect(query.get('groupId')).toBe('0');
    expect(query.get('minPurchase')).toBe('0');
    expect(query.get('maxDebt')).toBe('100');
    expect(query.get('search')).toBe('A & B');
    expect(query.get('from')).toBe('2026-09-22');
  });
});
