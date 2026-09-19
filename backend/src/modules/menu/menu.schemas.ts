import { z } from 'zod';

export const updateSoldOutSchema = z.object({
  isAvailable: z.boolean({
    required_error: 'isAvailable là bắt buộc (true: còn hàng, false: hết hàng / 86d)'
  })
});

export type UpdateSoldOutInput = z.infer<typeof updateSoldOutSchema>;

export const modifierOptionUpsertSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1, 'Tên tùy chọn không được để trống'),
  priceDelta: z.number().int('Phụ phí phải là số nguyên').min(0, 'Phụ phí không được âm').default(0),
  isAvailable: z.boolean().optional().default(true)
});

export const modifierGroupUpsertSchema = z
  .object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(1, 'Tên nhóm tùy chọn không được để trống'),
    isRequired: z.boolean().optional().default(false),
    minSelect: z.number().int('minSelect phải là số nguyên').min(0, 'minSelect không được âm').default(0),
    maxSelect: z.number().int('maxSelect phải là số nguyên').min(1, 'maxSelect phải ít nhất là 1').default(1),
    options: z.array(modifierOptionUpsertSchema).default([])
  })
  .superRefine((group, ctx) => {
    if (group.minSelect > group.maxSelect) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'minSelect không được lớn hơn maxSelect',
        path: ['minSelect']
      });
    }
    if (group.options && group.options.length < group.maxSelect) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Số lượng options phải lớn hơn hoặc bằng maxSelect',
        path: ['options']
      });
    }
  });

const menuTypeSchema = z.enum(['FOOD', 'DRINK', 'SERVICE', 'OTHER']);
const menuItemTypeSchema = z.enum(['REGULAR', 'TOPPING', 'COMBO', 'SERVICE']);
const stockQuantitySchema = z.number().int('stockQuantity phải là số nguyên').min(0, 'stockQuantity không được âm');

export const createMenuItemSchema = z.object({
  categoryId: z.number().int().positive('categoryId phải là số nguyên dương'),
  name: z.string().trim().min(1, 'Tên món ăn không được để trống'),
  description: z.string().trim().optional().nullable(),
  basePrice: z.number().int('basePrice phải là số nguyên VND').positive('basePrice phải lớn hơn 0'),
  imageUrl: z.string().trim().optional().nullable(),
  isAvailable: z.boolean().optional().default(true),
  displayOrder: z.number().int().optional().default(0),
  menuType: menuTypeSchema.optional().default('FOOD'),
  itemType: menuItemTypeSchema.optional().default('REGULAR'),
  trackStock: z.boolean().optional().default(false),
  stockQuantity: stockQuantitySchema.optional().default(0),
  position: z.string().trim().optional().nullable(),
  modifierGroups: z.array(modifierGroupUpsertSchema).optional().default([])
});

export const updateMenuItemSchema = z.object({
  categoryId: z.number().int().positive('categoryId phải là số nguyên dương').optional(),
  name: z.string().trim().min(1, 'Tên món ăn không được để trống').optional(),
  description: z.string().trim().optional().nullable(),
  basePrice: z.number().int('basePrice phải là số nguyên VND').positive('basePrice phải lớn hơn 0').optional(),
  imageUrl: z.string().trim().optional().nullable(),
  isAvailable: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  menuType: menuTypeSchema.optional(),
  itemType: menuItemTypeSchema.optional(),
  trackStock: z.boolean().optional(),
  stockQuantity: stockQuantitySchema.optional(),
  position: z.string().trim().optional().nullable(),
  modifierGroups: z.array(modifierGroupUpsertSchema).optional()
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

const categoryNameSchema = z.string().trim().min(1, 'Tên danh mục không được để trống').max(100, 'Tên danh mục không được vượt quá 100 ký tự');

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  displayOrder: z.number().int('displayOrder phải là số nguyên').min(0, 'displayOrder không được âm').optional().default(0)
});

export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    displayOrder: z.number().int('displayOrder phải là số nguyên').min(0, 'displayOrder không được âm').optional()
  })
  .refine(input => input.name !== undefined || input.displayOrder !== undefined, {
    message: 'Phải cung cấp ít nhất một trường cần cập nhật'
  });

export const deleteCategorySchema = z.object({
  moveToCategoryId: z.number().int().positive().optional()
});

export const reorderCategoriesSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Danh sách category không được rỗng')
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
