type Listener = (...args: unknown[]) => void;
export interface EmployeeCommissionRealtimeSocket { on(event: string, listener: Listener): unknown; off(event: string, listener: Listener): unknown }
export interface EmployeeCommissionChangedPayload {
  revision: number; branchId: number; reason: string;
  affectedPlanIds: number[]; affectedEmployeeIds: number[]; affectedOrderItemIds: number[];
}

const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const ids = (value: unknown): value is number[] => Array.isArray(value) && value.every(positive);

export function nextEmployeeCommissionRevision(current: number, serverRevision?: number) {
  const local = Number.isSafeInteger(current) && current >= 0 ? Math.min(Number.MAX_SAFE_INTEGER, current + 1) : 1;
  return positive(serverRevision) ? Math.max(local, serverRevision) : local;
}

export function subscribeToEmployeeCommissionInvalidation(
  socket: EmployeeCommissionRealtimeSocket,
  branchId: number,
  invalidate: (payload: EmployeeCommissionChangedPayload | null) => void
) {
  let connected = false;
  const changed: Listener = value => {
    if (!value || typeof value !== 'object') return;
    const payload = value as Record<string, unknown>;
    if (!positive(payload.revision) || payload.branchId !== branchId || typeof payload.reason !== 'string') return;
    const affectedPlanIds = ids(payload.affectedPlanIds) ? payload.affectedPlanIds : [];
    const affectedEmployeeIds = ids(payload.affectedEmployeeIds) ? payload.affectedEmployeeIds : [];
    const affectedOrderItemIds = ids(payload.affectedOrderItemIds) ? payload.affectedOrderItemIds : [];
    invalidate({ revision: payload.revision, branchId, reason: payload.reason, affectedPlanIds, affectedEmployeeIds, affectedOrderItemIds });
  };
  const connect: Listener = () => { if (connected) invalidate(null); connected = true; };
  socket.on('employee-commission:changed', changed);
  socket.on('connect', connect);
  return () => { socket.off('employee-commission:changed', changed); socket.off('connect', connect); };
}
