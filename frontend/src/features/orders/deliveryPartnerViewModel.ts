export function deliveryOrderTotal(foodTotal: number, deliveryFee: number) {
  const vatAmount = Math.round((foodTotal * 8) / 108);
  return { vatAmount, finalAmount: foodTotal + deliveryFee };
}

export function validateDeliveryDraft(input: { partnerId: number | null; address: string; fee: number }) {
  if (!input.partnerId) return 'Vui lòng chọn đối tác giao hàng.';
  if (input.address.trim().length < 3) return 'Vui lòng nhập địa chỉ giao hàng.';
  if (!Number.isSafeInteger(input.fee) || input.fee < 0) return 'Phí giao hàng không hợp lệ.';
  return null;
}
