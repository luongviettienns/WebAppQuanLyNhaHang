import { describe, expect, it } from 'vitest';
import {
  allocateDiscountLargestRemainder,
  calculateCommissionSnapshot,
  prorateSnapshot,
  resolveCurrentOwner
} from './employee-commission.domain';

describe('employee commission domain', () => {
  it('allocates whole-order discount by largest remainder with item id as the tie-break', () => {
    expect(allocateDiscountLargestRemainder([
      { orderItemId: 20, grossRevenue: 100 },
      { orderItemId: 10, grossRevenue: 100 },
      { orderItemId: 30, grossRevenue: 100 }
    ], 100)).toEqual(new Map([[10, 34], [20, 33], [30, 33]]));
  });

  it('caps discount at gross revenue and returns zero allocations for a zero-gross order', () => {
    expect(allocateDiscountLargestRemainder([
      { orderItemId: 1, grossRevenue: 40 },
      { orderItemId: 2, grossRevenue: 60 }
    ], 500)).toEqual(new Map([[1, 40], [2, 60]]));
    expect(allocateDiscountLargestRemainder([
      { orderItemId: 1, grossRevenue: 0 },
      { orderItemId: 2, grossRevenue: 0 }
    ], 10)).toEqual(new Map([[1, 0], [2, 0]]));
  });

  it('calculates fixed, revenue and profit rules using integer round-half-up', () => {
    expect(calculateCommissionSnapshot({
      type: 'FIXED_PER_UNIT', quantity: 3, fixedAmount: 1_500,
      grossRevenue: 30_000, allocatedDiscount: 0, unitCost: null
    }).commissionAmount).toBe(4_500);
    expect(calculateCommissionSnapshot({
      type: 'PERCENT_NET_REVENUE', quantity: 1, rateBps: 5_000,
      grossRevenue: 3, allocatedDiscount: 0, unitCost: null
    })).toMatchObject({ netRevenue: 3, commissionAmount: 2 });
    expect(calculateCommissionSnapshot({
      type: 'PERCENT_GROSS_PROFIT', quantity: 2, rateBps: 2_500,
      grossRevenue: 21, allocatedDiscount: 1, unitCost: 5
    })).toMatchObject({ costAmount: 10, grossProfit: 10, commissionAmount: 3 });
  });

  it('reports missing cost for profit rules instead of silently using zero', () => {
    expect(calculateCommissionSnapshot({
      type: 'PERCENT_GROSS_PROFIT', quantity: 1, rateBps: 1_000,
      grossRevenue: 100_000, allocatedDiscount: 0, unitCost: null
    })).toEqual({ ok: false, issue: 'COST_MISSING' });
  });

  it('uses cumulative remainder so partial portions always reconcile to the original total', () => {
    const first = prorateSnapshot(10, 1, 3, 0, 0);
    const second = prorateSnapshot(10, 1, 3, 1, first);
    const last = prorateSnapshot(10, 1, 3, 2, first + second);
    expect([first, second, last]).toEqual([3, 3, 4]);
    expect(first + second + last).toBe(10);
  });

  it('resolves the current positive owner after reassignment and a partial return', () => {
    expect(resolveCurrentOwner([
      { id: 1, type: 'EARNING', employeeId: 11, quantityDelta: 5, sourceEntryId: null },
      { id: 2, type: 'REASSIGNMENT_REVERSAL', employeeId: 11, quantityDelta: -5, sourceEntryId: 1 },
      { id: 3, type: 'REASSIGNMENT_EARNING', employeeId: 22, quantityDelta: 5, sourceEntryId: null },
      { id: 4, type: 'RETURN_REVERSAL', employeeId: 22, quantityDelta: -2, sourceEntryId: 3 }
    ])).toEqual({ ok: true, entryId: 3, employeeId: 22, remainingQuantity: 3 });
  });

  it('returns an explicit conflict when more than one positive owner has balance', () => {
    expect(resolveCurrentOwner([
      { id: 1, type: 'EARNING', employeeId: 11, quantityDelta: 2, sourceEntryId: null },
      { id: 2, type: 'REASSIGNMENT_EARNING', employeeId: 22, quantityDelta: 2, sourceEntryId: null }
    ])).toEqual({ ok: false, issue: 'LEDGER_CONFLICT' });
  });
});
