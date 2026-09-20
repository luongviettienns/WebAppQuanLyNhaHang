export type PurchaseReceiptTotals = {
  subtotalAmount: number;
  payableAmount: number;
  outstandingAmount: number;
};

export type PurchaseReceiptTotalsInput = {
  lines: ReadonlyArray<{ quantity: number; unitCost: number; discountAmount: number }>;
  discountAmount: number;
  paidAmount: number;
};

// Prisma Int maps to a signed MySQL INTEGER. Reject overflow before persistence.
const MAX_VND_AMOUNT = 2147483647;

function assertVndAmount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_VND_AMOUNT) {
    throw new Error(`${label} phải là số nguyên VND từ 0 đến ${MAX_VND_AMOUNT}`);
  }
}

// Multiply the decimal quantity by integer VND exactly, then round half up.
// Math.round(1.005 * 100) returns 100 in JS even though the decimal total is 100.5.
function roundedLineAmount(quantity: number, unitCost: number): number {
  const [coefficient, exponent = '0'] = quantity.toString().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const scale = fraction.length - Number(exponent);
  const product = BigInt(whole + fraction) * BigInt(unitCost);
  if (scale <= 0) return Number(product * (10n ** BigInt(-scale)));
  const divisor = 10n ** BigInt(scale);
  return Number((product + divisor / 2n) / divisor);
}

/** Pure totals only: saving a draft must not change inventory or create payments. */
export function calculatePurchaseReceiptTotals(input: PurchaseReceiptTotalsInput): PurchaseReceiptTotals {
  assertVndAmount(input.discountAmount, 'Giảm giá phiếu');
  assertVndAmount(input.paidAmount, 'Số tiền đã trả');

  const subtotalAmount = input.lines.reduce((sum, line) => {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error('Số lượng nhập phải là số hữu hạn lớn hơn 0');
    }
    assertVndAmount(line.unitCost, 'Đơn giá');
    assertVndAmount(line.discountAmount, 'Giảm giá dòng');

    // Round per line, before discounts, so the sum matches the displayed lines.
    const grossAmount = roundedLineAmount(line.quantity, line.unitCost);
    assertVndAmount(grossAmount, 'Thành tiền dòng');
    if (line.discountAmount > grossAmount) {
      throw new Error('Giảm giá dòng không được vượt thành tiền');
    }
    const subtotal = sum + grossAmount - line.discountAmount;
    assertVndAmount(subtotal, 'Tổng tiền hàng');
    return subtotal;
  }, 0);

  if (input.discountAmount > subtotalAmount) {
    throw new Error('Giảm giá phiếu không được vượt tổng tiền hàng');
  }
  const payableAmount = subtotalAmount - input.discountAmount;
  if (input.paidAmount > payableAmount) {
    throw new Error('Số tiền đã trả không được vượt số cần trả');
  }
  return { subtotalAmount, payableAmount, outstandingAmount: payableAmount - input.paidAmount };
}
