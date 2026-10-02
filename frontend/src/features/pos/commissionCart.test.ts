import { describe, expect, it } from 'vitest';
import { appendOrMergeCommissionCartLine, cartToOrderItems, type CommissionCartLine } from './commissionCart';

const menuItem = { id: 9, name: 'Cà phê', basePrice: 30_000 } as CommissionCartLine['menuItem'];
const line = (employeeId: number | null): CommissionCartLine => ({ menuItem, quantity: 1, selectedModifiers: [], unitPrice: 30_000, subtotal: 30_000, commissionEmployeeId: employeeId });

describe('commission cart identity and payload', () => {
  it('keeps nullable ownership and never merges otherwise-identical rows assigned to different employees', () => {
    const first = appendOrMergeCommissionCartLine([], line(null));
    const second = appendOrMergeCommissionCartLine(first, line(3));
    expect(second).toHaveLength(2);
    expect(second.map(item => item.commissionEmployeeId)).toEqual([null, 3]);
  });

  it('merges identical rows only when item, modifiers, note and employee all match', () => {
    const result = appendOrMergeCommissionCartLine([line(3)], { ...line(3), quantity: 2, subtotal: 60_000 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ quantity: 3, subtotal: 90_000, commissionEmployeeId: 3 });
  });

  it('sends explicit ownership for staff but forces QR-created lines to null', () => {
    expect(cartToOrderItems([line(3)], false)[0]).toMatchObject({ menuItemId: 9, commissionEmployeeId: 3 });
    expect(cartToOrderItems([line(3)], true)[0]).toMatchObject({ menuItemId: 9, commissionEmployeeId: null });
  });
});
