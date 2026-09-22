import { describe, expect, it } from 'vitest';
import {
  calculateInventoryWasteLine,
  summarizeInventoryWaste
} from '../../src/modules/inventory/inventory-waste.math';

describe('inventory waste math', () => {
  it('calculates a positive rounded value for a decimal wasted quantity', () => {
    expect(calculateInventoryWasteLine({ quantity: 1.5, costPerUnit: 12000 }))
      .toEqual({ quantity: 1.5, costPerUnit: 12000, lineValue: 18000 });
  });

  it('summarizes positive quantity and value across lines', () => {
    expect(summarizeInventoryWaste([
      { quantity: 1, costPerUnit: 12000 },
      { quantity: 0.5, costPerUnit: 8000 }
    ])).toEqual({
      totalQuantity: 1.5,
      totalValue: 16000
    });
  });

  it('keeps an empty voucher at zero totals', () => {
    expect(summarizeInventoryWaste([])).toEqual({
      totalQuantity: 0,
      totalValue: 0
    });
  });
});
