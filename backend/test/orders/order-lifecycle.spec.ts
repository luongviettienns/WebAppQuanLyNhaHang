import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { ordersRouter } from '../../src/modules/orders/orders.routes';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { errorHandler } from '../../src/middlewares/error-handler';
import { env } from '../../src/config/env';

vi.mock('../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'lifecycle-test-secret-at-least-32-characters',
    JWT_ISSUER: 'crispy-bite-api',
    JWT_AUDIENCE: 'crispy-bite-client'
  }
}));

vi.mock('../../src/modules/orders/orders.service', () => ({
  OrdersService: {
    getOrders: vi.fn(),
    updateOrderStatus: vi.fn(),
    payOrder: vi.fn(),
    createOrder: vi.fn()
  }
}));

const app = express();
app.use(express.json());
app.use('/api/orders', ordersRouter);
app.use(errorHandler);

function createToken(role: string, expiresIn = 3600) {
  return jwt.sign(
    { sub: '1', username: 'staff', name: 'Staff User', role },
    env.JWT_SECRET,
    { algorithm: 'HS256', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn }
  );
}

describe('Order Lifecycle & KDS API (Task 10)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/orders (KDS Bootstrap)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/orders?status=PENDING,PREPARING,READY');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(OrdersService.getOrders).not.toHaveBeenCalled();
    });

    it('rejects CASHIER role with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/orders?status=PENDING,PREPARING,READY')
        .set('Authorization', `Bearer ${createToken('CASHIER')}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(OrdersService.getOrders).not.toHaveBeenCalled();
    });

    it.each(['KITCHEN', 'ADMIN'])('allows %s to fetch active KDS orders', async (role) => {
      vi.mocked(OrdersService.getOrders).mockResolvedValue([
        {
          id: 101,
          code: 'CRISPY-20260909-0101',
          status: 'PENDING',
          orderType: 'DINE_IN',
          tableNumber: 3,
          totalAmount: 120000,
          vatAmount: 9600,
          finalAmount: 129600,
          paymentStatus: 'UNPAID',
          createdAt: new Date().toISOString(),
          items: []
        }
      ] as any);

      const res = await request(app)
        .get('/api/orders?status=PENDING,PREPARING,READY')
        .set('Authorization', `Bearer ${createToken(role)}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].code).toBe('CRISPY-20260909-0101');
      expect(OrdersService.getOrders).toHaveBeenCalledWith({
        status: ['PENDING', 'PREPARING', 'READY']
      });
    });
  });

  describe('PATCH /api/orders/:id/status (Lifecycle FSM Transitions)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .patch('/api/orders/101/status')
        .send({ status: 'PREPARING' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects CASHIER role with 403', async () => {
      const res = await request(app)
        .patch('/api/orders/101/status')
        .set('Authorization', `Bearer ${createToken('CASHIER')}`)
        .send({ status: 'PREPARING' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects invalid status payloads with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch('/api/orders/101/status')
        .set('Authorization', `Bearer ${createToken('KITCHEN')}`)
        .send({ status: 'INVALID_STATUS' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows KITCHEN to transition order from PENDING to PREPARING', async () => {
      const preparingAt = new Date().toISOString();
      vi.mocked(OrdersService.updateOrderStatus).mockResolvedValue({
        id: 101,
        code: 'CRISPY-20260909-0101',
        status: 'PREPARING',
        preparingAt
      } as any);

      const res = await request(app)
        .patch('/api/orders/101/status')
        .set('Authorization', `Bearer ${createToken('KITCHEN')}`)
        .send({ status: 'PREPARING' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PREPARING');
      expect(OrdersService.updateOrderStatus).toHaveBeenCalledWith(101, 'PREPARING', 1);
    });

    it('allows transition from PREPARING to READY and derives prepTimeSec', async () => {
      const readyAt = new Date().toISOString();
      vi.mocked(OrdersService.updateOrderStatus).mockResolvedValue({
        id: 101,
        code: 'CRISPY-20260909-0101',
        status: 'READY',
        readyAt,
        prepTimeSec: 240
      } as any);

      const res = await request(app)
        .patch('/api/orders/101/status')
        .set('Authorization', `Bearer ${createToken('KITCHEN')}`)
        .send({ status: 'READY' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('READY');
      expect(res.body.data.prepTimeSec).toBe(240);
    });
  });
});
