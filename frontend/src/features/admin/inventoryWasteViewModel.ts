import type {
  InventoryWasteDraftInput,
  InventoryWasteLineDto,
  InventoryWasteLineInput,
  InventoryWasteStatus
} from '../../api/contracts';

export interface InventoryWasteComposerLine extends Omit<InventoryWasteLineDto, 'id'> {
  id?: number;
}

export type InventoryWasteStatusPresentation = {
  label: string;
  tone: 'warning' | 'success' | 'danger';
};

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function calculateWasteRow(line: InventoryWasteComposerLine): InventoryWasteComposerLine {
  const quantity = Number.isFinite(line.quantity) ? roundQuantity(line.quantity) : 0;
  const costPerUnit = Number.isFinite(line.costPerUnit) ? line.costPerUnit : 0;
  return {
    ...line,
    quantity,
    costPerUnit,
    lineValue: Math.round(Math.max(0, quantity) * Math.max(0, costPerUnit))
  };
}

export function summarizeWasteRows(lines: Array<Pick<InventoryWasteComposerLine, 'quantity' | 'costPerUnit'>>) {
  return lines.reduce((summary, line) => {
    const row = calculateWasteRow({
      id: undefined,
      ingredientId: 0,
      ingredientSku: '',
      ingredientName: '',
      unit: '',
      systemQuantity: 0,
      quantity: line.quantity,
      costPerUnit: line.costPerUnit,
      lineValue: 0
    });
    return {
      totalQuantity: roundQuantity(summary.totalQuantity + Math.max(0, row.quantity)),
      totalValue: summary.totalValue + row.lineValue
    };
  }, { totalQuantity: 0, totalValue: 0 });
}

export function upsertWasteRow(existingLines: InventoryWasteComposerLine[], incomingLine: InventoryWasteComposerLine): InventoryWasteComposerLine[] {
  const normalized = calculateWasteRow(incomingLine);
  const index = existingLines.findIndex(line => line.ingredientId === normalized.ingredientId);
  if (index < 0) return [...existingLines, normalized];
  return existingLines.map((line, lineIndex) => lineIndex === index ? normalized : line);
}

export function validateWasteForCompletion(input: {
  note: string;
  lines: InventoryWasteComposerLine[];
}): string[] {
  const errors: string[] = [];
  if (!input.lines.length) errors.push('Phiếu xuất hủy cần ít nhất một nguyên liệu');
  if (!input.note.trim()) errors.push('Vui lòng nhập ghi chú hoặc lý do xuất hủy');
  if (input.lines.some(line => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    errors.push('Số lượng hủy phải lớn hơn 0');
  }
  for (const line of input.lines) {
    if (Number.isFinite(line.quantity) && Number.isFinite(line.systemQuantity) && line.quantity > line.systemQuantity) {
      errors.push('Số lượng hủy của ' + line.ingredientName + ' vượt tồn kho hiện tại');
    }
  }
  return errors;
}

export function toInventoryWasteDraftInput(note: string, lines: Array<Pick<InventoryWasteComposerLine, 'ingredientId' | 'quantity'>>): InventoryWasteDraftInput {
  return {
    note: note.trim() || null,
    lines: lines.map(line => ({ ingredientId: line.ingredientId, quantity: line.quantity } satisfies InventoryWasteLineInput))
  };
}

export function getInventoryWasteStatusPresentation(status: InventoryWasteStatus): InventoryWasteStatusPresentation {
  switch (status) {
    case 'COMPLETED': return { label: 'Hoàn thành', tone: 'success' };
    case 'CANCELLED': return { label: 'Đã hủy', tone: 'danger' };
    default: return { label: 'Phiếu tạm', tone: 'warning' };
  }
}

export function formatInventoryWasteQuantity(value: number): string {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
}

export function formatInventoryWasteMoney(value: number): string {
  return value.toLocaleString('vi-VN') + ' đ';
}
