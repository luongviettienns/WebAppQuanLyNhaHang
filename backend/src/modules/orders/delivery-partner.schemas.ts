import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value === '' ? null : value);
const optionalEmail = z.union([z.string().trim().email('Email đối tác không hợp lệ').max(120), z.literal(''), z.null()]).optional().transform(value => value === '' ? null : value);

const profileFields = {
  phone: optionalText(30), email: optionalEmail, address: optionalText(255), province: optionalText(100), district: optionalText(100), ward: optionalText(100), note: optionalText(1000),
  groupId: z.number().int().positive().nullable().optional(), partnerType: z.enum(['INDIVIDUAL', 'COMPANY']).optional()
};

export const createDeliveryPartnerSchema = z.object({
  ...profileFields,
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/, 'Mã đối tác chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới').transform(value => value.toUpperCase()).optional(),
  name: z.string().trim().min(2, 'Tên đối tác phải có ít nhất 2 ký tự').max(120)
});

export const updateDeliveryPartnerSchema = z.object({
  ...profileFields,
  name: z.string().trim().min(2, 'Tên đối tác phải có ít nhất 2 ký tự').max(120).optional(),
  isActive: z.boolean().optional()
}).refine(value => Object.values(value).some(field => field !== undefined), 'Cần cung cấp ít nhất một trường để cập nhật');

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ');
const money = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional();

export const deliveryPartnerListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  isActive: z.enum(['true', 'false', 'all']).default('true'),
  groupId: z.coerce.number().int().min(0).optional(),
  from: dateOnly.optional(), to: dateOnly.optional(),
  minDeliveryFee: money, maxDeliveryFee: money, minDebt: money, maxDebt: money,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  ids: z.string().regex(/^\d+(,\d+)*$/).transform(value => [...new Set(value.split(',').map(Number))]).refine(ids => ids.length <= 500 && ids.every(id => Number.isSafeInteger(id) && id > 0)).optional()
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: 'custom', message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to'] });
  for (const [min, max] of [['minDeliveryFee', 'maxDeliveryFee'], ['minDebt', 'maxDebt']] as const) {
    if (value[min] !== undefined && value[max] !== undefined && value[min]! > value[max]!) context.addIssue({ code: 'custom', message: 'Giá trị từ phải nhỏ hơn hoặc bằng giá trị tới', path: [max] });
  }
});

export const deliveryPartnerGroupSchema = z.object({ name: z.string().trim().min(2).max(100) });
export const deliveryPartnerImportFileSchema = z.object({ fileName: z.string().max(255).regex(/\.(xlsx|csv)$/i), fileBase64: z.string().min(1).max(7 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/) });
export const deliveryPartnerImportRowsSchema = z.object({ rows: z.array(createDeliveryPartnerSchema).min(1).max(500) });
export type CreateDeliveryPartnerDto = z.infer<typeof createDeliveryPartnerSchema>;
export type UpdateDeliveryPartnerDto = z.infer<typeof updateDeliveryPartnerSchema>;
export type DeliveryPartnerListQuery = z.infer<typeof deliveryPartnerListQuerySchema>;
