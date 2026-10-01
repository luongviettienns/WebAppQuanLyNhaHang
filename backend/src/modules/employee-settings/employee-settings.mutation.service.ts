import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError, ErrorCode } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import { businessDateAt } from '../employee-attendance/attendance-domain';
import { dateRangesOverlap, EmployeeSettingsDomainError, validateHolidayPeriod } from './employee-settings.domain';
import { employeeSettingsDateOnly, resolveAccessibleMainBranch } from './employee-settings.policy-reader';
import type {
  AttendancePolicyCreateInput,
  HolidayArchiveInput,
  HolidayCreateInput,
  HolidayUpdateInput,
  PayrollPolicyCreateInput,
  WorkweekPolicyCreateInput
} from './employee-settings.schemas';

export interface EmployeeSettingsActor { id: number; name?: string | null }
type SettingsArea = 'attendance' | 'payroll' | 'workweek' | 'holiday';

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function serializeHoliday(value: {
  id: number; branchId: number; name: string; startDate: Date; endDate: Date; note: string | null;
  revision: number; archivedAt: Date | null; archivedByUserId: number | null;
}) {
  return {
    id: value.id, branchId: value.branchId, name: value.name,
    startDate: isoDate(value.startDate), endDate: isoDate(value.endDate), note: value.note,
    revision: value.revision, archivedAt: value.archivedAt?.toISOString() ?? null,
    archivedByUserId: value.archivedByUserId
  };
}

async function lockRevision(tx: Prisma.TransactionClient, branchId: number) {
  await tx.$queryRaw`SELECT branchId FROM BranchEmployeeSettingsRevision WHERE branchId = ${branchId} FOR UPDATE`;
  return tx.branchEmployeeSettingsRevision.findUniqueOrThrow({ where: { branchId } });
}

function assertRevision(actual: number, expected: number, code: 'EMPLOYEE_SETTINGS_REVISION_CONFLICT' | 'EMPLOYEE_HOLIDAY_REVISION_CONFLICT' = 'EMPLOYEE_SETTINGS_REVISION_CONFLICT') {
  if (actual !== expected) {
    throw ApiError.conflict('Dữ liệu thiết lập đã thay đổi. Vui lòng tải lại trước khi lưu.', code, {
      expectedRevision: String(expected), currentRevision: String(actual)
    });
  }
}

function mapPersistenceError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof EmployeeSettingsDomainError) {
    throw new ApiError(422, error.code as ErrorCode, error.message);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw ApiError.conflict('Ngày hiệu lực của chính sách đã tồn tại.', 'EMPLOYEE_SETTINGS_VERSION_DUPLICATE');
    }
    if (error.code === 'P2034') {
      throw ApiError.conflict('Thiết lập vừa được thay đổi bởi yêu cầu khác.', 'EMPLOYEE_SETTINGS_REVISION_CONFLICT');
    }
  }
  throw error;
}

function validateHolidayMutation(input: { name: string; startDate: string; endDate: string; note?: string | null }) {
  try {
    return validateHolidayPeriod(input);
  } catch (error) {
    mapPersistenceError(error);
  }
}

function notify(area: SettingsArea, branchId: number, revision: number, details: Record<string, unknown>) {
  emitToAll('employee-settings:changed', {
    branchId,
    settingsArea: area,
    revision,
    eventRevision: `${area}:${revision}`,
    updatedAt: new Date().toISOString(),
    ...details
  });
}

