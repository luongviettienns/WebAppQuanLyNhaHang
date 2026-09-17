import { z } from 'zod';

export const getAuditLogsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  action: z.string().optional(),
  targetType: z.string().optional()
});

export type GetAuditLogsQuery = z.infer<typeof getAuditLogsSchema>;
