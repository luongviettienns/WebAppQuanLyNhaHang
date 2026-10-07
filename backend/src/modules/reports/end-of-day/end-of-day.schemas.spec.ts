import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEndOfDayQuery, endOfDayReportMetadataSchema } from './end-of-day.schemas';
import { resolveBusinessWindow, isWithinBusinessWindow, serializeBusinessWindow } from './end-of-day.time';
import type { EndOfDayReportResponse, NormalizedConcernResult } from './end-of-day.types';

const date = '2026-10-03';

describe('business window', () => {
  it.each([
    ['2026-10-03', '2026-10-02T17:00:00.000Z', '2026-10-03T17:00:00.000Z'],
    ['2024-02-29', '2024-02-28T17:00:00.000Z', '2024-02-29T17:00:00.000Z'],
    ['2026-12-31', '2026-12-30T17:00:00.000Z', '2026-12-31T17:00:00.000Z']
  ])('resolves full day %s', (businessDate, from, to) => {
    expect(serializeBusinessWindow(resolveBusinessWindow(businessDate))).toEqual({ from, to, timezone: 'Asia/Ho_Chi_Minh' });
  });
  it('resolves clock bounds on the selected date', () => {
    const window = resolveBusinessWindow(date, '08:30', '23:59', 'Asia/Ho_Chi_Minh');
    expect(window.from.toISOString()).toBe('2026-10-03T01:30:00.000Z');
    expect(window.to.toISOString()).toBe('2026-10-03T16:59:00.000Z');
  });
  it('includes exact start and excludes exact end', () => {
    const window = resolveBusinessWindow(date);
    expect(isWithinBusinessWindow(new Date('2026-10-02T16:59:59.999Z'), window)).toBe(false);
    expect(isWithinBusinessWindow(new Date('2026-10-02T17:00:00.000Z'), window)).toBe(true);
    expect(isWithinBusinessWindow(new Date('2026-10-03T16:59:59.999Z'), window)).toBe(true);
    expect(isWithinBusinessWindow(new Date('2026-10-03T17:00:00.000Z'), window)).toBe(false);
  });
  it.each(['2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-10-00', '26-10-03', '2026-1-03', '0000-01-01'])('rejects invalid date %s', value => {
    expect(() => resolveBusinessWindow(value)).toThrow();
    expect(() => parseEndOfDayQuery({ date: value })).toThrow();
  });
  it.each([
    ['08:00', undefined], [undefined, '12:00'], ['8:00', '12:00'], ['08:00', '24:00'],
    ['08:60', '12:00'], ['08:00:00', '12:00'], ['08:00', '08:00'], ['23:00', '01:00'], ['08:00\n', '12:00']
  ])('rejects invalid time bounds %s..%s', (fromTime, toTime) => {
    expect(() => resolveBusinessWindow(date, fromTime, toTime)).toThrow();
    expect(() => parseEndOfDayQuery({ date, fromTime, toTime })).toThrow();
  });
  it('rejects other timezones', () => {
    expect(() => resolveBusinessWindow(date, undefined, undefined, 'UTC')).toThrow();
    expect(() => parseEndOfDayQuery({ date, timezone: 'UTC' })).toThrow();
  });
});

