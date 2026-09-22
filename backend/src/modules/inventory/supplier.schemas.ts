import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value === '' ? null : value);
const email = z.union([z.string().trim().email('Email nhà cung cấp không hợp lệ').max(120), z.literal(''), z.null()]).optional().transform(value => value === '' ? null : value);
const profileFields = {
  identityNumber: optionalText(20), province: optionalText(100), district: optionalText(100), ward: optionalText(100), companyName: optionalText(200),
  groupId: z.number().int().positive().nullable().optional()
};

export const createSupplierSchema = z.object({
  ...profileFields,
  code: z.string().trim().min(2, 'Mã nhà cung cấp phải có ít nhất 2 ký tự').max(32).regex(/^[A-Za-z0-9_-]+$/, 'Mã nhà cung cấp chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới').transform(value => value.toUpperCase()).optional(),
  name: z.string().trim().min(2, 'Tên nhà cung cấp phải có ít nhất 2 ký tự').max(120),
  phone: optionalText(30),
  email,
  address: optionalText(255),
  taxCode: optionalText(32),
  note: optionalText(1000)
});

export const updateSupplierSchema = z.object({
  ...profileFields,
  name: z.string().trim().min(2, 'Tên nhà cung cấp phải có ít nhất 2 ký tự').max(120).optional(),
  phone: optionalText(30),
  email,
  address: optionalText(255),
  taxCode: optionalText(32),
  note: optionalText(1000),
  isActive: z.boolean().optional()
}).refine(value => Object.values(value).some(field => field !== undefined), 'Cần cung cấp ít nhất một trường để cập nhật');

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ');
const money = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional();

export const supplierListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  isActive: z.enum(['true', 'false', 'all']).default('true'),
  groupId: z.coerce.number().int().min(0).optional(),
  from: dateOnly.optional(), to: dateOnly.optional(),
  minPurchase: money, maxPurchase: money, minDebt: money, maxDebt: money,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  ids: z.string().regex(/^\d+(,\d+)*$/).transform(value => [...new Set(value.split(',').map(Number))]).refine(ids => ids.length <= 500 && ids.every(id => Number.isSafeInteger(id) && id > 0)).optional()
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: 'custom', message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to'] });
  for (const [min, max] of [['minPurchase', 'maxPurchase'], ['minDebt', 'maxDebt']] as const) {
    if (value[min] !== undefined && value[max] !== undefined && value[min]! > value[max]!) context.addIssue({ code: 'custom', message: 'Giá trị từ phải nhỏ hơn hoặc bằng giá trị tới', path: [max] });
  }
});
export const supplierGroupSchema = z.object({ name: z.string().trim().min(2).max(100) });
export const supplierImportFileSchema = z.object({ fileName: z.string().max(255).regex(/\.(xlsx|csv)$/i), fileBase64: z.string().min(1).max(7 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/) });
export const supplierImportRowsSchema = z.object({ rows: z.array(createSupplierSchema).min(1).max(500) });

export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierDto = z.infer<typeof updateSupplierSchema>;
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
