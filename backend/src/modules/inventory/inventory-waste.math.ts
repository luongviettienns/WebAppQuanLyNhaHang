export interface InventoryWasteLineMathInput {
  quantity: number;
  costPerUnit: number;
}

export interface InventoryWasteLineMathResult {
  quantity: number;
  costPerUnit: number;
  lineValue: number;
}

export interface InventoryWasteSummary {
  totalQuantity: number;
  totalValue: number;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function assertValidWasteInput(input: InventoryWasteLineMathInput): void {
  if (!Number.isFinite(input.quantity) || !Number.isFinite(input.costPerUnit)) {
    throw new Error('Số liệu xuất hủy không hợp lệ');
  }
  if (input.quantity <= 0) {
    throw new Error('Số lượng hủy phải lớn hơn 0');
  }
  if (input.costPerUnit < 0) {
    throw new Error('Giá vốn không được âm');
  }
}

export function calculateInventoryWasteLine(input: InventoryWasteLineMathInput): InventoryWasteLineMathResult {
  assertValidWasteInput(input);
  const quantity = roundQuantity(input.quantity);
  return {
    quantity,
    costPerUnit: input.costPerUnit,
    lineValue: Math.round(quantity * input.costPerUnit)
  };
}

export function summarizeInventoryWaste(lines: InventoryWasteLineMathInput[]): InventoryWasteSummary {
  return lines.reduce<InventoryWasteSummary>((summary, line) => {
    const result = calculateInventoryWasteLine(line);
    return {
      totalQuantity: roundQuantity(summary.totalQuantity + result.quantity),
      totalValue: summary.totalValue + result.lineValue
    };
  }, {
    totalQuantity: 0,
    totalValue: 0
  });
}
