import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

describe('GET /health', () => {
  it('tra ve ma trang thai 200 va status ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        status: 'ok'
      }
    });
  });
});