export class EmployeeSettingsMutationService {
  static async createAttendancePolicy(input: AttendancePolicyCreateInput, actor: EmployeeSettingsActor) {
    try {
      const policy = await prisma.$transaction(async tx => {
        const branch = await resolveAccessibleMainBranch(tx, input.branchId);
        const revisions = await lockRevision(tx, branch.id);
        assertRevision(revisions.attendanceRevision, input.expectedAreaRevision);
        const effectiveFrom = employeeSettingsDateOnly(input.effectiveFrom);
        if (await tx.branchAttendancePolicyVersion.findUnique({ where: { branchId_effectiveFrom: { branchId: branch.id, effectiveFrom } } })) {
          throw ApiError.conflict('Ngày hiệu lực của chính sách đã tồn tại.', 'EMPLOYEE_SETTINGS_VERSION_DUPLICATE');
        }
        const revision = revisions.attendanceRevision + 1;
        const created = await tx.branchAttendancePolicyVersion.create({
          data: {
            branchId: branch.id, effectiveFrom, revision, attendanceMode: input.attendanceMode,
            standardDayMinutes: input.standardDayMinutes, lateThresholdMinutes: input.lateThresholdMinutes,
            earlyLeaveThresholdMinutes: input.earlyLeaveThresholdMinutes,
            allowUnscheduledAttendance: input.allowUnscheduledAttendance, createdByUserId: actor.id
          }
        });
        await tx.branchEmployeeSettingsRevision.update({ where: { branchId: branch.id }, data: { attendanceRevision: revision } });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_ATTENDANCE_POLICY_CREATED', targetType: 'BranchAttendancePolicyVersion',
          targetId: created.id, actorId: actor.id, actorName: actor.name ?? null,
          metadata: { branchId: branch.id, revision, effectiveFrom: input.effectiveFrom, after: created }
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      notify('attendance', policy.branchId, policy.revision, { effectiveFrom: isoDate(policy.effectiveFrom) });
      return policy;
    } catch (error) { mapPersistenceError(error); }
  }

  static async createPayrollPolicy(input: PayrollPolicyCreateInput, actor: EmployeeSettingsActor) {
    try {
      const policy = await prisma.$transaction(async tx => {
        const branch = await resolveAccessibleMainBranch(tx, input.branchId);
        const revisions = await lockRevision(tx, branch.id);
        assertRevision(revisions.payrollRevision, input.expectedAreaRevision);
        const effectiveFrom = employeeSettingsDateOnly(input.effectiveFrom);
        if (await tx.branchPayrollPolicyVersion.findUnique({ where: { branchId_effectiveFrom: { branchId: branch.id, effectiveFrom } } })) {
          throw ApiError.conflict('Ngày hiệu lực của chính sách đã tồn tại.', 'EMPLOYEE_SETTINGS_VERSION_DUPLICATE');
        }
        const revision = revisions.payrollRevision + 1;
        const created = await tx.branchPayrollPolicyVersion.create({
          data: {
            branchId: branch.id, effectiveFrom, revision, frequency: input.frequency,
            periodStartDay: input.periodStartDay, hourlyCalculationSource: input.hourlyCalculationSource,
            createdByUserId: actor.id
          }
        });
        await tx.branchEmployeeSettingsRevision.update({ where: { branchId: branch.id }, data: { payrollRevision: revision } });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_PAYROLL_POLICY_CREATED', targetType: 'BranchPayrollPolicyVersion',
          targetId: created.id, actorId: actor.id, actorName: actor.name ?? null,
          metadata: { branchId: branch.id, revision, effectiveFrom: input.effectiveFrom, after: created }
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      notify('payroll', policy.branchId, policy.revision, { effectiveFrom: isoDate(policy.effectiveFrom) });
      return policy;
    } catch (error) { mapPersistenceError(error); }
  }

  static async createWorkweekPolicy(input: WorkweekPolicyCreateInput, actor: EmployeeSettingsActor) {
    try {
      const policy = await prisma.$transaction(async tx => {
        const branch = await resolveAccessibleMainBranch(tx, input.branchId);
        const revisions = await lockRevision(tx, branch.id);
        assertRevision(revisions.workweekRevision, input.expectedAreaRevision);
        const effectiveFrom = employeeSettingsDateOnly(input.effectiveFrom);
        if (await tx.branchWorkweekPolicyVersion.findUnique({ where: { branchId_effectiveFrom: { branchId: branch.id, effectiveFrom } } })) {
          throw ApiError.conflict('Ngày hiệu lực của chính sách đã tồn tại.', 'EMPLOYEE_SETTINGS_VERSION_DUPLICATE');
        }
        const revision = revisions.workweekRevision + 1;
        const created = await tx.branchWorkweekPolicyVersion.create({
          data: {
            branchId: branch.id, effectiveFrom, revision,
            monday: input.monday, tuesday: input.tuesday, wednesday: input.wednesday,
            thursday: input.thursday, friday: input.friday, saturday: input.saturday, sunday: input.sunday,
            createdByUserId: actor.id
          }
        });
        await tx.branchEmployeeSettingsRevision.update({ where: { branchId: branch.id }, data: { workweekRevision: revision } });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_WORKWEEK_POLICY_CREATED', targetType: 'BranchWorkweekPolicyVersion',
          targetId: created.id, actorId: actor.id, actorName: actor.name ?? null,
          metadata: { branchId: branch.id, revision, effectiveFrom: input.effectiveFrom, after: created }
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      notify('workweek', policy.branchId, policy.revision, { effectiveFrom: isoDate(policy.effectiveFrom) });
      return policy;
    } catch (error) { mapPersistenceError(error); }
  }

  static async createHoliday(input: HolidayCreateInput, actor: EmployeeSettingsActor) {
    const committed = await prisma.$transaction(async tx => {
      const branch = await resolveAccessibleMainBranch(tx, input.branchId);
      const revisions = await lockRevision(tx, branch.id);
      assertRevision(revisions.holidayRevision, input.expectedHolidayRevision, 'EMPLOYEE_HOLIDAY_REVISION_CONFLICT');
      const overlapping = await tx.branchHolidayPeriod.findFirst({
        where: {
          branchId: branch.id, archivedAt: null,
          startDate: { lte: employeeSettingsDateOnly(input.endDate) },
          endDate: { gte: employeeSettingsDateOnly(input.startDate) }
        }
      });
      if (overlapping) throw ApiError.conflict('Khoảng nghỉ/lễ bị chồng với kỳ đã tồn tại.', 'EMPLOYEE_HOLIDAY_OVERLAP');
      const collectionRevision = revisions.holidayRevision + 1;
      const holiday = await tx.branchHolidayPeriod.create({
        data: {
          branchId: branch.id, name: input.name, startDate: employeeSettingsDateOnly(input.startDate),
          endDate: employeeSettingsDateOnly(input.endDate), note: input.note ?? null, createdByUserId: actor.id
        }
      });
      await tx.branchEmployeeSettingsRevision.update({ where: { branchId: branch.id }, data: { holidayRevision: collectionRevision } });
      await AuditService.logInTransaction(tx, {
        action: 'EMPLOYEE_HOLIDAY_CREATED', targetType: 'BranchHolidayPeriod', targetId: holiday.id,
        actorId: actor.id, actorName: actor.name ?? null,
        metadata: { branchId: branch.id, collectionRevision, before: null, after: serializeHoliday(holiday) }
      });
      return { holiday, collectionRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    notify('holiday', committed.holiday.branchId, committed.collectionRevision, {
      holidayId: committed.holiday.id,
      range: { from: isoDate(committed.holiday.startDate), to: isoDate(committed.holiday.endDate) }
    });
    return committed;
  }

  static async updateHoliday(holidayId: number, input: HolidayUpdateInput, actor: EmployeeSettingsActor, now = new Date()) {
    const committed = await prisma.$transaction(async tx => {
      const branch = await resolveAccessibleMainBranch(tx, input.branchId);
      const revisions = await lockRevision(tx, branch.id);
      assertRevision(revisions.holidayRevision, input.expectedHolidayRevision, 'EMPLOYEE_HOLIDAY_REVISION_CONFLICT');
      const current = await tx.branchHolidayPeriod.findFirst({ where: { id: holidayId, branchId: branch.id } });
      if (!current) throw ApiError.notFound('Không tìm thấy kỳ nghỉ/lễ.', 'EMPLOYEE_HOLIDAY_NOT_FOUND');
      if (current.archivedAt) throw ApiError.conflict('Kỳ nghỉ/lễ đã được lưu trữ.', 'EMPLOYEE_HOLIDAY_ARCHIVED');
      if (current.revision !== input.expectedRowRevision) {
        throw ApiError.conflict('Kỳ nghỉ/lễ vừa được chỉnh sửa.', 'EMPLOYEE_HOLIDAY_REVISION_CONFLICT');
      }
      const currentStart = isoDate(current.startDate);
      const currentEnd = isoDate(current.endDate);
      const next = validateHolidayMutation({
        name: input.name ?? current.name,
        startDate: input.startDate ?? currentStart,
        endDate: input.endDate ?? currentEnd,
        note: input.note === undefined ? current.note : input.note
      });
      const started = currentStart <= businessDateAt(now);
      const changesDateRange = next.startDate !== currentStart || next.endDate !== currentEnd;
      if (started && changesDateRange) {
        throw ApiError.conflict('Không thể đổi khoảng ngày của kỳ nghỉ/lễ đã bắt đầu.', 'EMPLOYEE_HOLIDAY_HISTORY_LOCKED');
      }
      if (started && !input.reason) {
        throw ApiError.conflict('Hiệu chỉnh kỳ nghỉ/lễ lịch sử phải có lý do.', 'EMPLOYEE_HOLIDAY_HISTORY_LOCKED');
      }
      const candidates = await tx.branchHolidayPeriod.findMany({
        where: { branchId: branch.id, archivedAt: null, id: { not: current.id } },
        select: { id: true, startDate: true, endDate: true }
      });
      if (candidates.some(candidate => dateRangesOverlap(next.startDate, next.endDate, isoDate(candidate.startDate), isoDate(candidate.endDate)))) {
        throw ApiError.conflict('Khoảng nghỉ/lễ bị chồng với kỳ đã tồn tại.', 'EMPLOYEE_HOLIDAY_OVERLAP');
      }
      const collectionRevision = revisions.holidayRevision + 1;
      const holiday = await tx.branchHolidayPeriod.update({
        where: { id: current.id },
        data: {
          name: next.name, startDate: employeeSettingsDateOnly(next.startDate),
          endDate: employeeSettingsDateOnly(next.endDate), note: next.note, revision: current.revision + 1
        }
      });
      await tx.branchEmployeeSettingsRevision.update({ where: { branchId: branch.id }, data: { holidayRevision: collectionRevision } });
      await AuditService.logInTransaction(tx, {
        action: started ? 'EMPLOYEE_HOLIDAY_CORRECTED' : 'EMPLOYEE_HOLIDAY_UPDATED',
        targetType: 'BranchHolidayPeriod', targetId: holiday.id, actorId: actor.id, actorName: actor.name ?? null,
        metadata: { reason: input.reason ?? null, collectionRevision, before: serializeHoliday(current), after: serializeHoliday(holiday) }
      });
      return { holiday, collectionRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    notify('holiday', committed.holiday.branchId, committed.collectionRevision, {
      holidayId: committed.holiday.id,
      range: { from: isoDate(committed.holiday.startDate), to: isoDate(committed.holiday.endDate) }
    });
    return committed;
  }

  static async archiveHoliday(holidayId: number, input: HolidayArchiveInput, actor: EmployeeSettingsActor, now = new Date()) {
    const committed = await prisma.$transaction(async tx => {
      const branch = await resolveAccessibleMainBranch(tx, input.branchId);
      const revisions = await lockRevision(tx, branch.id);
      assertRevision(revisions.holidayRevision, input.expectedHolidayRevision, 'EMPLOYEE_HOLIDAY_REVISION_CONFLICT');
      const current = await tx.branchHolidayPeriod.findFirst({ where: { id: holidayId, branchId: branch.id } });
      if (!current) throw ApiError.notFound('Không tìm thấy kỳ nghỉ/lễ.', 'EMPLOYEE_HOLIDAY_NOT_FOUND');
      if (current.archivedAt) throw ApiError.conflict('Kỳ nghỉ/lễ đã được lưu trữ.', 'EMPLOYEE_HOLIDAY_ARCHIVED');
      if (current.revision !== input.expectedRowRevision) {
        throw ApiError.conflict('Kỳ nghỉ/lễ vừa được chỉnh sửa.', 'EMPLOYEE_HOLIDAY_REVISION_CONFLICT');
      }
      if (isoDate(current.startDate) <= businessDateAt(now)) {
        throw ApiError.conflict('Không thể lưu trữ kỳ nghỉ/lễ đã bắt đầu.', 'EMPLOYEE_HOLIDAY_HISTORY_LOCKED');
      }
      const collectionRevision = revisions.holidayRevision + 1;
      const holiday = await tx.branchHolidayPeriod.update({
        where: { id: current.id },
        data: { archivedAt: now, archivedByUserId: actor.id, revision: current.revision + 1 }
      });
      await tx.branchEmployeeSettingsRevision.update({ where: { branchId: branch.id }, data: { holidayRevision: collectionRevision } });
      await AuditService.logInTransaction(tx, {
        action: 'EMPLOYEE_HOLIDAY_ARCHIVED', targetType: 'BranchHolidayPeriod', targetId: holiday.id,
        actorId: actor.id, actorName: actor.name ?? null,
        metadata: { reason: input.reason, collectionRevision, before: serializeHoliday(current), after: serializeHoliday(holiday) }
      });
      return { holiday, collectionRevision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    notify('holiday', committed.holiday.branchId, committed.collectionRevision, {
      holidayId: committed.holiday.id,
      range: { from: isoDate(committed.holiday.startDate), to: isoDate(committed.holiday.endDate) }
    });
    return committed;
  }
}
