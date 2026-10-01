import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import { AuditService, type LogAuditInput } from '../audit/audit.service';
import { lockEmployeeRows } from '../employee-schedules/employee-schedules.service';
import { emitToAll } from '../../lib/socket';
import { getEffectiveAttendancePolicy } from '../employee-settings/employee-settings.policy-reader';
import { businessDateAt, expandAttendanceOccurrences, getBusinessWeekBounds, type AttendanceOccurrence, type AttendanceScheduleException, type AttendanceScheduleRule } from './attendance-domain';
import type {
  AdminAttendanceSessionUpdateInput,
  DispositionRevokeInput,
  ManualAttendanceSessionInput,
  MarkAttendanceAbsentInput
} from './employee-attendance.schemas';

export interface AttendanceAdminActor { id: number; name?: string | null }

export interface AttendanceAdminEmployee {
  id: number;
  status: 'WORKING' | 'RESIGNED';
  startDate: Date | null;
  endDate: Date | null;
}

export interface AttendanceAdminSession {
  id: number;
  employeeId: number;
  branchId: number;
  scheduleRuleId: number | null;
  scheduleDate: Date | null;
  checkInAt: Date;
  checkOutAt: Date | null;
  checkInSource: 'KIOSK' | 'ADMIN_MANUAL';
  checkOutSource: 'KIOSK' | 'ADMIN_MANUAL' | null;
  checkInKioskSessionId: number | null;
  checkOutKioskSessionId: number | null;
  scheduleLinkStatus: 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW';
  plannedBranchId: number | null;
  plannedWorkDate: Date | null;
  plannedShiftName: string | null;
  plannedStartMinute: number | null;
  plannedEndMinute: number | null;
  attendancePolicyVersionId?: number | null;
  standardDayMinutesSnapshot?: number;
  lateThresholdMinutesSnapshot?: number;
  earlyLeaveThresholdMinutesSnapshot?: number;
  allowUnscheduledAttendanceSnapshot?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AttendanceAdminPolicy {
  id: number;
  branchId: number;
  effectiveFrom: Date;
  standardDayMinutes: number;
  lateThresholdMinutes: number;
  earlyLeaveThresholdMinutes: number;
  allowUnscheduledAttendance: boolean;
}

export interface AttendanceAdminDisposition {
  id: number;
  branchId: number;
  employeeId: number;
  scheduleRuleId: number;
  workDate: Date;
  type: 'ABSENT';
  reason: string;
  actorId: number;
  createdAt: Date;
  revokedAt: Date | null;
  revokedByUserId: number | null;
}

export interface AttendanceAdminTransaction {
  lockEmployee(employeeId: number): Promise<void>;
  getEmployee(employeeId: number): Promise<AttendanceAdminEmployee | null>;
  getBranch(branchId: number): Promise<{ id: number } | null>;
  getOccurrenceOwner(scheduleRuleId: number, branchId: number, workDate: string): Promise<{ employeeId: number } | null>;
  getOccurrence(employeeId: number, branchId: number, scheduleRuleId: number, workDate: string): Promise<AttendanceOccurrence | null>;
  getEffectiveAttendancePolicy(branchId: number, workDate: string): Promise<AttendanceAdminPolicy | null>;
  getAttendancePolicyVersion(policyVersionId: number, branchId: number): Promise<AttendanceAdminPolicy | null>;
  findOpenSession(employeeId: number, exceptSessionId?: number): Promise<{ id: number } | null>;
  findSession(sessionId: number): Promise<AttendanceAdminSession | null>;
  findSessionForOccurrence(employeeId: number, branchId: number, scheduleRuleId: number, workDate: string): Promise<AttendanceAdminSession | null>;
  findDispositionForOccurrence(branchId: number, scheduleRuleId: number, workDate: string): Promise<AttendanceAdminDisposition | null>;
  findDisposition(dispositionId: number): Promise<AttendanceAdminDisposition | null>;
  createSession(data: Record<string, unknown>): Promise<AttendanceAdminSession>;
  updateSession(sessionId: number, data: Record<string, unknown>): Promise<AttendanceAdminSession>;
  createDisposition(data: Record<string, unknown>): Promise<AttendanceAdminDisposition>;
  updateDisposition(dispositionId: number, data: Record<string, unknown>): Promise<AttendanceAdminDisposition>;
  audit(input: LogAuditInput): Promise<unknown>;
}

export interface AttendanceAdminStore {
  transaction<T>(work: (tx: AttendanceAdminTransaction) => Promise<T>): Promise<T>;
}

function dateFromIso(value: string): Date { return new Date(`${value}T00:00:00.000Z`); }
function isoDate(value: Date): string { return value.toISOString().slice(0, 10); }

function plannedEndAt(workDate: string, plannedEndMinute: number): Date {
  return new Date(Date.parse(`${workDate}T00:00:00.000Z`) + (plannedEndMinute - 7 * 60) * 60_000);
}

function toRule(rule: {
  id: number; employeeId: number; branchId: number; shiftId: number;
  recurrenceType: 'ONCE' | 'WEEKLY'; startDate: Date; endDate: Date | null; dayOfWeek: number | null;
  cancelledAt: Date | null; shift: { name: string; startMinute: number; endMinute: number };
}): AttendanceScheduleRule {
  return {
    id: rule.id, employeeId: rule.employeeId, branchId: rule.branchId, shiftId: rule.shiftId,
    recurrenceType: rule.recurrenceType, startDate: isoDate(rule.startDate),
    endDate: rule.endDate ? isoDate(rule.endDate) : null, dayOfWeek: rule.dayOfWeek,
    cancelledAt: rule.cancelledAt?.toISOString() ?? null, shift: rule.shift
  };
}

function serializeSession(session: AttendanceAdminSession | null) {
  if (!session) return null;
  return {
    id: session.id, employeeId: session.employeeId, branchId: session.branchId,
    scheduleRuleId: session.scheduleRuleId, scheduleDate: session.scheduleDate ? isoDate(session.scheduleDate) : null,
    checkInAt: session.checkInAt.toISOString(), checkOutAt: session.checkOutAt?.toISOString() ?? null,
    checkInSource: session.checkInSource, checkOutSource: session.checkOutSource,
    checkInKioskSessionId: session.checkInKioskSessionId, checkOutKioskSessionId: session.checkOutKioskSessionId,
    scheduleLinkStatus: session.scheduleLinkStatus, plannedBranchId: session.plannedBranchId,
    plannedWorkDate: session.plannedWorkDate ? isoDate(session.plannedWorkDate) : null,
    plannedShiftName: session.plannedShiftName, plannedStartMinute: session.plannedStartMinute,
    plannedEndMinute: session.plannedEndMinute,
    attendancePolicyVersionId: session.attendancePolicyVersionId ?? null,
    standardDayMinutesSnapshot: session.standardDayMinutesSnapshot ?? 480,
    lateThresholdMinutesSnapshot: session.lateThresholdMinutesSnapshot ?? 0,
    earlyLeaveThresholdMinutesSnapshot: session.earlyLeaveThresholdMinutesSnapshot ?? 0,
    allowUnscheduledAttendanceSnapshot: session.allowUnscheduledAttendanceSnapshot ?? true
  };
}

function policySnapshotPatch(policy: AttendanceAdminPolicy) {
  return {
    attendancePolicyVersionId: policy.id,
    standardDayMinutesSnapshot: policy.standardDayMinutes,
    lateThresholdMinutesSnapshot: policy.lateThresholdMinutes,
    earlyLeaveThresholdMinutesSnapshot: policy.earlyLeaveThresholdMinutes,
    allowUnscheduledAttendanceSnapshot: policy.allowUnscheduledAttendance
  };
}

function serializeDisposition(disposition: AttendanceAdminDisposition | null) {
  if (!disposition) return null;
  return {
    id: disposition.id, branchId: disposition.branchId, employeeId: disposition.employeeId,
    scheduleRuleId: disposition.scheduleRuleId, workDate: isoDate(disposition.workDate),
    type: disposition.type, reason: disposition.reason, actorId: disposition.actorId,
    createdAt: disposition.createdAt.toISOString(), revokedAt: disposition.revokedAt?.toISOString() ?? null,
    revokedByUserId: disposition.revokedByUserId
  };
}

function snapshotPatch(occurrence: AttendanceOccurrence | null) {
  if (!occurrence) {
    return {
      scheduleRuleId: null, scheduleDate: null, scheduleLinkStatus: 'UNSCHEDULED' as const,
      plannedBranchId: null, plannedWorkDate: null, plannedShiftName: null,
      plannedStartMinute: null, plannedEndMinute: null
    };
  }
  return {
    scheduleRuleId: occurrence.scheduleRuleId, scheduleDate: dateFromIso(occurrence.scheduleDate),
    scheduleLinkStatus: 'SCHEDULED' as const, plannedBranchId: occurrence.branchId,
    plannedWorkDate: dateFromIso(occurrence.scheduleDate), plannedShiftName: occurrence.shiftName,
    plannedStartMinute: occurrence.plannedStartMinute, plannedEndMinute: occurrence.plannedEndMinute
  };
}

function assertEmployeeWorkDate(employee: AttendanceAdminEmployee, workDate: string) {
  const outsideEmployment = (employee.startDate && workDate < isoDate(employee.startDate))
    || (employee.endDate && workDate > isoDate(employee.endDate))
    || (employee.status === 'RESIGNED' && (!employee.endDate || workDate > isoDate(employee.endDate)));
  if (outsideEmployment) {
    throw ApiError.conflict('Thời điểm chấm công nằm ngoài thời gian làm việc của nhân viên.', 'EMPLOYEE_NOT_WORKING');
  }
}

function assertEmployeeDate(employee: AttendanceAdminEmployee, instant: Date) {
  assertEmployeeWorkDate(employee, businessDateAt(instant));
}

function mutationAudit(
  action: string,
  actor: AttendanceAdminActor,
  targetType: string,
  targetId: number,
  reason: string,
  before: unknown,
  after: unknown
): LogAuditInput {
  return {
    action, targetType, targetId, actorId: actor.id, actorName: actor.name ?? null,
    metadata: { reason, before, after }
  };
}

export class EmployeeAttendanceAdminService {
  constructor(
    private readonly store: AttendanceAdminStore,
    private readonly serverNow: () => Date = () => new Date(),
    private readonly emitChanged: (payload: { branchId: number; changedFrom: string; changedThrough: string; updatedAt: string }) => void = payload => {
      emitToAll('employee-attendance:changed', payload);
    }
  ) {}

