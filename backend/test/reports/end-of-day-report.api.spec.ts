import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { EndOfDayReportService, EndOfDayReportRowLimitError } from '../../src/modules/reports/end-of-day/end-of-day.service';
import { ReportsService } from '../../src/modules/reports/reports.service';
import type { EndOfDayReportResponse } from '../../src/modules/reports/end-of-day/end-of-day.types';
const snapshot: EndOfDayReportResponse = {
  metadata: { date: '2026-08-15', from: '2026-08-14T17:00:00.000Z', to: '2026-08-15T17:00:00.000Z',
    timezone: 'Asia/Ho_Chi_Minh', asOf: '2026-08-15T10:00:00.000Z', generatedAt: '2026-08-15T10:00:01.000Z',
    concern: 'SALES', view: 'VERTICAL', operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true } },
  hasData: false, summary: {}, rows: [], pagination: { page: 1, pageSize: 50, totalRows: 0, totalPages: 0 }, filterOptions: {}
};

function token(role: string) {
  return jwt.sign({ sub: '1', username: 'test', name: 'Test', role }, env.JWT_SECRET,
    { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn: '1h' });
}
afterEach(() => vi.restoreAllMocks());
describe('secured end-of-day API', () => {
  it.each(['guest', 'CASHIER', 'KITCHEN'])('rejects %s for report and export', async role => {
    for (const path of ['/end-of-day', '/end-of-day/export?format=xlsx']) {
      const req = request(app).get(`/api/reports${path}`);
      if (role !== 'guest') req.set('Authorization', `Bearer ${token(role)}`);
      const res = await req;
      expect(res.status).toBe(role === 'guest' ? 401 : 403);
      expect(res.body.error.code).toBe(role === 'guest' ? 'UNAUTHENTICATED' : 'FORBIDDEN');
    }
  });
  it.each([{ concern: 'SUMMARY', customerId: '1' }, { fromTime: '08:00' },
    { toTime: '12:00' }, { concern: 'CASHFLOW', recordTypes: 'SALE_ITEM' },
    { concern: 'GOODS', recordTypes: 'INVALID' }])('rejects invalid filters %j for both routes', async query => {
    for (const path of ['/end-of-day', '/end-of-day/export']) {
      const res = await request(app).get(`/api/reports${path}`).query({ ...query, ...(path.endsWith('export') ? { format: 'xlsx' } : {}) })
        .set('Authorization', `Bearer ${token('ADMIN')}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('returns locked operating metadata and normalized business window', async () => {
    vi.spyOn(EndOfDayReportService.prototype, 'get').mockImplementation(async query => {
      expect(query.from.toISOString()).toBe('2026-08-14T17:00:00.000Z');
      expect(query.to.toISOString()).toBe('2026-08-15T17:00:00.000Z');
      return snapshot as never;
    });
    const res = await request(app).get('/api/reports/end-of-day?date=2026-08-15').set('Authorization', `Bearer ${token('ADMIN')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.metadata.operatingScope).toEqual({ code: 'MAIN', name: 'Nhà hàng chính', locked: true });
    expect(res.body.data.metadata).not.toHaveProperty('branch');
  });
  it('preserves daily endpoint response', async () => {
    vi.spyOn(ReportsService, 'getDailyReport').mockResolvedValue({ report: { totalRevenue: 123 } } as never);
    const res = await request(app).get('/api/reports/daily?date=2026-08-15').set('Authorization', `Bearer ${token('ADMIN')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.report.totalRevenue).toBe(123);
  });
  it('rejects unsupported or missing export format', async () => {
    for (const suffix of ['', '?format=csv', '?format=xlsx&mode=EXPORT']) {
      const res = await request(app).get(`/api/reports/end-of-day/export${suffix}`).set('Authorization', `Bearer ${token('ADMIN')}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
  it('returns an XLSX download from the bounded unpaginated result', async () => {
    vi.spyOn(EndOfDayReportService.prototype, 'get').mockImplementation(async (query, options) => {
      expect(query.page).toBe(2);
      expect(options).toEqual({ mode: 'EXPORT', maxRows: 50000 });
      return snapshot as never;
    });
    const res = await request(app).get('/api/reports/end-of-day/export?date=2026-08-15&format=xlsx&page=2')
      .set('Authorization', `Bearer ${token('ADMIN')}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('end-of-day-2026-08-15.xlsx');
  });
  it('maps 50,001 estimated rows to 413 without a workbook', async () => {
    vi.spyOn(EndOfDayReportService.prototype, 'get').mockRejectedValue(new EndOfDayReportRowLimitError(50001, 50000));
    const res = await request(app).get('/api/reports/end-of-day/export?format=xlsx').set('Authorization', `Bearer ${token('ADMIN')}`);
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({ code: 'REPORT_EXPORT_TOO_LARGE', details: { estimatedRows: 50001 } });
    expect(res.headers['content-disposition']).toBeUndefined();
  });
});
