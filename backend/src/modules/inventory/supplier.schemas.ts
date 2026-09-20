import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const createSupplierSchema = z.object({
  code: z.string().trim().min(2, 'Mã nhà cung cấp phải có ít nhất 2 ký tự').max(32).regex(/^[A-Za-z0-9_-]+$/, 'Mã nhà cung cấp chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới').transform(value => value.toUpperCase()).optional(),
  name: z.string().trim().min(2, 'Tên nhà cung cấp phải có ít nhất 2 ký tự').max(120),
  phone: optionalText(30),
  email: z.string().trim().email('Email nhà cung cấp không hợp lệ').max(120).optional(),
  address: optionalText(255),
  taxCode: optionalText(32),
  note: optionalText(1000)
});

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Tên nhà cung cấp phải có ít nhất 2 ký tự').max(120).optional(),
  phone: optionalText(30),
  email: z.string().trim().email('Email nhà cung cấp không hợp lệ').max(120).optional(),
  address: optionalText(255),
  taxCode: optionalText(32),
  note: optionalText(1000),
  isActive: z.boolean().optional()
}).refine(value => Object.keys(value).length > 0, 'Cần cung cấp ít nhất một trường để cập nhật');

export const supplierListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  isActive: z.enum(['true', 'false', 'all']).default('true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierDto = z.infer<typeof updateSupplierSchema>;
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
