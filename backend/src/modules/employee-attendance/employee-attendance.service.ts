import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import {
  businessDateAt,
  classifyAttendanceSession,
  expandAttendanceOccurrences,
  getBusinessWeekBounds,
  getBusinessWeekUtcBounds,
  projectOccurrenceAttendance,
  type AttendanceClassification,
  type AttendanceOccurrence,
  type AttendanceScheduleException,
  type AttendanceScheduleRule
} from './attendance-domain';
import type { AttendanceExceptionQuery, AttendanceWeekQuery } from './employee-attendance.schemas';

export interface AttendanceWeekEmployeeDto {
  id: number;
  code: string;
  name: string;
  departmentName: string | null;
  jobTitleName: string | null;
}

export interface AttendanceWeekSessionDto {
  id: number;
  checkInAt: string;
  checkOutAt: string | null;
  linkStatus: 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW';
  plannedShiftName: string | null;
  plannedStartMinute: number | null;
  plannedEndMinute: number | null;
  classification: AttendanceClassification;
}

export interface AttendanceWeekRowDto {
  id: string;
  kind: 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW';
  workDate: string;
  scheduleRuleId: number | null;
  scheduleDate: string | null;
  employee: AttendanceWeekEmployeeDto;
  shift: { name: string; plannedStartMinute: number; plannedEndMinute: number } | null;
  occurrenceStatus: 'NOT_CLOCKED' | 'ABSENT' | 'ATTENDED';
  reviewConflict: boolean;
  disposition: { id: number; type: 'ABSENT'; reason: string; createdAt: string } | null;
  classification: AttendanceClassification | null;
  sessions: AttendanceWeekSessionDto[];
}

export type AttendanceExceptionType = 'NOT_CLOCKED' | 'MISSING_CHECK_OUT' | 'REVIEW_CONFLICT' | 'ABSENT_CONFIRMED';
export interface AttendanceExceptionRowDto extends AttendanceWeekRowDto {
  exceptionType: AttendanceExceptionType;
  status: 'OPEN' | 'RESOLVED';
}

interface EmployeeRecord {
  id: number;
  code: string;
  name: string;
  department: { name: string } | null;
  jobTitle: { name: string } | null;
}

interface ScheduleRuleRecord {
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
  employee: EmployeeRecord;
  exceptions: Array<{ scheduleRuleId: number; workDate: Date; type: 'CANCELLED' }>;
}

interface AttendanceSessionRecord {
  id: number;
  employeeId: number;
  branchId: number;
  scheduleRuleId: number | null;
  scheduleDate: Date | null;
  checkInAt: Date;
  checkOutAt: Date | null;
  scheduleLinkStatus: 'SCHEDULED' | 'UNSCHEDULED' | 'NEEDS_REVIEW';
  plannedBranchId: number | null;
  plannedWorkDate: Date | null;
  plannedShiftName: string | null;
  plannedStartMinute: number | null;
  plannedEndMinute: number | null;
  employee: EmployeeRecord;
}

interface DispositionRecord {
  id: number;
  employeeId: number;
  scheduleRuleId: number;
  workDate: Date;
  type: 'ABSENT';
  reason: string;
  createdAt: Date;
  revokedAt: Date | null;
  employee: EmployeeRecord;
}

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const dateFromIso = (value: string) => new Date(`${value}T00:00:00.000Z`);

function toEmployee(employee: EmployeeRecord): AttendanceWeekEmployeeDto {
  return {
    id: employee.id,
    code: employee.code,
    name: employee.name,
    departmentName: employee.department?.name ?? null,
    jobTitleName: employee.jobTitle?.name ?? null
  };
}

function toRule(rule: ScheduleRuleRecord): AttendanceScheduleRule {
  return {
    id: rule.id,
    employeeId: rule.employeeId,
    branchId: rule.branchId,
    shiftId: rule.shiftId,
    recurrenceType: rule.recurrenceType,
    startDate: isoDate(rule.startDate),
    endDate: rule.endDate ? isoDate(rule.endDate) : null,
    dayOfWeek: rule.dayOfWeek,
    cancelledAt: rule.cancelledAt?.toISOString() ?? null,
    shift: rule.shift
  };
}

function occurrenceKey(scheduleRuleId: number, workDate: string): string {
  return `${scheduleRuleId}:${workDate}`;
}

function employeeSearchFilter(search?: string) {
  return search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }] } : undefined;
}

