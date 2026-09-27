import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDeliveryPartnersApi } from './deliveryPartners';
vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

describe('delivery partner API filters', () => {
  it('preserves zero amounts, inactive selection and safe search encoding', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [], pagination: {}, summary: {} } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await fetchDeliveryPartnersApi('token', { search: 'A & B', groupId: 0, minDeliveryFee: 0, maxDebt: 100, isActive: 'false' });
    const query = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
    expect(query.get('search')).toBe('A & B'); expect(query.get('groupId')).toBe('0'); expect(query.get('minDeliveryFee')).toBe('0'); expect(query.get('maxDebt')).toBe('100'); expect(query.get('isActive')).toBe('false');
  });
});
