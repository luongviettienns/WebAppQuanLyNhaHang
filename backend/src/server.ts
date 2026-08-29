import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { app } from './app';
import { env } from './config/env';

const server = http.createServer(app);

export const io = new SocketIOServer(server, {
  cors: {
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
    credentials: true
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client ket noi moi: ${socket.id}`);

  socket.on('join:room', (roomName: string) => {
    socket.join(roomName);
    console.log(`[Socket.io] Socket ${socket.id} da gia nhap room: ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client ngat ket noi: ${socket.id}`);
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(env.PORT, () => {
    console.log(`🚀 CRISPY BITE Backend Server dang chay tai port ${env.PORT}`);
    console.log(`👉 Health Check: http://localhost:${env.PORT}/health`);
  });
}

export { server };