function compareRows(view: AttendanceWeekQuery['view'], left: AttendanceWeekRowDto, right: AttendanceWeekRowDto): number {
  const dateCompare = left.workDate.localeCompare(right.workDate);
  const shiftStartCompare = (left.shift?.plannedStartMinute ?? Number.MAX_SAFE_INTEGER)
    - (right.shift?.plannedStartMinute ?? Number.MAX_SAFE_INTEGER);
  const employeeCompare = left.employee.name.localeCompare(right.employee.name, 'vi') || left.employee.id - right.employee.id;
  return view === 'employee'
    ? employeeCompare || dateCompare || shiftStartCompare || left.id.localeCompare(right.id)
    : dateCompare || shiftStartCompare || employeeCompare || left.id.localeCompare(right.id);
}

function plannedEndAt(workDate: string, plannedEndMinute: number): Date {
  const localMidnight = Date.parse(`${workDate}T00:00:00.000Z`);
  return new Date(localMidnight + (plannedEndMinute - 7 * 60) * 60_000);
}

function exceptionForRow(row: AttendanceWeekRowDto, now: Date): Omit<AttendanceExceptionRowDto, keyof AttendanceWeekRowDto> | null {
  if (row.reviewConflict) return { exceptionType: 'REVIEW_CONFLICT', status: 'OPEN' };
  if (row.occurrenceStatus === 'ABSENT') return { exceptionType: 'ABSENT_CONFIRMED', status: 'RESOLVED' };
  if (row.classification?.sessionStatus === 'MISSING_CHECK_OUT') {
    return { exceptionType: 'MISSING_CHECK_OUT', status: 'OPEN' };
  }
  if (row.kind === 'NEEDS_REVIEW') return { exceptionType: 'REVIEW_CONFLICT', status: 'OPEN' };
  if (row.occurrenceStatus === 'NOT_CLOCKED' && row.shift
    && plannedEndAt(row.workDate, row.shift.plannedEndMinute).getTime() < now.getTime()) {
    return { exceptionType: 'NOT_CLOCKED', status: 'OPEN' };
  }
  return null;
}

function sessionClassification(
  session: AttendanceSessionRecord,
  occurrence: AttendanceOccurrence | null,
  now: Date
): AttendanceClassification {
  if (occurrence) {
    return projectOccurrenceAttendance({
      occurrence,
      session: {
        checkInAt: session.checkInAt,
        checkOutAt: session.checkOutAt,
        linkStatus: session.scheduleLinkStatus,
        plannedWorkDate: session.plannedWorkDate ? isoDate(session.plannedWorkDate) : null,
        plannedStartMinute: session.plannedStartMinute,
        plannedEndMinute: session.plannedEndMinute
      },
      now
    }).classification!;
  }
  return classifyAttendanceSession({
    checkInAt: session.checkInAt,
    checkOutAt: session.checkOutAt,
    now,
    linkStatus: session.scheduleLinkStatus
  });
}

function toSessionDto(session: AttendanceSessionRecord, occurrence: AttendanceOccurrence | null, now: Date): AttendanceWeekSessionDto {
  return {
    id: session.id,
    checkInAt: session.checkInAt.toISOString(),
    checkOutAt: session.checkOutAt?.toISOString() ?? null,
    linkStatus: session.scheduleLinkStatus,
    plannedShiftName: session.plannedShiftName,
    plannedStartMinute: session.plannedStartMinute,
    plannedEndMinute: session.plannedEndMinute,
    classification: sessionClassification(session, occurrence, now)
  };
}

export class EmployeeAttendanceService {
  constructor(private readonly prisma: PrismaClient, private readonly serverNow: () => Date = () => new Date()) {}

  async getWeek(query: AttendanceWeekQuery) {
    return this.readWeek(query);
  }

