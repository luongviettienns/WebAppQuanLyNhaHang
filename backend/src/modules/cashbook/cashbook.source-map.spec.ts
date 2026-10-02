import { describe, expect, it } from 'vitest';
import { toCashbookSourceReference } from './cashbook.source-map';

describe('cashbook source references', () => {
  it('creates distinct source keys for separate payments belonging to one order', () => {
    const firstPayment = toCashbookSourceReference({
      sourceType: 'ORDER_PAYMENT',
      sourceTransactionId: 101
    });
    const secondPayment = toCashbookSourceReference({
      sourceType: 'ORDER_PAYMENT',
      sourceTransactionId: 102
    });

    expect(firstPayment).toEqual({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: 101, sourceKey: 'ORDER_PAYMENT:101', direction: 'RECEIPT' });
    expect(secondPayment).toEqual({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: 102, sourceKey: 'ORDER_PAYMENT:102', direction: 'RECEIPT' });
    expect(firstPayment.sourceKey).not.toBe(secondPayment.sourceKey);
  });

  it.each([
    ['RESERVATION_DEPOSIT', 11, 'RESERVATION_DEPOSIT:11', 'RECEIPT'],
    ['RESERVATION_REFUND', 12, 'RESERVATION_REFUND:12', 'PAYMENT'],
    ['SALES_RETURN_REFUND', 13, 'SALES_RETURN_REFUND:13', 'PAYMENT'],
    ['PURCHASE_RECEIPT_PAYMENT', 14, 'PURCHASE_RECEIPT_PAYMENT:14', 'PAYMENT'],
    ['SUPPLIER_PAYMENT', 15, 'SUPPLIER_PAYMENT:15', 'PAYMENT'],
    ['PURCHASE_RETURN_REFUND', 16, 'PURCHASE_RETURN_REFUND:16', 'RECEIPT'],
    ['PAYROLL_PAYMENT', 17, 'PAYROLL_PAYMENT:17', 'PAYMENT']
  ] as const)('maps %s using its immutable transaction ID', (sourceType, id, sourceKey, direction) => {
    expect(toCashbookSourceReference({ sourceType, sourceTransactionId: id })).toEqual({
      sourceType,
      sourceTransactionId: id,
      sourceKey,
      direction
    });
  });

  it('does not accept a parent order identifier as a transaction reference', () => {
    expect(() => toCashbookSourceReference({ sourceType: 'ORDER_PAYMENT', sourceTransactionId: 0 })).toThrow();
  });
});
