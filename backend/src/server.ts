import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { app } from './app';
import { env } from './config/env';
import { setSocketIO } from './lib/socket';
import { setupSocketServer } from './config/socket';

const server = http.createServer(app);

export const io = new SocketIOServer(server, {
  cors: {
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
    credentials: true
  }
});

setSocketIO(io);
setupSocketServer(io);


if (process.env.NODE_ENV !== 'test') {
  server.listen(env.PORT, () => {
    console.log(`🚀 CRISPY BITE Backend Server dang chay tai port ${env.PORT}`);
    console.log(`👉 Health Check: http://localhost:${env.PORT}/health`);
  });
}

export { server };