  async getExceptions(query: AttendanceExceptionQuery) {
    const now = this.serverNow();
    const { status, ...weekQuery } = query;
    const week = await this.readWeek({ ...weekQuery, view: 'shift' }, true, now);
    const candidates = week.rows.flatMap(row => {
      const exception = exceptionForRow(row, now);
      return exception ? [{ ...row, ...exception }] : [];
    });
    const matchingRows = candidates.filter(row => row.status === status);
    const total = matchingRows.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      branch: week.branch,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      status,
      rows: matchingRows.slice(start, start + query.pageSize),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) }
    };
  }

  private async readWeek(query: AttendanceWeekQuery, includeAllRows = false, now = this.serverNow()) {
    const { weekStart, weekEnd } = getBusinessWeekBounds(query.weekStart);
    const utcBounds = getBusinessWeekUtcBounds(weekStart);
    const startDate = dateFromIso(weekStart);
    const endDate = dateFromIso(weekEnd);
    const employeeFilter = employeeSearchFilter(query.search);
    const employeeWhere: Prisma.EmployeeWhereInput | undefined = employeeFilter
      ? employeeFilter
      : undefined;

    const branch = await this.prisma.branch.findUnique({ where: { id: query.branchId }, select: { id: true, code: true } });
    if (!branch) throw ApiError.notFound('Không tìm thấy chi nhánh.');

    const [ruleRowsRaw, sessionsRaw, dispositionsRaw] = await Promise.all([
      this.prisma.employeeScheduleRule.findMany({
        where: {
          branchId: query.branchId,
          employeeId: query.employeeId,
          cancelledAt: null,
          ...(employeeWhere ? { employee: { is: employeeWhere } } : {}),
          OR: [
            { recurrenceType: 'ONCE', startDate: { gte: startDate, lte: endDate } },
            {
              recurrenceType: 'WEEKLY',
              startDate: { lte: endDate },
              OR: [{ endDate: null }, { endDate: { gte: startDate } }]
            }
          ]
        },
        include: {
          shift: { select: { name: true, startMinute: true, endMinute: true } },
          employee: { select: { id: true, code: true, name: true, department: { select: { name: true } }, jobTitle: { select: { name: true } } } },
          exceptions: {
            where: { workDate: { gte: startDate, lte: endDate }, type: 'CANCELLED' },
            select: { scheduleRuleId: true, workDate: true, type: true }
          }
        }
      }),
      this.prisma.employeeAttendanceSession.findMany({
        where: {
          branchId: query.branchId,
          employeeId: query.employeeId,
          ...(employeeWhere ? { employee: { is: employeeWhere } } : {}),
          OR: [
            { checkInAt: { gte: utcBounds.startInclusive, lt: utcBounds.endExclusive } },
            { scheduleDate: { gte: startDate, lte: endDate } }
          ]
        },
        orderBy: [{ checkInAt: 'asc' }, { id: 'asc' }],
        include: {
          employee: { select: { id: true, code: true, name: true, department: { select: { name: true } }, jobTitle: { select: { name: true } } } }
        }
      }),
      this.prisma.employeeAttendanceDisposition.findMany({
        where: {
          branchId: query.branchId,
          employeeId: query.employeeId,
          workDate: { gte: startDate, lte: endDate },
          revokedAt: null,
          ...(employeeWhere ? { employee: { is: employeeWhere } } : {})
        },
        include: {
          employee: { select: { id: true, code: true, name: true, department: { select: { name: true } }, jobTitle: { select: { name: true } } } }
        }
      })
    ]);

    const ruleRows = ruleRowsRaw as unknown as ScheduleRuleRecord[];
    const sessions = sessionsRaw as unknown as AttendanceSessionRecord[];
    const dispositions = dispositionsRaw as unknown as DispositionRecord[];
    const rules: AttendanceScheduleRule[] = ruleRows.map(toRule);
    const exceptions: AttendanceScheduleException[] = ruleRows.flatMap(rule => rule.exceptions.map(exception => ({
      scheduleRuleId: exception.scheduleRuleId,
      workDate: isoDate(exception.workDate),
      type: exception.type
    })));
    const occurrences = expandAttendanceOccurrences({ weekStart, rules, exceptions, branchId: query.branchId, employeeId: query.employeeId });
    const employeeById = new Map<number, AttendanceWeekEmployeeDto>();
    for (const row of ruleRows) employeeById.set(row.employee.id, toEmployee(row.employee));
    for (const session of sessions) employeeById.set(session.employee.id, toEmployee(session.employee));
    for (const disposition of dispositions) employeeById.set(disposition.employee.id, toEmployee(disposition.employee));

    const sessionsByOccurrence = new Map<string, AttendanceSessionRecord[]>();
    for (const session of sessions) {
      if (session.scheduleRuleId === null || session.scheduleDate === null) continue;
      const key = occurrenceKey(session.scheduleRuleId, isoDate(session.scheduleDate));
      const list = sessionsByOccurrence.get(key) ?? [];
      list.push(session);
      sessionsByOccurrence.set(key, list);
    }
    const dispositionByOccurrence = new Map<string, DispositionRecord>();
    for (const disposition of dispositions) {
      dispositionByOccurrence.set(occurrenceKey(disposition.scheduleRuleId, isoDate(disposition.workDate)), disposition);
    }

    const rows: AttendanceWeekRowDto[] = [];
    const projectedSessionIds = new Set<number>();
    for (const occurrence of occurrences) {
      const key = occurrenceKey(occurrence.scheduleRuleId, occurrence.scheduleDate);
      const occurrenceSessions = sessionsByOccurrence.get(key) ?? [];
      const primarySession = occurrenceSessions[0] ?? null;
      const disposition = dispositionByOccurrence.get(key) ?? null;
      const projection = projectOccurrenceAttendance({
        occurrence,
        session: primarySession ? {
          checkInAt: primarySession.checkInAt,
          checkOutAt: primarySession.checkOutAt,
          linkStatus: primarySession.scheduleLinkStatus,
          plannedWorkDate: primarySession.plannedWorkDate ? isoDate(primarySession.plannedWorkDate) : null,
          plannedStartMinute: primarySession.plannedStartMinute,
          plannedEndMinute: primarySession.plannedEndMinute
        } : null,
        disposition: disposition?.type ?? null,
        now
      });
      for (const session of occurrenceSessions) projectedSessionIds.add(session.id);
      const displayShift = primarySession?.scheduleLinkStatus === 'SCHEDULED'
        && primarySession.plannedShiftName !== null
        && primarySession.plannedStartMinute !== null
        && primarySession.plannedEndMinute !== null
        ? { name: primarySession.plannedShiftName, plannedStartMinute: primarySession.plannedStartMinute, plannedEndMinute: primarySession.plannedEndMinute }
        : { name: occurrence.shiftName, plannedStartMinute: occurrence.plannedStartMinute, plannedEndMinute: occurrence.plannedEndMinute };
      rows.push({
        id: `schedule:${occurrence.scheduleRuleId}:${occurrence.scheduleDate}`,
        kind: 'SCHEDULED',
        workDate: occurrence.scheduleDate,
        scheduleRuleId: occurrence.scheduleRuleId,
        scheduleDate: occurrence.scheduleDate,
        employee: employeeById.get(occurrence.employeeId)!,
        shift: displayShift,
        occurrenceStatus: projection.occurrenceStatus,
        reviewConflict: projection.reviewConflict || occurrenceSessions.length > 1 || occurrenceSessions.some(session => session.scheduleLinkStatus === 'NEEDS_REVIEW'),
        disposition: disposition ? { id: disposition.id, type: disposition.type, reason: disposition.reason, createdAt: disposition.createdAt.toISOString() } : null,
        classification: projection.classification,
        sessions: occurrenceSessions.map(session => toSessionDto(session, occurrence, now))
      });
    }

    for (const session of sessions) {
      if (projectedSessionIds.has(session.id)) continue;
      const workDate = session.plannedWorkDate ? isoDate(session.plannedWorkDate) : businessDateAt(session.checkInAt);
      const snapshotOccurrence = session.scheduleDate && session.plannedShiftName !== null
        && session.plannedStartMinute !== null && session.plannedEndMinute !== null
        ? {
          scheduleRuleId: session.scheduleRuleId ?? 0,
          employeeId: session.employeeId,
          branchId: session.plannedBranchId ?? session.branchId,
          shiftId: 0,
          scheduleDate: session.plannedWorkDate ? isoDate(session.plannedWorkDate) : isoDate(session.scheduleDate),
          shiftName: session.plannedShiftName,
          plannedStartMinute: session.plannedStartMinute,
          plannedEndMinute: session.plannedEndMinute
        } satisfies AttendanceOccurrence
        : null;
      const isNeedsReview = session.scheduleLinkStatus === 'NEEDS_REVIEW';
      rows.push({
        id: `session:${session.id}`,
        kind: isNeedsReview ? 'NEEDS_REVIEW' : session.scheduleRuleId === null ? 'UNSCHEDULED' : 'SCHEDULED',
        workDate,
        scheduleRuleId: session.scheduleRuleId,
        scheduleDate: session.scheduleDate ? isoDate(session.scheduleDate) : null,
        employee: employeeById.get(session.employeeId)!,
        shift: snapshotOccurrence ? {
          name: snapshotOccurrence.shiftName,
          plannedStartMinute: snapshotOccurrence.plannedStartMinute,
          plannedEndMinute: snapshotOccurrence.plannedEndMinute
        } : null,
        occurrenceStatus: 'ATTENDED',
        reviewConflict: isNeedsReview,
        disposition: null,
        classification: sessionClassification(session, snapshotOccurrence, now),
        sessions: [toSessionDto(session, snapshotOccurrence, now)]
      });
    }

    rows.sort((left, right) => compareRows(query.view, left, right));
    const total = rows.length;
    const start = (query.page - 1) * query.pageSize;
    return {
      branch: { id: branch.id, code: branch.code },
      weekStart,
      weekEnd,
      view: query.view,
      rows: includeAllRows ? rows : rows.slice(start, start + query.pageSize),
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) }
    };
  }
}
