import { describe, expect, it, vi } from 'vitest';
import {
  subscribeToEmployeeSettingsInvalidation,
  subscribeToEmployeeSettingsWorkspaceInvalidation,
  type EmployeeSettingsRealtimeSocket
} from './employeeSettingsRealtime';

function socketHarness() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
    off: vi.fn()
  } as unknown as EmployeeSettingsRealtimeSocket;
  return { socket, handlers };
}

describe('employee settings realtime', () => {
  it('accepts only valid same-branch settings invalidations and refetches on reconnect', () => {
    const { socket, handlers } = socketHarness();
    const invalidate = vi.fn();
    const unsubscribe = subscribeToEmployeeSettingsInvalidation(socket, 1, invalidate);

    handlers.get('employee-settings:changed')?.({ branchId: 2, settingsArea: 'attendance', revision: 2, eventRevision: 'attendance:2', updatedAt: '2026-09-30T10:00:00.000Z' });
    handlers.get('employee-settings:changed')?.({ branchId: 1, settingsArea: 'unknown', revision: 2 });
    handlers.get('employee-settings:changed')?.({ branchId: 1, settingsArea: 'payroll', revision: 2, eventRevision: 'payroll:2', updatedAt: '2026-09-30T10:00:00.000Z' });
    handlers.get('connect')?.();
    handlers.get('connect')?.();

    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ settingsArea: 'payroll', revision: 2 }));
    unsubscribe();
    expect((socket.off as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });

  it('invalidates checklist for every authoritative workforce source and cleans all listeners', () => {
    const { socket, handlers } = socketHarness();
    const invalidate = vi.fn();
    const unsubscribe = subscribeToEmployeeSettingsWorkspaceInvalidation(socket, 1, invalidate);

    handlers.get('employees:changed')?.({ employeeId: 4 });
    handlers.get('employee-schedules:changed')?.({ branchId: 1 });
    handlers.get('employee-attendance:changed')?.({ branchId: 1 });
    handlers.get('employee-payroll:changed')?.({ branchId: 1 });
    handlers.get('employee-settings:changed')?.({ branchId: 2, settingsArea: 'holiday', revision: 2, eventRevision: 'holiday:2', updatedAt: '2026-09-30T10:00:00.000Z' });

    expect(invalidate).toHaveBeenCalledTimes(4);
    unsubscribe();
    expect((socket.off as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(6);
  });
});
