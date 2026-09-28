import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmReservationDepositApi, createPublicReservationApi, fetchReservationsApi } from './reservations';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

describe('reservation API clients', () => {
  it('encodes staff filters and attaches the staff session', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: { items: [], pagination: {} } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await fetchReservationsApi('staff-token', { status: 'CONFIRMED', depositStatus: 'PAID', search: 'An & Bình', page: 2 });
    const [url, init] = fetchMock.mock.calls[0];
    const query = new URL(url as string).searchParams;
    expect(query.get('status')).toBe('CONFIRMED'); expect(query.get('depositStatus')).toBe('PAID');
    expect(query.get('search')).toBe('An & Bình'); expect(query.get('page')).toBe('2');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer staff-token');
  });

  it('creates a public booking without staff credentials and confirms its deposit through the authorized endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { code: 'BK1', accessToken: 'private-booking-token', depositAmount: 300000 } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 7, depositStatus: 'PAID' } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    await createPublicReservationApi({ name: 'Khách đặt', phone: '0903000000', scheduledAt: '2026-09-30T10:00:00.000Z', partySize: 3 });
    await confirmReservationDepositApi('staff-token', 7, 300000, 'BANK-TRACE-7');
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/reservations/7/deposit/confirm');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ amount: 300000, paymentMethod: 'BANK_TRANSFER', externalReference: 'BANK-TRACE-7' });
  });
});
