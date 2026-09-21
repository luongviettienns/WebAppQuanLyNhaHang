import { describe, expect, it } from 'vitest';
import {
  formatReceiptMoney,
  getPurchaseReceiptStatusPresentation,
  getReceiptPaymentSummary
} from './purchaseReceiptViewModel';

describe('purchase receipt view model', () => {
  it('derives outstanding amount from payable minus paid', () => {
    expect(getReceiptPaymentSummary({ subtotalAmount: 50_000, discountAmount: 5_000, paidAmount: 10_000 }))
      .toEqual({ payableAmount: 45_000, outstandingAmount: 35_000 });
  });

  it('formats VND values and stable status presentation', () => {
    expect(formatReceiptMoney(1_013_000)).toBe('1.013.000 đ');
    expect(getPurchaseReceiptStatusPresentation('DRAFT')).toEqual({ label: 'Phiếu tạm', tone: 'warning' });
    expect(getPurchaseReceiptStatusPresentation('POSTED')).toEqual({ label: 'Đã nhập hàng', tone: 'success' });
    expect(getPurchaseReceiptStatusPresentation('CANCELLED')).toEqual({ label: 'Đã hủy', tone: 'danger' });
  });
});
