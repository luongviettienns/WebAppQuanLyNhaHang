import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { businessDateAt } from '../employee-attendance/attendance-domain';
import {
  getEffectiveAttendancePolicy,
  getEffectivePayrollPolicy,
  getEffectiveWorkweekPolicy,
  getHolidayPeriods,
  resolveAccessibleMainBranch
} from './employee-settings.policy-reader';
import type { HolidayListQuery } from './employee-settings.schemas';

const capabilities = {
  mobileAttendance: false,
  automaticAttendance: false,
  continuousShiftPunch: false,
  hourToDayConversion: false,
  automaticOvertime: false,
  scheduledHoursPayroll: false,
  automaticPayrollCreation: false,
  automaticPayrollRefresh: false,
  salaryTemplates: false,
  tax: false,
  insurance: false,
  hardwareTimeclock: false,
  zaloMiniApp: false
} as const;

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export class EmployeeSettingsQueryService {
  static async getWorkspace(branchId: number, now = new Date()) {
    return prisma.$transaction(async tx => {
      const branch = await resolveAccessibleMainBranch(tx, branchId);
      const businessDate = businessDateAt(now);
      const date = toDate(businessDate);
      const [
        revisions,
        attendance,
        payroll,
        workweek,
        attendanceHistory,
        payrollHistory,
        workweekHistory,
        holidays,
        workingEmployees,
        activeShiftCount,
        activeKioskCount,
        compensatedEmployees,
        payrollBatchCount
      ] = await Promise.all([
        tx.branchEmployeeSettingsRevision.findUniqueOrThrow({ where: { branchId: branch.id } }),
        getEffectiveAttendancePolicy(tx, branch.id, businessDate),
        getEffectivePayrollPolicy(tx, branch.id, businessDate),
        getEffectiveWorkweekPolicy(tx, branch.id, businessDate),
        tx.branchAttendancePolicyVersion.findMany({ where: { branchId: branch.id }, orderBy: { effectiveFrom: 'desc' }, take: 20 }),
        tx.branchPayrollPolicyVersion.findMany({ where: { branchId: branch.id }, orderBy: { effectiveFrom: 'desc' }, take: 20 }),
        tx.branchWorkweekPolicyVersion.findMany({ where: { branchId: branch.id }, orderBy: { effectiveFrom: 'desc' }, take: 20 }),
        getHolidayPeriods(tx, branch.id),
        tx.employee.findMany({ where: { status: 'WORKING' }, select: { id: true } }),
        tx.workShift.count({ where: { isActive: true } }),
        tx.attendanceKioskSession.count({ where: { branchId: branch.id, revokedAt: null, expiresAt: { gt: now } } }),
        tx.employee.findMany({
          where: { status: 'WORKING', compensations: { some: { effectiveFrom: { lte: date } } } },
          select: { id: true }
        }),
        tx.employeePayrollBatch.count({ where: { branchId: branch.id } })
      ]);

      const steps = [
        { key: 'employees', destination: 'employee-directory', completed: workingEmployees.length > 0, count: workingEmployees.length },
        { key: 'attendance-policy', destination: 'employee-settings-attendance', completed: Boolean(attendance) && activeShiftCount > 0, count: activeShiftCount },
        { key: 'attendance-method', destination: 'employee-attendance', completed: activeKioskCount > 0, count: activeKioskCount },
        {
          key: 'compensation', destination: 'employee-directory',
          completed: workingEmployees.length > 0 && compensatedEmployees.length === workingEmployees.length,
          count: compensatedEmployees.length, total: workingEmployees.length
        },
        { key: 'payroll', destination: 'employee-payroll', completed: payrollBatchCount > 0, count: payrollBatchCount }
      ];
      return {
        branch,
        businessDate,
        revisions: {
          attendance: revisions.attendanceRevision,
          payroll: revisions.payrollRevision,
          workweek: revisions.workweekRevision,
          holiday: revisions.holidayRevision
        },
        effectivePolicies: { attendance, payroll, workweek },
        history: { attendance: attendanceHistory, payroll: payrollHistory, workweek: workweekHistory },
        holidays,
        checklist: { completedCount: steps.filter(step => step.completed).length, totalCount: steps.length, steps },
        capabilities
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  static async listHolidays(query: HolidayListQuery) {
    return prisma.$transaction(async tx => {
      const branch = await resolveAccessibleMainBranch(tx, query.branchId);
      return getHolidayPeriods(tx, branch.id, query.from, query.to, query.includeArchived);
    });
  }
}
