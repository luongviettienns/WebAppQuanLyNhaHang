import { describe, expect, it } from 'vitest';
import { buildCashflowRegistry, canonicalMoneyEventKey, type CashflowCandidate } from './cashflow.registry';

const at = '2026-10-03T05:00:00.000Z';
function domain(overrides: Partial<CashflowCandidate> = {}): CashflowCandidate {
  return { sourceType: 'ORDER_PAYMENT', sourceTransactionId: 11, sourceKey: 'ORDER_PAYMENT:11',
    status: 'SUCCESS', occurredAt: at, direction: 'RECEIPT', amount: 100, paymentMethod: 'CASH',
    documentCode: 'HD-1', customerId: 3, customerName: 'Khách', creatorUserId: 5, creatorUserName: 'Xác nhận',
    accountId: null, accountName: null, categoryId: null, categoryName: null, externalReference: null,
    cashVoucherId: null, reversalOfId: null, ...overrides };
}
function voucher(overrides: Partial<CashflowCandidate> = {}): CashflowCandidate {
  return domain({ status: 'POSTED', cashVoucherId: 21, accountId: 1, accountName: 'Quỹ', categoryId: 2,
    categoryName: 'Thu', documentCode: 'PT-21', occurredAt: '2026-10-04T05:00:00.000Z', ...overrides });
}

