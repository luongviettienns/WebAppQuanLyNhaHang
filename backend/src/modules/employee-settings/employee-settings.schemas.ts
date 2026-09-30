import { z } from 'zod';
import { ApiError, ErrorCode } from '../../lib/api-error';
import { businessDateAt } from '../employee-attendance/attendance-domain';
import {
  assertEffectiveDateAllowed,
  EmployeeSettingsDomainError,
  validateAttendancePolicy,
  validateHolidayPeriod,
  validatePayrollPolicy,
  validateWorkweekPolicy
} from './employee-settings.domain';

const branchId = z.coerce.number().int().positive();
const revision = z.number().int().positive();
const collectionRevision = z.number().int().nonnegative();
const isoDate = z.string();
const reason = z.string().trim().min(3).max(500);

const settingsQuerySchema = z.object({ branchId: branchId.default(1) }).strict();
const policyBase = {
  branchId,
  effectiveFrom: isoDate,
  expectedAreaRevision: revision
};
const attendancePolicySchema = z.object({
  ...policyBase,
  attendanceMode: z.string(),
  standardDayMinutes: z.number().int(),
  lateThresholdMinutes: z.number().int(),
  earlyLeaveThresholdMinutes: z.number().int(),
  allowUnscheduledAttendance: z.boolean()
}).strict();
const payrollPolicySchema = z.object({
  ...policyBase,
  frequency: z.string(),
  periodStartDay: z.number().int(),
  hourlyCalculationSource: z.string()
}).strict();
const workweekPolicySchema = z.object({
  ...policyBase,
  monday: z.boolean(),
  tuesday: z.boolean(),
  wednesday: z.boolean(),
  thursday: z.boolean(),
  friday: z.boolean(),
  saturday: z.boolean(),
  sunday: z.boolean()
}).strict();
const holidayCreateSchema = z.object({
  branchId,
  expectedHolidayRevision: collectionRevision,
  name: z.string(),
  startDate: isoDate,
  endDate: isoDate,
  note: z.string().nullable().optional()
}).strict();
const holidayUpdateSchema = z.object({
  branchId,
  expectedHolidayRevision: collectionRevision,
  expectedRowRevision: revision,
  name: z.string().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  note: z.string().nullable().optional(),
  reason: reason.optional()
}).strict().superRefine((value, context) => {
  if (value.name === undefined && value.startDate === undefined && value.endDate === undefined && value.note === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cần có ít nhất một thay đổi', path: [] });
  }
});
const holidayArchiveSchema = z.object({
  branchId,
  expectedHolidayRevision: collectionRevision,
  expectedRowRevision: revision,
  reason
}).strict();
const holidayListSchema = z.object({
  branchId: branchId.default(1),
  from: isoDate.optional(),
  to: isoDate.optional(),
  includeArchived: z.preprocess(value => value === 'true' ? true : value === 'false' ? false : value, z.boolean()).default(false)
}).strict().superRefine((value, context) => {
  if ((value.from === undefined) !== (value.to === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cần truyền đồng thời từ ngày và đến ngày', path: ['to'] });
  }
});

function mapDomainError(error: unknown): never {
  if (error instanceof EmployeeSettingsDomainError) {
    throw new ApiError(422, error.code as ErrorCode, error.message);
  }
  throw error;
}

function assertEffectiveDate(effectiveFrom: string, currentBusinessDate: string): void {
  try {
    assertEffectiveDateAllowed(effectiveFrom, currentBusinessDate);
  } catch (error) {
    mapDomainError(error);
  }
}

export interface AttendancePolicyCreateInput {
  effectiveFrom: string;
  branchId: number;
  expectedAreaRevision: number;
  attendanceMode: 'SHIFT';
  standardDayMinutes: number;
  lateThresholdMinutes: number;
  earlyLeaveThresholdMinutes: number;
  allowUnscheduledAttendance: boolean;
}

export interface PayrollPolicyCreateInput {
  effectiveFrom: string;
  branchId: number;
  expectedAreaRevision: number;
  frequency: 'MONTHLY';
  periodStartDay: 1;
  hourlyCalculationSource: 'ACTUAL_ATTENDANCE';
}

export interface WorkweekPolicyCreateInput {
  effectiveFrom: string;
  branchId: number;
  expectedAreaRevision: number;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export type HolidayCreateInput = z.output<typeof holidayCreateSchema>;
export type HolidayUpdateInput = z.output<typeof holidayUpdateSchema>;
export type HolidayArchiveInput = z.output<typeof holidayArchiveSchema>;
export type HolidayListQuery = z.output<typeof holidayListSchema>;

export function parseEmployeeSettingsQuery(value: unknown): { branchId: number } {
  return settingsQuerySchema.parse(value);
}

export function parseAttendancePolicyCreateInput(
  value: unknown,
  currentBusinessDate = businessDateAt(new Date())
): AttendancePolicyCreateInput {
  const parsed = attendancePolicySchema.parse(value);
  assertEffectiveDate(parsed.effectiveFrom, currentBusinessDate);
  try {
    const values = validateAttendancePolicy({
      attendanceMode: parsed.attendanceMode as 'SHIFT',
      standardDayMinutes: parsed.standardDayMinutes,
      lateThresholdMinutes: parsed.lateThresholdMinutes,
      earlyLeaveThresholdMinutes: parsed.earlyLeaveThresholdMinutes,
      allowUnscheduledAttendance: parsed.allowUnscheduledAttendance
    });
    return { ...values, branchId: parsed.branchId, effectiveFrom: parsed.effectiveFrom, expectedAreaRevision: parsed.expectedAreaRevision };
  } catch (error) {
    mapDomainError(error);
  }
}

export function parsePayrollPolicyCreateInput(
  value: unknown,
  currentBusinessDate = businessDateAt(new Date())
): PayrollPolicyCreateInput {
  const parsed = payrollPolicySchema.parse(value);
  assertEffectiveDate(parsed.effectiveFrom, currentBusinessDate);
  try {
    const values = validatePayrollPolicy({
      frequency: parsed.frequency as 'MONTHLY',
      periodStartDay: parsed.periodStartDay as 1,
      hourlyCalculationSource: parsed.hourlyCalculationSource as 'ACTUAL_ATTENDANCE'
    });
    return { ...values, branchId: parsed.branchId, effectiveFrom: parsed.effectiveFrom, expectedAreaRevision: parsed.expectedAreaRevision };
  } catch (error) {
    mapDomainError(error);
  }
}

export function parseWorkweekPolicyCreateInput(
  value: unknown,
  currentBusinessDate = businessDateAt(new Date())
): WorkweekPolicyCreateInput {
  const parsed = workweekPolicySchema.parse(value);
  assertEffectiveDate(parsed.effectiveFrom, currentBusinessDate);
  try {
    const values = validateWorkweekPolicy({
      monday: parsed.monday,
      tuesday: parsed.tuesday,
      wednesday: parsed.wednesday,
      thursday: parsed.thursday,
      friday: parsed.friday,
      saturday: parsed.saturday,
      sunday: parsed.sunday
    });
    return { ...values, branchId: parsed.branchId, effectiveFrom: parsed.effectiveFrom, expectedAreaRevision: parsed.expectedAreaRevision };
  } catch (error) {
    mapDomainError(error);
  }
}

export function parseHolidayCreateInput(value: unknown): HolidayCreateInput {
  const parsed = holidayCreateSchema.parse(value);
  try {
    return { ...parsed, ...validateHolidayPeriod(parsed) };
  } catch (error) {
    mapDomainError(error);
  }
}

export function parseHolidayUpdateInput(value: unknown): HolidayUpdateInput {
  return holidayUpdateSchema.parse(value);
}

export function parseHolidayArchiveInput(value: unknown): HolidayArchiveInput {
  return holidayArchiveSchema.parse(value);
}

export function parseHolidayListQuery(value: unknown): HolidayListQuery {
  const parsed = holidayListSchema.parse(value);
  if (parsed.from && parsed.to) {
    try {
      validateHolidayPeriod({ name: 'date-range', startDate: parsed.from, endDate: parsed.to });
    } catch (error) {
      mapDomainError(error);
    }
  }
  return parsed;
}

export function parseHolidayId(value: unknown): number {
  return z.coerce.number().int().positive().parse(value);
}
