import { z } from 'zod';

export const updateTableStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'DIRTY', 'NEED_CLEANING'], {
    required_error: 'Trạng thái bàn ăn là bắt buộc',
    invalid_type_error: 'Trạng thái bàn ăn phải là AVAILABLE hoặc DIRTY'
  })
});

export type UpdateTableStatusInput = z.infer<typeof updateTableStatusSchema>;
