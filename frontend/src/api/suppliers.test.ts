import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSuppliersApi, recordSupplierPaymentApi } from './suppliers';
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

  it('posts supplier debt payments with the selected account and stable retry key', async () => {
    const payment = { id: 17, supplierId: 3, amount: 250_000, paymentMethod: 'CASH', financialAccountId: 2, status: 'SUCCESS' };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ data: payment }) } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await recordSupplierPaymentApi('staff-token', 3, {
      amount: 250_000, paymentMethod: 'CASH', financialAccountId: 2, note: 'Thanh toán công nợ'
    }, 'supplier-pay-try-1');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/inventory/suppliers/3/payments');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer staff-token', 'Content-Type': 'application/json', 'Idempotency-Key': 'supplier-pay-try-1' },
      body: JSON.stringify({ amount: 250_000, paymentMethod: 'CASH', financialAccountId: 2, note: 'Thanh toán công nợ' })
    });
  });
});
