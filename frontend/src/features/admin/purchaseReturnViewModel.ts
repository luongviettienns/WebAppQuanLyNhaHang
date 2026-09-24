import type { PurchaseReturnDto, PurchaseReturnLineInput, PurchaseReturnStatus } from '../../api/contracts';

export interface PurchaseReturnComposerLine extends PurchaseReturnLineInput {
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  currentStock: number;
  purchaseUnitCost: number;
}

export function formatPurchaseReturnMoney(value: number): string { return Math.round(value).toLocaleString('vi-VN') + ' đ'; }
export function formatPurchaseReturnQuantity(value: number): string { return value.toLocaleString('vi-VN', { maximumFractionDigits: 3 }); }
export function lineAmount(line: Pick<PurchaseReturnComposerLine, 'quantity' | 'returnUnitPrice'>): number { return Math.round(line.quantity * line.returnUnitPrice); }
export function summarizePurchaseReturn(lines: Array<Pick<PurchaseReturnComposerLine, 'quantity' | 'returnUnitPrice'>>, discountAmount: number, vatAmount: number, refundAmount: number) {
  const subtotalAmount = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const payableAmount = subtotalAmount - discountAmount + vatAmount;
  return { subtotalAmount, payableAmount, debtReductionAmount: payableAmount - refundAmount, refundAmount };
}
export function toPurchaseReturnDraftInput(value: { supplierId: number | null; returnedAt: string; discountAmount: number; vatAmount: number; refundAmount: number; refundMethod: 'CASH' | 'BANK_TRANSFER'; note: string; lines: PurchaseReturnComposerLine[] }) {
  return { supplierId: value.supplierId, returnedAt: value.returnedAt, discountAmount: value.discountAmount, vatAmount: value.vatAmount, refundAmount: value.refundAmount, refundMethod: value.refundMethod, note: value.note.trim() || null, lines: value.lines.map(line => ({ ingredientId: line.ingredientId, quantity: line.quantity, returnUnitPrice: line.returnUnitPrice })) };
}
export function getPurchaseReturnStatusPresentation(status: PurchaseReturnStatus) {
  if (status === 'COMPLETED') return { label: 'Hoàn thành', tone: 'success' as const };
  if (status === 'CANCELLED') return { label: 'Đã hủy', tone: 'neutral' as const };
  return { label: 'Phiếu tạm', tone: 'warning' as const };
}
export function validatePurchaseReturnForCompletion(input: { supplierId: number | null; lines: PurchaseReturnComposerLine[]; payableAmount: number; refundAmount: number }) {
  const errors: string[] = [];
  if (!input.supplierId) errors.push('Cần chọn nhà cung cấp');
  if (!input.lines.length) errors.push('Phiếu cần ít nhất một dòng hàng');
  if (input.lines.some(line => line.quantity <= 0)) errors.push('Số lượng trả phải lớn hơn 0');
  if (input.lines.some(line => line.quantity > line.currentStock)) errors.push('Số lượng trả không được vượt tồn kho hiện tại');
  if (input.refundAmount > input.payableAmount) errors.push('Số tiền hoàn không được vượt giá trị phải trả');
  return errors;
}
export function applyPurchaseReturnDetail(data: PurchaseReturnDto): { id: number; code: string; status: PurchaseReturnStatus; version: number; supplierId: number | null; lines: PurchaseReturnComposerLine[]; note: string; returnedAt: string; discountAmount: number; vatAmount: number; refundAmount: number; refundMethod: 'CASH' | 'BANK_TRANSFER' } {
  return { id: data.id, code: data.returnCode, status: data.status, version: data.version, supplierId: data.supplierId, note: data.note || '', returnedAt: data.returnedAt.slice(0, 10), discountAmount: data.discountAmount, vatAmount: data.vatAmount, refundAmount: data.refundAmount, refundMethod: data.refundMethod, lines: data.lines.map(line => ({ ingredientId: line.ingredientId, ingredientSku: line.ingredientSku, ingredientName: line.ingredientName, unit: line.unit, currentStock: line.quantity, quantity: line.quantity, returnUnitPrice: line.returnUnitPrice, purchaseUnitCost: line.purchaseUnitCost })) };
}
