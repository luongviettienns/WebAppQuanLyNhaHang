import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD').refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ');

const csvEnum = <T extends [string, ...string[]]>(values: T) =>
  z.string().transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean)).pipe(z.array(z.enum(values)).min(1));

const orderInvoiceQueryBaseSchema = z.object({
  search: z.string().trim().max(120).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  statuses: csvEnum(['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']).optional(),
  paymentStatuses: csvEnum(['UNPAID', 'PAID', 'VOIDED']).optional(),
  orderTypes: csvEnum(['DINE_IN', 'TAKE_AWAY']).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

export const orderInvoiceQuerySchema = orderInvoiceQueryBaseSchema.refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to']
});

export const orderInvoiceExportSchema = orderInvoiceQueryBaseSchema.extend({
  format: z.enum(['csv', 'xlsx']).default('csv')
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to']
});

export const orderInvoiceIdSchema = z.object({
  id: z.coerce.number().int().positive()
});

export type OrderInvoiceQuery = z.infer<typeof orderInvoiceQuerySchema>;
export type OrderInvoiceExportQuery = z.infer<typeof orderInvoiceExportSchema>;
