import { z } from 'zod';
import { ApiError } from '../../lib/api-error';

const shiftInputSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N}_-]+$/u).transform(value => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440)
});

export type CreateWorkShiftInput = z.infer<typeof shiftInputSchema>;

export function parseCreateWorkShiftInput(value: unknown): CreateWorkShiftInput {
  const parsed = shiftInputSchema.safeParse(value);
  if (!parsed.success) {
    const timeIssue = parsed.error.issues.some(issue => issue.path.includes('startMinute') || issue.path.includes('endMinute'));
    if (timeIssue) {
      throw ApiError.badRequest('Giờ làm việc phải nằm trong cùng một ngày', {}, 'SCHEDULE_TIME_INVALID');
    }
    throw parsed.error;
  }
  if (parsed.data.startMinute >= parsed.data.endMinute) {
    throw ApiError.badRequest('Giờ kết thúc phải sau giờ bắt đầu trong cùng một ngày', {}, 'SCHEDULE_TIME_INVALID');
  }
  return parsed.data;
}
