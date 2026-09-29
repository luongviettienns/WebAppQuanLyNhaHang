import { z } from 'zod';
import { ApiError } from '../../lib/api-error';
import { isValidAttendanceDate } from './attendance-domain';

const isoDate = z.string().refine(isValidAttendanceDate, 'Ngày phải hợp lệ theo YYYY-MM-DD');
const positiveId = z.number().int().positive();
const reason = z.string().trim().min(3).max(500);
const offsetDateTime = z.string().datetime({ offset: true });

const kioskPunchSchema = z.object({
  attendanceCode: z.string().trim().min(1).max(32),
  action: z.enum(['CHECK_IN', 'CHECK_OUT']),
  scheduleRuleId: positiveId.optional(),
  scheduleDate: isoDate.optional(),
  outsideScheduleConfirmation: z.boolean().optional(),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/)
}).strict().superRefine((value, context) => {
  if ((value.scheduleRuleId === undefined) !== (value.scheduleDate === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cần chọn đồng thời ca và ngày lịch', path: ['scheduleDate'] });
  }
  if (value.outsideScheduleConfirmation && value.scheduleRuleId !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Không thể vừa chọn ca vừa xác nhận ngoài lịch', path: ['outsideScheduleConfirmation'] });
  }
});

const weekQuerySchema = z.object({
  weekStart: isoDate,
  branchId: z.coerce.number().int().positive(),
  view: z.enum(['shift', 'employee']).default('shift'),
  search: z.string().trim().max(160).optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100)
}).strict();

const createKioskSessionSchema = z.object({
  branchId: positiveId,
  expiresInMinutes: z.number().int().min(15).max(1440),
  deviceName: z.string().trim().min(1).max(120).optional()
}).strict();

const manualAttendanceSessionSchema = z.object({
  employeeId: positiveId,
  branchId: positiveId,
  checkInAt: offsetDateTime,
  checkOutAt: offsetDateTime.optional(),
  scheduleRuleId: positiveId.optional(),
  scheduleDate: isoDate.optional(),
  reason
}).strict().superRefine((value, context) => {
  if ((value.scheduleRuleId === undefined) !== (value.scheduleDate === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cần chọn đồng thời quy tắc lịch và ngày lịch', path: ['scheduleDate'] });
  }
  if (value.checkOutAt && Date.parse(value.checkOutAt) < Date.parse(value.checkInAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Giờ ra không thể trước giờ vào', path: ['checkOutAt'] });
  }
});

function parseWithSchema<S extends z.ZodTypeAny>(schema: S, value: unknown, label: string, code: 'VALIDATION_ERROR' | 'ATTENDANCE_DATE_INVALID' | 'ATTENDANCE_REASON_REQUIRED' = 'VALIDATION_ERROR'): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const hasDateIssue = parsed.error.issues.some(issue => issue.path.some(part => String(part).toLowerCase().includes('date')));
    const hasReasonIssue = parsed.error.issues.some(issue => issue.path.includes('reason'));
    const selectedCode = hasReasonIssue ? 'ATTENDANCE_REASON_REQUIRED' : hasDateIssue ? 'ATTENDANCE_DATE_INVALID' : code;
    throw ApiError.badRequest(label, {}, selectedCode);
  }
  return parsed.data;
}

export type KioskPunchInput = z.infer<typeof kioskPunchSchema>;
export type AttendanceWeekQuery = z.output<typeof weekQuerySchema>;
export type CreateKioskSessionInput = z.infer<typeof createKioskSessionSchema>;
export type ManualAttendanceSessionInput = z.infer<typeof manualAttendanceSessionSchema>;

export function parseKioskPunchInput(value: unknown): KioskPunchInput {
  return parseWithSchema(kioskPunchSchema, value, 'Yêu cầu chấm công không hợp lệ');
}

export function parseAttendanceWeekQuery(value: unknown): AttendanceWeekQuery {
  const parsed = parseWithSchema(weekQuerySchema, value, 'Bộ lọc bảng chấm công không hợp lệ');
  const weekday = new Date(`${parsed.weekStart}T00:00:00.000Z`).getUTCDay();
  if (weekday !== 1) throw ApiError.badRequest('Ngày đầu tuần phải là thứ Hai', { weekStart: parsed.weekStart }, 'ATTENDANCE_DATE_INVALID');
  return parsed;
}

export function parseCreateKioskSessionInput(value: unknown): CreateKioskSessionInput {
  return parseWithSchema(createKioskSessionSchema, value, 'Thông tin cấp kiosk không hợp lệ');
}

export function parseManualAttendanceSessionInput(value: unknown): ManualAttendanceSessionInput {
  return parseWithSchema(manualAttendanceSessionSchema, value, 'Thông tin bổ sung chấm công không hợp lệ');
}
