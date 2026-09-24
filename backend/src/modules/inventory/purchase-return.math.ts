import { ApiError } from '../../lib/api-error';

export function purchaseReturnTotals(lines: Array<{ quantity: number; returnUnitPrice: number }>, discountAmount: number, vatAmount: number, refundAmount: number) {
  const subtotalAmount = lines.reduce((total, line) => total + Math.round(line.quantity * line.returnUnitPrice), 0);
  const payableAmount = subtotalAmount - discountAmount + vatAmount;
  if (![subtotalAmount, payableAmount, discountAmount, vatAmount, refundAmount].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2_000_000_000)) throw ApiError.badRequest('Giá trị phiếu vượt giới hạn 2 tỷ đồng hoặc không hợp lệ');
  if (discountAmount > subtotalAmount) throw ApiError.badRequest('Giảm giá không được vượt tổng tiền hàng');
  if (refundAmount > payableAmount) throw ApiError.badRequest('Tiền NCC trả không được vượt số cần trả');
  return { subtotalAmount, payableAmount, debtReductionAmount: payableAmount - refundAmount };
}
