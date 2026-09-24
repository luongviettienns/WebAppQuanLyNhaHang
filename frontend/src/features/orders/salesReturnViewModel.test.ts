import { describe, expect, it } from 'vitest';
import { calculateReturnTotal, getSalesReturnStatusPresentation, normalizeReturnQuantity } from './salesReturnViewModel';

describe('sales return view model', () => {
  it('clamps quantity to remaining quantity and rejects invalid values', () => {
    expect(normalizeReturnQuantity('3', 2)).toBe(2);
    expect(normalizeReturnQuantity('0', 2)).toBe(0);
    expect(normalizeReturnQuantity('abc', 2)).toBe(0);
  });

  it('calculates refund from the invoice line snapshot', () => {
    expect(calculateReturnTotal([{ quantity: 2, unitPrice: 45000 }, { quantity: 1, unitPrice: 12000 }])).toBe(102000);
  });

  it('maps completed and cancelled return badges', () => {
    expect(getSalesReturnStatusPresentation('COMPLETED')).toEqual({ label: 'Đã trả', tone: 'success' });
    expect(getSalesReturnStatusPresentation('CANCELLED')).toEqual({ label: 'Đã hủy', tone: 'danger' });
  });
});
