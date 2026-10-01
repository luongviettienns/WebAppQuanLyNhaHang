import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { lockEmployeeRows } from '../employee-schedules/employee-schedules.service';
import { getEffectiveAttendancePolicy } from '../employee-settings/employee-settings.policy-reader';
import {
  businessDateAt,
  expandAttendanceOccurrences,
  getBusinessWeekBounds,
  resolveCheckInSchedule,
  type AttendanceOccurrence,
  type AttendanceScheduleException,
  type AttendanceScheduleRule,
  type CheckInScheduleSelection
} from './attendance-domain';
import { createAttendancePunchDigest } from './attendance-idempotency';
import { parseKioskPunchInput, type KioskPunchInput } from './employee-attendance.schemas';
import type { KioskSessionContext } from './kiosk-auth';

export interface KioskPunchSuccess {
  action: 'CHECK_IN' | 'CHECK_OUT';
  employeeName: string;
  recordedAt: string;
  state: 'OPEN' | 'COMPLETED';
  linkStatus: 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW';
  shiftName: string | null;
}

export interface KioskPunchChoiceRequired {
  selectionRequired: true;
  code: 'SCHEDULE_SELECTION_REQUIRED' | 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED';
  choices: Array<{
    scheduleRuleId: number;
    scheduleDate: string;
    shiftName: string;
    plannedStartMinute: number;
    plannedEndMinute: number;
  }>;
  allowOutsideSchedule: boolean;
}

export type KioskPunchResponse = KioskPunchSuccess | KioskPunchChoiceRequired;

interface PunchCommitResult {
  response: KioskPunchResponse;
  replayed: boolean;
  changedWorkDate?: string;
}

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);
const fromIsoDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function credentialInvalid() {
  return ApiError.unauthorized('Mã chấm công không hợp lệ.', 'ATTENDANCE_CREDENTIAL_INVALID');
}

function toAttendanceRule(rule: {
  id: number;
  employeeId: number;
  branchId: number;
  shiftId: number;
  recurrenceType: 'ONCE' | 'WEEKLY';
  startDate: Date;
  endDate: Date | null;
  dayOfWeek: number | null;
  cancelledAt: Date | null;
  shift: { name: string; startMinute: number; endMinute: number };
  exceptions: Array<{ scheduleRuleId: number; workDate: Date; type: 'CANCELLED' }>;
}): AttendanceScheduleRule {
  return {
    id: rule.id,
    employeeId: rule.employeeId,
    branchId: rule.branchId,
    shiftId: rule.shiftId,
    recurrenceType: rule.recurrenceType,
    startDate: toIsoDate(rule.startDate),
    endDate: rule.endDate ? toIsoDate(rule.endDate) : null,
    dayOfWeek: rule.dayOfWeek,
    cancelledAt: rule.cancelledAt?.toISOString() ?? null,
    shift: rule.shift
  };
}

async function getOccurrences(
  tx: Prisma.TransactionClient,
  employeeId: number,
  branchId: number,
  workDate: string
): Promise<AttendanceOccurrence[]> {
  const { weekStart, weekEnd } = getBusinessWeekBounds(workDate);
  const weekStartDate = fromIsoDate(weekStart);
  const weekEndDate = fromIsoDate(weekEnd);
  const rules = await tx.employeeScheduleRule.findMany({
    where: {
      employeeId,
      branchId,
      cancelledAt: null,
      OR: [
        { recurrenceType: 'ONCE', startDate: { gte: weekStartDate, lte: weekEndDate } },
        {
          recurrenceType: 'WEEKLY',
          startDate: { lte: weekEndDate },
          OR: [{ endDate: null }, { endDate: { gte: weekStartDate } }]
        }
      ]
    },
    include: {
      shift: { select: { name: true, startMinute: true, endMinute: true } },
      exceptions: {
        where: { workDate: { gte: weekStartDate, lte: weekEndDate }, type: 'CANCELLED' },
        select: { scheduleRuleId: true, workDate: true, type: true }
      }
    }
  });
  const normalizedRules = rules.map(toAttendanceRule);
  const exceptions: AttendanceScheduleException[] = rules.flatMap(rule => rule.exceptions.map(exception => ({
    scheduleRuleId: exception.scheduleRuleId,
    workDate: toIsoDate(exception.workDate),
    type: exception.type
  })));
  return expandAttendanceOccurrences({ weekStart, rules: normalizedRules, exceptions, branchId, employeeId })
    .filter(occurrence => occurrence.scheduleDate === workDate);
}

