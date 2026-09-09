import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './env';

export interface AuthenticatedUser {
  id: number;
  username: string;
  name: string;
  role: string;
}

export function setupSocketServer(io: SocketIOServer) {
  // 1. Handshake authentication middleware
  io.use((socket: Socket, next) => {
    const rawToken =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization;

    if (!rawToken) {
      // Khach quen QR ban hoac ket noi khong kem token
      socket.data.user = null;
      return next();
    }

    const token = typeof rawToken === 'string' && rawToken.startsWith('Bearer ')
      ? rawToken.slice(7)
      : rawToken;

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE
      }) as any;

      socket.data.user = {
        id: parseInt(decoded.sub, 10),
        username: decoded.username,
        name: decoded.name,
        role: decoded.role
      };
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  // 2. Connection and room management
  io.on('connection', (socket: Socket) => {
    // Tat ca client deu gia nhap phong chung restaurant:main
    socket.join('restaurant:main');

    const user: AuthenticatedUser | null = socket.data.user;

    // Chi KITCHEN va ADMIN duoc tu dong gia nhap phong restaurant:kds
    if (user && (user.role === 'KITCHEN' || user.role === 'ADMIN')) {
      socket.join('restaurant:kds');
    }

    // Xu ly gia nhap room chu dong
    socket.on('join:room', (roomName: string) => {
      if (roomName === 'restaurant:kds') {
        if (socket.data.user?.role === 'KITCHEN' || socket.data.user?.role === 'ADMIN') {
          socket.join(roomName);
        } else {
          socket.emit('error', { code: 'FORBIDDEN', message: 'Chỉ nhân viên Bếp và Admin mới được vào room KDS' });
        }
        return;
      }
      socket.join(roomName);
    });

    socket.on('disconnect', () => {
      // client disconnected
    });
  });
}