  async createManualSession(input: ManualAttendanceSessionInput, actor: AttendanceAdminActor) {
    const committed = await this.store.transaction(async tx => {
      await tx.lockEmployee(input.employeeId);
      const [employee, branch] = await Promise.all([tx.getEmployee(input.employeeId), tx.getBranch(input.branchId)]);
      if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên.', 'EMPLOYEE_NOT_FOUND');
      if (!branch) throw ApiError.notFound('Không tìm thấy chi nhánh.');
      const checkInAt = new Date(input.checkInAt);
      const checkOutAt = input.checkOutAt ? new Date(input.checkOutAt) : null;
      assertEmployeeDate(employee, checkInAt);
      if (checkOutAt && checkOutAt.getTime() < checkInAt.getTime()) {
        throw ApiError.badRequest('Giờ ra không thể trước giờ vào.', {}, 'ATTENDANCE_DATE_INVALID');
      }
      if (!checkOutAt && await tx.findOpenSession(input.employeeId)) {
        throw ApiError.conflict('Nhân viên đang có phiên chấm công chưa kết thúc.', 'ATTENDANCE_SESSION_ALREADY_OPEN');
      }
      const occurrence = input.scheduleRuleId === undefined
        ? null
        : await tx.getOccurrence(input.employeeId, input.branchId, input.scheduleRuleId, input.scheduleDate!);
      if (input.scheduleRuleId !== undefined && !occurrence) {
        throw ApiError.conflict('Ca lịch không còn áp dụng cho nhân viên, chi nhánh và ngày đã chọn.', 'SCHEDULE_NOT_AVAILABLE');
      }
      if (occurrence && await tx.findSessionForOccurrence(input.employeeId, input.branchId, occurrence.scheduleRuleId, occurrence.scheduleDate)) {
        throw ApiError.conflict('Occurrence này đã có phiên chấm công.', 'ATTENDANCE_OCCURRENCE_ALREADY_RECORDED');
      }
      const workDate = businessDateAt(checkInAt);
      const attendancePolicy = await tx.getEffectiveAttendancePolicy(input.branchId, workDate);
      if (!attendancePolicy) throw ApiError.internal('Chi nhánh chưa có chính sách chấm công hiệu lực.');
      const data = {
        employeeId: input.employeeId, branchId: input.branchId,
        checkInAt, checkOutAt, checkInSource: 'ADMIN_MANUAL' as const,
        checkOutSource: checkOutAt ? 'ADMIN_MANUAL' as const : null,
        checkInKioskSessionId: null, checkOutKioskSessionId: null,
        ...snapshotPatch(occurrence),
        ...policySnapshotPatch(attendancePolicy)
      };
      const created = await tx.createSession(data);
      await tx.audit(mutationAudit('EMPLOYEE_ATTENDANCE_MANUAL_CREATED', actor, 'EmployeeAttendanceSession', created.id, input.reason, null, serializeSession(created)));
      return { data: created, branchId: input.branchId, workDate: businessDateAt(checkInAt) };
    });
    this.notify(committed.branchId, committed.workDate, committed.workDate);
    return committed.data;
  }