describe('strict query contract', () => {
  afterEach(() => vi.useRealTimers());
  it('defaults Vietnam date, sorting and pagination', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T18:00:00.000Z'));
    expect(parseEndOfDayQuery({})).toMatchObject({ date, concern: 'SALES', view: 'VERTICAL', page: 1, pageSize: 50, sortBy: 'occurredAt', sortOrder: 'desc' });
  });
  it('normalizes HTTP filters and preserves false', () => {
    expect(parseEndOfDayQuery({ date, customerId: '12', receiverEmployeeId: '23', creatorUserId: '34', areaId: '45', tableId: '56', paymentMethods: 'CASH,BANK_TRANSFER', delivery: 'false', search: '  CB-001  ', page: '2', pageSize: '200', sortBy: 'amount', sortOrder: 'asc' })).toMatchObject({ customerId: 12, receiverEmployeeId: 23, creatorUserId: 34, areaId: 45, tableId: 56, paymentMethods: ['CASH', 'BANK_TRANSFER'], delivery: false, search: 'CB-001', page: 2, pageSize: 200, sortBy: 'amount', sortOrder: 'asc' });
  });
  const samples = { customerId: '1', receiverEmployeeId: '1', creatorUserId: '1', paymentMethods: 'CASH', delivery: 'true', areaId: '1', tableId: '1', cancelReason: 'duplicate', recordTypes: 'MANUAL', search: 'CB' };
  const supported: Record<string, string[]> = {
    SALES: ['customerId', 'receiverEmployeeId', 'creatorUserId', 'paymentMethods', 'delivery', 'areaId', 'tableId', 'search'],
    CASHFLOW: ['customerId', 'creatorUserId', 'paymentMethods', 'recordTypes', 'search'],
    GOODS: ['creatorUserId', 'recordTypes', 'search'],
    CANCELLED_ITEMS: ['receiverEmployeeId', 'creatorUserId', 'delivery', 'areaId', 'tableId', 'cancelReason', 'search'],
    SUMMARY: []
  };
  for (const [concern, filters] of Object.entries(supported)) {
    it(`accepts ${concern}`, () => expect(parseEndOfDayQuery({ date, concern })).toMatchObject({ concern, view: 'VERTICAL' }));
    for (const [filter, sample] of Object.entries(samples)) {
      it(`${filters.includes(filter) ? 'accepts' : 'rejects'} ${filter} for ${concern}`, () => {
        const value = filter === 'recordTypes' && concern === 'GOODS' ? 'SALE_ITEM' : sample;
        const parse = () => parseEndOfDayQuery({ date, concern, [filter]: value });
        if (filters.includes(filter)) expect(parse()).toHaveProperty(filter);
        else expect(parse).toThrow(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }));
      });
    }
  }
  it.each([
    { unknown: 'x' }, { branchId: '1' }, { concern: 'OTHER' }, { view: 'GRID' },
    { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: true }, { page: ['1'] }, { pageSize: '201' }, { pageSize: '' },
    { customerId: true }, { customerId: '1e2' }, { delivery: 'yes' }, { paymentMethods: 'CASH,OTHER' },
    { paymentMethods: '' }, { paymentMethods: 'CASH,,BANK_TRANSFER' }, { sortBy: 'finalAmount; DROP TABLE Order' },
    { sortOrder: 'sideways' }, { sortBy: 'quantity' }, { recordTypes: 'SALE_ITEM' }, { page: '1\n' }, { customerId: '1\n' }, { sort: 'occurredAt' }
  ])('rejects malformed input %j', input => {
    expect(() => parseEndOfDayQuery({ date, ...input })).toThrow(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }));
  });
  it('accepts supported null filters but rejects unsupported null filters', () => {
    expect(parseEndOfDayQuery({ date, customerId: null, delivery: null, paymentMethods: null })).toMatchObject({ customerId: null, delivery: null, paymentMethods: null });
    expect(() => parseEndOfDayQuery({ date, concern: 'SUMMARY', paymentMethods: null })).toThrow();
  });
  it.each(['MANUAL', 'RESERVATION_DEPOSIT', 'RESERVATION_REFUND', 'ORDER_PAYMENT', 'SALES_RETURN_REFUND', 'PURCHASE_RECEIPT_PAYMENT', 'SUPPLIER_PAYMENT', 'PURCHASE_RETURN_REFUND', 'PAYROLL_PAYMENT', 'REVERSAL'])('accepts cash source %s only for Cashflow', recordType => {
    expect(parseEndOfDayQuery({ date, concern: 'CASHFLOW', recordTypes: [recordType] }).recordTypes).toEqual([recordType]);
    expect(() => parseEndOfDayQuery({ date, concern: 'GOODS', recordTypes: [recordType] })).toThrow();
  });
  it.each(['SALE_ITEM', 'INVENTORY_EVENT', 'STOCK_IN', 'PURCHASE_RETURN', 'AUTO_DEDUCT', 'KITCHEN_WASTE', 'MANUAL_ADJUST', 'VOID_RESTORE', 'SALES_RETURN'])('accepts Goods type %s only for Goods', recordType => {
    expect(parseEndOfDayQuery({ date, concern: 'GOODS', recordTypes: recordType }).recordTypes).toEqual([recordType]);
    expect(() => parseEndOfDayQuery({ date, concern: 'CASHFLOW', recordTypes: recordType })).toThrow();
  });
  it.each(['APPLY_TO_BILL', 'FORFEIT', 'OTHER'])('rejects non-money source %s', recordType => {
    expect(() => parseEndOfDayQuery({ date, concern: 'CASHFLOW', recordTypes: recordType })).toThrow();
  });
  it.each([
    ['SALES', 'occurredAt'], ['SALES', 'documentCode'], ['SALES', 'amount'],
    ['CASHFLOW', 'occurredAt'], ['CASHFLOW', 'amount'], ['CASHFLOW', 'sourceType'],
    ['GOODS', 'occurredAt'], ['GOODS', 'recordType'], ['GOODS', 'quantity'], ['GOODS', 'amount'],
    ['CANCELLED_ITEMS', 'occurredAt'], ['CANCELLED_ITEMS', 'menuItemName'], ['CANCELLED_ITEMS', 'quantity'], ['CANCELLED_ITEMS', 'lineAmount']
  ])('allows %s sort %s', (concern, sortBy) => {
    expect(parseEndOfDayQuery({ date, concern, sortBy, sortOrder: 'asc' })).toMatchObject({ sortBy, sortOrder: 'asc' });
  });
  it('rejects Summary detail sorting and cross-concern sort fields', () => {
    expect(parseEndOfDayQuery({ date, concern: 'SUMMARY' })).not.toHaveProperty('sortBy');
    expect(() => parseEndOfDayQuery({ date, concern: 'SUMMARY', sortBy: 'occurredAt' })).toThrow();
    expect(() => parseEndOfDayQuery({ date, concern: 'SUMMARY', sortOrder: 'asc' })).toThrow();
    expect(() => parseEndOfDayQuery({ date, concern: 'SUMMARY', sortBy: undefined })).toThrow();
    expect(() => parseEndOfDayQuery({ date, concern: 'CASHFLOW', sortBy: 'documentCode' })).toThrow();
  });
  it('deduplicates lists without dropping invalid entries', () => {
    expect(parseEndOfDayQuery({ date, paymentMethods: ['CASH', 'CASH'] }).paymentMethods).toEqual(['CASH']);
    expect(parseEndOfDayQuery({ date, concern: 'GOODS', recordTypes: ['SALE_ITEM', 'SALE_ITEM'] }).recordTypes).toEqual(['SALE_ITEM']);
    expect(() => parseEndOfDayQuery({ date, concern: 'GOODS', recordTypes: 'SALE_ITEM,' })).toThrow();
  });
});

