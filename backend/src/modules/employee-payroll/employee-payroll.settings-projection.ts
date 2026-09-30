import type { Prisma } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import type { PayrollPolicySnapshot, PayrollSettingsSnapshot } from './employee-payroll.calculation';

type PayrollSettingsClient = Pick<
  Prisma.TransactionClient,
  'branchPayrollPolicyVersion' | 'branchAttendancePolicyVersion' | 'branchWorkweekPolicyVersion' | 'branchHolidayPeriod'
>;

type AttendancePolicyReference = { attendancePolicyVersionId: number | null };

const isoDate = (value: Date) => value.toISOString().slice(0, 10);

function policySnapshot(
  row: { id: number; revision: number; effectiveFrom: Date },
  values: PayrollPolicySnapshot['values']
): PayrollPolicySnapshot {
  return { id: row.id, revision: row.revision, effectiveFrom: isoDate(row.effectiveFrom), values };
}

export async function buildPayrollSettingsProjection(
  db: PayrollSettingsClient,
  branchId: number,
  periodStart: string,
  periodEnd: string,
  sourceSessions: AttendancePolicyReference[]
): Promise<PayrollSettingsSnapshot> {
  const startDate = new Date(`${periodStart}T00:00:00.000Z`);
  const endDate = new Date(`${periodEnd}T00:00:00.000Z`);
  const attendancePolicyIds = [...new Set(
    sourceSessions
      .map(session => session.attendancePolicyVersionId)
      .filter((id): id is number => id !== null)
  )].sort((left, right) => left - right);

  const [payrollRows, attendanceRows, workweekRows, holidayRows] = await Promise.all([
    db.branchPayrollPolicyVersion.findMany({
      where: { branchId, effectiveFrom: { lte: startDate } },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }]
    }),
    db.branchAttendancePolicyVersion.findMany({
      where: { branchId, id: { in: attendancePolicyIds } },
      orderBy: { id: 'asc' }
    }),
    db.branchWorkweekPolicyVersion.findMany({
      where: { branchId, effectiveFrom: { lte: endDate } },
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }]
    }),
    db.branchHolidayPeriod.findMany({
      where: { branchId, startDate: { lte: endDate }, endDate: { gte: startDate } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
    })
  ]);

  const payrollPolicy = payrollRows
    .filter(row => isoDate(row.effectiveFrom) <= periodStart)
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime() || right.id - left.id)[0];
  if (!payrollPolicy) {
    throw ApiError.conflict('Chi nhánh chưa có thiết lập tính lương hiệu lực', 'EMPLOYEE_SETTINGS_BASELINE_MISSING');
  }

  const eligibleWorkweekRows = workweekRows
    .filter(row => isoDate(row.effectiveFrom) <= periodEnd)
    .sort((left, right) => left.effectiveFrom.getTime() - right.effectiveFrom.getTime() || left.id - right.id);
  const workweekAtStart = [...eligibleWorkweekRows].reverse().find(row => isoDate(row.effectiveFrom) <= periodStart);
  if (!workweekAtStart) {
    throw ApiError.conflict('Chi nhánh chưa có thiết lập ngày làm việc hiệu lực', 'EMPLOYEE_SETTINGS_BASELINE_MISSING');
  }
  const scopedWorkweekRows = [
    workweekAtStart,
    ...eligibleWorkweekRows.filter(row => isoDate(row.effectiveFrom) > periodStart)
  ].filter((row, index, rows) => rows.findIndex(candidate => candidate.id === row.id) === index);

  return {
    payrollPolicy: policySnapshot(payrollPolicy, {
      frequency: payrollPolicy.frequency,
      periodStartDay: payrollPolicy.periodStartDay,
      hourlyCalculationSource: payrollPolicy.hourlyCalculationSource
    }),
    attendancePolicies: attendanceRows
      .filter(row => attendancePolicyIds.includes(row.id))
      .sort((left, right) => left.id - right.id)
      .map(row => policySnapshot(row, {
        attendanceMode: row.attendanceMode,
        standardDayMinutes: row.standardDayMinutes,
        lateThresholdMinutes: row.lateThresholdMinutes,
        earlyLeaveThresholdMinutes: row.earlyLeaveThresholdMinutes,
        allowUnscheduledAttendance: row.allowUnscheduledAttendance
      })),
    workweekPolicies: scopedWorkweekRows.map(row => policySnapshot(row, {
      monday: row.monday,
      tuesday: row.tuesday,
      wednesday: row.wednesday,
      thursday: row.thursday,
      friday: row.friday,
      saturday: row.saturday,
      sunday: row.sunday
    })),
    holidays: holidayRows
      .filter(row => isoDate(row.startDate) <= periodEnd && isoDate(row.endDate) >= periodStart)
      .sort((left, right) => left.startDate.getTime() - right.startDate.getTime() || left.id - right.id)
      .map(row => ({
        id: row.id,
        revision: row.revision,
        name: row.name,
        startDate: isoDate(row.startDate),
        endDate: isoDate(row.endDate),
        archivedAt: row.archivedAt?.toISOString() ?? null
      }))
  };
}