  async updateSession(sessionId: number, input: AdminAttendanceSessionUpdateInput, actor: AttendanceAdminActor) {
    const committed = await this.store.transaction(async tx => {
      const initial = await tx.findSession(sessionId);
      if (!initial) throw ApiError.notFound('Không tìm thấy phiên chấm công.', 'ATTENDANCE_SESSION_NOT_FOUND');
      await tx.lockEmployee(initial.employeeId);
      const current = await tx.findSession(sessionId);
      if (!current) throw ApiError.notFound('Không tìm thấy phiên chấm công.', 'ATTENDANCE_SESSION_NOT_FOUND');
      const employee = await tx.getEmployee(current.employeeId);
      if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên.', 'EMPLOYEE_NOT_FOUND');
      const checkInAt = input.checkInAt === undefined ? current.checkInAt : new Date(input.checkInAt);
      const checkOutAt = input.checkOutAt === undefined ? current.checkOutAt : new Date(input.checkOutAt);
      assertEmployeeDate(employee, checkInAt);
      if (checkOutAt && checkOutAt.getTime() < checkInAt.getTime()) {
        throw ApiError.badRequest('Giờ ra không thể trước giờ vào.', {}, 'ATTENDANCE_DATE_INVALID');
      }
      if (!checkOutAt && await tx.findOpenSession(current.employeeId, current.id)) {
        throw ApiError.conflict('Nhân viên đang có một phiên chấm công mở khác.', 'ATTENDANCE_SESSION_ALREADY_OPEN');
      }

      let linkPatch: Record<string, unknown> = {};
      if (input.scheduleRuleId !== undefined) {
        const occurrence = input.scheduleRuleId === null
          ? null
          : await tx.getOccurrence(current.employeeId, current.branchId, input.scheduleRuleId, input.scheduleDate!);
        if (input.scheduleRuleId !== null && !occurrence) {
          throw ApiError.conflict('Ca lịch không còn áp dụng cho nhân viên, chi nhánh và ngày đã chọn.', 'SCHEDULE_NOT_AVAILABLE');
        }
        if (occurrence) {
          assertEmployeeWorkDate(employee, occurrence.scheduleDate);
          const duplicate = await tx.findSessionForOccurrence(current.employeeId, current.branchId, occurrence.scheduleRuleId, occurrence.scheduleDate);
          if (duplicate && duplicate.id !== current.id) {
            throw ApiError.conflict('Occurrence này đã có phiên chấm công.', 'ATTENDANCE_OCCURRENCE_ALREADY_RECORDED');
          }
        }
        linkPatch = snapshotPatch(occurrence);
      }
      let policyPatch: Record<string, unknown> = {};
      if (input.attendancePolicyVersionId !== undefined) {
        const policy = await tx.getAttendancePolicyVersion(input.attendancePolicyVersionId, current.branchId);
        if (!policy) throw ApiError.conflict('Phiên bản chính sách chấm công không thuộc chi nhánh này.', 'EMPLOYEE_SETTINGS_VALUE_INVALID');
        policyPatch = policySnapshotPatch(policy);
      }
      const update = {
        checkInAt, checkOutAt,
        ...(input.checkInAt !== undefined ? { checkInSource: 'ADMIN_MANUAL' as const, checkInKioskSessionId: null } : {}),
        ...(input.checkOutAt !== undefined ? { checkOutSource: 'ADMIN_MANUAL' as const, checkOutKioskSessionId: null } : {}),
        ...linkPatch,
        ...policyPatch
      };
      const saved = await tx.updateSession(current.id, update);
      await tx.audit(mutationAudit('EMPLOYEE_ATTENDANCE_SESSION_UPDATED', actor, 'EmployeeAttendanceSession', saved.id, input.reason, serializeSession(current), serializeSession(saved)));
      const dates = [
        businessDateAt(current.checkInAt), businessDateAt(checkInAt),
        ...(current.scheduleDate ? [isoDate(current.scheduleDate)] : []),
        ...(input.scheduleDate && input.scheduleRuleId ? [input.scheduleDate] : [])
      ].sort();
      return { data: saved, branchId: current.branchId, changedFrom: dates[0], changedThrough: dates[dates.length - 1] };
    });
    this.notify(committed.branchId, committed.changedFrom, committed.changedThrough);
    return committed.data;
  }

