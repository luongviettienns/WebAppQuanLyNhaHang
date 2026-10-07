import { z } from 'zod';
import { ApiError } from '../../../lib/api-error';
import { BUSINESS_TIMEZONE, currentBusinessDate, isValidBusinessDate, resolveBusinessWindow } from './end-of-day.time';
import type { EndOfDayConcern, EndOfDayFilter, EndOfDayReportQuery, EndOfDaySortBy } from './end-of-day.types';

export const END_OF_DAY_CONCERNS = ['SALES', 'CASHFLOW', 'GOODS', 'CANCELLED_ITEMS', 'SUMMARY'] as const;
export const SUPPORTED_FILTERS_BY_CONCERN = {
  SALES: ['customerId', 'receiverEmployeeId', 'creatorUserId', 'paymentMethods', 'delivery', 'areaId', 'tableId', 'search'],
  CASHFLOW: ['customerId', 'creatorUserId', 'paymentMethods', 'recordTypes', 'search'],
  GOODS: ['creatorUserId', 'recordTypes', 'search'],
  CANCELLED_ITEMS: ['receiverEmployeeId', 'creatorUserId', 'delivery', 'areaId', 'tableId', 'cancelReason', 'search'],
  SUMMARY: []
} as const satisfies Record<EndOfDayConcern, readonly EndOfDayFilter[]>;

/** Classifies domain money events even when no matching voucher exists. */
export const CASHFLOW_RECORD_TYPES = ['MANUAL', 'RESERVATION_DEPOSIT', 'RESERVATION_REFUND', 'ORDER_PAYMENT', 'SALES_RETURN_REFUND', 'PURCHASE_RECEIPT_PAYMENT', 'SUPPLIER_PAYMENT', 'PURCHASE_RETURN_REFUND', 'PAYROLL_PAYMENT', 'REVERSAL'] as const;
/** INVENTORY_EVENT selects all ledger kinds; individual transaction types narrow that set. */
export const GOODS_RECORD_TYPES = ['SALE_ITEM', 'INVENTORY_EVENT', 'STOCK_IN', 'PURCHASE_RETURN', 'AUTO_DEDUCT', 'KITCHEN_WASTE', 'MANUAL_ADJUST', 'VOID_RESTORE', 'SALES_RETURN'] as const;
export const RECORD_TYPES_BY_CONCERN = {
  SALES: [], CASHFLOW: CASHFLOW_RECORD_TYPES, GOODS: GOODS_RECORD_TYPES, CANCELLED_ITEMS: [], SUMMARY: []
} as const;

/** occurredAt is a DTO field; each adapter still selects by its domain timestamp. */
export const SORT_FIELDS_BY_CONCERN = {
  SALES: ['occurredAt', 'documentCode', 'amount'],
  CASHFLOW: ['occurredAt', 'amount', 'sourceType'],
  GOODS: ['occurredAt', 'recordType', 'quantity', 'amount'],
  CANCELLED_ITEMS: ['occurredAt', 'menuItemName', 'quantity', 'lineAmount'],
  SUMMARY: []
} as const satisfies Record<EndOfDayConcern, readonly EndOfDaySortBy[]>;

const businessDate = z.string().refine(isValidBusinessDate, 'Ngày phải là ngày hợp lệ theo YYYY-MM-DD');
const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const paymentMethod = z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET']);
const recordType = z.enum([...CASHFLOW_RECORD_TYPES, ...GOODS_RECORD_TYPES]);
const sortBy = z.enum(['occurredAt', 'documentCode', 'amount', 'sourceType', 'recordType', 'quantity', 'menuItemName', 'lineAmount']);

