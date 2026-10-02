import { z } from 'zod';

export const createPublicReservationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(8).max(30),
  scheduledAt: z.coerce.date(),
  partySize: z.number().int().min(1).max(100),
  note: z.string().trim().max(1000).optional()
});

export type CreatePublicReservationInput = z.infer<typeof createPublicReservationSchema>;

export const confirmDepositSchema = z.object({
  amount: z.number().int().positive(),
  paymentMethod: z.enum(['BANK_TRANSFER']),
  financialAccountId: z.number().int().positive().nullable().optional(),
  externalReference: z.string().trim().min(1).max(120)
});

export const rejectDepositSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export const refundDepositSchema = z.object({
  amount: z.number().int().positive(),
  financialAccountId: z.number().int().positive().nullable().optional(),
  externalReference: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(3).max(500)
});

export const rescheduleReservationSchema = z.object({
  newScheduledAt: z.coerce.date(),
  reason: z.string().trim().min(3).max(500)
});

export const markNoShowSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export const publicCancellationSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export const staffCancellationSchema = publicCancellationSchema;

export const checkInReservationSchema = z.object({
  tableId: z.number().int().positive()
});

export const reservationListQuerySchema = z.object({
  status: z.enum(['PENDING_DEPOSIT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  depositStatus: z.enum(['UNPAID', 'WAITING_CONFIRMATION', 'PAID', 'REFUND_PENDING', 'REFUNDED', 'FORFEITED', 'APPLIED_TO_BILL']).optional(),
  search: z.string().trim().max(160).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30)
});

export type ConfirmDepositInput = z.infer<typeof confirmDepositSchema>;
export type RejectDepositInput = z.infer<typeof rejectDepositSchema>;
export type RefundDepositInput = z.infer<typeof refundDepositSchema>;
export type RescheduleReservationInput = z.infer<typeof rescheduleReservationSchema>;
export type MarkNoShowInput = z.infer<typeof markNoShowSchema>;
export type PublicCancellationInput = z.infer<typeof publicCancellationSchema>;
export type StaffCancellationInput = z.infer<typeof staffCancellationSchema>;
export type CheckInReservationInput = z.infer<typeof checkInReservationSchema>;
export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>;
