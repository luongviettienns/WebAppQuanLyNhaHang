import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

describe('HTTP Envelope & Error Contracts (Task 6)', () => {
  it('tra ve ma 404 va dung format error envelope khi truy cap route khong ton tai', async () => {
    const res = await request(app).get('/api/unknown-endpoint-random');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String)
      }
    });
  });

  it('tra ve ma 400 va chi tiet loi chi tiet khi body request validation that bai', async () => {
    const res = await request(app).post('/api/system/test-validation').send({
      // Truong bat buoc bi thieu de gay loi validation
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBeDefined();
    expect(res.body.error.details).toBeDefined();
  });

  it('tra ve ma 401 UNAUTHENTICATED khi route yeu cau token nhung khong cung cap', async () => {
    const res = await request(app).get('/api/system/test-auth');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: 'UNAUTHENTICATED',
        message: expect.any(String)
      }
    });
  });

  it('tra ve ma 403 FORBIDDEN khi user khong du quyen han truy cap', async () => {
    const res = await request(app)
      .get('/api/system/test-forbidden')
      .set('x-mock-role', 'CASHIER');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: expect.any(String)
      }
    });
  });

  it('an stack trace va tra ve 500 INTERNAL_ERROR khi xay ra loi server chua xu ly', async () => {
    const res = await request(app).get('/api/system/test-server-error');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Da xay ra loi noi bo he thong. Vui long thu lai sau.'
      }
    });
    // Khong duoc de lo stack trace ra ngoai response
    expect(res.body.error.stack).toBeUndefined();
  });
});