// Coerce only digit strings, avoiding booleans, arrays, empty text and exponent syntax.
const positiveInteger = z.preprocess(value => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value, z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const id = positiveInteger.nullable().optional();
function listOf<S extends z.ZodTypeAny>(item: S, max: number) {
  return z.preprocess(value => typeof value === 'string' ? value.split(',').map(part => part.trim()) : value, z.array(item).min(1).max(max)).nullable().optional();
}
const filterFields = {
  customerId: id, receiverEmployeeId: id, creatorUserId: id,
  paymentMethods: listOf(paymentMethod, 4),
  delivery: z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean()).nullable().optional(),
  areaId: id, tableId: id,
  cancelReason: z.string().trim().min(1).max(500).nullable().optional(),
  recordTypes: listOf(recordType, 19),
  search: z.string().trim().max(160).nullable().optional()
};

export const endOfDayQuerySchema = z.object({
  date: businessDate.default(() => currentBusinessDate()),
  fromTime: clockTime.optional(), toTime: clockTime.optional(),
  concern: z.enum(END_OF_DAY_CONCERNS).default('SALES'),
  view: z.enum(['VERTICAL', 'HORIZONTAL']).default('VERTICAL'),
  ...filterFields,
  page: positiveInteger.default(1),
  pageSize: positiveInteger.refine(value => value <= 200, 'Tối đa 200 dòng mỗi trang').default(50),
  sortBy: sortBy.optional(), sortOrder: z.enum(['asc', 'desc']).optional()
}).strict().superRefine((query, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if ((query.fromTime === undefined) !== (query.toTime === undefined)) issue('fromTime', 'Phải chọn cả giờ bắt đầu và giờ kết thúc');
  if (query.fromTime !== undefined && query.toTime !== undefined && query.fromTime >= query.toTime) issue('toTime', 'Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày');
  const supported: readonly string[] = SUPPORTED_FILTERS_BY_CONCERN[query.concern];
  for (const filter of Object.keys(filterFields)) {
    if (Object.prototype.hasOwnProperty.call(query, filter) && !supported.includes(filter)) issue(filter, `Bộ lọc ${filter} không được hỗ trợ cho ${query.concern}`);
  }
  const recordTypes: readonly string[] = RECORD_TYPES_BY_CONCERN[query.concern];
  if (query.recordTypes?.some(type => !recordTypes.includes(type))) issue('recordTypes', 'Loại bản ghi không được hỗ trợ cho mối quan tâm này');
  const fields: readonly string[] = SORT_FIELDS_BY_CONCERN[query.concern];
  if (query.sortBy !== undefined && !fields.includes(query.sortBy)) issue('sortBy', 'Trường sắp xếp không được hỗ trợ');
  if (query.concern === 'SUMMARY') {
    for (const field of ['sortBy', 'sortOrder']) {
      if (Object.prototype.hasOwnProperty.call(query, field)) issue(field, 'Tổng hợp không hỗ trợ sắp xếp chi tiết');
    }
  }
});

export function parseEndOfDayQuery(input: unknown): EndOfDayReportQuery {
  const result = endOfDayQuerySchema.safeParse(input);
  if (!result.success) throw ApiError.badRequest('Bộ lọc báo cáo cuối ngày không hợp lệ', { issues: result.error.issues });
  const query = result.data;
  return {
    ...query,
    ...resolveBusinessWindow(query.date, query.fromTime, query.toTime),
    ...(query.concern === 'SUMMARY' ? {} : { sortBy: query.sortBy ?? 'occurredAt', sortOrder: query.sortOrder ?? 'desc' }),
    ...(query.paymentMethods ? { paymentMethods: [...new Set(query.paymentMethods)] } : {}),
    ...(query.recordTypes ? { recordTypes: [...new Set(query.recordTypes)] } : {})
  };
}

const isoTimestamp = z.string().datetime();
export const endOfDayReportMetadataSchema = z.object({
  date: businessDate, from: isoTimestamp, to: isoTimestamp,
  timezone: z.literal(BUSINESS_TIMEZONE),
  asOf: isoTimestamp, generatedAt: isoTimestamp,
  concern: z.enum(END_OF_DAY_CONCERNS), view: z.enum(['VERTICAL', 'HORIZONTAL']),
  operatingScope: z.object({ code: z.literal('MAIN'), name: z.literal('Nhà hàng chính'), locked: z.literal(true) }).strict()
}).strict();
