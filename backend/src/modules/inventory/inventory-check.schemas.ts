import { z } from 'zod';

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const inventoryCheckLineInputSchema = z.object({
  ingredientId: z.number().int().positive(),
  actualQuantity: z.number().finite().nonnegative().nullable().optional()
});

const inventoryCheckLineArray = z.array(inventoryCheckLineInputSchema).superRefine((lines, context) => {
  const ingredientIds = new Set<number>();
  lines.forEach((line, index) => {
    if (ingredientIds.has(line.ingredientId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'ingredientId'],
        message: 'Một nguyên liệu chỉ được xuất hiện một lần'
      });
    }
    ingredientIds.add(line.ingredientId);
  });
});

export const createInventoryCheckSchema = z.object({
  note: nullableText(1000),
  lines: inventoryCheckLineArray.default([])
});

export const updateInventoryCheckSchema = z.object({
  note: nullableText(1000),
  lines: inventoryCheckLineArray.optional()
}).refine(value => Object.keys(value).length > 0, 'Cần cung cấp ít nhất một trường');

export const inventoryCheckListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  statuses: z.preprocess(value => {
    if (value === undefined) return undefined;
    const values = Array.isArray(value) ? value : String(value).split(',');
    return values.flatMap(item => String(item).split(',')).map(item => item.trim()).filter(Boolean);
  }, z.array(z.enum(['DRAFT', 'BALANCED', 'CANCELLED'])).min(1).optional()),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().min(1).optional()
});

export const inventoryCheckImportPreviewSchema = z.object({
  fileBase64: z.string().min(1, 'Dữ liệu file Excel không được để trống'),
  fileName: z.string().trim().min(1, 'Tên file không được để trống')
});

export type InventoryCheckLineInput = z.infer<typeof inventoryCheckLineInputSchema>;
export type CreateInventoryCheckInput = z.infer<typeof createInventoryCheckSchema>;
export type UpdateInventoryCheckInput = z.infer<typeof updateInventoryCheckSchema>;
export type InventoryCheckListQuery = z.infer<typeof inventoryCheckListQuerySchema>;
export type InventoryCheckImportPreviewInput = z.infer<typeof inventoryCheckImportPreviewSchema>;
