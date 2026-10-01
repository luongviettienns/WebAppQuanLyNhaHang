import { describe, expect, it } from 'vitest';
import { deliveryOrderTotal, validateDeliveryDraft } from './deliveryPartnerViewModel';

describe('delivery partner view model', () => {
  it('adds delivery fee after food VAT without applying VAT to the fee', () => {
    expect(deliveryOrderTotal(100000, 15000)).toEqual({ vatAmount: 8000, finalAmount: 123000 });
  });

  it('requires an active partner and a delivery address for a delivery draft', () => {
    expect(validateDeliveryDraft({ partnerId: null, address: '', fee: 0 })).toBe('Vui lòng chọn đối tác giao hàng.');
    expect(validateDeliveryDraft({ partnerId: 3, address: '  ', fee: 0 })).toBe('Vui lòng nhập địa chỉ giao hàng.');
    expect(validateDeliveryDraft({ partnerId: 3, address: '12 Nguyễn Huệ', fee: -1 })).toBe('Phí giao hàng không hợp lệ.');
    expect(validateDeliveryDraft({ partnerId: 3, address: '12 Nguyễn Huệ', fee: 0 })).toBeNull();
  });
});
