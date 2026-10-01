import { describe, expect, it, vi } from 'vitest';
import { subscribeToEmployeeAttendanceInvalidation, type AttendanceRealtimeSocket } from './employeeAttendanceRealtime';

describe('employee attendance realtime invalidation', () => {
  it('turns attendance changes into a payload-free invalidation and removes listeners', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => { handlers.set(event, handler); }),
      off: vi.fn((event: string, handler: (...args: unknown[]) => void) => { if (handlers.get(event) === handler) handlers.delete(event); })
    };
    const invalidate = vi.fn();
    const unsubscribe = subscribeToEmployeeAttendanceInvalidation(socket as unknown as AttendanceRealtimeSocket, invalidate);

    handlers.get('employee-attendance:changed')?.({ branchId: 1, attendanceCode: 'must-not-forward' });
    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith();
    unsubscribe();
    expect(handlers.has('employee-attendance:changed')).toBe(false);
  });

  it('invalidates after reconnection so clients refetch missed changes', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const socket = { on: (event: string, handler: (...args: unknown[]) => void) => { handlers.set(event, handler); }, off: vi.fn() };
    const invalidate = vi.fn();
    subscribeToEmployeeAttendanceInvalidation(socket as unknown as AttendanceRealtimeSocket, invalidate);

    handlers.get('connect')?.();
    expect(invalidate).not.toHaveBeenCalled();
    handlers.get('connect')?.();
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
