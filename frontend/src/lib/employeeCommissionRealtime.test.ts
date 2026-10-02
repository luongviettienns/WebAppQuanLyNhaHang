import { describe, expect, it, vi } from 'vitest';
import { nextEmployeeCommissionRevision, subscribeToEmployeeCommissionInvalidation } from './employeeCommissionRealtime';

describe('employee commission realtime', () => {
  it('validates change payloads and unsubscribes without forwarding sensitive extras', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = { on: vi.fn((event: string, listener: (...args: unknown[]) => void) => handlers.set(event, listener)), off: vi.fn((event: string) => handlers.delete(event)) };
    const invalidate = vi.fn();
    const unsubscribe = subscribeToEmployeeCommissionInvalidation(socket, 1, invalidate);
    handlers.get('employee-commission:changed')?.({ revision: 12, branchId: 2, reason: 'PLAN_CHANGED' });
    handlers.get('employee-commission:changed')?.({ revision: 13, branchId: 1, reason: 'PLAN_CHANGED', affectedPlanIds: [3], secret: 'drop' });
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ revision: 13, affectedPlanIds: [3] }));
    expect(invalidate.mock.calls[0][0]).not.toHaveProperty('secret');
    unsubscribe();
    expect(handlers.has('employee-commission:changed')).toBe(false);
  });

  it('advances monotonically across duplicate and out-of-order server revisions', () => {
    expect(nextEmployeeCommissionRevision(0, 20)).toBe(20);
    expect(nextEmployeeCommissionRevision(20, 20)).toBe(21);
    expect(nextEmployeeCommissionRevision(21, 4)).toBe(22);
  });
});
