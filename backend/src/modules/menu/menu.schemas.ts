import { z } from 'zod';

export const updateSoldOutSchema = z.object({
  isAvailable: z.boolean({
    required_error: 'isAvailable là bắt buộc (true: còn hàng, false: hết hàng / 86d)'
  })
});

export type UpdateSoldOutInput = z.infer<typeof updateSoldOutSchema>;
