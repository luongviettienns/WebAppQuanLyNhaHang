import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import {
  estimateWeeklyCompensation,
  expandRulesForWeek,
  findRuleConflict,
  ScheduleDomainError,
  validateScheduleRule,
  type ScheduleException,
  type ScheduleRule
} from './schedule-domain';
import type { CreateScheduleBatchInput, CreateWorkShiftInput, ScheduleDeleteInput, ScheduleMutationInput, ScheduleWeekQuery } from './employee-schedules.schemas';

const dateFromIso = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const isoDateTime = (value: Date | null) => value?.toISOString() ?? null;
async function resolveMainBranchId(client: Pick<Prisma.TransactionClient, 'branch'>): Promise<number> {
  const branch = await client.branch.findUnique({ where: { code: 'MAIN' }, select: { id: true } });
  if (!branch) throw ApiError.internal('Chưa khởi tạo chi nhánh mặc định MAIN.');
  return branch.id;
}
const addDays = (value: string, count: number) => {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
function toScheduleRule(rule: {
  id: number;
  employeeId: number;
  shiftId: number;
  recurrenceType: 'ONCE' | 'WEEKLY';
  startDate: Date;
  endDate: Date | null;
  dayOfWeek: number | null;
  cancelledAt: Date | null;
  shift: { code: string; name: string; startMinute: number; endMinute: number };
  exceptions: Array<{ workDate: Date; type: 'CANCELLED' }>;
}): ScheduleRule {
  return {
    id: rule.id,
    employeeId: rule.employeeId,
    shiftId: rule.shiftId,
    recurrenceType: rule.recurrenceType,
    startDate: isoDate(rule.startDate)!,
    endDate: isoDate(rule.endDate),
    dayOfWeek: rule.dayOfWeek,
    cancelledAt: isoDateTime(rule.cancelledAt),
    shift: rule.shift,
    exceptions: rule.exceptions.map(exception => ({ workDate: isoDate(exception.workDate)!, type: exception.type }))
  };
}

export function emitScheduleChanged(employeeIds: number[] = [], changedFrom: string | null = null, changedThrough: string | null = null) {
  emitToAll('employee-schedules:changed', { employeeIds, changedFrom, changedThrough, updatedAt: new Date().toISOString() });
}

export async function lockEmployeeRows(tx: Prisma.TransactionClient, employeeIds: number[]) {
  const sortedIds = [...new Set(employeeIds)].sort((left, right) => left - right);
  if (sortedIds.length) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM Employee WHERE id IN (${Prisma.join(sortedIds)}) ORDER BY id FOR UPDATE`);
  }
}

function todayInBusinessTimezone() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function weekStartForDate(value: string) {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function ensureNotPast(workDate: string) {
  if (workDate < todayInBusinessTimezone()) {
    throw ApiError.badRequest('Không thể sửa hoặc xóa lịch trong quá khứ', { workDate }, 'SCHEDULE_DATE_INVALID');
  }
}

interface ScheduleDraft {
  employeeId: number;
  employeeCode?: string;
  shiftId: number;
  shiftCode?: string;
  startDate: string;
  endDate: string | null;
  recurrenceType: 'ONCE' | 'WEEKLY';
  dayOfWeek: number | null;
  rowNumber?: number;
}

function draftErrorDetails(draft: ScheduleDraft, extra: Record<string, string> = {}) {
  return {
    ...(draft.employeeCode ? { employeeCode: draft.employeeCode } : { employeeId: String(draft.employeeId) }),
    ...(draft.shiftCode ? { shiftCode: draft.shiftCode } : { shiftId: String(draft.shiftId) }),
    workDate: draft.startDate,
    ...(draft.rowNumber ? { rowNumber: String(draft.rowNumber) } : {}),
    ...extra
  };
}

async function createScheduleDraftsInTransaction(
  tx: Prisma.TransactionClient,
  drafts: ScheduleDraft[],
  actor: { id: number; name: string }
) {
  if (drafts.length === 0) return [];
  const employeeIds = [...new Set(drafts.map(draft => draft.employeeId))].sort((left, right) => left - right);
  const shiftIds = [...new Set(drafts.map(draft => draft.shiftId))].sort((left, right) => left - right);
  await lockEmployeeRows(tx, employeeIds);
  const branchId = await resolveMainBranchId(tx);

  const employees = await tx.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, code: true, status: true, startDate: true, endDate: true }
  });
  const employeesById = new Map(employees.map(employee => [employee.id, employee]));
  const shifts = await tx.workShift.findMany({ where: { id: { in: shiftIds } } });
  const shiftsById = new Map(shifts.map(shift => [shift.id, shift]));

  for (const draft of drafts) {
    const employee = employeesById.get(draft.employeeId);
    if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên', 'EMPLOYEE_NOT_FOUND', draftErrorDetails(draft));
    if (employee.status !== 'WORKING') {
      throw ApiError.conflict('Nhân viên không còn làm việc', 'EMPLOYEE_NOT_WORKING', draftErrorDetails(draft, { employeeCode: employee.code }));
    }
    const shift = shiftsById.get(draft.shiftId);
    if (!shift) throw ApiError.notFound('Không tìm thấy ca làm việc', 'SHIFT_NOT_FOUND', draftErrorDetails(draft));
    if (!shift.isActive) throw ApiError.conflict('Ca làm việc đã ngừng hoạt động', 'SHIFT_INACTIVE', draftErrorDetails(draft, { shiftCode: shift.code }));

    try {
      validateScheduleRule({
        recurrenceType: draft.recurrenceType,
        startDate: draft.startDate,
        endDate: draft.endDate,
        dayOfWeek: draft.dayOfWeek,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute
      });
    } catch (error) {
      if (error instanceof ScheduleDomainError) throw ApiError.badRequest(error.message, draftErrorDetails(draft), error.code);
      throw error;
    }
    if (employee.startDate && dateFromIso(draft.startDate) < employee.startDate) {
      throw ApiError.conflict('Ngày lịch nằm trước ngày bắt đầu làm việc', 'EMPLOYEE_NOT_WORKING', draftErrorDetails(draft, { employeeCode: employee.code }));
    }
    if (employee.endDate && draft.recurrenceType === 'WEEKLY' && (!draft.endDate || dateFromIso(draft.endDate) > employee.endDate)) {
      throw ApiError.conflict('Lịch vượt quá ngày làm việc cuối cùng của nhân viên', 'EMPLOYEE_NOT_WORKING', draftErrorDetails(draft, { employeeCode: employee.code, endDate: isoDate(employee.endDate)! }));
    }
    if (employee.endDate && dateFromIso(draft.startDate) > employee.endDate) {
      throw ApiError.conflict('Ngày lịch sau ngày làm việc cuối cùng', 'EMPLOYEE_NOT_WORKING', draftErrorDetails(draft, { employeeCode: employee.code }));
    }
  }

  const existingRulesRaw = await tx.employeeScheduleRule.findMany({
    where: { employeeId: { in: employeeIds }, branchId },
    include: { shift: { select: { code: true, name: true, startMinute: true, endMinute: true } }, exceptions: { select: { workDate: true, type: true } } }
  });
  const existingRules = existingRulesRaw.map(toScheduleRule);
  const candidates: Array<{ draft: ScheduleDraft; index: number; rule: ScheduleRule }> = [];
  for (const [index, draft] of drafts.entries()) {
    const employee = employeesById.get(draft.employeeId)!;
    const shift = shiftsById.get(draft.shiftId)!;
    const candidate: ScheduleRule = {
      id: -(index + 1),
      employeeId: draft.employeeId,
      shiftId: draft.shiftId,
      recurrenceType: draft.recurrenceType,
      startDate: draft.startDate,
      endDate: draft.endDate,
      dayOfWeek: draft.dayOfWeek,
      cancelledAt: null,
      shift: { code: shift.code, name: shift.name, startMinute: shift.startMinute, endMinute: shift.endMinute },
      exceptions: []
    };
    const priorCandidates = candidates.map(candidateRow => candidateRow.rule);
    const conflict = findRuleConflict(candidate, [...existingRules, ...priorCandidates]);
    if (conflict) {
      const conflictingCandidate = candidates.find(candidateRow => -(candidateRow.index + 1) === conflict.conflictingRuleId);
      const conflictingShiftCode = shiftsById.get(conflict.conflictingShiftId)?.code
        ?? existingRulesRaw.find(existing => existing.shiftId === conflict.conflictingShiftId)?.shift.code
        ?? '';
      throw ApiError.conflict(
        conflict.code === 'SCHEDULE_DUPLICATE' ? 'Nhân viên đã có lịch cho ca này' : 'Khung giờ ca bị chồng lấn',
        conflict.code,
        draftErrorDetails(draft, {
          employeeCode: employee.code,
          workDate: conflict.workDate,
          shiftCode: shift.code,
          conflictingShiftCode,
          ...(conflictingCandidate?.draft.rowNumber ? { conflictingRowNumber: String(conflictingCandidate.draft.rowNumber) } : {})
        })
      );
    }
    candidates.push({ draft, index, rule: candidate });
  }

  const createdRules = [];
  for (const { draft, rule: candidate } of candidates) {
    const created = await tx.employeeScheduleRule.create({
      data: {
        employeeId: draft.employeeId,
        branchId,
        shiftId: draft.shiftId,
        recurrenceType: draft.recurrenceType,
        startDate: dateFromIso(draft.startDate),
        endDate: draft.endDate ? dateFromIso(draft.endDate) : null,
        dayOfWeek: draft.dayOfWeek,
        createdByUserId: actor.id
      }
    });
    await AuditService.logInTransaction(tx, {
      action: 'EMPLOYEE_SCHEDULE_CREATED',
      targetType: 'EmployeeScheduleRule',
      targetId: created.id,
      actorId: actor.id,
      actorName: actor.name,
      metadata: {
        employeeId: draft.employeeId,
        employeeCode: draft.employeeCode ?? employeesById.get(draft.employeeId)!.code,
        shiftCode: draft.shiftCode ?? candidate.shift.code,
        recurrenceType: draft.recurrenceType,
        startDate: draft.startDate,
        endDate: draft.endDate,
        dayOfWeek: draft.dayOfWeek,
        ...(draft.rowNumber ? { rowNumber: draft.rowNumber } : {})
      }
    });
    createdRules.push({
      id: created.id,
      employeeId: created.employeeId,
      shiftId: created.shiftId,
      recurrenceType: created.recurrenceType,
      startDate: isoDate(created.startDate),
      endDate: isoDate(created.endDate),
      dayOfWeek: created.dayOfWeek
    });
  }
  return createdRules;
}

export class EmployeeSchedulesService {
  static async listShifts() {
    return prisma.workShift.findMany({
      orderBy: [{ isActive: 'desc' }, { startMinute: 'asc' }, { name: 'asc' }]
    });
  }

  static async createShift(input: CreateWorkShiftInput, actor: { id: number; name: string }) {
    try {
      const shift = await prisma.$transaction(async tx => {
        const created = await tx.workShift.create({
          data: {
            ...input,
            isActive: true,
            createdByUserId: actor.id
          }
        });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_WORK_SHIFT_CREATED',
          targetType: 'WorkShift',
          targetId: created.id,
          actorId: actor.id,
          actorName: actor.name,
          metadata: { code: created.code, startMinute: created.startMinute, endMinute: created.endMinute }
        });
        return created;
      });
      emitScheduleChanged();
      return shift;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw ApiError.conflict('Mã hoặc tên ca làm việc đã tồn tại', 'SCHEDULE_DUPLICATE', { code: input.code });
        }
        if (error.code === 'P2003') throw ApiError.notFound('Tài khoản tạo ca làm việc không tồn tại');
      }
      throw error;
    }
  }

  static async getWeek(query: ScheduleWeekQuery) {
    const weekEnd = addDays(query.weekStart, 6);
    const weekStartDate = dateFromIso(query.weekStart);
    const weekEndDate = dateFromIso(weekEnd);
    const branchId = await resolveMainBranchId(prisma);

    const where: Prisma.EmployeeWhereInput = {
      ...(query.search ? { OR: [
        { code: { contains: query.search } },
        { attendanceCode: { contains: query.search } },
        { name: { contains: query.search } }
      ] } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {})
    };
    const [employees, totalRows] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          department: { select: { id: true, name: true } },
          jobTitle: { select: { id: true, name: true } },
          scheduleRules: {
            where: {
              branchId,
              cancelledAt: null,
              startDate: { lte: weekEndDate },
              OR: [{ endDate: null }, { endDate: { gte: weekStartDate } }]
            },
            include: {
              shift: { select: { code: true, name: true, startMinute: true, endMinute: true } },
              exceptions: {
                where: { workDate: { gte: weekStartDate, lte: weekEndDate } },
                select: { workDate: true, type: true }
              }
            }
          },
          compensations: {
            where: { effectiveFrom: { lte: weekEndDate } },
            orderBy: { effectiveFrom: 'desc' },
            select: { payBasis: true, baseRate: true, effectiveFrom: true }
          }
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      prisma.employee.count({ where })
    ]);

    const rules = employees.flatMap(employee => employee.scheduleRules.map(toScheduleRule));
    const exceptions: ScheduleException[] = employees.flatMap(employee => employee.scheduleRules.flatMap(rule => rule.exceptions.map(exception => ({
      scheduleRuleId: rule.id,
      workDate: isoDate(exception.workDate)!,
      type: exception.type
    }))));
    let occurrences;
    try {
      occurrences = expandRulesForWeek({ weekStart: query.weekStart, rules, exceptions });
    } catch (error) {
      if (error instanceof ScheduleDomainError) throw ApiError.badRequest(error.message, undefined, error.code);
      throw error;
    }
    const compensationTerms = employees.flatMap(employee => employee.compensations.map(compensation => ({
      employeeId: employee.id,
      payBasis: compensation.payBasis,
      baseRate: compensation.baseRate,
      effectiveFrom: isoDate(compensation.effectiveFrom)!
    })));
    const projections = new Map(estimateWeeklyCompensation(occurrences, compensationTerms).map(projection => [projection.employeeId, projection]));
    const occurrencesByEmployee = new Map<number, typeof occurrences>();
    for (const occurrence of occurrences) {
      const current = occurrencesByEmployee.get(occurrence.employeeId) ?? [];
      current.push(occurrence);
      occurrencesByEmployee.set(occurrence.employeeId, current);
    }

    return {
      weekStart: query.weekStart,
      weekEnd,
      employees: employees.map(employee => ({
        id: employee.id,
        code: employee.code,
        name: employee.name,
        status: employee.status,
        department: employee.department,
        jobTitle: employee.jobTitle,
        occurrences: occurrencesByEmployee.get(employee.id) ?? [],
        compensation: projections.has(employee.id)
          ? { amount: projections.get(employee.id)!.amount, status: projections.get(employee.id)!.status }
          : { amount: 0, status: 'ESTIMATED' as const }
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalRows,
        totalPages: Math.ceil(totalRows / query.pageSize)
      }
    };
  }

  static async createBatch(input: CreateScheduleBatchInput, actor: { id: number; name: string }) {
    const drafts = input.employeeIds.flatMap(employeeId => input.shiftIds.map(shiftId => ({
      employeeId,
      shiftId,
      startDate: input.startDate,
      endDate: input.endDate,
      recurrenceType: input.recurrenceType,
      dayOfWeek: input.dayOfWeek
    })));
    const created = await prisma.$transaction(tx => createScheduleDraftsInTransaction(tx, drafts, actor), { timeout: 30000 });
    emitScheduleChanged(input.employeeIds, input.startDate, input.endDate);
    return { createdCount: created.length, rules: created };
  }

  static async importBatch(rows: Array<{ employeeCode: string; shiftCode: string; workDate: string; repeatWeekly: boolean; endDate: string | null; rowNumber?: number }>, actor: { id: number; name: string }) {
    if (rows.length === 0) throw ApiError.badRequest('File không có dòng lịch hợp lệ', {}, 'SCHEDULE_IMPORT_EMPTY');
    const employeeCodes = [...new Set(rows.map(row => row.employeeCode.trim().toUpperCase()))];
    const shiftCodes = [...new Set(rows.map(row => row.shiftCode.trim().toUpperCase()))];
    const committed = await prisma.$transaction(async tx => {
      const employees = await tx.employee.findMany({ where: { code: { in: employeeCodes } }, select: { id: true, code: true } });
      const employeesByCode = new Map(employees.map(employee => [employee.code.toUpperCase(), employee]));
      const shifts = await tx.workShift.findMany({ where: { code: { in: shiftCodes } }, select: { id: true, code: true } });
      const shiftsByCode = new Map(shifts.map(shift => [shift.code.toUpperCase(), shift]));
      const drafts: ScheduleDraft[] = rows.map(row => {
        const employeeCode = row.employeeCode.trim().toUpperCase();
        const shiftCode = row.shiftCode.trim().toUpperCase();
        const employee = employeesByCode.get(employeeCode);
        if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên trong dòng import', 'EMPLOYEE_NOT_FOUND', { employeeCode, rowNumber: String(row.rowNumber ?? '') });
        const shift = shiftsByCode.get(shiftCode);
        if (!shift) throw ApiError.notFound('Không tìm thấy ca làm việc trong dòng import', 'SHIFT_NOT_FOUND', { shiftCode, rowNumber: String(row.rowNumber ?? '') });
        const weekday = new Date(`${row.workDate}T00:00:00.000Z`).getUTCDay();
        return {
          employeeId: employee.id,
          employeeCode,
          shiftId: shift.id,
          shiftCode,
          startDate: row.workDate,
          endDate: row.repeatWeekly ? row.endDate : null,
          recurrenceType: row.repeatWeekly ? 'WEEKLY' : 'ONCE',
          dayOfWeek: row.repeatWeekly ? (weekday === 0 ? 7 : weekday) : null,
          rowNumber: row.rowNumber
        };
      });
      const rules = await createScheduleDraftsInTransaction(tx, drafts, actor);
      await AuditService.logInTransaction(tx, {
        action: 'EMPLOYEE_SCHEDULE_IMPORT_COMMITTED', targetType: 'EmployeeScheduleImport', targetId: null,
        actorId: actor.id, actorName: actor.name,
        metadata: { createdCount: rules.length, rowCount: rows.length, employeeCodes }
      });
      return { rules, employeeIds: [...new Set(drafts.map(draft => draft.employeeId))], changedFrom: rows.map(row => row.workDate).sort()[0], changedThrough: rows.some(row => row.repeatWeekly && !row.endDate) ? null : rows.map(row => row.repeatWeekly ? row.endDate ?? row.workDate : row.workDate).sort().at(-1) ?? null };
    }, { timeout: 30000 });
    emitScheduleChanged(committed.employeeIds, committed.changedFrom, committed.changedThrough);
    return { createdCount: committed.rules.length, rules: committed.rules };
  }

  static async mutateRule(ruleId: number, input: ScheduleMutationInput, actor: { id: number; name: string }) {
    ensureNotPast(input.workDate);
    const branchId = await resolveMainBranchId(prisma);
    const initial = await prisma.employeeScheduleRule.findFirst({ where: { id: ruleId, branchId }, select: { employeeId: true } });
    if (!initial) throw ApiError.notFound('Không tìm thấy lịch làm việc', 'NOT_FOUND');

    const result = await prisma.$transaction(async tx => {
      await lockEmployeeRows(tx, [initial.employeeId]);
      const rule = await tx.employeeScheduleRule.findUnique({
        where: { id: ruleId },
        include: { shift: { select: { code: true, name: true, startMinute: true, endMinute: true } }, exceptions: { select: { workDate: true, type: true } } }
      });
      if (!rule || rule.employeeId !== initial.employeeId || rule.branchId !== branchId) throw ApiError.notFound('Lịch làm việc không còn tồn tại');
      if (rule.cancelledAt) throw ApiError.conflict('Lịch làm việc đã bị hủy', 'CONFLICT', { ruleId: String(ruleId) });

      const normalizedRule = toScheduleRule(rule);
      const workDateOccurrence = expandRulesForWeek({
        weekStart: weekStartForDate(input.workDate),
        rules: [normalizedRule],
        exceptions: normalizedRule.exceptions?.map(exception => ({ scheduleRuleId: rule.id, workDate: exception.workDate, type: exception.type })) ?? []
      }).some(occurrence => occurrence.workDate === input.workDate);
      if (!workDateOccurrence) {
        throw ApiError.badRequest('Ngày chọn không thuộc lịch lặp này', { ruleId: String(ruleId), workDate: input.workDate }, 'SCHEDULE_RECURRENCE_INVALID');
      }

      const employee = await tx.employee.findUnique({
        where: { id: rule.employeeId },
        select: { id: true, code: true, status: true, startDate: true, endDate: true }
      });
      if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên', 'EMPLOYEE_NOT_FOUND', { employeeId: String(rule.employeeId) });
      if (employee.status !== 'WORKING') {
        throw ApiError.conflict('Nhân viên không còn làm việc', 'EMPLOYEE_NOT_WORKING', { employeeCode: employee.code, workDate: input.workDate });
      }
      if (employee.startDate && dateFromIso(input.workDate) < employee.startDate) {
        throw ApiError.conflict('Ngày lịch nằm trước ngày bắt đầu làm việc', 'EMPLOYEE_NOT_WORKING', { employeeCode: employee.code, workDate: input.workDate });
      }

      const shifts = await tx.workShift.findMany({ where: { id: { in: input.shiftIds } } });
      const shiftsById = new Map(shifts.map(shift => [shift.id, shift]));
      for (const shiftId of input.shiftIds) {
        const shift = shiftsById.get(shiftId);
        if (!shift) throw ApiError.notFound('Không tìm thấy ca làm việc', 'SHIFT_NOT_FOUND', { shiftId: String(shiftId) });
        if (!shift.isActive) throw ApiError.conflict('Ca làm việc đã ngừng hoạt động', 'SHIFT_INACTIVE', { shiftCode: shift.code });
      }

      const existingRulesRaw = await tx.employeeScheduleRule.findMany({
        where: { employeeId: rule.employeeId, branchId },
        include: { shift: { select: { code: true, name: true, startMinute: true, endMinute: true } }, exceptions: { select: { workDate: true, type: true } } }
      });
      const effectiveRules = existingRulesRaw.map(toScheduleRule);
      const oldIndex = effectiveRules.findIndex(existing => existing.id === rule.id);
      const oldRule = effectiveRules[oldIndex];
      const now = new Date();
      const isOneTimeNoop = rule.recurrenceType === 'ONCE' && input.workDate === oldRule.startDate && input.shiftIds.includes(rule.shiftId);
      const createsException = input.scope === 'occurrence' && rule.recurrenceType === 'WEEKLY';
      let closesAt: string | null = null;
      let cancelsOldRule = false;

      if (createsException) {
        effectiveRules[oldIndex] = {
          ...oldRule,
          exceptions: [...(oldRule.exceptions ?? []), { workDate: input.workDate, type: 'CANCELLED' }]
        };
      } else if (!isOneTimeNoop) {
        if (input.scope === 'following' && rule.recurrenceType === 'WEEKLY' && input.workDate > oldRule.startDate) {
          closesAt = addDays(input.workDate, -1);
          effectiveRules[oldIndex] = { ...oldRule, endDate: closesAt };
        } else {
          cancelsOldRule = true;
          effectiveRules[oldIndex] = { ...oldRule, cancelledAt: now.toISOString() };
        }
      }

      const nextRecurrenceType = input.scope === 'following' && rule.recurrenceType === 'WEEKLY' ? 'WEEKLY' : 'ONCE';
      const nextEndDate = nextRecurrenceType === 'WEEKLY' ? isoDate(rule.endDate) : null;
      const selectedWeekday = new Date(`${input.workDate}T00:00:00.000Z`).getUTCDay();
      const nextDayOfWeek = nextRecurrenceType === 'WEEKLY' ? rule.dayOfWeek ?? (selectedWeekday === 0 ? 7 : selectedWeekday) : null;
      if (employee.endDate && nextRecurrenceType === 'WEEKLY' && (!nextEndDate || dateFromIso(nextEndDate) > employee.endDate)) {
        throw ApiError.conflict('Lịch vượt quá ngày làm việc cuối cùng của nhân viên', 'EMPLOYEE_NOT_WORKING', { employeeCode: employee.code, endDate: isoDate(employee.endDate)! });
      }
      if (employee.endDate && dateFromIso(input.workDate) > employee.endDate) {
        throw ApiError.conflict('Ngày lịch sau ngày làm việc cuối cùng', 'EMPLOYEE_NOT_WORKING', { employeeCode: employee.code, workDate: input.workDate });
      }

      const candidates: ScheduleRule[] = [];
      const shiftCodeById = new Map<number, string>();
      for (const existing of existingRulesRaw) shiftCodeById.set(existing.shiftId, existing.shift.code);
      for (const shift of shifts) shiftCodeById.set(shift.id, shift.code);
      for (const shiftId of input.shiftIds) {
        if (isOneTimeNoop && shiftId === rule.shiftId) continue;
        const shift = shiftsById.get(shiftId)!;
        const candidate: ScheduleRule = {
          id: -(candidates.length + 1),
          employeeId: rule.employeeId,
          shiftId,
          recurrenceType: nextRecurrenceType,
          startDate: input.workDate,
          endDate: nextEndDate,
          dayOfWeek: nextDayOfWeek,
          cancelledAt: null,
          shift: { code: shift.code, name: shift.name, startMinute: shift.startMinute, endMinute: shift.endMinute },
          exceptions: []
        };
        const conflict = findRuleConflict(candidate, [...effectiveRules, ...candidates]);
        if (conflict) {
          throw ApiError.conflict(
            conflict.code === 'SCHEDULE_DUPLICATE' ? 'Nhân viên đã có lịch cho ca này' : 'Khung giờ ca bị chồng lấn',
            conflict.code,
            { employeeCode: employee.code, workDate: conflict.workDate, shiftCode: shift.code, conflictingShiftCode: shiftCodeById.get(conflict.conflictingShiftId) ?? '' }
          );
        }
        candidates.push(candidate);
      }

      if (createsException) {
        await tx.employeeScheduleException.create({ data: {
          scheduleRuleId: rule.id, workDate: dateFromIso(input.workDate), type: 'CANCELLED', createdByUserId: actor.id
        } });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_SCHEDULE_EXCEPTION_CREATED', targetType: 'EmployeeScheduleRule', targetId: rule.id,
          actorId: actor.id, actorName: actor.name,
          metadata: { employeeId: employee.id, employeeCode: employee.code, shiftCode: rule.shift.code, workDate: input.workDate, scope: input.scope }
        });
      } else if (!isOneTimeNoop) {
        await tx.employeeScheduleRule.update({
          where: { id: rule.id },
          data: { ...(cancelsOldRule ? { cancelledAt: now, cancelledByUserId: actor.id } : { endDate: dateFromIso(closesAt!) }) }
        });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_SCHEDULE_UPDATED', targetType: 'EmployeeScheduleRule', targetId: rule.id,
          actorId: actor.id, actorName: actor.name,
          metadata: { employeeId: employee.id, employeeCode: employee.code, shiftCode: rule.shift.code, workDate: input.workDate, scope: input.scope, updatedFields: [cancelsOldRule ? 'cancelledAt' : 'endDate'] }
        });
      }

      const createdRules = [];
      for (const candidate of candidates) {
        const created = await tx.employeeScheduleRule.create({ data: {
          employeeId: candidate.employeeId,
          branchId,
          shiftId: candidate.shiftId,
          recurrenceType: candidate.recurrenceType,
          startDate: dateFromIso(candidate.startDate),
          endDate: candidate.endDate ? dateFromIso(candidate.endDate) : null,
          dayOfWeek: candidate.dayOfWeek,
          createdByUserId: actor.id
        } });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_SCHEDULE_CREATED', targetType: 'EmployeeScheduleRule', targetId: created.id,
          actorId: actor.id, actorName: actor.name,
          metadata: { employeeId: employee.id, employeeCode: employee.code, shiftCode: candidate.shift.code, workDate: input.workDate, scope: input.scope, recurrenceType: candidate.recurrenceType }
        });
        createdRules.push({ id: created.id, shiftId: created.shiftId, recurrenceType: created.recurrenceType });
      }

      return { employeeId: employee.id, createdRules, changedThrough: input.scope === 'occurrence' ? input.workDate : isoDate(rule.endDate) };
    }, { timeout: 30000 });

    emitScheduleChanged([result.employeeId], input.workDate, result.changedThrough);
    return { updated: true, createdCount: result.createdRules.length, rules: result.createdRules };
  }

  static async deleteRule(ruleId: number, input: ScheduleDeleteInput, actor: { id: number; name: string }) {
    ensureNotPast(input.workDate);
    const branchId = await resolveMainBranchId(prisma);
    const initial = await prisma.employeeScheduleRule.findFirst({ where: { id: ruleId, branchId }, select: { employeeId: true } });
    if (!initial) throw ApiError.notFound('Không tìm thấy lịch làm việc');

    const result = await prisma.$transaction(async tx => {
      await lockEmployeeRows(tx, [initial.employeeId]);
      const rule = await tx.employeeScheduleRule.findUnique({
        where: { id: ruleId },
        include: { shift: { select: { code: true, name: true, startMinute: true, endMinute: true } }, exceptions: { select: { workDate: true, type: true } } }
      });
      if (!rule || rule.employeeId !== initial.employeeId || rule.branchId !== branchId) throw ApiError.notFound('Lịch làm việc không còn tồn tại');
      if (rule.cancelledAt) throw ApiError.conflict('Lịch làm việc đã bị hủy', 'CONFLICT', { ruleId: String(ruleId) });

      const normalizedRule = toScheduleRule(rule);
      const targetExists = expandRulesForWeek({
        weekStart: weekStartForDate(input.workDate),
        rules: [normalizedRule],
        exceptions: normalizedRule.exceptions?.map(exception => ({ scheduleRuleId: rule.id, workDate: exception.workDate, type: exception.type })) ?? []
      }).some(occurrence => occurrence.workDate === input.workDate);
      if (!targetExists) {
        throw ApiError.badRequest('Ngày chọn không thuộc lịch lặp này', { ruleId: String(ruleId), workDate: input.workDate }, 'SCHEDULE_RECURRENCE_INVALID');
      }

      const employee = await tx.employee.findUnique({ where: { id: rule.employeeId }, select: { id: true, code: true } });
      if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên', 'EMPLOYEE_NOT_FOUND', { employeeId: String(rule.employeeId) });
      const now = new Date();
      const createsException = input.scope === 'occurrence' && rule.recurrenceType === 'WEEKLY';
      const closeDate = input.scope === 'following' && rule.recurrenceType === 'WEEKLY' && input.workDate > isoDate(rule.startDate)! ? addDays(input.workDate, -1) : null;

      if (createsException) {
        await tx.employeeScheduleException.create({ data: {
          scheduleRuleId: rule.id, workDate: dateFromIso(input.workDate), type: 'CANCELLED', createdByUserId: actor.id
        } });
      } else if (closeDate) {
        await tx.employeeScheduleRule.update({ where: { id: rule.id }, data: { endDate: dateFromIso(closeDate) } });
      } else {
        await tx.employeeScheduleRule.update({ where: { id: rule.id }, data: { cancelledAt: now, cancelledByUserId: actor.id } });
      }

      await AuditService.logInTransaction(tx, {
        action: createsException ? 'EMPLOYEE_SCHEDULE_EXCEPTION_CREATED' : 'EMPLOYEE_SCHEDULE_DELETED',
        targetType: 'EmployeeScheduleRule', targetId: rule.id, actorId: actor.id, actorName: actor.name,
        metadata: { employeeId: employee.id, employeeCode: employee.code, shiftCode: rule.shift.code, workDate: input.workDate, scope: input.scope, ...(closeDate ? { endDate: closeDate } : {}) }
      });
      return { employeeId: employee.id, changedThrough: input.scope === 'occurrence' ? input.workDate : isoDate(rule.endDate) };
    }, { timeout: 30000 });

    emitScheduleChanged([result.employeeId], input.workDate, result.changedThrough);
    return { deleted: true };
  }
}
