import { z } from 'zod';

export const createIngredientSchema = z.object({
  sku: z.string().min(2, 'Mã nguyên liệu phải có ít nhất 2 ký tự').trim(),
  name: z.string().min(2, 'Tên nguyên liệu phải có ít nhất 2 ký tự').trim(),
  unit: z.string().min(1, 'Đơn vị tính không được để trống').trim(),
  currentStock: z.number().optional().default(0),
  minThreshold: z.number().min(0, 'Ngưỡng cảnh báo không được nhỏ hơn 0').optional().default(0),
  costPerUnit: z.number().int().min(0, 'Đơn giá vốn không được nhỏ hơn 0').optional().default(0)
});

export const updateIngredientSchema = z.object({
  name: z.string().min(2, 'Tên nguyên liệu phải có ít nhất 2 ký tự').trim().optional(),
  unit: z.string().min(1, 'Đơn vị tính không được để trống').trim().optional(),
  minThreshold: z.number().min(0, 'Ngưỡng cảnh báo không được nhỏ hơn 0').optional(),
  costPerUnit: z.number().int().min(0, 'Đơn giá vốn không được nhỏ hơn 0').optional(),
  isActive: z.boolean().optional()
});

export const stockInSchema = z.object({
  ingredientId: z.number().int().positive('ID nguyên liệu không hợp lệ'),
  quantity: z.number().positive('Số lượng nhập phải lớn hơn 0'),
  costPerUnit: z.number().int().min(0, 'Đơn giá nhập không được âm'),
  note: z.string().optional()
});

export const updateRecipeItemSchema = z.object({
  ingredientId: z.number().int().positive('ID nguyên liệu không hợp lệ'),
  quantityRequired: z.number().positive('Định lượng phải lớn hơn 0')
});

export const updateRecipeSchema = z.object({
  ingredients: z.array(updateRecipeItemSchema)
});

export const excelPreviewSchema = z.object({
  fileBase64: z.string().min(1, 'Dữ liệu file Excel không được để trống'),
  fileName: z.string().min(1, 'Tên file không được để trống')
});

export const excelCommitItemSchema = z.object({
  sku: z.string().min(1, 'Mã nguyên liệu không được để trống').trim(),
  quantity: z.number().positive('Số lượng phải lớn hơn 0'),
  costPerUnit: z.number().int().min(0, 'Đơn giá không được âm'),
  note: z.string().optional()
});

export const excelCommitSchema = z.object({
  items: z.array(excelCommitItemSchema).min(1, 'Danh sách nhập kho không được để trống'),
  sourceFileName: z.string().default('import.xlsx')
});

export const inventoryCatalogQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  managementGroup: z.enum(['MATERIAL', 'SELLABLE', 'TOOL']).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  menuType: z.enum(['FOOD', 'DRINK', 'SERVICE', 'OTHER']).optional(),
  stockStatus: z.enum(['ALL', 'NORMAL', 'LOW', 'NEGATIVE', 'NOT_TRACKED']).default('ALL'),
  position: z.string().trim().min(1).optional(),
  isActive: z.enum(['true', 'false', 'all']).default('true'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['sku', 'name', 'costPrice', 'stockQuantity', 'updatedAt']).default('sku'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
});

export type CreateIngredientDto = z.input<typeof createIngredientSchema>;
export type UpdateIngredientDto = z.infer<typeof updateIngredientSchema>;
export type StockInDto = z.infer<typeof stockInSchema>;
export type UpdateRecipeDto = z.infer<typeof updateRecipeSchema>;
export type ExcelCommitDto = z.infer<typeof excelCommitSchema>;
export const kitchenWasteSchema = z.object({
  type: z.enum(['MENU_ITEM', 'INGREDIENT'], {
    required_error: 'Loại hao hụt là bắt buộc (MENU_ITEM | INGREDIENT)'
  }),
  menuItemId: z.number().int().positive().optional(),
  ingredientId: z.number().int().positive().optional(),
  quantity: z.number().positive('Số lượng hao hụt phải lớn hơn 0'),
  reason: z.string().min(2, 'Lý do hao hụt phải có ít nhất 2 ký tự').trim(),
  note: z.string().optional()
}).refine(
  (data) => (data.type === 'MENU_ITEM' ? !!data.menuItemId : !!data.ingredientId),
  {
    message: 'Phải chỉ định menuItemId khi type=MENU_ITEM hoặc ingredientId khi type=INGREDIENT',
    path: ['type']
  }
);

export type KitchenWasteDto = z.infer<typeof kitchenWasteSchema>;

export type InventoryCatalogFilter = {
  search?: string;
  managementGroup?: 'MATERIAL' | 'SELLABLE' | 'TOOL';
  categoryId?: number;
  menuType?: 'FOOD' | 'DRINK' | 'SERVICE' | 'OTHER';
  stockStatus?: 'ALL' | 'NORMAL' | 'LOW' | 'NEGATIVE' | 'NOT_TRACKED';
  position?: string;
  isActive?: 'true' | 'false' | 'all';
  page: number;
  pageSize: number;
  sortBy: 'sku' | 'name' | 'costPrice' | 'stockQuantity' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
};
export type ParsedInventoryCatalogQuery = z.infer<typeof inventoryCatalogQuerySchema>;
