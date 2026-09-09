import { z } from 'zod';

export const getDailyReportSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày phải là YYYY-MM-DD')
    .refine((val) => !isNaN(new Date(`${val}T00:00:00+07:00`).getTime()), {
      message: 'Ngày không hợp lệ'
    })
    .optional()
});

export type GetDailyReportQuery = z.infer<typeof getDailyReportSchema>;
