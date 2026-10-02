import { describe, expect, it } from 'vitest';
import { calculateSupplierOutstanding } from './supplier-payment.domain';

describe('supplier payable balance', () => {
  it('subtracts successful payments and only the return amount applied to debt', () => {
    expect(calculateSupplierOutstanding({ receiptsPayable: 1_000_000, successfulPayments: 400_000, returnsPayable: 300_000, supplierRefunds: 100_000 }))
      .toBe(400_000);
    expect(calculateSupplierOutstanding({ receiptsPayable: 1_000_000, successfulPayments: 100_000, returnsPayable: 300_000, supplierRefunds: 100_000 }))
      .toBe(700_000);
  });

  it('never permits supplier overpayment to produce a negative payable', () => {
    expect(calculateSupplierOutstanding({ receiptsPayable: 100, successfulPayments: 200, returnsPayable: 0, supplierRefunds: 0 })).toBe(0);
  });
});
