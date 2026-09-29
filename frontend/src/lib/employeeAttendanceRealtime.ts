type AttendanceRealtimeListener = (...args: never[]) => void;

export interface AttendanceRealtimeSocket {
  on(event: string, listener: AttendanceRealtimeListener): unknown;
  off(event: string, listener: AttendanceRealtimeListener): unknown;
}

/** Treat socket messages as invalidations only; callers must refetch authoritative rows. */
export function subscribeToEmployeeAttendanceInvalidation(
  socket: AttendanceRealtimeSocket,
  invalidate: () => void
): () => void {
  let connectedOnce = false;
  const onChanged: AttendanceRealtimeListener = () => invalidate();
  const onConnect: AttendanceRealtimeListener = () => {
    if (connectedOnce) invalidate();
    connectedOnce = true;
  };
  socket.on('employee-attendance:changed', onChanged);
  socket.on('connect', onConnect);
  return () => {
    socket.off('employee-attendance:changed', onChanged);
    socket.off('connect', onConnect);
  };
}
