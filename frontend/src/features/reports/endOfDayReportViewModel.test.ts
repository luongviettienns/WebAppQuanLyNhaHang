import { describe, expect, it } from 'vitest';
import { CONCERN_OPTIONS, visibleFiltersForConcern, formatReceiver, changeConcern, detailCells, qualityFlags } from './endOfDayReportViewModel';
import { RECORD_TYPES_BY_CONCERN, SUPPORTED_FILTERS_BY_CONCERN, parseEndOfDayQuery } from '../../../../backend/src/modules/reports/end-of-day/end-of-day.schemas';
describe('end-of-day presentation contracts', () => {
  it.each([
    { source: 'CASHFLOW', destination: 'GOODS', recordType: 'MANUAL' },
    { source: 'GOODS', destination: 'CASHFLOW', recordType: 'STOCK_IN' }
  ] as const)('clears concern-specific record types from $source to $destination', ({ source, destination, recordType }) => {
    expect(RECORD_TYPES_BY_CONCERN[source] as readonly string[]).toContain(recordType);
    expect(RECORD_TYPES_BY_CONCERN[destination] as readonly string[]).not.toContain(recordType);
    const draft = { concern: source, recordTypes: [recordType], creatorUserId: 7, date: '2026-10-03', page: 2 };
    const switched = changeConcern(draft, destination);
    expect(switched).toEqual({ concern: destination, creatorUserId: 7, date: '2026-10-03', page: 1 });
    expect(() => parseEndOfDayQuery(switched)).not.toThrow();
    expect(changeConcern(draft, source).recordTypes).toEqual([recordType]);
  });
  it('shows quality counters without falsely warning about ordinary nonzero row counts', () => {
    expect(qualityFlags({ totalRows: 4, completedInvoiceCount: 4 })).toEqual([]);
    expect(qualityFlags({ 'goods.quantitySignMismatchRows': 2, 'sales.legacyPaymentMethodFallbackRows': 0 })).toEqual(['Số lượng kho sai dấu: 2']);
  });
  it('offers all approved concerns and mirrors every backend filter support set', () => {
    expect(CONCERN_OPTIONS.map(x => x.label)).toEqual(['Bán hàng', 'Thu chi', 'Hàng hóa', 'Hủy món', 'Tổng hợp']);
    for (const { value } of CONCERN_OPTIONS) expect(visibleFiltersForConcern(value)).toEqual(SUPPORTED_FILTERS_BY_CONCERN[value]);
    expect(visibleFiltersForConcern('SALES')).toContain('paymentMethods');
    expect(visibleFiltersForConcern('CANCELLED_ITEMS')).not.toContain('paymentMethods');
  });
  it('keeps unknown receivers distinct and removes incompatible filters and sorting on concern change', () => {
    expect(formatReceiver(null)).toBe('Chưa xác định');
    expect(formatReceiver('Lan')).toBe('Lan');
    expect(changeConcern({ concern: 'SALES', paymentMethods: ['CASH'], receiverEmployeeId: 4, date: '2026-10-03', view: 'HORIZONTAL', sortBy: 'amount', page: 2 }, 'CANCELLED_ITEMS')).toEqual({ concern: 'CANCELLED_ITEMS', receiverEmployeeId: 4, date: '2026-10-03', view: 'HORIZONTAL', page: 1 });
  });
  it('unwraps SUMMARY detail without losing its domain or unknown receiver', () => {
    const cells = detailCells({ domain: 'SALES', recordKind: 'INVOICE', occurredAt: '2026-10-03T02:00:00Z', sourceKey: 'sales:1', detail: { documentCode: 'HD01', occurredAt: '2026-10-03T02:00:00Z', amount: 0, receiverEmployeeId: null, receiverEmployeeName: 'Creator name', creatorUserName: 'Creator name' } } as any);
    expect(cells).toContain('Bán hàng');
    expect(cells).toContain('HD01');
    expect(cells).toContain('Chưa xác định');
  });
});
