import { z } from 'zod';

const MAX_VND_AMOUNT = 2147483647;
const vndAmount = (label: string) => z.number().int(`${label} phải là số nguyên VND`).min(0).max(MAX_VND_AMOUNT);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const dateValue = z.preprocess(value => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return value;
}, z.date());

export const purchaseReceiptLineInputSchema = z.object({
  ingredientId: z.number().int().positive(),
  quantity: z.number().finite().positive('Số lượng nhập phải lớn hơn 0'),
  unitCost: vndAmount('Đơn giá'),
  discountAmount: vndAmount('Giảm giá dòng').default(0),
  note: nullableText(1000)
});

const receiptLinesSchema = z.array(purchaseReceiptLineInputSchema).superRefine((lines, ctx) => {
  const ingredientIds = new Set<number>();
  lines.forEach((line, index) => {
    if (ingredientIds.has(line.ingredientId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'ingredientId'],
        message: 'Một nguyên liệu chỉ được xuất hiện một lần trên phiếu nhập'
      });
    }
    ingredientIds.add(line.ingredientId);
  });
});

export const createPurchaseReceiptSchema = z.object({
  supplierId: z.number().int().positive().nullable().default(null),
  receivedAt: dateValue.optional(),
  invoiceNumber: nullableText(120),
  invoiceDate: z.union([z.null(), dateValue]).optional(),
  discountAmount: vndAmount('Giảm giá phiếu').default(0),
  paidAmount: vndAmount('Số tiền đã trả').default(0),
  note: nullableText(1000),
  lines: receiptLinesSchema.default([])
});

export const updatePurchaseReceiptSchema = z.object({
  supplierId: z.number().int().positive().nullable().optional(),
  receivedAt: dateValue.optional(),
  invoiceNumber: nullableText(120),
  invoiceDate: z.union([z.null(), dateValue]).optional(),
  discountAmount: vndAmount('Giảm giá phiếu').optional(),
  paidAmount: vndAmount('Số tiền đã trả').optional(),
  note: nullableText(1000),
  lines: receiptLinesSchema.optional()
}).refine(value => Object.keys(value).length > 0, 'Cần cung cấp ít nhất một trường để cập nhật');

export const purchaseReceiptListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

export type PurchaseReceiptLineInput = z.infer<typeof purchaseReceiptLineInputSchema>;
export type CreatePurchaseReceiptInput = z.infer<typeof createPurchaseReceiptSchema>;
export type UpdatePurchaseReceiptInput = z.infer<typeof updatePurchaseReceiptSchema>;
export type PurchaseReceiptListQuery = z.infer<typeof purchaseReceiptListQuerySchema>;
