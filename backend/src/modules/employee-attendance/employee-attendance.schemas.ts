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
  if (value.action === 'CHECK_OUT' && (value.scheduleRuleId !== undefined || value.outsideScheduleConfirmation === true)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Tan ca luôn đóng phiên đang mở, không chọn lại lịch', path: ['action'] });
  }
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

const exceptionQuerySchema = weekQuerySchema.omit({ view: true }).extend({
  status: z.enum(['OPEN', 'RESOLVED']).default('OPEN')
});

const createKioskSessionSchema = z.object({
  branchId: positiveId,
  expiresInMinutes: z.number().int().min(15).max(1440),
  deviceName: z.string().trim().min(1).max(120).optional()
}).strict();

const kioskSessionIdSchema = z.coerce.number().int().positive();
const kioskSessionListQuerySchema = z.object({ branchId: z.coerce.number().int().positive() }).strict();

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

const adminAttendanceSessionUpdateSchema = z.object({
  checkInAt: offsetDateTime.optional(),
  checkOutAt: offsetDateTime.optional(),
  scheduleRuleId: positiveId.nullable().optional(),
  scheduleDate: isoDate.nullable().optional(),
  reason
}).strict().superRefine((value, context) => {
  const ruleSpecified = value.scheduleRuleId !== undefined;
  const dateSpecified = value.scheduleDate !== undefined;
  if (ruleSpecified !== dateSpecified || (ruleSpecified && ((value.scheduleRuleId === null) !== (value.scheduleDate === null)))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cần chọn đầy đủ quy tắc/ngày lịch hoặc bỏ liên kết cả hai', path: ['scheduleDate'] });
  }
  if (value.checkInAt === undefined && value.checkOutAt === undefined && !ruleSpecified) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Cần có ít nhất một thay đổi chấm công', path: [] });
  }
  if (value.checkInAt && value.checkOutAt && Date.parse(value.checkOutAt) < Date.parse(value.checkInAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Giờ ra không thể trước giờ vào', path: ['checkOutAt'] });
  }
});

const markAttendanceAbsentSchema = z.object({ branchId: positiveId, reason }).strict();
const dispositionRevokeSchema = z.object({ reason }).strict();
const attendanceSessionIdSchema = z.coerce.number().int().positive();

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
export type AttendanceExceptionQuery = z.output<typeof exceptionQuerySchema>;
export type CreateKioskSessionInput = z.infer<typeof createKioskSessionSchema>;
export type KioskSessionListQuery = z.infer<typeof kioskSessionListQuerySchema>;
export type ManualAttendanceSessionInput = z.infer<typeof manualAttendanceSessionSchema>;
export type AdminAttendanceSessionUpdateInput = z.infer<typeof adminAttendanceSessionUpdateSchema>;
export type MarkAttendanceAbsentInput = z.infer<typeof markAttendanceAbsentSchema>;
export type DispositionRevokeInput = z.infer<typeof dispositionRevokeSchema>;

export function parseKioskPunchInput(value: unknown): KioskPunchInput {
  return parseWithSchema(kioskPunchSchema, value, 'Yêu cầu chấm công không hợp lệ');
}

export function parseAttendanceWeekQuery(value: unknown): AttendanceWeekQuery {
  const parsed = parseWithSchema(weekQuerySchema, value, 'Bộ lọc bảng chấm công không hợp lệ');
  const weekday = new Date(`${parsed.weekStart}T00:00:00.000Z`).getUTCDay();
  if (weekday !== 1) throw ApiError.badRequest('Ngày đầu tuần phải là thứ Hai', { weekStart: parsed.weekStart }, 'ATTENDANCE_DATE_INVALID');
  return parsed;
}

export function parseAttendanceExceptionQuery(value: unknown): AttendanceExceptionQuery {
  const parsed = parseWithSchema(exceptionQuerySchema, value, 'Bộ lọc hàng đợi chấm công không hợp lệ');
  const weekday = new Date(`${parsed.weekStart}T00:00:00.000Z`).getUTCDay();
  if (weekday !== 1) throw ApiError.badRequest('Ngày đầu tuần phải là thứ Hai', { weekStart: parsed.weekStart }, 'ATTENDANCE_DATE_INVALID');
  return parsed;
}

export function parseCreateKioskSessionInput(value: unknown): CreateKioskSessionInput {
  return parseWithSchema(createKioskSessionSchema, value, 'Thông tin cấp kiosk không hợp lệ');
}

export function parseKioskSessionId(value: unknown): number {
  return parseWithSchema(kioskSessionIdSchema, value, 'Mã phiên kiosk không hợp lệ');
}

export function parseKioskSessionListQuery(value: unknown): KioskSessionListQuery {
  return parseWithSchema(kioskSessionListQuerySchema, value, 'Bộ lọc phiên kiosk không hợp lệ');
}

export function parseManualAttendanceSessionInput(value: unknown): ManualAttendanceSessionInput {
  return parseWithSchema(manualAttendanceSessionSchema, value, 'Thông tin bổ sung chấm công không hợp lệ');
}

export function parseAdminAttendanceSessionUpdateInput(value: unknown): AdminAttendanceSessionUpdateInput {
  return parseWithSchema(adminAttendanceSessionUpdateSchema, value, 'Thông tin điều chỉnh chấm công không hợp lệ');
}

export function parseMarkAttendanceAbsentInput(value: unknown): MarkAttendanceAbsentInput {
  return parseWithSchema(markAttendanceAbsentSchema, value, 'Thông tin xác nhận vắng mặt không hợp lệ', 'ATTENDANCE_REASON_REQUIRED');
}

export function parseDispositionRevokeInput(value: unknown): DispositionRevokeInput {
  return parseWithSchema(dispositionRevokeSchema, value, 'Thông tin gỡ xác nhận vắng mặt không hợp lệ', 'ATTENDANCE_REASON_REQUIRED');
}

export function parseAttendanceSessionId(value: unknown): number {
  return parseWithSchema(attendanceSessionIdSchema, value, 'Mã phiên chấm công không hợp lệ');
}

export function parseAttendanceRouteId(value: unknown, label = 'Mã chấm công không hợp lệ'): number {
  return parseWithSchema(attendanceSessionIdSchema, value, label);
}

export function parseAttendanceWorkDate(value: unknown): string {
  return parseWithSchema(isoDate, value, 'Ngày chấm công không hợp lệ', 'ATTENDANCE_DATE_INVALID');
}
