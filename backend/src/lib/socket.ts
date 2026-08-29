import { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export function setSocketIO(io: SocketIOServer) {
  ioInstance = io;
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

export function emitToAll<T>(event: string, payload: T): void {
  if (ioInstance) {
    ioInstance.emit(event, payload);
  }
}

export function emitToRoom<T>(room: string, event: string, payload: T): void {
  if (ioInstance) {
    ioInstance.to(room).emit(event, payload);
  }
}
