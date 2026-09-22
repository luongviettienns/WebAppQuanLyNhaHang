import { z } from 'zod';

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const inventoryWasteLineInputSchema = z.object({
  ingredientId: z.number().int().positive(),
  quantity: z.number().finite().positive()
});

const inventoryWasteLineArray = z.array(inventoryWasteLineInputSchema).superRefine((lines, context) => {
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

export const createInventoryWasteSchema = z.object({
  note: nullableText(1000),
  lines: inventoryWasteLineArray.default([])
});

export const updateInventoryWasteSchema = z.object({
  note: nullableText(1000),
  lines: inventoryWasteLineArray.optional()
}).refine(value => Object.keys(value).length > 0, 'Cần cung cấp ít nhất một trường');

export const inventoryWasteListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  statuses: z.preprocess(value => {
    if (value === undefined) return undefined;
    const values = Array.isArray(value) ? value : String(value).split(',');
    return values.flatMap(item => String(item).split(',')).map(item => item.trim()).filter(Boolean);
  }, z.array(z.enum(['DRAFT', 'COMPLETED', 'CANCELLED'])).min(1).optional()),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().trim().min(1).optional()
});

export const inventoryWasteImportPreviewSchema = z.object({
  fileBase64: z.string().min(1, 'Dữ liệu file Excel không được để trống'),
  fileName: z.string().trim().min(1, 'Tên file không được để trống')
});

export type InventoryWasteLineInput = z.infer<typeof inventoryWasteLineInputSchema>;
export type CreateInventoryWasteInput = z.infer<typeof createInventoryWasteSchema>;
export type UpdateInventoryWasteInput = z.infer<typeof updateInventoryWasteSchema>;
export type InventoryWasteListQuery = z.infer<typeof inventoryWasteListQuerySchema>;
export type InventoryWasteImportPreviewInput = z.infer<typeof inventoryWasteImportPreviewSchema>;
