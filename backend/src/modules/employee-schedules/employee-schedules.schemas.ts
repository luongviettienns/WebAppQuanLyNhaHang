import { z } from 'zod';
import { ApiError } from '../../lib/api-error';
import { isValidScheduleDate, ScheduleDomainError, validateScheduleRule } from './schedule-domain';

const shiftInputSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N}_-]+$/u).transform(value => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440)
});

export type CreateWorkShiftInput = z.infer<typeof shiftInputSchema>;

const weekQuerySchema = z.object({
  weekStart: z.string().min(1),
  search: z.string().trim().max(160).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100)
});

const createScheduleBatchSchema = z.object({
  employeeIds: z.array(z.number().int().positive()).min(1).max(100),
  shiftIds: z.array(z.number().int().positive()).min(1).max(20),
  startDate: z.string(),
  repeatWeekly: z.boolean(),
  endDate: z.string().nullable().optional()
});

const mutationBodySchema = z.object({
  workDate: z.string(),
  scope: z.enum(['occurrence', 'following']),
  shiftIds: z.array(z.number().int().positive()).min(1).max(20)
});
const deletionQuerySchema = z.object({
  workDate: z.string(),
  scope: z.enum(['occurrence', 'following'])
});
const scheduleImportFileSchema = z.object({
  fileName: z.string().max(255).regex(/\.(xlsx|csv)$/i),
  fileBase64: z.string().min(1).max(7 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/)
});
const scheduleImportRowSchema = z.object({
  employeeCode: z.string().trim().min(1).max(40).transform(value => value.toUpperCase()),
  shiftCode: z.string().trim().min(1).max(40).transform(value => value.toUpperCase()),
  workDate: z.string(),
  repeatWeekly: z.boolean(),
  endDate: z.string().nullable().optional().transform(value => value ?? null),
  rowNumber: z.number().int().min(2).optional()
});
const scheduleImportCommitSchema = z.object({ rows: z.array(scheduleImportRowSchema).min(1).max(1000) });
const scheduleExportSchema = z.object({
  weekStart: z.string().min(1),
  format: z.enum(['csv', 'xlsx']).default('csv')
});

export type ScheduleWeekQuery = z.infer<typeof weekQuerySchema>;
export type CreateScheduleBatchInput = Omit<z.infer<typeof createScheduleBatchSchema>, 'employeeIds' | 'shiftIds'> & {
  employeeIds: number[];
  shiftIds: number[];
  endDate: string | null;
  recurrenceType: 'ONCE' | 'WEEKLY';
  dayOfWeek: number | null;
};
export type ScheduleMutationInput = Omit<z.infer<typeof mutationBodySchema>, 'shiftIds'> & { shiftIds: number[] };
export type ScheduleDeleteInput = z.infer<typeof deletionQuerySchema>;
export type ScheduleImportRowInput = z.infer<typeof scheduleImportRowSchema>;
export type ScheduleImportExportQuery = z.infer<typeof scheduleExportSchema>;

const mapDomainError = (error: unknown): never => {
  if (error instanceof ScheduleDomainError) throw ApiError.badRequest(error.message, undefined, error.code);
  throw error;
};

