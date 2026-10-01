import type { EmployeeSettingsArea } from '../api/employeeSettings';

type Listener = (...args: unknown[]) => void;
export interface EmployeeSettingsRealtimeSocket {
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
}
export interface EmployeeSettingsChangedPayload {
  branchId: number;
  settingsArea: EmployeeSettingsArea;
  revision: number;
  eventRevision: string;
  updatedAt: string;
}

interface EmployeeSettingsChecklistChangedPayload {
  branchId: number;
  settingsArea: 'checklist';
  eventRevision: string;
  updatedAt: string;
}

const areas = new Set<EmployeeSettingsArea>(['attendance', 'payroll', 'workweek', 'holiday']);
const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;

export function isEmployeeSettingsChangedPayload(value: unknown): value is EmployeeSettingsChangedPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<EmployeeSettingsChangedPayload>;
  return positiveInteger(payload.branchId)
    && typeof payload.settingsArea === 'string'
    && areas.has(payload.settingsArea as EmployeeSettingsArea)
    && positiveInteger(payload.revision)
    && payload.eventRevision === `${payload.settingsArea}:${payload.revision}`
    && typeof payload.updatedAt === 'string'
    && !Number.isNaN(Date.parse(payload.updatedAt));
}

function isEmployeeSettingsChecklistChangedPayload(value: unknown): value is EmployeeSettingsChecklistChangedPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<EmployeeSettingsChecklistChangedPayload>;
  return positiveInteger(payload.branchId)
    && payload.settingsArea === 'checklist'
    && typeof payload.eventRevision === 'string'
    && /^checklist:KIOSK_SESSION_(?:CREATED|REVOKED):[1-9]\d*$/.test(payload.eventRevision)
    && typeof payload.updatedAt === 'string'
    && !Number.isNaN(Date.parse(payload.updatedAt));
}

export function subscribeToEmployeeSettingsInvalidation(
  socket: EmployeeSettingsRealtimeSocket,
  branchId: number,
  invalidate: (payload: EmployeeSettingsChangedPayload | null) => void
): () => void {
  let connectedOnce = false;
  const onChanged: Listener = payload => {
    if (isEmployeeSettingsChangedPayload(payload) && payload.branchId === branchId) invalidate(payload);
  };
  const onConnect: Listener = () => {
    if (connectedOnce) invalidate(null);
    connectedOnce = true;
  };
  socket.on('employee-settings:changed', onChanged);
  socket.on('connect', onConnect);
  return () => {
    socket.off('employee-settings:changed', onChanged);
    socket.off('connect', onConnect);
  };
}

export function subscribeToEmployeeSettingsWorkspaceInvalidation(
  socket: EmployeeSettingsRealtimeSocket,
  branchId: number,
  invalidate: () => void
): () => void {
  const events = ['employee-settings:changed', 'employees:changed', 'employee-schedules:changed', 'employee-attendance:changed', 'employee-payroll:changed'] as const;
  const handlers = new Map<string, Listener>();
  for (const event of events) {
    const handler: Listener = payload => {
      if (event === 'employee-settings:changed') {
        if ((isEmployeeSettingsChangedPayload(payload) || isEmployeeSettingsChecklistChangedPayload(payload))
          && payload.branchId === branchId) invalidate();
        return;
      }
      if (event === 'employees:changed') {
        invalidate();
        return;
      }
      if (payload && typeof payload === 'object' && (payload as { branchId?: unknown }).branchId === branchId) invalidate();
    };
    handlers.set(event, handler);
    socket.on(event, handler);
  }
  let connectedOnce = false;
  const onConnect: Listener = () => {
    if (connectedOnce) invalidate();
    connectedOnce = true;
  };
  socket.on('connect', onConnect);
  return () => {
    for (const [event, handler] of handlers) socket.off(event, handler);
    socket.off('connect', onConnect);
  };
}
