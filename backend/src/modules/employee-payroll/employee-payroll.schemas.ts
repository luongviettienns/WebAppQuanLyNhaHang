import { z } from 'zod';
import { ApiError } from '../../lib/api-error';
import { getPayrollMonthBounds } from './employee-payroll.calculation';

const positiveId = z.number().int().positive();
const reasonSchema = z.string().trim().min(3).max(500);
const monthSchema = z.string().refine(value => {
  try {
    getPayrollMonthBounds(value);
    return true;
  } catch {
    return false;
  }
}, 'Kỳ lương phải là một tháng hợp lệ theo YYYY-MM');

const payrollStatusSchema = z.enum(['DRAFT', 'CALCULATED', 'FINALIZED', 'CANCELLED']);
const listStatusSchema = z.preprocess(value => {
  if (typeof value === 'string') return value.split(',').map(item => item.trim()).filter(Boolean);
  return value;
}, z.array(payrollStatusSchema).max(4)).optional();

const listQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().default(1),
  search: z.string().trim().max(160).optional(),
  frequency: z.enum(['MONTHLY']).optional(),
  status: listStatusSchema,
  periodMonth: monthSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
}).strict();

const createInputSchema = z.object({
  branchId: positiveId.default(1),
  month: monthSchema,
  scope: z.enum(['ALL', 'CUSTOM']),
  employeeIds: z.array(positiveId).max(500).default([])
}).strict().superRefine((value, context) => {
  if (value.scope === 'CUSTOM' && value.employeeIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['employeeIds'], message: 'Cần chọn ít nhất một nhân viên' });
  }
  if (value.scope === 'ALL' && value.employeeIds.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['employeeIds'], message: 'Không gửi danh sách nhân viên khi áp dụng cho tất cả' });
  }
});

const emptyMutationSchema = z.object({}).strict();
const cancelInputSchema = z.object({ reason: reasonSchema }).strict();
const reasonInputSchema = z.object({ reason: reasonSchema }).strict();
const adjustmentInputSchema = z.object({
  type: z.enum(['BONUS', 'DEDUCTION']),
  amount: z.number().int().positive().max(2_147_483_647),
  reason: reasonSchema
}).strict();
const paymentInputSchema = z.object({
  amount: z.number().int().positive().max(2_147_483_647),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'OTHER']),
  financialAccountId: positiveId.nullable().optional(),
  externalReference: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().min(1).max(500).optional(),
  paidAt: z.string().datetime({ offset: true }).optional()
}).strict();
const exportQuerySchema = z.object({ format: z.enum(['csv', 'xlsx']).default('csv') }).strict();
const routeIdSchema = z.coerce.number().int().positive();
const idempotencyKeySchema = z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/);

function parseWithSchema<S extends z.ZodTypeAny>(schema: S, value: unknown, label: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const periodIssue = parsed.error.issues.some(issue => issue.path.includes('month') || issue.path.includes('periodMonth'));
  throw ApiError.badRequest(label, undefined, periodIssue ? 'PAYROLL_PERIOD_INVALID' : 'VALIDATION_ERROR');
}

export type PayrollListQuery = z.output<typeof listQuerySchema>;
export type PayrollCreateInput = z.output<typeof createInputSchema>;
export type PayrollCancelInput = z.output<typeof cancelInputSchema>;
export type PayrollReasonInput = z.output<typeof reasonInputSchema>;
export type PayrollAdjustmentInput = z.output<typeof adjustmentInputSchema>;
export type PayrollPaymentInput = z.output<typeof paymentInputSchema>;
export type PayrollExportQuery = z.output<typeof exportQuerySchema>;

export function parsePayrollListQuery(value: unknown): PayrollListQuery {
  const parsed = parseWithSchema(listQuerySchema, value, 'Bộ lọc bảng lương không hợp lệ');
  return parsed.status ? { ...parsed, status: [...new Set(parsed.status)] } : parsed;
}

export function parsePayrollCreateInput(value: unknown): PayrollCreateInput {
  const parsed = parseWithSchema(createInputSchema, value, 'Thông tin tạo bảng lương không hợp lệ');
  return { ...parsed, employeeIds: [...new Set(parsed.employeeIds)].sort((left, right) => left - right) };
}

export function parsePayrollRecalculateInput(value: unknown): Record<string, never> {
  return parseWithSchema(emptyMutationSchema, value, 'Yêu cầu tính lại bảng lương không hợp lệ');
}

export function parsePayrollFinalizeInput(value: unknown): Record<string, never> {
  return parseWithSchema(emptyMutationSchema, value, 'Yêu cầu chốt bảng lương không hợp lệ');
}

export function parsePayrollCancelInput(value: unknown): PayrollCancelInput {
  return parseWithSchema(cancelInputSchema, value, 'Lý do hủy bảng lương không hợp lệ');
}

export function parsePayrollReasonInput(value: unknown): PayrollReasonInput {
  return parseWithSchema(reasonInputSchema, value, 'Lý do đảo giao dịch không hợp lệ');
}

export function parsePayrollAdjustmentInput(value: unknown): PayrollAdjustmentInput {
  return parseWithSchema(adjustmentInputSchema, value, 'Thông tin điều chỉnh lương không hợp lệ');
}

export function parsePayrollPaymentInput(value: unknown): PayrollPaymentInput {
  return parseWithSchema(paymentInputSchema, value, 'Thông tin thanh toán lương không hợp lệ');
}

export function parsePayrollExportQuery(value: unknown): PayrollExportQuery {
  return parseWithSchema(exportQuerySchema, value, 'Định dạng xuất bảng lương không hợp lệ');
}

export function parsePayrollBatchId(value: unknown): number {
  return parseWithSchema(routeIdSchema, value, 'Mã bảng lương không hợp lệ');
}

export function parsePayrollRouteId(value: unknown, label = 'Mã dữ liệu bảng lương không hợp lệ'): number {
  return parseWithSchema(routeIdSchema, value, label);
}

export function parsePayrollIdempotencyKey(value: unknown): string {
  return parseWithSchema(idempotencyKeySchema, value, 'Idempotency-Key bảng lương không hợp lệ');
}
