import { z } from 'zod';

export const selectedModifierSchema = z.object({
  modifierGroupId: z.number(),
  groupName: z.string(),
  optionId: z.number(),
  optionName: z.string(),
  priceDelta: z.number()
});

export const orderItemCreateSchema = z.object({
  menuItemId: z.number({ required_error: 'menuItemId là bắt buộc' }),
  quantity: z.number().int().min(1, 'Số lượng tối thiểu là 1'),
  selectedModifiers: z.array(selectedModifierSchema).optional().default([]),
  notes: z.string().max(120).optional()
});

export const createOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKE_AWAY']).default('DINE_IN'),
  tableId: z.number().optional(),
  idempotencyKey: z.string().optional(),
  notes: z.string().max(200).optional(),
  items: z.array(orderItemCreateSchema).min(1, 'Đơn hàng phải chứa ít nhất 1 món')
});

export const payOrderSchema = z.object({
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD'], {
    required_error: 'Phương thức thanh toán là bắt buộc (CASH | BANK_TRANSFER | CREDIT_CARD)'
  })
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type PayOrderInput = z.infer<typeof payOrderSchema>;
