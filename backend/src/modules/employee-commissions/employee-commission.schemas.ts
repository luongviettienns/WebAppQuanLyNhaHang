import { z } from 'zod';

const positiveId = z.coerce.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có định dạng YYYY-MM-DD');
const nullableIsoDate = isoDate.nullable().optional();
const reason = z.string().trim().min(3).max(500);

const pagination = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
};

const planCreateSchema = z.object({
  branchId: positiveId.default(1),
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(160),
  effectiveFrom: isoDate,
  effectiveTo: nullableIsoDate
}).strict().superRefine((value, context) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Ngày kết thúc phải từ ngày bắt đầu', path: ['effectiveTo'] });
  }
});

const planUpdateSchema = z.object({ name: z.string().trim().min(2).max(160) }).strict();
const planArchiveSchema = z.object({ reason }).strict();

const ruleCreateSchema = z.object({
  menuItemId: positiveId,
  type: z.enum(['FIXED_PER_UNIT', 'PERCENT_NET_REVENUE', 'PERCENT_GROSS_PROFIT']),
  fixedAmount: z.number().int().positive().nullable().optional(),
  rateBps: z.number().int().min(1).max(10_000).nullable().optional(),
  effectiveFrom: isoDate
}).strict().superRefine((value, context) => {
  const fixed = value.fixedAmount != null;
  const rate = value.rateBps != null;
  if (value.type === 'FIXED_PER_UNIT' ? (!fixed || rate) : (fixed || !rate)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: value.type === 'FIXED_PER_UNIT'
        ? 'Hoa hồng cố định chỉ nhận fixedAmount'
        : 'Hoa hồng tỷ lệ chỉ nhận rateBps',
      path: [value.type === 'FIXED_PER_UNIT' ? 'fixedAmount' : 'rateBps']
    });
  }
});

const assignmentCreateSchema = z.object({
  employeeId: positiveId,
  effectiveFrom: isoDate,
  effectiveTo: nullableIsoDate,
  autoAssignOwnPos: z.boolean().default(false)
}).strict().superRefine((value, context) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Ngày kết thúc phải từ ngày bắt đầu', path: ['effectiveTo'] });
  }
});

const workspaceQuerySchema = z.object({
  branchId: positiveId.default(1),
  mode: z.enum(['ITEM', 'EMPLOYEE']).default('ITEM'),
  search: z.string().trim().max(160).optional(),
  categoryId: positiveId.optional(),
  planIds: z.string().regex(/^\d+(,\d+)*$/).optional(),
  ...pagination
}).strict();

const listQuerySchema = z.object({
  branchId: positiveId.default(1),
  status: z.string().trim().max(40).optional(),
  employeeId: positiveId.optional(),
  orderItemId: positiveId.optional(),
  ...pagination
}).strict();

const assignmentSchema = z.object({ commissionEmployeeId: positiveId.nullable() }).strict();
const resolutionSchema = z.object({
  type: z.enum(['COST_OVERRIDE', 'RULE_OVERRIDE']),
  resolution: z.record(z.unknown()),
  reason,
  idempotencyKey: z.string().trim().min(8).max(120)
}).strict();
const retrySchema = z.object({ idempotencyKey: z.string().trim().min(8).max(120) }).strict();
const reassignSchema = z.object({
  employeeId: positiveId,
  reason,
  idempotencyKey: z.string().trim().min(8).max(120)
}).strict();

export type CommissionPlanCreateInput = z.output<typeof planCreateSchema>;
export type CommissionPlanUpdateInput = z.output<typeof planUpdateSchema>;
export type CommissionRuleCreateInput = z.output<typeof ruleCreateSchema>;
export type CommissionAssignmentCreateInput = z.output<typeof assignmentCreateSchema>;
export type CommissionWorkspaceQuery = z.output<typeof workspaceQuerySchema> & { selectedPlanIds?: number[] };
export type CommissionListQuery = z.output<typeof listQuerySchema>;
export type CommissionResolutionInput = z.output<typeof resolutionSchema>;
export type CommissionReassignInput = z.output<typeof reassignSchema>;

export const parseCommissionPlanCreateInput = (value: unknown) => planCreateSchema.parse(value);
export const parseCommissionPlanUpdateInput = (value: unknown) => planUpdateSchema.parse(value);
export const parseCommissionPlanArchiveInput = (value: unknown) => planArchiveSchema.parse(value);
export const parseCommissionRuleCreateInput = (value: unknown) => ruleCreateSchema.parse(value);
export const parseCommissionAssignmentCreateInput = (value: unknown) => assignmentCreateSchema.parse(value);
export const parseCommissionAssignmentInput = (value: unknown) => assignmentSchema.parse(value);
export const parseCommissionResolutionInput = (value: unknown) => resolutionSchema.parse(value);
export const parseCommissionRetryInput = (value: unknown) => retrySchema.parse(value);
export const parseCommissionReassignInput = (value: unknown) => reassignSchema.parse(value);
export const parseCommissionId = (value: unknown) => positiveId.parse(value);
export function parseCommissionWorkspaceQuery(value: unknown): CommissionWorkspaceQuery {
  const parsed = workspaceQuerySchema.parse(value);
  return { ...parsed, selectedPlanIds: parsed.planIds?.split(',').map(Number) };
}
export const parseCommissionListQuery = (value: unknown) => listQuerySchema.parse(value);

