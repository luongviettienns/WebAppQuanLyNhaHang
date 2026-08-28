import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ordersRouter } from '../../src/modules/orders/orders.routes';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { errorHandler } from '../../src/middlewares/error-handler';
import { env } from '../../src/config/env';

// Exercise the real router, JWT middleware and controller without accessing a DB.
vi.mock('../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'payment-route-test-secret-at-least-32-characters',
    JWT_ISSUER: 'crispy-bite-api',
    JWT_AUDIENCE: 'crispy-bite-client'
  }
}));
vi.mock('../../src/modules/orders/orders.service', () => ({
  OrdersService: { payOrder: vi.fn(), createOrder: vi.fn() }
}));

const app = express();
app.use(express.json());
app.use('/api/orders', ordersRouter);
app.use(errorHandler);

function token(role: string, secret = env.JWT_SECRET, expiresIn = 3600) {
  return jwt.sign({ sub: '1', username: 'staff', name: 'Staff', role }, secret, {
    algorithm: 'HS256', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn
  });
}

describe('Payment authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(OrdersService.payOrder).mockResolvedValue({
      order: { id: 42, paymentStatus: 'PAID', paymentMethod: 'CASH' }
    } as Awaited<ReturnType<typeof OrdersService.payOrder>>);
  });

  it.each([
    ['no token', undefined, 401, 'UNAUTHENTICATED'],
    ['malformed token', 'invalid-token', 401, 'UNAUTHENTICATED'],
    ['wrong signature', token('CASHIER', 'wrong-secret'), 401, 'UNAUTHENTICATED'],
    ['expired token', token('CASHIER', env.JWT_SECRET, -1), 401, 'UNAUTHENTICATED'],
    ['kitchen', token('KITCHEN'), 403, 'FORBIDDEN']
  ])('rejects %s before payment processing', async (_name, bearer, status, code) => {
    const req = request(app).post('/api/orders/42/pay');
    if (bearer) req.set('Authorization', `Bearer ${bearer}`);
    const res = await req.send({ paymentMethod: 'BANK_TRANSFER' });

    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(OrdersService.payOrder).not.toHaveBeenCalled();
  });

  it.each(['CASHIER', 'ADMIN'])('allows %s to confirm payment', async (role) => {
    const res = await request(app).post('/api/orders/42/pay')
      .set('Authorization', `Bearer ${token(role)}`)
      .send({ paymentMethod: 'CASH' });

    expect(res.status).toBe(200);
    expect(res.body.data.order).toMatchObject({ id: 42, paymentStatus: 'PAID' });
    expect(OrdersService.payOrder).toHaveBeenCalledOnce();
    expect(OrdersService.payOrder).toHaveBeenCalledWith(42, { paymentMethod: 'CASH' });
  });

  it('keeps guest order creation public', async () => {
    vi.mocked(OrdersService.createOrder).mockResolvedValue({
      order: { id: 43, paymentStatus: 'UNPAID' }, isDuplicate: false
    } as Awaited<ReturnType<typeof OrdersService.createOrder>>);

    const res = await request(app).post('/api/orders').send({
      orderType: 'DINE_IN', tableId: 1, items: [{ menuItemId: 1, quantity: 1 }]
    });

    expect(res.status).toBe(201);
    expect(res.body.data.order.paymentStatus).toBe('UNPAID');
    expect(OrdersService.createOrder).toHaveBeenCalledOnce();
  });
});
