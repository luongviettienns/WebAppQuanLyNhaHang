import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { setupSocketServer } from '../../src/config/socket';

describe('Socket.io Gateway & Room Authorization (Task 10)', () => {
  let server: http.Server;
  let ioServer: SocketIOServer;
  let port: number;

  function createToken(role: string, expiresIn = 3600) {
    return jwt.sign(
      { sub: '1', username: 'testuser', name: 'Test User', role },
      env.JWT_SECRET,
      { algorithm: 'HS256', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn }
    );
  }

  beforeAll(async () => {
    server = http.createServer();
    ioServer = new SocketIOServer(server, {
      cors: { origin: '*' }
    });

    setupSocketServer(ioServer);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    ioServer.close();
    server.close();
  });

  it('rejects connection with invalid JWT token with UNAUTHENTICATED error', async () => {
    const client = Client(`http://localhost:${port}`, {
      auth: { token: 'invalid-jwt-token' },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false
    });

    const errorPromise = new Promise<string>((resolve) => {
      client.on('connect_error', (err) => {
        resolve(err.message);
      });
    });

    const errorMsg = await errorPromise;
    expect(errorMsg).toContain('UNAUTHENTICATED');
    client.close();
  });

  it('allows KITCHEN user to connect and automatically join restaurant:kds', async () => {
    const kitchenToken = createToken('KITCHEN');
    const client = Client(`http://localhost:${port}`, {
      auth: { token: kitchenToken },
      transports: ['websocket'],
      autoConnect: true
    });

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    const orderPromise = new Promise<any>((resolve) => {
      client.on('order:new', (data) => resolve(data));
    });

    // Emit order:new to restaurant:kds
    ioServer.to('restaurant:kds').emit('order:new', { orderId: 999, code: 'CRISPY-TEST' });

    const received = await orderPromise;
    expect(received.orderId).toBe(999);
    client.close();
  });

  it('CASHIER does not join restaurant:kds and does not receive order:new', async () => {
    const cashierToken = createToken('CASHIER');
    const client = Client(`http://localhost:${port}`, {
      auth: { token: cashierToken },
      transports: ['websocket'],
      autoConnect: true
    });

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    let received = false;
    client.on('order:new', () => {
      received = true;
    });

    // Emit to restaurant:kds only
    ioServer.to('restaurant:kds').emit('order:new', { orderId: 888 });

    // Wait 200ms
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toBe(false);
    client.close();
  });

  it('CASHIER receives menu:itemSoldOutChanged in restaurant:main', async () => {
    const cashierToken = createToken('CASHIER');
    const client = Client(`http://localhost:${port}`, {
      auth: { token: cashierToken },
      transports: ['websocket'],
      autoConnect: true
    });

    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
    });

    const menuPromise = new Promise<any>((resolve) => {
      client.on('menu:itemSoldOutChanged', (data) => resolve(data));
    });

    ioServer.to('restaurant:main').emit('menu:itemSoldOutChanged', { itemId: 5, isSoldOut: true });

    const received = await menuPromise;
    expect(received.itemId).toBe(5);
    expect(received.isSoldOut).toBe(true);
    client.close();
  });
});
