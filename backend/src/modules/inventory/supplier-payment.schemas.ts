import { z } from 'zod';
import { ApiError } from '../../lib/api-error';

const inputSchema = z.object({
  amount: z.number().int().positive().max(2_000_000_000),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET']),
  financialAccountId: z.number().int().positive().nullable().optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
  externalReference: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(500).optional()
}).strict();
const reversalSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

const keySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export type SupplierPaymentInput = z.infer<typeof inputSchema>;
export type SupplierPaymentReversalInput = z.infer<typeof reversalSchema>;

export function parseSupplierPaymentInput(value: unknown): SupplierPaymentInput {
  const result = inputSchema.safeParse(value);
  if (!result.success) throw ApiError.badRequest('Thông tin thanh toán nhà cung cấp không hợp lệ');
  return result.data;
}

export function parseSupplierPaymentIdempotencyKey(value: string | undefined): string {
  const result = keySchema.safeParse(value);
  if (!result.success) throw ApiError.badRequest('Idempotency-Key thanh toán nhà cung cấp không hợp lệ');
  return result.data;
}

export function parseSupplierPaymentReversalInput(value: unknown): SupplierPaymentReversalInput {
  const result = reversalSchema.safeParse(value);
  if (!result.success) throw ApiError.badRequest('Lý do đảo thanh toán nhà cung cấp không hợp lệ');
  return result.data;
}
