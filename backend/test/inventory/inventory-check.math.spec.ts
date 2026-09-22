import { describe, expect, it } from 'vitest';
import {
  calculateInventoryCheckLine,
  summarizeInventoryCheck
} from '../../src/modules/inventory/inventory-check.math';

describe('inventory check math', () => {
  it('keeps a negative variance and computes negative VND value', () => {
    expect(calculateInventoryCheckLine({ systemQuantity: 10, actualQuantity: 7.5, costPerUnit: 12000 }))
      .toEqual({ varianceQuantity: -2.5, varianceValue: -30000 });
  });

  it('treats zero as checked and null as unchecked', () => {
    expect(summarizeInventoryCheck([
      { systemQuantity: 4, actualQuantity: 0, costPerUnit: 10 },
      { systemQuantity: 3, actualQuantity: null, costPerUnit: 10 }
    ])).toMatchObject({
      totalActualQuantity: 0,
      decreasedQuantity: 4,
      uncheckedCount: 1
    });
  });

  it('summarizes signed increases and decreases', () => {
    expect(summarizeInventoryCheck([
      { systemQuantity: 2, actualQuantity: 3.25, costPerUnit: 100 },
      { systemQuantity: 5, actualQuantity: 4, costPerUnit: 50 }
    ])).toEqual({
      totalActualQuantity: 7.25,
      totalVarianceQuantity: 0.25,
      increasedQuantity: 1.25,
      decreasedQuantity: 1,
      totalVarianceValue: 75,
      uncheckedCount: 0
    });
  });

  it('rejects invalid quantities and costs', () => {
    expect(() => calculateInventoryCheckLine({ systemQuantity: 1, actualQuantity: -1, costPerUnit: 10 }))
      .toThrow('Số lượng thực tế không được âm');
    expect(() => calculateInventoryCheckLine({ systemQuantity: 1, actualQuantity: 1, costPerUnit: -10 }))
      .toThrow('Giá vốn không được âm');
    expect(() => calculateInventoryCheckLine({ systemQuantity: Number.NaN, actualQuantity: 1, costPerUnit: 10 }))
      .toThrow('Số liệu kiểm kho không hợp lệ');
  });
});
