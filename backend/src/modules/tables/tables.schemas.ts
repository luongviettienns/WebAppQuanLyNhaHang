import { z } from 'zod';

export const updateTableStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'DIRTY', 'NEED_CLEANING'], {
    required_error: 'Trạng thái bàn ăn là bắt buộc',
    invalid_type_error: 'Trạng thái bàn ăn phải là AVAILABLE hoặc DIRTY'
  })
});

export type UpdateTableStatusInput = z.infer<typeof updateTableStatusSchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(value => value === '' ? null : value);
const profileFields = {
  areaId: z.number().int().positive().nullable().optional(),
  seatCount: z.number().int().min(1).max(100).optional(),
  displayOrder: z.number().int().min(0).max(100000).optional(),
  note: optionalText(500)
};
export const createTableSchema = z.object({
  ...profileFields,
  displayName: z.string().trim().min(2, 'Tên phòng/bàn phải có ít nhất 2 ký tự').max(100),
  tableNumber: z.number().int().positive().max(100000).optional()
});
export const updateTableSchema = z.object({
  ...profileFields,
  displayName: z.string().trim().min(2).max(100).optional(),
  isActive: z.boolean().optional()
}).refine(value => Object.values(value).some(field => field !== undefined), 'Cần cung cấp ít nhất một trường để cập nhật');
export const tableAreaSchema = z.object({ name: z.string().trim().min(2).max(100), displayOrder: z.number().int().min(0).max(100000).optional(), isActive: z.boolean().optional() });
export const tableManageQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  areaId: z.coerce.number().int().positive().optional(),
  isActive: z.enum(['true', 'false', 'all']).default('true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});
export const tableImportFileSchema = z.object({
  fileName: z.string().trim().regex(/\.(xlsx|csv)$/i, 'Chỉ hỗ trợ file XLSX hoặc CSV'),
  fileBase64: z.string().min(1).max(7_000_000)
});
export const tableImportRowsSchema = z.object({ rows: z.array(createTableSchema).min(1).max(500) });
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type TableManageQuery = z.infer<typeof tableManageQuerySchema>;
