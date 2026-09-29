import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { subscribeToEmployeeScheduleInvalidation } from './employeeScheduleRealtime';

describe('employee schedule realtime subscription', () => {
  it('invalidates on schedule changes and reconnect, ignores other revisions, and cleans up', () => {
    const listeners = new Map<string, Set<() => void>>();
    const socket = {
      on: vi.fn((event: string, handler: () => void) => {
        const handlers = listeners.get(event) ?? new Set<() => void>();
        handlers.add(handler); listeners.set(event, handlers);
      }),
      off: vi.fn((event: string, handler: () => void) => listeners.get(event)?.delete(handler))
    };
    const invalidate = vi.fn();
    const unsubscribe = subscribeToEmployeeScheduleInvalidation(socket as unknown as Socket, invalidate);
    const emit = (event: string) => listeners.get(event)?.forEach(handler => handler());

    emit('employees:changed');
    expect(invalidate).not.toHaveBeenCalled();
    emit('connect');
    emit('employee-schedules:changed');
    expect(invalidate).toHaveBeenCalledTimes(2);

    unsubscribe();
    emit('connect');
    emit('employee-schedules:changed');
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(socket.off).toHaveBeenCalledTimes(2);
  });
});
