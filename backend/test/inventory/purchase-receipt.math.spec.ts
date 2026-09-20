import { describe, expect, it } from 'vitest';
import { calculatePurchaseReceiptTotals } from '../../src/modules/inventory/purchase-receipt.math';

describe('calculatePurchaseReceiptTotals', () => {
  const line = { quantity: 2, unitCost: 15000, discountAmount: 1000 };
  const input = { lines: [line], discountAmount: 2000, paidAmount: 12000 };

  it('subtracts both discounts and derives the remaining amount', () => {
    expect(calculatePurchaseReceiptTotals(input)).toEqual({
      subtotalAmount: 29000, payableAmount: 27000, outstandingAmount: 15000
    });
  });

  it('allows an empty draft with zero totals', () => {
    expect(calculatePurchaseReceiptTotals({ lines: [], discountAmount: 0, paidAmount: 0 }))
      .toEqual({ subtotalAmount: 0, payableAmount: 0, outstandingAmount: 0 });
  });

  it('rounds each fractional-quantity line to VND before adding it', () => {
    expect(calculatePurchaseReceiptTotals({
      lines: [
        { quantity: 0.5, unitCost: 101, discountAmount: 1 },
        { quantity: 0.5, unitCost: 101, discountAmount: 0 }
      ], discountAmount: 1, paidAmount: 100
    })).toEqual({ subtotalAmount: 101, payableAmount: 100, outstandingAmount: 0 });
  });

  it('allows free items and discounts equal to the available amount', () => {
    expect(calculatePurchaseReceiptTotals({
      lines: [{ quantity: 1, unitCost: 0, discountAmount: 0 }, line],
      discountAmount: 29000, paidAmount: 0
    })).toEqual({ subtotalAmount: 29000, payableAmount: 0, outstandingAmount: 0 });
    expect(calculatePurchaseReceiptTotals({
      lines: [{ quantity: 1, unitCost: 100, discountAmount: 100 }],
      discountAmount: 0, paidAmount: 0
    }).subtotalAmount).toBe(0);
  });

  it('rounds decimal quantities at half-VND boundaries without binary floating-point loss', () => {
    expect(calculatePurchaseReceiptTotals({
      lines: [{ quantity: 1.005, unitCost: 100, discountAmount: 0 }],
      discountAmount: 0, paidAmount: 0
    })).toEqual({ subtotalAmount: 101, payableAmount: 101, outstandingAmount: 101 });
    expect(calculatePurchaseReceiptTotals({
      lines: [{ quantity: 5e-7, unitCost: 1000000, discountAmount: 0 }],
      discountAmount: 0, paidAmount: 0
    }).subtotalAmount).toBe(1);
  });

  it('rejects a line discount above the rounded line amount', () => {
    expect(() => calculatePurchaseReceiptTotals({
      ...input, lines: [{ ...line, discountAmount: 30001 }]
    })).toThrow('Giảm giá dòng không được vượt thành tiền');
  });

  it('rejects a receipt discount above the net subtotal', () => {
    expect(() => calculatePurchaseReceiptTotals({ ...input, discountAmount: 29001 }))
      .toThrow('Giảm giá phiếu không được vượt tổng tiền hàng');
  });

  it('rejects a payment above the amount payable', () => {
    expect(() => calculatePurchaseReceiptTotals({ ...input, paidAmount: 27001 }))
      .toThrow('Số tiền đã trả không được vượt số cần trả');
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid quantity %s', quantity => {
    expect(() => calculatePurchaseReceiptTotals({ ...input, lines: [{ ...line, quantity }] }))
      .toThrow();
  });

  it.each([-1, 0.5, NaN, Infinity, -Infinity, 2147483648])('rejects invalid VND amount %s in every money field', value => {
    for (const field of ['unitCost', 'discountAmount'] as const) {
      expect(() => calculatePurchaseReceiptTotals({
        ...input, lines: [{ ...line, [field]: value }]
      })).toThrow();
    }
    for (const field of ['discountAmount', 'paidAmount'] as const) {
      expect(() => calculatePurchaseReceiptTotals({ ...input, [field]: value })).toThrow();
    }
  });

  it('accepts the signed MySQL INT upper boundary', () => {
    expect(calculatePurchaseReceiptTotals({
      lines: [{ quantity: 1, unitCost: 2147483647, discountAmount: 0 }],
      discountAmount: 0, paidAmount: 2147483647
    })).toEqual({ subtotalAmount: 2147483647, payableAmount: 2147483647, outstandingAmount: 0 });
  });

  it('rejects overflowing line products and subtotals', () => {
    for (const lines of [
      [{ quantity: Number.MAX_VALUE, unitCost: 2, discountAmount: 0 }],
      [{ quantity: 2, unitCost: 2147483647, discountAmount: 0 }],
      [{ quantity: 1, unitCost: 2147483647, discountAmount: 0 },
        { quantity: 1, unitCost: 1, discountAmount: 0 }]
    ]) {
      expect(() => calculatePurchaseReceiptTotals({ lines, discountAmount: 0, paidAmount: 0 })).toThrow();
    }
  });
});
