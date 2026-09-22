export interface InventoryCheckLineMathInput {
  systemQuantity: number;
  actualQuantity: number;
  costPerUnit: number;
}

export interface InventoryCheckLineMathResult {
  varianceQuantity: number;
  varianceValue: number;
}

export interface InventoryCheckSummaryLine {
  systemQuantity: number;
  actualQuantity: number | null;
  costPerUnit: number;
}

export interface InventoryCheckSummary {
  totalActualQuantity: number;
  totalVarianceQuantity: number;
  increasedQuantity: number;
  decreasedQuantity: number;
  totalVarianceValue: number;
  uncheckedCount: number;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function assertValidMathInput(input: InventoryCheckLineMathInput): void {
  if (!Number.isFinite(input.systemQuantity) || !Number.isFinite(input.actualQuantity) || !Number.isFinite(input.costPerUnit)) {
    throw new Error('Số liệu kiểm kho không hợp lệ');
  }
  if (input.actualQuantity < 0) {
    throw new Error('Số lượng thực tế không được âm');
  }
  if (input.costPerUnit < 0) {
    throw new Error('Giá vốn không được âm');
  }
}

export function calculateInventoryCheckLine(input: InventoryCheckLineMathInput): InventoryCheckLineMathResult {
  assertValidMathInput(input);
  const varianceQuantity = roundQuantity(input.actualQuantity - input.systemQuantity);
  return {
    varianceQuantity,
    varianceValue: Math.round(varianceQuantity * input.costPerUnit)
  };
}

export function summarizeInventoryCheck(lines: InventoryCheckSummaryLine[]): InventoryCheckSummary {
  return lines.reduce<InventoryCheckSummary>((summary, line) => {
    if (line.actualQuantity === null) {
      summary.uncheckedCount += 1;
      return summary;
    }

    const result = calculateInventoryCheckLine({
      systemQuantity: line.systemQuantity,
      actualQuantity: line.actualQuantity,
      costPerUnit: line.costPerUnit
    });
    summary.totalActualQuantity = roundQuantity(summary.totalActualQuantity + line.actualQuantity);
    summary.totalVarianceQuantity = roundQuantity(summary.totalVarianceQuantity + result.varianceQuantity);
    summary.totalVarianceValue += result.varianceValue;
    if (result.varianceQuantity > 0) summary.increasedQuantity = roundQuantity(summary.increasedQuantity + result.varianceQuantity);
    if (result.varianceQuantity < 0) summary.decreasedQuantity = roundQuantity(summary.decreasedQuantity + Math.abs(result.varianceQuantity));
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
