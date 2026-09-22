import type {
  InventoryCheckLineDto,
  InventoryCheckLineInput,
  InventoryCheckStatus
} from '../../api/contracts';

export type InventoryCheckStatusPresentation = {
  label: string;
  tone: 'warning' | 'success' | 'danger';
};

export function calculateInventoryCheckComposerSummary(lines: Array<Pick<InventoryCheckLineDto, 'systemQuantity' | 'actualQuantity' | 'costPerUnit'>>) {
  return lines.reduce((summary, line) => {
    if (line.actualQuantity === null) {
      summary.uncheckedCount += 1;
      return summary;
    }
    const variance = Math.round((line.actualQuantity - line.systemQuantity) * 1000) / 1000;
    summary.totalActualQuantity = Math.round((summary.totalActualQuantity + line.actualQuantity) * 1000) / 1000;
    summary.totalVarianceQuantity = Math.round((summary.totalVarianceQuantity + variance) * 1000) / 1000;
    summary.totalVarianceValue += Math.round(variance * line.costPerUnit);
    if (variance > 0) summary.increasedQuantity = Math.round((summary.increasedQuantity + variance) * 1000) / 1000;
    if (variance < 0) summary.decreasedQuantity = Math.round((summary.decreasedQuantity + Math.abs(variance)) * 1000) / 1000;
    return summary;
  }, {
    totalActualQuantity: 0,
    totalVarianceQuantity: 0,
    increasedQuantity: 0,
    decreasedQuantity: 0,
    totalVarianceValue: 0,
    uncheckedCount: 0
  });
}

export function mergeInventoryCheckLine(lines: InventoryCheckLineDto[], incoming: InventoryCheckLineDto): InventoryCheckLineDto[] {
  const existingIndex = lines.findIndex(line => line.ingredientId === incoming.ingredientId);
  if (existingIndex < 0) return [...lines, incoming];
  return lines.map((line, index) => index === existingIndex ? incoming : line);
}

export function toInventoryCheckDraftInput(note: string, lines: Array<Pick<InventoryCheckLineDto, 'ingredientId' | 'actualQuantity'>>): { note: string | null; lines: InventoryCheckLineInput[] } {
  return {
    note: note.trim() || null,
    lines: lines.map(line => ({ ingredientId: line.ingredientId, actualQuantity: line.actualQuantity }))
  };
}

export function getInventoryCheckStatusPresentation(status: InventoryCheckStatus): InventoryCheckStatusPresentation {
  switch (status) {
    case 'BALANCED': return { label: 'Đã cân bằng kho', tone: 'success' };
    case 'CANCELLED': return { label: 'Đã hủy', tone: 'danger' };
    default: return { label: 'Phiếu tạm', tone: 'warning' };
  }
}

export function formatInventoryCheckQuantity(value: number): string {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
}

export function formatInventoryCheckMoney(value: number): string {
  return `${value.toLocaleString('vi-VN')} đ`;
}
