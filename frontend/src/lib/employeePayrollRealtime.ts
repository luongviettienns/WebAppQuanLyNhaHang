type PayrollRealtimeListener = (...args: unknown[]) => void;

export interface EmployeePayrollRealtimeSocket {
  on(event: string, listener: PayrollRealtimeListener): unknown;
  off(event: string, listener: PayrollRealtimeListener): unknown;
}

export interface EmployeePayrollChangedPayload {
  batchId: number;
  branchId: number;
  employeeIds: number[];
  periodStart: string;
  periodEnd: string;
  revision: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;

export function isEmployeePayrollChangedPayload(value: unknown): value is EmployeePayrollChangedPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<EmployeePayrollChangedPayload>;
  return positiveInteger(payload.batchId)
    && positiveInteger(payload.branchId)
    && Array.isArray(payload.employeeIds)
    && payload.employeeIds.every(positiveInteger)
    && typeof payload.periodStart === 'string'
    && ISO_DATE.test(payload.periodStart)
    && typeof payload.periodEnd === 'string'
    && ISO_DATE.test(payload.periodEnd)
    && payload.periodStart <= payload.periodEnd
    && positiveInteger(payload.revision);
}

export function nextEmployeePayrollRevision(current: number) {
  if (!Number.isSafeInteger(current) || current < 0) return 1;
  return current < Number.MAX_SAFE_INTEGER ? current + 1 : current;
}

/** Socket messages are invalidations only; screens always refetch authoritative payroll rows. */
export function subscribeToEmployeePayrollInvalidation(
  socket: EmployeePayrollRealtimeSocket,
  invalidate: (payload: EmployeePayrollChangedPayload | null) => void
): () => void {
  let connectedOnce = false;
  const onChanged: PayrollRealtimeListener = payload => {
    if (isEmployeePayrollChangedPayload(payload)) invalidate(payload);
  };
  const onConnect: PayrollRealtimeListener = () => {
    if (connectedOnce) invalidate(null);
    connectedOnce = true;
  };
  socket.on('employee-payroll:changed', onChanged);
  socket.on('connect', onConnect);
  return () => {
    socket.off('employee-payroll:changed', onChanged);
    socket.off('connect', onConnect);
  };
}
