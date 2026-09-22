import type { PurchaseReceiptLineInput } from '../../api/contracts';

export interface PurchaseReceiptComposerLine extends PurchaseReceiptLineInput {
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  lineAmount?: number;
}

export interface PurchaseReceiptComposerTotals {
  subtotalAmount: number;
  discountAmount: number;
  payableAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}

const roundMoney = (value: number) => Math.round(value);

export function validateReceiptForPost(input: {
  supplierId: number | null;
  lines: Array<{ ingredientId: number; quantity: number; unitCost: number }>;
}): string[] {
  const errors: string[] = [];
  if (!input.supplierId) errors.push('Vui lòng chọn nhà cung cấp');
  if (!input.lines.length) errors.push('Phiếu nhập cần ít nhất một nguyên liệu');
  if (input.lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    errors.push('Số lượng nguyên liệu phải lớn hơn 0');
  }
  if (input.lines.some((line) => !Number.isFinite(line.unitCost) || line.unitCost < 0)) {
    errors.push('Đơn giá nhập không được nhỏ hơn 0');
  }
  return errors;
}

export function mergePurchaseReceiptLine(
  existingLines: PurchaseReceiptComposerLine[],
  incomingLine: PurchaseReceiptComposerLine
): PurchaseReceiptComposerLine[] {
  const index = existingLines.findIndex((line) => line.ingredientId === incomingLine.ingredientId);
  if (index < 0) return [...existingLines, incomingLine];

  return existingLines.map((line, lineIndex) => lineIndex === index
    ? {
        ...line,
        ...incomingLine,
        quantity: line.quantity + incomingLine.quantity
      }
    : line);
}

export function getPurchaseReceiptComposerTotals(
  lines: Array<Pick<PurchaseReceiptLineInput, 'quantity' | 'unitCost' | 'discountAmount'>>,
  discountAmount: number,
  paidAmount: number
): PurchaseReceiptComposerTotals {
  const subtotalAmount = roundMoney(lines.reduce((sum, line) => (
    sum + (line.quantity * line.unitCost) - (line.discountAmount ?? 0)
  ), 0));
  const normalizedDiscount = Math.max(0, roundMoney(discountAmount));
  const payableAmount = Math.max(0, subtotalAmount - normalizedDiscount);
  const normalizedPaid = Math.max(0, roundMoney(paidAmount));

  return {
    subtotalAmount,
    discountAmount: normalizedDiscount,
    payableAmount,
    paidAmount: normalizedPaid,
    outstandingAmount: Math.max(0, payableAmount - normalizedPaid)
  };
}

export function toPurchaseReceiptDraftInput(input: {
  supplierId: number | null;
  receivedAt: string;
  invoiceNumber: string;
  invoiceDate: string;
  discountAmount: number;
  paidAmount: number;
  note: string;
  lines: PurchaseReceiptComposerLine[];
}) {
  return {
    supplierId: input.supplierId,
    receivedAt: input.receivedAt,
    invoiceNumber: input.invoiceNumber.trim() || null,
    invoiceDate: input.invoiceDate.trim() || null,
    discountAmount: Math.max(0, input.discountAmount),
    paidAmount: Math.max(0, input.paidAmount),
    note: input.note.trim() || null,
    lines: input.lines.map((line) => ({
      ingredientId: line.ingredientId,
      quantity: line.quantity,
      unitCost: line.unitCost,
      discountAmount: line.discountAmount ?? 0,
      note: line.note ?? null
    }))
  };
}