function isoWeekday(value: string): number {
  const weekday = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function parseScheduleWeekQuery(value: unknown): ScheduleWeekQuery {
  const parsed = weekQuerySchema.parse(value);
  if (!isValidScheduleDate(parsed.weekStart) || isoWeekday(parsed.weekStart) !== 1) {
    throw ApiError.badRequest('Ngày đầu tuần phải là ngày hợp lệ theo YYYY-MM-DD và là thứ Hai', { weekStart: parsed.weekStart }, 'SCHEDULE_DATE_INVALID');
  }
  return parsed;
}

export function parseCreateScheduleBatchInput(value: unknown): CreateScheduleBatchInput {
  const parsed = createScheduleBatchSchema.parse(value);
  const employeeIds = [...new Set(parsed.employeeIds)].sort((left, right) => left - right);
  const shiftIds = [...new Set(parsed.shiftIds)].sort((left, right) => left - right);
  const recurrenceType = parsed.repeatWeekly ? 'WEEKLY' : 'ONCE';
  const endDate = parsed.endDate ?? null;
  const dayOfWeek = parsed.repeatWeekly && isValidScheduleDate(parsed.startDate) ? isoWeekday(parsed.startDate) : null;

  try {
    validateScheduleRule({ recurrenceType, startDate: parsed.startDate, endDate, dayOfWeek });
  } catch (error) {
    mapDomainError(error);
  }

  return { ...parsed, employeeIds, shiftIds, endDate, recurrenceType, dayOfWeek };
}

function parseMutationDate<T extends { workDate: string }>(parsed: T): T {
  if (!isValidScheduleDate(parsed.workDate)) {
    throw ApiError.badRequest('Ngày lịch phải là ngày hợp lệ theo YYYY-MM-DD', { workDate: parsed.workDate }, 'SCHEDULE_DATE_INVALID');
  }
  return parsed;
}

export function parseScheduleMutationInput(value: unknown): ScheduleMutationInput {
  const parsed = parseMutationDate(mutationBodySchema.parse(value));
  return { ...parsed, shiftIds: [...new Set(parsed.shiftIds)].sort((left, right) => left - right) };
}

export function parseScheduleDeleteInput(value: unknown): ScheduleDeleteInput {
  return parseMutationDate(deletionQuerySchema.parse(value));
}

export function parseScheduleRuleId(value: unknown): number {
  return z.coerce.number().int().positive().parse(value);
}

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

export function parseScheduleImportFile(value: unknown) {
  const parsed = scheduleImportFileSchema.safeParse(value);
  if (!parsed.success) throw ApiError.badRequest('File import không hợp lệ hoặc vượt giới hạn cho phép', {}, 'SCHEDULE_IMPORT_FILE_INVALID');
  return parsed.data;
}

export function parseScheduleImportRows(value: unknown): ScheduleImportRowInput[] {
  const parsed = scheduleImportCommitSchema.safeParse(value);
  if (!parsed.success) throw ApiError.badRequest('Danh sách lịch import không hợp lệ hoặc vượt quá 1000 dòng', {}, 'SCHEDULE_IMPORT_ROWS_INVALID');
  for (const row of parsed.data.rows) {
    if (!isValidScheduleDate(row.workDate) || (row.endDate && !isValidScheduleDate(row.endDate))) {
      throw ApiError.badRequest('Ngày import phải hợp lệ theo YYYY-MM-DD', { rowNumber: String(row.rowNumber ?? '') }, 'SCHEDULE_DATE_INVALID');
    }
    const weekday = isoWeekday(row.workDate);
    try {
      validateScheduleRule({
        recurrenceType: row.repeatWeekly ? 'WEEKLY' : 'ONCE', startDate: row.workDate,
        endDate: row.endDate,
        dayOfWeek: row.repeatWeekly ? weekday : null
      });
    } catch (error) {
      if (error instanceof ScheduleDomainError) {
        throw ApiError.badRequest(error.message, { rowNumber: String(row.rowNumber ?? '') }, error.code);
      }
      throw error;
    }
  }
  return parsed.data.rows;
}

export function parseScheduleImportExportQuery(value: unknown): ScheduleImportExportQuery {
  const parsed = scheduleExportSchema.parse(value);
  if (!isValidScheduleDate(parsed.weekStart) || isoWeekday(parsed.weekStart) !== 1) {
    throw ApiError.badRequest('Ngày đầu tuần phải là ngày hợp lệ theo YYYY-MM-DD và là thứ Hai', { weekStart: parsed.weekStart }, 'SCHEDULE_DATE_INVALID');
  }
  return parsed;
}