  async markAbsent(scheduleRuleId: number, workDate: string, input: MarkAttendanceAbsentInput, actor: AttendanceAdminActor) {
    const committed = await this.store.transaction(async tx => {
      const initial = await tx.getOccurrenceOwner(scheduleRuleId, input.branchId, workDate);
      if (!initial) throw ApiError.conflict('Ca lịch không còn áp dụng cho chi nhánh và ngày đã chọn.', 'SCHEDULE_NOT_AVAILABLE');
      await tx.lockEmployee(initial.employeeId);
      const occurrence = await tx.getOccurrence(initial.employeeId, input.branchId, scheduleRuleId, workDate);
      if (!occurrence) throw ApiError.conflict('Ca lịch không còn áp dụng cho chi nhánh và ngày đã chọn.', 'SCHEDULE_NOT_AVAILABLE');
      const now = this.serverNow();
      if (now.getTime() <= plannedEndAt(workDate, occurrence.plannedEndMinute).getTime()) {
        throw ApiError.conflict('Chỉ xác nhận vắng mặt sau khi ca đã kết thúc.', 'ATTENDANCE_SHIFT_NOT_ENDED');
      }
      const existing = await tx.findDispositionForOccurrence(input.branchId, scheduleRuleId, workDate);
      if (existing && existing.revokedAt === null) {
        throw ApiError.conflict('Ca này đã được xác nhận vắng mặt.', 'ATTENDANCE_ABSENCE_ALREADY_CONFIRMED');
      }
      const before = serializeDisposition(existing);
      const saved = existing
        ? await tx.updateDisposition(existing.id, { reason: input.reason, actorId: actor.id, createdAt: now, revokedAt: null, revokedByUserId: null })
        : await tx.createDisposition({
          branchId: input.branchId, employeeId: occurrence.employeeId, scheduleRuleId,
          workDate: dateFromIso(workDate), type: 'ABSENT', reason: input.reason, actorId: actor.id
        });
      await tx.audit(mutationAudit('EMPLOYEE_ATTENDANCE_ABSENCE_CONFIRMED', actor, 'EmployeeAttendanceDisposition', saved.id, input.reason, before, serializeDisposition(saved)));
      return { data: saved, branchId: input.branchId, workDate };
    });
    this.notify(committed.branchId, committed.workDate, committed.workDate);
    return committed.data;
  }

