import { describe, expect, it } from 'vitest';
import { allocateCommissionAmounts, deriveActiveAllocationEvents } from './employee-commission.payroll';

describe('commission payroll allocation', () => {
  it('reserves positive entries first and applies negative entries FIFO', () => {
    const result = allocateCommissionAmounts([
      { id: 1, amount: -80, accountingDate: '2026-09-01' },
      { id: 2, amount: 120, accountingDate: '2026-09-02' },
      { id: 3, amount: -30, accountingDate: '2026-09-03' }
    ], 100);

    expect(result.reservations).toEqual([
      { entryId: 2, amount: 120 },
      { entryId: 1, amount: -80 },
      { entryId: 3, amount: -30 }
    ]);
    expect(result.commissionAmount).toBe(10);
    expect(result.deferredDebitAmount).toBe(0);
  });

  it('caps negative commission at the payable floor and carries the exact remainder', () => {
    const result = allocateCommissionAmounts([
      { id: 1, amount: -90, accountingDate: '2026-08-01' },
      { id: 2, amount: -40, accountingDate: '2026-09-01' }
    ], 75);

    expect(result.reservations).toEqual([{ entryId: 1, amount: -75 }]);
    expect(result.commissionAmount).toBe(-75);
    expect(result.deferredDebitAmount).toBe(55);
  });

  it('derives current immutable allocation state across reserve, finalize and release events', () => {
    const active = deriveActiveAllocationEvents([
      { id: 1, allocationKey: 'A', type: 'RESERVED', priorEventId: null, allocatedAmount: 100 },
      { id: 2, allocationKey: 'A', type: 'FINALIZED', priorEventId: 1, allocatedAmount: 100 },
      { id: 3, allocationKey: 'A', type: 'RELEASED', priorEventId: 2, allocatedAmount: 100 },
      { id: 4, allocationKey: 'B', type: 'RESERVED', priorEventId: null, allocatedAmount: -25 }
    ]);

    expect(active).toEqual([{ id: 4, allocationKey: 'B', type: 'RESERVED', priorEventId: null, allocatedAmount: -25 }]);
  });
});
