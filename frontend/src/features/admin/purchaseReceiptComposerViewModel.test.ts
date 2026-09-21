import { describe, expect, it } from 'vitest';
import {
  getPurchaseReceiptComposerTotals,
  mergePurchaseReceiptLine,
  validateReceiptForPost
} from './purchaseReceiptComposerViewModel';

describe('purchase receipt composer view model', () => {
  it('requires a supplier and one line before completion', () => {
    expect(validateReceiptForPost({ supplierId: null, lines: [] })).toEqual([
      'Vui lòng chọn nhà cung cấp',
      'Phiếu nhập cần ít nhất một nguyên liệu'
    ]);
  });

  it('merges duplicate ingredients by adding quantities', () => {
    const existing = {
      ingredientId: 7,
      ingredientSku: 'SP000007',
      ingredientName: 'Cà phê',
      unit: 'kg',
      quantity: 2,
      unitCost: 100000,
      discountAmount: 0,
      note: null
    };

    expect(mergePurchaseReceiptLine([existing], {
      ...existing,
      quantity: 3,
      unitCost: 110000
    })).toEqual([{
      ...existing,
      quantity: 5,
      unitCost: 110000
    }]);
  });

  it('calculates subtotal, payable and outstanding from line totals', () => {
    expect(getPurchaseReceiptComposerTotals([
      { quantity: 2, unitCost: 10000, discountAmount: 500 },
      { quantity: 1, unitCost: 25000, discountAmount: 0 }
    ], 1000, 5000)).toEqual({
      subtotalAmount: 44500,
      discountAmount: 1000,
      payableAmount: 43500,
      paidAmount: 5000,
      outstandingAmount: 38500
    });
  });
});