function isStoredPunchResponse(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readStoredResponse(value: Prisma.JsonValue): KioskPunchResponse {
  if (!isStoredPunchResponse(value)) throw ApiError.internal('Kết quả chấm công đã lưu không hợp lệ.');
  return value as unknown as KioskPunchResponse;
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class EmployeeAttendancePunchService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly serverNow: () => Date = () => new Date(),
    private readonly emitChanged: (payload: { branchId: number; changedFrom: string; changedThrough: string; updatedAt: string }) => void = payload => {
      emitToAll('employee-attendance:changed', payload);
    }
  ) {}

  async punch(rawInput: unknown, kiosk: KioskSessionContext): Promise<KioskPunchResponse> {
    const input = parseKioskPunchInput(rawInput);
    const employee = await this.prisma.employee.findUnique({
      where: { attendanceCode: input.attendanceCode },
      select: { id: true }
    });
    if (!employee) throw credentialInvalid();

    const digest = createAttendancePunchDigest({
      employeeId: employee.id,
      action: input.action,
      scheduleRuleId: input.scheduleRuleId,
      scheduleDate: input.scheduleDate,
      outsideScheduleConfirmation: input.outsideScheduleConfirmation
    });

    try {
      const result = await this.prisma.$transaction(async tx => this.commitPunch(tx, input, kiosk, employee.id, digest));
      if (!result.replayed && result.changedWorkDate) {
        const updatedAt = 'recordedAt' in result.response ? result.response.recordedAt : this.serverNow().toISOString();
        this.emitChanged({
          branchId: kiosk.branchId,
          changedFrom: result.changedWorkDate,
          changedThrough: result.changedWorkDate,
          updatedAt
        });
      }
      return result.response;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const idempotency = await this.prisma.attendanceKioskIdempotency.findUnique({
        where: { kioskSessionId_idempotencyKey: { kioskSessionId: kiosk.id, idempotencyKey: input.idempotencyKey } }
      });
      if (!idempotency) throw error;
      if (idempotency.requestDigest !== digest) {
        throw ApiError.conflict('Khóa yêu cầu đã được dùng cho nội dung khác.', 'IDEMPOTENCY_KEY_REUSED');
      }
      return readStoredResponse(idempotency.response);
    }
  }

  private async commitPunch(
    tx: Prisma.TransactionClient,
    input: KioskPunchInput,
    kiosk: KioskSessionContext,
    employeeId: number,
    digest: string
  ): Promise<PunchCommitResult> {
    await tx.$queryRaw`SELECT id FROM AttendanceKioskSession WHERE id = ${kiosk.id} FOR UPDATE`;
    await lockEmployeeRows(tx, [employeeId]);
    const now = this.serverNow();

    const kioskRecord = await tx.attendanceKioskSession.findUnique({
      where: { id: kiosk.id },
      select: { id: true, branchId: true, expiresAt: true, revokedAt: true }
    });
    if (!kioskRecord || kioskRecord.branchId !== kiosk.branchId) {
      throw ApiError.unauthorized('Phiên kiosk không hợp lệ.', 'KIOSK_SESSION_INVALID');
    }
    if (kioskRecord.revokedAt) throw ApiError.unauthorized('Phiên kiosk đã bị thu hồi.', 'KIOSK_SESSION_REVOKED');
    if (kioskRecord.expiresAt.getTime() <= now.getTime()) {
      throw ApiError.unauthorized('Phiên kiosk đã hết hạn.', 'KIOSK_SESSION_EXPIRED');
    }

    const currentEmployee = await tx.employee.findFirst({
      where: { id: employeeId, attendanceCode: input.attendanceCode },
      select: { id: true, name: true, status: true }
    });
    if (!currentEmployee) throw credentialInvalid();

    const existing = await tx.attendanceKioskIdempotency.findUnique({
      where: { kioskSessionId_idempotencyKey: { kioskSessionId: kiosk.id, idempotencyKey: input.idempotencyKey } }
    });
    if (existing) {
      if (existing.requestDigest !== digest) {
        throw ApiError.conflict('Khóa yêu cầu đã được dùng cho nội dung khác.', 'IDEMPOTENCY_KEY_REUSED');
      }
      return { response: readStoredResponse(existing.response), replayed: true };
    }
    if (currentEmployee.status !== 'WORKING') throw credentialInvalid();

    const openSessions = await tx.employeeAttendanceSession.findMany({
      where: { employeeId, checkOutAt: null },
      orderBy: { checkInAt: 'asc' },
      select: {
        id: true, branchId: true, checkInAt: true, checkOutAt: true, scheduleLinkStatus: true,
        scheduleDate: true, plannedWorkDate: true, plannedShiftName: true
      }
    });

    if (input.action === 'CHECK_OUT') {
      if (openSessions.length === 0) throw ApiError.conflict('Không có phiên chấm công đang mở.', 'NO_OPEN_ATTENDANCE_SESSION');
      if (openSessions.length > 1) throw ApiError.conflict('Có nhiều phiên chấm công đang mở; cần Admin xử lý.', 'MULTIPLE_OPEN_ATTENDANCE_SESSIONS');
      const openSession = openSessions[0];
      if (openSession.branchId !== kioskRecord.branchId) {
        throw ApiError.conflict('Phiên chấm công đang mở thuộc chi nhánh khác.', 'ATTENDANCE_BRANCH_MISMATCH');
      }
      const update = await tx.employeeAttendanceSession.updateMany({
        where: { id: openSession.id, checkOutAt: null },
        data: { checkOutAt: now, checkOutSource: 'KIOSK', checkOutKioskSessionId: kiosk.id }
      });
      if (update.count !== 1) throw ApiError.conflict('Phiên chấm công đã được xử lý ở nơi khác.', 'NO_OPEN_ATTENDANCE_SESSION');
      await tx.attendanceKioskSession.update({ where: { id: kiosk.id }, data: { lastUsedAt: now } });

      const response: KioskPunchSuccess = {
        action: 'CHECK_OUT', employeeName: currentEmployee.name, recordedAt: now.toISOString(),
        state: 'COMPLETED', linkStatus: openSession.scheduleLinkStatus,
        shiftName: openSession.plannedShiftName
      };
      await tx.attendanceKioskIdempotency.create({
        data: {
          kioskSessionId: kiosk.id, idempotencyKey: input.idempotencyKey, requestDigest: digest,
          attendanceSessionId: openSession.id, response: response as unknown as Prisma.InputJsonValue
        }
      });
      return { response, replayed: false, changedWorkDate: businessDateAt(openSession.checkInAt) };
    }

    if (openSessions.length > 0) {
      throw ApiError.conflict('Bạn đang có phiên chưa chấm tan ca. Vui lòng liên hệ Admin.', 'ATTENDANCE_SESSION_ALREADY_OPEN');
    }

    const workDate = businessDateAt(now);
    const attendancePolicy = await getEffectiveAttendancePolicy(tx, kioskRecord.branchId, workDate);
    if (!attendancePolicy) {
      throw ApiError.internal('Chi nhánh chưa có chính sách chấm công hiệu lực.');
    }
    const occurrences = await getOccurrences(tx, employeeId, kioskRecord.branchId, workDate);
    const baseDecision = resolveCheckInSchedule({
      occurrences, serverNow: now, employeeId, branchId: kioskRecord.branchId, scheduleDate: workDate
    });
    let selection: CheckInScheduleSelection | undefined;
    if (input.scheduleRuleId !== undefined && input.scheduleDate !== undefined) {
      selection = { type: 'SCHEDULED', scheduleRuleId: input.scheduleRuleId, scheduleDate: input.scheduleDate };
    } else if (input.outsideScheduleConfirmation === true) {
      if (!attendancePolicy.allowUnscheduledAttendance) {
        throw ApiError.conflict('Chi nhánh yêu cầu nhân viên chấm công theo lịch đã xếp.', 'ATTENDANCE_SCHEDULE_REQUIRED');
      }
      if (occurrences.length > 1 || baseDecision.status === 'AUTO_LINKED') {
        throw ApiError.badRequest('Lựa chọn ngoài lịch không còn khả dụng.', undefined, 'SCHEDULE_NOT_AVAILABLE');
      }
      selection = { type: 'OUTSIDE_SCHEDULE' };
    }

    const decision = selection
      ? resolveCheckInSchedule({ occurrences, serverNow: now, selection, employeeId, branchId: kioskRecord.branchId, scheduleDate: workDate })
      : baseDecision;
    if (decision.status === 'OUTSIDE_CONFIRMATION_REQUIRED') {
      if (!attendancePolicy.allowUnscheduledAttendance) {
        throw ApiError.conflict('Chi nhánh yêu cầu nhân viên chấm công theo lịch đã xếp.', 'ATTENDANCE_SCHEDULE_REQUIRED');
      }
      return {
        response: {
          selectionRequired: true,
          code: 'OUTSIDE_SCHEDULE_CONFIRMATION_REQUIRED',
          choices: [],
          allowOutsideSchedule: attendancePolicy.allowUnscheduledAttendance
        },
        replayed: false
      };
    }
    if (decision.status === 'SCHEDULE_SELECTION_REQUIRED' || decision.status === 'SINGLE_SHIFT_CONFIRMATION_REQUIRED') {
      return {
        response: {
          selectionRequired: true,
          code: 'SCHEDULE_SELECTION_REQUIRED',
          choices: decision.occurrences.map(occurrence => ({
            scheduleRuleId: occurrence.scheduleRuleId,
            scheduleDate: occurrence.scheduleDate,
            shiftName: occurrence.shiftName,
            plannedStartMinute: occurrence.plannedStartMinute,
            plannedEndMinute: occurrence.plannedEndMinute
          })),
          allowOutsideSchedule: decision.status === 'SINGLE_SHIFT_CONFIRMATION_REQUIRED'
            && attendancePolicy.allowUnscheduledAttendance
        },
        replayed: false
      };
    }

    const occurrence = decision.status === 'AUTO_LINKED' || decision.status === 'LINKED' ? decision.occurrence : null;
    const session = await tx.employeeAttendanceSession.create({
      data: {
        employeeId,
        branchId: kioskRecord.branchId,
        scheduleRuleId: occurrence?.scheduleRuleId ?? null,
        scheduleDate: occurrence ? fromIsoDate(occurrence.scheduleDate) : null,
        checkInAt: now,
        checkInSource: 'KIOSK',
        checkInKioskSessionId: kiosk.id,
        scheduleLinkStatus: occurrence ? 'SCHEDULED' : 'UNSCHEDULED',
        plannedBranchId: occurrence?.branchId ?? null,
        plannedWorkDate: occurrence ? fromIsoDate(occurrence.scheduleDate) : null,
        plannedShiftName: occurrence?.shiftName ?? null,
        plannedStartMinute: occurrence?.plannedStartMinute ?? null,
        plannedEndMinute: occurrence?.plannedEndMinute ?? null,
        attendancePolicyVersionId: attendancePolicy.id,
        standardDayMinutesSnapshot: attendancePolicy.standardDayMinutes,
        lateThresholdMinutesSnapshot: attendancePolicy.lateThresholdMinutes,
        earlyLeaveThresholdMinutesSnapshot: attendancePolicy.earlyLeaveThresholdMinutes,
        allowUnscheduledAttendanceSnapshot: attendancePolicy.allowUnscheduledAttendance
      }
    });
    await tx.attendanceKioskSession.update({ where: { id: kiosk.id }, data: { lastUsedAt: now } });

    const response: KioskPunchSuccess = {
      action: 'CHECK_IN', employeeName: currentEmployee.name, recordedAt: now.toISOString(),
      state: 'OPEN', linkStatus: occurrence ? 'SCHEDULED' : 'UNSCHEDULED', shiftName: occurrence?.shiftName ?? null
    };
    await tx.attendanceKioskIdempotency.create({
      data: {
        kioskSessionId: kiosk.id, idempotencyKey: input.idempotencyKey, requestDigest: digest,
        attendanceSessionId: session.id, response: response as unknown as Prisma.InputJsonValue
      }
    });
    return { response, replayed: false, changedWorkDate: workDate };
  }
}