  async resolveAbsenceConflict(dispositionId: number, input: DispositionRevokeInput, actor: AttendanceAdminActor) {
    const committed = await this.store.transaction(async tx => {
      const initial = await tx.findDisposition(dispositionId);
      if (!initial) throw ApiError.notFound('Không tìm thấy quyết định vắng mặt.', 'ATTENDANCE_DISPOSITION_NOT_FOUND');
      await tx.lockEmployee(initial.employeeId);
      const current = await tx.findDisposition(dispositionId);
      if (!current) throw ApiError.notFound('Không tìm thấy quyết định vắng mặt.', 'ATTENDANCE_DISPOSITION_NOT_FOUND');
      if (current.revokedAt) throw ApiError.conflict('Quyết định vắng mặt đã được gỡ.', 'ATTENDANCE_DISPOSITION_ALREADY_REVOKED');
      const session = await tx.findSessionForOccurrence(current.employeeId, current.branchId, current.scheduleRuleId, isoDate(current.workDate));
      if (!session) throw ApiError.conflict('Không có phiên chấm công thực tế để giải quyết xung đột.', 'ATTENDANCE_DISPOSITION_HAS_NO_SESSION');
      const now = this.serverNow();
      const saved = await tx.updateDisposition(current.id, { revokedAt: now, revokedByUserId: actor.id });
      await tx.audit(mutationAudit('EMPLOYEE_ATTENDANCE_ABSENCE_REVOKED', actor, 'EmployeeAttendanceDisposition', saved.id, input.reason, serializeDisposition(current), serializeDisposition(saved)));
      return { data: saved, branchId: current.branchId, workDate: isoDate(current.workDate) };
    });
    this.notify(committed.branchId, committed.workDate, committed.workDate);
    return committed.data;
  }

