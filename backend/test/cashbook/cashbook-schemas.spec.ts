import { describe, expect, it } from 'vitest';
import { parseCashbookListQuery, parseManualVoucherInput } from '../../src/modules/cashbook/cashbook.schemas';

describe('cashbook API contracts', () => {
  it('normalizes multi-value filters and applies safe pagination defaults', () => {
    expect(parseCashbookListQuery({
      accountIds: '2,1,2', directions: ['RECEIPT', 'PAYMENT'], statuses: 'POSTED,CANCELLED', page: '2'
    })).toMatchObject({ accountIds: [1, 2], directions: ['RECEIPT', 'PAYMENT'], statuses: ['POSTED', 'CANCELLED'], page: 2, pageSize: 25 });
  });

  it('rejects an inverted report period and malformed account filters', () => {
    expect(() => parseCashbookListQuery({ from: '2026-10-02T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })).toThrow();
    expect(() => parseCashbookListQuery({ accountIds: '1,nope' })).toThrow();
  });

  it('requires a client-stable idempotency key for manual voucher creation', () => {
    const body = { direction: 'RECEIPT', amount: 100_000, accountId: 1, categoryId: 2, paymentMethod: 'CASH', note: 'Bổ sung quỹ' };
    expect(() => parseManualVoucherInput(body, undefined)).toThrow();
    expect(() => parseManualVoucherInput(body, 'short')).toThrow();
    expect(parseManualVoucherInput(body, 'cashier-req-001')).toMatchObject({ clientRequestId: 'cashier-req-001', amount: 100_000 });
  });

  it('rejects extra client-controlled source fields on manual vouchers', () => {
    expect(() => parseManualVoucherInput({
      direction: 'RECEIPT', amount: 100, accountId: 1, categoryId: 2, sourceKey: 'ORDER:7'
    }, 'cashier-req-002')).toThrow();
  });
});
