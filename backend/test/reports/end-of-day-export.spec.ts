import { afterAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { EndOfDayReportResponse } from '../../src/modules/reports/end-of-day/end-of-day.types';
import { EndOfDayReportService } from '../../src/modules/reports/end-of-day/end-of-day.service';
import { parseEndOfDayQuery } from '../../src/modules/reports/end-of-day/end-of-day.schemas';
import { prismaTest } from '../helpers/database';

afterAll(async () => prismaTest.$disconnect());

export const snapshot: EndOfDayReportResponse = {
  metadata: { date: '2026-08-15', from: '2026-08-14T17:00:00.000Z', to: '2026-08-15T17:00:00.000Z',
    timezone: 'Asia/Ho_Chi_Minh', asOf: '2026-08-15T10:00:00.000Z', generatedAt: '2026-08-15T10:00:01.000Z',
    concern: 'SUMMARY', view: 'HORIZONTAL', operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true } },
  hasData: true, summary: { netInvoiceValue: 880, invariantCounters: { unreconciledCount: 1 } },
  rows: [{ concern: 'SALES', documentCode: '=HYPERLINK("evil")', amount: 1000, qualityFlags: ['legacy'] },
    { concern: 'CASHFLOW', documentCode: 'PAY-1', amount: -120, account: { name: 'Cash' } }],
  pagination: { page: 1, pageSize: 2, totalRows: 2, totalPages: 1 }, filterOptions: {}
};

describe('end-of-day workbook', () => {
  it('rejects text exceeding Excel cell capacity with actionable 413 instead of an internal write error', async () => {
    const module = await import('../../src/modules/reports/end-of-day/end-of-day.export');
    expect(() => module.serializeEndOfDayWorkbook({ ...snapshot, rows: [{ name: 'x'.repeat(32768) }] }))
      .toThrow(expect.objectContaining({ statusCode: 413, code: 'REPORT_EXPORT_TOO_LARGE' }));
  });
  it('matches real unpaginated service rows and aggregates for a filtered MySQL fixture', async () => {
    const codes = ['TASK9-MATCH-1', 'TASK9-MATCH-2', 'TASK9-EXCLUDED'];
    try {
      for (const [index, code] of codes.entries()) await prismaTest.order.create({ data: {
        code, status: 'COMPLETED', orderType: 'TAKE_AWAY', completedAt: new Date('2031-08-15T05:00:00Z'),
        createdAt: new Date('2030-01-01T00:00:00Z'), vatAmount: 0, totalAmount: (index + 1) * 100, finalAmount: (index + 1) * 100
      } });
      const query = parseEndOfDayQuery({ date: '2031-08-15', search: 'TASK9-MATCH', page: 2, pageSize: 1 });
      const result = await new EndOfDayReportService(prismaTest).get(query, { mode: 'EXPORT', maxRows: 50000 });
      expect(result.rows).toHaveLength(2);
      expect(result.summary).toMatchObject({ netInvoiceValue: 300 });
      const module = await import('../../src/modules/reports/end-of-day/end-of-day.export').catch(() => null);
      expect(module).not.toBeNull();
      const book = XLSX.read(module!.serializeEndOfDayWorkbook({ ...result, filters: query }), { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.Data);
      expect(rows).toHaveLength(result.rows.length);
      expect(rows.reduce((total, row) => total + Number(row.amount), 0)).toBe(300);
      expect(XLSX.utils.sheet_to_json(book.Sheets.Summary)).toContainEqual({ key: 'netInvoiceValue', value: 300 });
    } finally { await prismaTest.order.deleteMany({ where: { code: { in: codes } } }); }
  });
  it('serializes every normalized detail and summary with metadata, filters and quality flags', async () => {
    // Dynamic import lets RED assert the missing serializer rather than a collection error.
    const module = await import('../../src/modules/reports/end-of-day/end-of-day.export').catch(() => null);
    expect(module, 'workbook serializer must exist').not.toBeNull();
    const buffer = module!.serializeEndOfDayWorkbook({ ...snapshot, filters: { search: 'PAY' } });
    const book = XLSX.read(buffer, { type: 'buffer' });
    expect(book.SheetNames).toEqual(['Data', 'Summary', 'Metadata']);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.Data);
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.amount)).toEqual([1000, -120]);
    expect(rows[0].qualityFlags).toBe('["legacy"]');
    expect(book.Sheets.Data.B2.f).toBeUndefined();
    expect(book.Sheets.Data.B2.t).toBe('s');
    const summary = XLSX.utils.sheet_to_json(book.Sheets.Summary);
    expect(summary).toContainEqual({ key: 'netInvoiceValue', value: 880 });
    expect(summary).toContainEqual({ key: 'invariantCounters.unreconciledCount', value: 1 });
    const metadata = XLSX.utils.sheet_to_json(book.Sheets.Metadata);
    for (const key of ['from', 'to', 'timezone', 'asOf', 'generatedAt']) {
      expect(metadata).toContainEqual({ key, value: snapshot.metadata[key as keyof typeof snapshot.metadata] });
    }
    expect(metadata).toContainEqual({ key: 'filters.search', value: 'PAY' });
    expect(metadata).toContainEqual({ key: 'operatingScope.name', value: 'Nhà hàng chính' });
  });
  it('rejects oversized snapshots and configured memory limits instead of truncating', async () => {
    const module = await import('../../src/modules/reports/end-of-day/end-of-day.export').catch(() => null);
    expect(module).not.toBeNull();
    expect(() => module!.serializeEndOfDayWorkbook({ ...snapshot, pagination: { ...snapshot.pagination, totalRows: 50001 } }))
      .toThrow(expect.objectContaining({ statusCode: 413, code: 'REPORT_EXPORT_TOO_LARGE', details: { estimatedRows: 50001, maxRows: 50000 } }));
    expect(() => module!.serializeEndOfDayWorkbook(snapshot, { maxBytes: 64 })).toThrow(expect.objectContaining({ statusCode: 413 }));
  });
});