  private notify(branchId: number, changedFrom: string, changedThrough: string) {
    this.emitChanged({ branchId, changedFrom, changedThrough, updatedAt: this.serverNow().toISOString() });
  }
}

class PrismaAttendanceAdminTransaction implements AttendanceAdminTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async lockEmployee(employeeId: number) { await lockEmployeeRows(this.tx, [employeeId]); }

  async getEmployee(employeeId: number) {
    return this.tx.employee.findUnique({ where: { id: employeeId }, select: { id: true, status: true, startDate: true, endDate: true } }) as Promise<AttendanceAdminEmployee | null>;
  }

  async getBranch(branchId: number) {
    return this.tx.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  }

  async getOccurrenceOwner(scheduleRuleId: number, branchId: number, _workDate: string) {
    return this.tx.employeeScheduleRule.findFirst({
      where: { id: scheduleRuleId, branchId, cancelledAt: null },
      select: { employeeId: true }
    });
  }

  async getOccurrence(employeeId: number, branchId: number, scheduleRuleId: number, workDate: string): Promise<AttendanceOccurrence | null> {
    const weekBounds = getBusinessWeekBounds(workDate);
    const rule = await this.tx.employeeScheduleRule.findFirst({
      where: { id: scheduleRuleId, employeeId, branchId, cancelledAt: null },
      include: {
        shift: { select: { name: true, startMinute: true, endMinute: true } },
        exceptions: { where: { workDate: dateFromIso(workDate), type: 'CANCELLED' }, select: { scheduleRuleId: true, workDate: true, type: true } }
      }
    });
    if (!rule) return null;
    const attendanceRule = toRule(rule);
    const exceptions: AttendanceScheduleException[] = rule.exceptions.map(exception => ({
      scheduleRuleId: exception.scheduleRuleId, workDate: isoDate(exception.workDate), type: exception.type
    }));
    return expandAttendanceOccurrences({ weekStart: weekBounds.weekStart, rules: [attendanceRule], exceptions, branchId, employeeId })
      .find(occurrence => occurrence.scheduleRuleId === scheduleRuleId && occurrence.scheduleDate === workDate) ?? null;
  }

