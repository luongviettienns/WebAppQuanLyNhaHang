import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const dateOnly = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải theo định dạng YYYY-MM-DD')
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Ngày không hợp lệ');

const optionalDate = dateOnly.nullable().optional();
const phone = z.string().trim().min(7).max(30).regex(/^[+\d\s().-]+$/).refine(value => value.replace(/\D/g, '').length >= 7);

export const employeeListQuerySchema = z.object({
  search: z.string().trim().max(160).optional(),
  status: z.enum(['WORKING', 'RESIGNED']).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  jobTitleId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export const employeeCompensationSchema = z.object({
  payBasis: z.enum(['MONTHLY', 'HOURLY', 'PER_SHIFT']),
  baseRate: z.number().int().min(0).max(2_000_000_000),
  effectiveFrom: dateOnly,
  note: optionalText(500)
});

const employeeProfileFields = {
  name: z.string().trim().min(2).max(160),
  phone,
  userId: z.number().int().positive().nullable().optional(),
  avatarUrl: optionalText(500),
  departmentId: z.number().int().positive().nullable().optional(),
  jobTitleId: z.number().int().positive().nullable().optional(),
  startDate: optionalDate,
  note: optionalText(500),
  nationalId: optionalText(32),
  birthDate: optionalDate,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  address: optionalText(255),
  province: optionalText(120),
  ward: optionalText(120),
  email: z.union([z.string().trim().email().max(160), z.literal(''), z.null()]).optional(),
  facebook: optionalText(255),
  bankName: optionalText(120),
  bankAccountNumber: optionalText(80),
  bankAccountName: optionalText(120)
};

export const employeeCreateSchema = z.object({
  ...employeeProfileFields,
  initialCompensation: employeeCompensationSchema.optional()
});

export const employeeUpdateSchema = z.object(employeeProfileFields).partial().refine(input => Object.keys(input).length > 0, 'Cần ít nhất một trường để cập nhật');

export const employeeStatusSchema = z.object({
  status: z.enum(['WORKING', 'RESIGNED']),
  endDate: dateOnly.nullable().optional()
});

export const departmentCreateSchema = z.object({ name: z.string().trim().min(2).max(120), isActive: z.boolean().optional() });
export const departmentUpdateSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional() })
  .refine(input => Object.keys(input).length > 0, 'Cần ít nhất một trường để cập nhật');
export const jobTitleCreateSchema = departmentCreateSchema;
export const jobTitleUpdateSchema = departmentUpdateSchema;

export const linkableUsersQuerySchema = z.object({ search: z.string().trim().max(160).optional() });
export const employeeIdSchema = z.coerce.number().int().positive();

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type EmployeeStatusInput = z.infer<typeof employeeStatusSchema>;
export type EmployeeCompensationInput = z.infer<typeof employeeCompensationSchema>;
export type DepartmentCreateInput = z.infer<typeof departmentCreateSchema>;
export type DepartmentUpdateInput = z.infer<typeof departmentUpdateSchema>;
export type JobTitleCreateInput = z.infer<typeof jobTitleCreateSchema>;
export type JobTitleUpdateInput = z.infer<typeof jobTitleUpdateSchema>;
export type LinkableUsersQuery = z.infer<typeof linkableUsersQuerySchema>;
