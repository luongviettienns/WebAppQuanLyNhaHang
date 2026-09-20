import { z } from 'zod';

export const priceListIdParamSchema = z.object({
  priceListId: z.coerce.number().int().positive()
});

export const menuItemPriceParamsSchema = priceListIdParamSchema.extend({
  menuItemId: z.coerce.number().int().positive()
});

export const updateGeneralPriceSchema = z.object({
  salePrice: z.number().int('salePrice phải là số nguyên VND').positive('salePrice phải lớn hơn 0'),
  expectedVersion: z.number().int().positive('expectedVersion không hợp lệ')
});

export type UpdateGeneralPriceInput = z.infer<typeof updateGeneralPriceSchema>;

const roundingSchema = z.union([z.literal(100), z.literal(1000), z.literal(10000)]).optional();

export const bulkPriceOperationSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('fixed'),
    value: z.number().int().positive(),
    rounding: roundingSchema
  }),
  z.object({
    mode: z.literal('amount'),
    value: z.number().int(),
    rounding: roundingSchema
  }),
  z.object({
    mode: z.literal('percent'),
    value: z.number().min(-99.99).max(10000),
    rounding: roundingSchema
  })
]);

export const bulkUpdateGeneralPricesSchema = z.object({
  menuItemIds: z.array(z.number().int().positive()).min(1).max(200),
  operation: bulkPriceOperationSchema
});

export const priceImportFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileBase64: z.string().min(1)
});

export type BulkPriceOperation = z.infer<typeof bulkPriceOperationSchema>;
export type BulkUpdateGeneralPricesInput = z.infer<typeof bulkUpdateGeneralPricesSchema>;
