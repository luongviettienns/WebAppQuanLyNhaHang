import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSalesReturnApi } from './salesReturns';
import { getSalesReturnIdempotencyKey } from './salesReturnIdempotency';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());

describe('sales return API client', () => {
  it('sends a stable retry key as a header, not as return data', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 4 } }) } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const input = { orderId: 7, lines: [{ orderItemId: 3, quantity: 1 }], refundMethod: 'CASH' as const, financialAccountId: null };

    await createSalesReturnApi('staff-token', input, 'sales-return-retry-123');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/orders/returns');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer staff-token', 'Idempotency-Key': 'sales-return-retry-123' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(input);
  });

  it('keeps an uncertain return request key across a page reload until success is acknowledged', async () => {
    const persisted = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => persisted.get(key) ?? null,
      setItem: (key: string, value: string) => { persisted.set(key, value); },
      removeItem: (key: string) => { persisted.delete(key); }
    });
    const input = { orderId: 9, lines: [{ orderItemId: 3, quantity: 1 }], refundMethod: 'CASH' as const };
    const firstKey = await getSalesReturnIdempotencyKey(input);

    vi.resetModules();
    const reloaded = await import('./salesReturnIdempotency');
    await expect(reloaded.getSalesReturnIdempotencyKey(input)).resolves.toBe(firstKey);
    await reloaded.clearSalesReturnIdempotencyKey(input);
    expect(persisted.size).toBe(0);
  });
});
