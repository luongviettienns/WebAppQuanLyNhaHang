import type { Socket } from 'socket.io-client';

export function subscribeToEmployeeScheduleInvalidation(socket: Socket, invalidate: () => void): () => void {
  socket.on('employee-schedules:changed', invalidate);
  socket.on('connect', invalidate);
  return () => {
    socket.off('employee-schedules:changed', invalidate);
    socket.off('connect', invalidate);
  };
}