describe('canonical Cashflow registry', () => {
  it('uses immutable source identity, including separate payments for one order', () => {
    expect(canonicalMoneyEventKey('ORDER_PAYMENT', 11)).toBe('ORDER_PAYMENT:11');
    expect(buildCashflowRegistry([domain(), domain({ sourceTransactionId: 12, sourceKey: 'ORDER_PAYMENT:12' })], []).map(e => e.key))
      .toEqual(['ORDER_PAYMENT:11', 'ORDER_PAYMENT:12']);
  });
  it('deduplicates a linked voucher while domain money, actor and timestamp win', () => {
    const result = buildCashflowRegistry([domain()], [voucher({ amount: 999, creatorUserId: 99 })]);
    expect(result).toMatchObject([{ key: 'ORDER_PAYMENT:11', amount: 100, occurredAt: at,
      creatorUserId: 5, accountId: 1, cashVoucherId: 21, documentCode: 'HD-1', reconciliationStatus: 'RECONCILED' }]);
    expect(result).toHaveLength(1);
  });
  it('matches a stable source key when voucher transaction identity is absent', () => {
    expect(buildCashflowRegistry([domain()], [voucher({ sourceTransactionId: null })])).toHaveLength(1);
    expect(buildCashflowRegistry([domain()], [voucher({ sourceTransactionId: null })])[0].cashVoucherId).toBe(21);
  });
  it('keeps real domain money unreconciled when its voucher is cancelled', () => {
    expect(buildCashflowRegistry([domain()], [voucher({ status: 'CANCELLED' })]))
      .toMatchObject([{ amount: 100, cashVoucherId: null, accountId: null, reconciliationStatus: 'UNRECONCILED' }]);
    expect(buildCashflowRegistry([], [voucher({ status: 'CANCELLED' })])).toEqual([]);
  });
  it('does not create money for pending, rejected, apply-to-bill or forfeiture transactions', () => {
    expect(buildCashflowRegistry([
      domain({ status: 'PENDING' }), domain({ status: 'REJECTED' }),
      domain({ sourceType: 'APPLY_TO_BILL' }), domain({ sourceType: 'FORFEIT' })
    ], [])).toEqual([]);
  });
  it('suppresses even posted vouchers linked to explicit non-cash reservation transactions', () => {
    expect(buildCashflowRegistry([
      domain({ sourceType: 'APPLY_TO_BILL', sourceTransactionId: 1 }),
      domain({ sourceType: 'FORFEIT', sourceTransactionId: 2 })
    ], [
      voucher({ sourceType: 'RESERVATION_DEPOSIT', sourceTransactionId: 1, sourceKey: 'RESERVATION_DEPOSIT:1' }),
      voucher({ sourceType: 'RESERVATION_REFUND', sourceTransactionId: 2, sourceKey: 'RESERVATION_REFUND:2' }),
      voucher({ sourceType: 'MANUAL', sourceTransactionId: null, sourceKey: 'MANUAL:independent' })
    ]).map(e => e.key)).toEqual(['MANUAL:independent']);
  });
  it('keeps reservation refunds and actual return refunds as payments', () => {
    const result = buildCashflowRegistry([
      domain({ sourceType: 'RESERVATION_DEPOSIT', sourceTransactionId: 1, sourceKey: 'RESERVATION_DEPOSIT:1' }),
      domain({ sourceType: 'RESERVATION_REFUND', sourceTransactionId: 2, sourceKey: 'RESERVATION_REFUND:2', direction: 'PAYMENT', amount: 30 }),
      domain({ sourceType: 'SALES_RETURN_REFUND', sourceTransactionId: 3, sourceKey: 'SALES_RETURN_REFUND:3', status: 'COMPLETED', direction: 'PAYMENT', amount: 20 }),
      domain({ sourceType: 'SALES_RETURN_REFUND', status: 'COMPLETED', amount: 0 })
    ], []);
    expect(result.map(e => e.amount)).toEqual([100, -30, -20]);
  });
  it('exposes refundCompletedAt from the return domain even when a linked voucher is on another day', () => {
    const result = buildCashflowRegistry([
      domain({ sourceType: 'SALES_RETURN_REFUND', sourceTransactionId: 3, sourceKey: 'SALES_RETURN_REFUND:3', status: 'COMPLETED', direction: 'PAYMENT', amount: 20 })
    ], [voucher({ sourceType: 'SALES_RETURN_REFUND', sourceTransactionId: 3, sourceKey: 'SALES_RETURN_REFUND:3' })]);
    expect(result[0]).toMatchObject({ occurredAt: at, refundCompletedAt: at });
    expect(buildCashflowRegistry([domain()], [])[0]).toHaveProperty('refundCompletedAt', null);
  });
  it('keeps manual and reversal vouchers as distinct signed events at occurredAt', () => {
    const result = buildCashflowRegistry([], [
      voucher({ sourceType: 'MANUAL', sourceTransactionId: null, sourceKey: 'MANUAL:request', occurredAt: at }),
      voucher({ sourceType: 'REVERSAL', sourceTransactionId: 21, sourceKey: 'REVERSAL:21', cashVoucherId: 22, reversalOfId: 21, direction: 'PAYMENT', occurredAt: at })
    ]);
    expect(result.map(e => [e.key, e.amount, e.occurredAt, e.reversalOfId])).toEqual([
      ['MANUAL:request', 100, at, null], ['REVERSAL:21', -100, at, 21]
    ]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it('deduplicates integrated and missing-domain identity aliases using the lowest voucher id', () => {
    const result = buildCashflowRegistry([
      domain({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: 7, sourceKey: 'SUPPLIER_PAYMENT:7', customerId: null })
    ], [
      voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: 7, sourceKey: 'legacy:supplier:7', cashVoucherId: 1, direction: 'PAYMENT', amount: 25 }),
      voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: null, sourceKey: 'SUPPLIER_PAYMENT:7', cashVoucherId: 2, direction: 'PAYMENT', amount: 999 }),
      voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: 99, sourceKey: 'legacy:missing:99', cashVoucherId: 3 }),
      voucher({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: null, sourceKey: 'ORDER_PAYMENT:99', cashVoucherId: 4 })
    ]);
    expect(result.map(e => [e.key, e.cashVoucherId, e.amount, e.occurredAt])).toEqual([
      ['SUPPLIER_PAYMENT:7', 1, -25, at], ['ORDER_PAYMENT:99', 3, 100, '2026-10-04T05:00:00.000Z']
    ]);
  });
  it('chooses one authoritative explicit target despite a stable key naming another supplier payment', () => {
    const result = buildCashflowRegistry([
      domain({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: 7, sourceKey: 'SUPPLIER_PAYMENT:7', creatorUserId: 5 }),
      domain({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: 8, sourceKey: 'SUPPLIER_PAYMENT:8', occurredAt: '2026-10-05T05:00:00.000Z', creatorUserId: 6 })
    ], [voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: 7, sourceKey: 'SUPPLIER_PAYMENT:8', direction: 'PAYMENT', amount: 25 })]);
    expect(result).toMatchObject([{ key: 'SUPPLIER_PAYMENT:7', occurredAt: at, creatorUserId: 5, amount: -25 }]);
    expect(result).toHaveLength(1);
  });
  it('resolves an existing pending explicit target before considering a successful stable-key target', () => {
    const result = buildCashflowRegistry([
      domain({ sourceTransactionId: 1, sourceKey: 'ORDER_PAYMENT:1', status: 'PENDING' }),
      domain({ sourceTransactionId: 2, sourceKey: 'ORDER_PAYMENT:2' })
    ], [voucher({ sourceTransactionId: 1, sourceKey: 'ORDER_PAYMENT:2' })]);
    expect(result.find(e => e.key === 'ORDER_PAYMENT:1')).toMatchObject({ occurredAt: at, cashVoucherId: 21 });
    expect(result.find(e => e.key === 'ORDER_PAYMENT:2')).toMatchObject({ cashVoucherId: null, reconciliationStatus: 'UNRECONCILED' });
  });
  it('suppresses non-cash reservation vouchers only when the resolved authoritative target is non-cash', () => {
    const result = buildCashflowRegistry([
      domain({ sourceType: 'RESERVATION_DEPOSIT', sourceTransactionId: 1, sourceKey: 'RESERVATION_DEPOSIT:1' }),
      domain({ sourceType: 'FORFEIT', sourceTransactionId: 2 })
    ], [voucher({ sourceType: 'RESERVATION_DEPOSIT', sourceTransactionId: 1, sourceKey: 'RESERVATION_DEPOSIT:2' })]);
    expect(result).toMatchObject([{ key: 'RESERVATION_DEPOSIT:1', reconciliationStatus: 'RECONCILED' }]);
    expect(result).toHaveLength(1);
  });
  it('keeps reversals independent of unrelated repeated transaction ids', () => {
    const result = buildCashflowRegistry([], [
      voucher({ sourceType: 'REVERSAL', sourceTransactionId: 5, sourceKey: 'REVERSAL:original-one', cashVoucherId: 1 }),
      voucher({ sourceType: 'REVERSAL', sourceTransactionId: 5, sourceKey: 'REVERSAL:original-two', cashVoucherId: 2 })
    ]);
    expect(result.map(e => e.key)).toEqual(['REVERSAL:original-one', 'REVERSAL:original-two']);
  });
  it('uses voucher-unique identities for integrated vouchers without an id or exact parseable key', () => {
    const result = buildCashflowRegistry([], [
      voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: null, sourceKey: 'legacy:unresolved', cashVoucherId: 7 }),
      voucher({ sourceType: 'SUPPLIER_PAYMENT', sourceTransactionId: null, sourceKey: 'SUPPLIER_PAYMENT:0001', cashVoucherId: 8 })
    ]);
    expect(result.map(e => e.key)).toEqual(['SUPPLIER_PAYMENT:VOUCHER:7', 'SUPPLIER_PAYMENT:VOUCHER:8']);
  });
});
