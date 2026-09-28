import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const customerGroupSchema = z.object({
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  description: optionalText(500),
  isActive: z.boolean().optional()
});

export const customerCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: optionalText(30),
  email: optionalText(160).pipe(z.string().email().nullable().optional()),
  type: z.enum(['INDIVIDUAL', 'COMPANY']).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  birthDate: z.coerce.date().nullable().optional(),
  province: optionalText(120),
  address: optionalText(255),
  groupId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional()
});

export const customerListQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  isActive: z.enum(['true', 'false', 'all']).optional(),
  groupId: z.coerce.number().int().min(0).optional(),
  type: z.enum(['INDIVIDUAL', 'COMPANY']).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  province: z.string().trim().max(120).optional(),
  birthDateFrom: z.coerce.date().optional(),
  birthDateTo: z.coerce.date().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  minSales: z.coerce.number().min(0).optional(),
  maxSales: z.coerce.number().min(0).optional(),
  minDebt: z.coerce.number().min(0).optional(),
  maxDebt: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type CustomerGroupInput = z.infer<typeof customerGroupSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