  async getEffectiveAttendancePolicy(branchId: number, workDate: string) {
    return getEffectiveAttendancePolicy(this.tx, branchId, workDate) as Promise<AttendanceAdminPolicy | null>;
  }

  async getAttendancePolicyVersion(policyVersionId: number, branchId: number) {
    return this.tx.branchAttendancePolicyVersion.findFirst({
      where: { id: policyVersionId, branchId }
    }) as Promise<AttendanceAdminPolicy | null>;
  }

  async findOpenSession(employeeId: number, exceptSessionId?: number) {
    return this.tx.employeeAttendanceSession.findFirst({
      where: { employeeId, checkOutAt: null, ...(exceptSessionId === undefined ? {} : { id: { not: exceptSessionId } }) },
      select: { id: true }, orderBy: [{ checkInAt: 'asc' }, { id: 'asc' }]
    });
  }

  async findSession(sessionId: number) {
    return this.tx.employeeAttendanceSession.findUnique({ where: { id: sessionId } }) as Promise<AttendanceAdminSession | null>;
  }

  async findSessionForOccurrence(employeeId: number, branchId: number, scheduleRuleId: number, workDate: string) {
    return this.tx.employeeAttendanceSession.findFirst({
      where: { employeeId, branchId, scheduleRuleId, scheduleDate: dateFromIso(workDate) }, orderBy: { checkInAt: 'asc' }
    }) as Promise<AttendanceAdminSession | null>;
  }

  async findDispositionForOccurrence(branchId: number, scheduleRuleId: number, workDate: string) {
    return this.tx.employeeAttendanceDisposition.findUnique({
      where: { branchId_scheduleRuleId_workDate: { branchId, scheduleRuleId, workDate: dateFromIso(workDate) } }
    }) as Promise<AttendanceAdminDisposition | null>;
  }

  async findDisposition(dispositionId: number) {
    return this.tx.employeeAttendanceDisposition.findUnique({ where: { id: dispositionId } }) as Promise<AttendanceAdminDisposition | null>;
  }

  async createSession(data: Record<string, unknown>) {
    return this.tx.employeeAttendanceSession.create({ data: data as Prisma.EmployeeAttendanceSessionUncheckedCreateInput });
  }

  async updateSession(sessionId: number, data: Record<string, unknown>) {
    return this.tx.employeeAttendanceSession.update({ where: { id: sessionId }, data: data as Prisma.EmployeeAttendanceSessionUncheckedUpdateInput });
  }

  async createDisposition(data: Record<string, unknown>) {
    return this.tx.employeeAttendanceDisposition.create({ data: data as Prisma.EmployeeAttendanceDispositionUncheckedCreateInput });
  }

  async updateDisposition(dispositionId: number, data: Record<string, unknown>) {
    return this.tx.employeeAttendanceDisposition.update({ where: { id: dispositionId }, data: data as Prisma.EmployeeAttendanceDispositionUncheckedUpdateInput });
  }

  async audit(input: LogAuditInput) { await AuditService.logInTransaction(this.tx, input); }
}

export class PrismaAttendanceAdminStore implements AttendanceAdminStore {
  constructor(private readonly prisma: PrismaClient) {}

  async transaction<T>(work: (tx: AttendanceAdminTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async tx => work(new PrismaAttendanceAdminTransaction(tx)));
  }
}