describe('serialized response contract', () => {
  const metadata = { date, from: '2026-10-02T17:00:00.000Z', to: '2026-10-03T17:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh', asOf: '2026-10-03T11:00:00.000Z', generatedAt: '2026-10-03T11:00:01.000Z', concern: 'CASHFLOW', view: 'VERTICAL', operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true } };
  it('requires ISO timestamps and scope without id', () => {
    expect(endOfDayReportMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(() => endOfDayReportMetadataSchema.parse({ ...metadata, operatingScope: { ...metadata.operatingScope, id: 1 } })).toThrow();
    expect(() => endOfDayReportMetadataSchema.parse({ ...metadata, asOf: undefined })).toThrow();
    expect(() => endOfDayReportMetadataSchema.parse({ ...metadata, generatedAt: new Date() })).toThrow();
    expect(() => endOfDayReportMetadataSchema.parse({ ...metadata, from: '2026-10-03' })).toThrow();
  });
  it('represents zero aggregate independently from empty', () => {
    const result: NormalizedConcernResult<{ amount: number }, { netCashFlow: number }> = { records: [{ amount: 100 }, { amount: -100 }], summary: { netCashFlow: 0 }, totalRows: 2, filterOptions: {}, invariantCounters: { eventCount: 2 } };
    const response: EndOfDayReportResponse<{ amount: number }, { netCashFlow: number }> = { metadata: endOfDayReportMetadataSchema.parse(metadata), hasData: result.totalRows > 0, summary: result.summary, rows: result.records, pagination: { page: 1, pageSize: 50, totalRows: 2, totalPages: 1 }, filterOptions: result.filterOptions };
    expect(response.hasData).toBe(true);
    expect(response.summary.netCashFlow).toBe(0);
    expect(JSON.parse(JSON.stringify(response)).metadata.asOf).toBe('2026-10-03T11:00:00.000Z');
  });
});
