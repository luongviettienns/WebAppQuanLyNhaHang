import {
  calculateInventoryCheckComposerSummary,
  getInventoryCheckStatusPresentation,
  mergeInventoryCheckLine,
  toInventoryCheckDraftInput
} from './inventoryCheckViewModel';
import { describe, expect, it } from 'vitest';

describe('inventory check view model', () => {
  it('summarizes counted, increased and decreased quantities without treating zero as unchecked', () => {
    expect(calculateInventoryCheckComposerSummary([
      { systemQuantity: 10, actualQuantity: 7.5, costPerUnit: 12000 },
      { systemQuantity: 5, actualQuantity: 0, costPerUnit: 4000 },
      { systemQuantity: 3, actualQuantity: null, costPerUnit: 1000 }
    ])).toEqual({ totalActualQuantity: 7.5, totalVarianceQuantity: -7.5, increasedQuantity: 0, decreasedQuantity: 7.5, totalVarianceValue: -50000, uncheckedCount: 1 });
  });

  it('merges a selected ingredient only once and keeps the latest actual quantity', () => {
    const line = { id: 1, ingredientId: 4, ingredientSku: 'NL-04', ingredientName: 'Dầu', unit: 'lít', systemQuantity: 8, actualQuantity: null, varianceQuantity: null, costPerUnit: 20000, varianceValue: null };
    expect(mergeInventoryCheckLine([], line)).toEqual([line]);
    expect(mergeInventoryCheckLine([line], { ...line, actualQuantity: 6 })).toEqual([{ ...line, actualQuantity: 6 }]);
  });

  it('maps composer values to the API draft contract', () => {
    expect(toInventoryCheckDraftInput('  Cuối ca  ', [
      { ingredientId: 4, actualQuantity: 0 },
      { ingredientId: 5, actualQuantity: null }
    ])).toEqual({ note: 'Cuối ca', lines: [{ ingredientId: 4, actualQuantity: 0 }, { ingredientId: 5, actualQuantity: null }] });
  });

  it('presents every document status consistently', () => {
    expect(getInventoryCheckStatusPresentation('DRAFT')).toEqual({ label: 'Phiếu tạm', tone: 'warning' });
    expect(getInventoryCheckStatusPresentation('BALANCED')).toEqual({ label: 'Đã cân bằng kho', tone: 'success' });
    expect(getInventoryCheckStatusPresentation('CANCELLED')).toEqual({ label: 'Đã hủy', tone: 'danger' });
  });
});
