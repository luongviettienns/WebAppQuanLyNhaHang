import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';

describe('Auth & RBAC End-to-End (Task 7)', () => {
  beforeAll(async () => {
    validateTestEnvironment();
    await seedDatabase(prismaTest);
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('dang nhap thanh cong voi tai khoan cashier va tra ve JWT hop le', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cashier', password: 'cashier123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toEqual({
      id: expect.any(Number),
      username: 'cashier',
      name: 'Thu Ngân Quầy (Cashier)',
      role: 'CASHIER'
    });
  });

  it('dang nhap thanh cong voi tai khoan kitchen va admin', async () => {
    const kitchenRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'kitchen', password: 'kitchen123' });
    expect(kitchenRes.status).toBe(200);
    expect(kitchenRes.body.data.user.role).toBe('KITCHEN');

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.user.role).toBe('ADMIN');
  });

  it('tra ve 401 INVALID_CREDENTIALS khi sai ten dang nhap hoac mat khau', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cashier', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác'
      }
    });
  });

  it('lay thong tin nguoi dung hien tai GET /api/auth/me voi Bearer token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.username).toBe('admin');
    expect(meRes.body.data.user.role).toBe('ADMIN');
  });

  it('tra ve 401 UNAUTHENTICATED khi truy cap GET /api/auth/me khong co token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('tra ve 429 RATE_LIMITED khi gui qua 5 lan dang nhap sai lien tiep tu cung 1 IP', async () => {
    const testIp = '192.168.1.99';
    // Gui 5 lan that bai
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({ username: 'cashier', password: 'badpassword' });
    }

    // Lan thu 6 bi chan
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', testIp)
      .send({ username: 'cashier', password: 'badpassword' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });
});
