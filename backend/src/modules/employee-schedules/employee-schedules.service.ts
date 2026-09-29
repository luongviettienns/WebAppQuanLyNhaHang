import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import {
  estimateWeeklyCompensation,
  expandRulesForWeek,
  findRuleConflict,
  ScheduleDomainError,
  type ScheduleException,
  type ScheduleRule
} from './schedule-domain';
import type { CreateScheduleBatchInput, CreateWorkShiftInput, ScheduleWeekQuery } from './employee-schedules.schemas';

const dateFromIso = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
const isoDateTime = (value: Date | null) => value?.toISOString() ?? null;
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

function emitScheduleChanged(employeeIds: number[] = [], changedFrom: string | null = null, changedThrough: string | null = null) {
  emitToAll('employee-schedules:changed', { employeeIds, changedFrom, changedThrough, updatedAt: new Date().toISOString() });
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
    const endDate = input.endDate;
    const created = await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM Employee WHERE id IN (${Prisma.join(input.employeeIds)}) ORDER BY id FOR UPDATE`);

      const employees = await tx.employee.findMany({
        where: { id: { in: input.employeeIds } },
        select: { id: true, code: true, status: true, startDate: true, endDate: true }
      });
      const employeesById = new Map(employees.map(employee => [employee.id, employee]));
      for (const employeeId of input.employeeIds) {
        const employee = employeesById.get(employeeId);
        if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên', 'EMPLOYEE_NOT_FOUND', { employeeId: String(employeeId) });
        if (employee.status !== 'WORKING') {
          throw ApiError.conflict('Nhân viên không còn làm việc', 'EMPLOYEE_NOT_WORKING', { employeeCode: employee.code, startDate: input.startDate });
        }
        if (employee.startDate && dateFromIso(input.startDate) < employee.startDate) {
          throw ApiError.conflict('Ngày lịch nằm trước ngày bắt đầu làm việc', 'EMPLOYEE_NOT_WORKING', { employeeCode: employee.code, startDate: input.startDate });
        }
        if (employee.endDate && input.repeatWeekly && (!endDate || dateFromIso(endDate) > employee.endDate)) {
          throw ApiError.conflict('Lịch vượt quá ngày làm việc cuối cùng của nhân viên', 'EMPLOYEE_NOT_WORKING', { employeeCode: employee.code, endDate: isoDate(employee.endDate)! });
        }
        if (employee.endDate && dateFromIso(input.startDate) > employee.endDate) {
          throw ApiError.conflict('Ngày lịch sau ngày làm việc cuối cùng', 'EMPLOYEE_NOT_WORKING', { employeeCode: employee.code, startDate: input.startDate });
        }
      }

      const shifts = await tx.workShift.findMany({ where: { id: { in: input.shiftIds } } });
      const shiftsById = new Map(shifts.map(shift => [shift.id, shift]));
      for (const shiftId of input.shiftIds) {
        const shift = shiftsById.get(shiftId);
        if (!shift) throw ApiError.notFound('Không tìm thấy ca làm việc', 'SHIFT_NOT_FOUND', { shiftId: String(shiftId) });
        if (!shift.isActive) throw ApiError.conflict('Ca làm việc đã ngừng hoạt động', 'SHIFT_INACTIVE', { shiftCode: shift.code });
      }

      const existingRulesRaw = await tx.employeeScheduleRule.findMany({
        where: { employeeId: { in: input.employeeIds } },
        include: { shift: { select: { code: true, name: true, startMinute: true, endMinute: true } }, exceptions: { select: { workDate: true, type: true } } }
      });
      const existingRules = existingRulesRaw.map(toScheduleRule);
      const candidates: Array<{ employeeId: number; shiftId: number; employeeCode: string; shiftCode: string }> = [];
      const candidateRules: ScheduleRule[] = [];
      for (const employeeId of input.employeeIds) {
        const employee = employeesById.get(employeeId)!;
        for (const shiftId of input.shiftIds) {
          const shift = shiftsById.get(shiftId)!;
          const candidate: ScheduleRule = {
            id: -(candidates.length + 1),
            employeeId,
            shiftId,
            recurrenceType: input.recurrenceType,
            startDate: input.startDate,
            endDate,
            dayOfWeek: input.dayOfWeek,
            cancelledAt: null,
            shift: { code: shift.code, name: shift.name, startMinute: shift.startMinute, endMinute: shift.endMinute },
            exceptions: []
          };
          const conflict = findRuleConflict(candidate, [...existingRules, ...candidateRules]);
          if (conflict) {
            const conflictingShift = shiftsById.get(conflict.conflictingShiftId);
            throw ApiError.conflict(
              conflict.code === 'SCHEDULE_DUPLICATE' ? 'Nhân viên đã có lịch cho ca này' : 'Khung giờ ca bị chồng lấn',
              conflict.code,
              { employeeCode: employee.code, workDate: conflict.workDate, shiftCode: shift.code, conflictingShiftCode: conflictingShift?.code ?? '' }
            );
          }
          candidates.push({ employeeId, shiftId, employeeCode: employee.code, shiftCode: shift.code });
          candidateRules.push(candidate);
        }
      }

      const rules = [];
      for (const candidate of candidates) {
        const rule = await tx.employeeScheduleRule.create({
          data: {
            employeeId: candidate.employeeId,
            shiftId: candidate.shiftId,
            recurrenceType: input.recurrenceType,
            startDate: dateFromIso(input.startDate),
            endDate: endDate ? dateFromIso(endDate) : null,
            dayOfWeek: input.dayOfWeek,
            createdByUserId: actor.id
          }
        });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_SCHEDULE_CREATED',
          targetType: 'EmployeeScheduleRule',
          targetId: rule.id,
          actorId: actor.id,
          actorName: actor.name,
          metadata: {
            employeeId: candidate.employeeId,
            employeeCode: candidate.employeeCode,
            shiftCode: candidate.shiftCode,
            recurrenceType: input.recurrenceType,
            startDate: input.startDate,
            endDate,
            dayOfWeek: input.dayOfWeek
          }
        });
        rules.push({
          id: rule.id,
          employeeId: rule.employeeId,
          shiftId: rule.shiftId,
          recurrenceType: rule.recurrenceType,
          startDate: isoDate(rule.startDate),
          endDate: isoDate(rule.endDate),
          dayOfWeek: rule.dayOfWeek
        });
      }
      return rules;
    }, { timeout: 30000 });

    emitScheduleChanged(input.employeeIds, input.startDate, endDate);
    return { createdCount: created.length, rules: created };
  }
}
