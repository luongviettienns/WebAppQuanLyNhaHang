import { describe, expect, it, vi } from 'vitest';
import {
  nextEmployeePayrollRevision,
  subscribeToEmployeePayrollInvalidation,
  type EmployeePayrollRealtimeSocket
} from './employeePayrollRealtime';

const validPayload = { batchId: 8, branchId: 1, employeeIds: [4, 5], periodStart: '2026-09-01', periodEnd: '2026-09-30', revision: 3 };

describe('employee payroll realtime invalidation', () => {
  it('accepts the stable payroll event shape and unregisters listeners', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
      off: vi.fn((event: string, handler: (...args: unknown[]) => void) => { if (handlers.get(event) === handler) handlers.delete(event); })
    };
    const invalidate = vi.fn();
    const unsubscribe = subscribeToEmployeePayrollInvalidation(socket as unknown as EmployeePayrollRealtimeSocket, invalidate);
    handlers.get('employee-payroll:changed')?.(validPayload);
    expect(invalidate).toHaveBeenCalledWith(validPayload);
    unsubscribe();
    expect(handlers.has('employee-payroll:changed')).toBe(false);
  });

  it.each([
    null,
    {},
    { ...validPayload, batchId: '8' },
    { ...validPayload, employeeIds: [4, '5'] },
    { ...validPayload, periodStart: '01/09/2026' },
    { ...validPayload, revision: -1 }
  ])('rejects malformed event payload %#', payload => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = { on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler), off: vi.fn() };
    const invalidate = vi.fn();
    subscribeToEmployeePayrollInvalidation(socket as unknown as EmployeePayrollRealtimeSocket, invalidate);
    handlers.get('employee-payroll:changed')?.(payload);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('keeps the local invalidation revision monotonically increasing and refreshes after reconnect', () => {
    expect(nextEmployeePayrollRevision(0)).toBe(1);
    expect(nextEmployeePayrollRevision(41)).toBe(42);
    expect(nextEmployeePayrollRevision(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = { on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler), off: vi.fn() };
    const invalidate = vi.fn();
    subscribeToEmployeePayrollInvalidation(socket as unknown as EmployeePayrollRealtimeSocket, invalidate);
    handlers.get('connect')?.();
    expect(invalidate).not.toHaveBeenCalled();
    handlers.get('connect')?.();
    expect(invalidate).toHaveBeenCalledWith(null);
  });
});
