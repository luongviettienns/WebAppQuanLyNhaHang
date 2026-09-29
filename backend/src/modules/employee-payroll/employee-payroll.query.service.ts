import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { getPayrollMonthBounds } from './employee-payroll.calculation';
import type { PayrollListQuery } from './employee-payroll.schemas';
import type { EmployeePayrollExportRow } from './employee-payroll.export';

type PayrollQueryClient = Pick<
  typeof prisma,
  'employeePayrollBatch' | 'employee' | 'employeeCompensation' | 'employeeAttendanceSession' | 'employeeScheduleRule'
>;

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const isoDateTime = (value: Date) => value.toISOString();

export class EmployeePayrollQueryService {
  constructor(private readonly db: PayrollQueryClient = prisma) {}

  async list(query: PayrollListQuery) {
    const month = query.periodMonth ? getPayrollMonthBounds(query.periodMonth) : null;
    const where: Prisma.EmployeePayrollBatchWhereInput = {
      branchId: query.branchId,
      ...(query.search ? {
        OR: [
          { code: { contains: query.search } },
          { name: { contains: query.search } }
        ]
      } : {}),
      ...(query.frequency ? { frequency: query.frequency } : {}),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(month ? {
        periodStart: new Date(`${month.periodStart}T00:00:00.000Z`),
        periodEnd: new Date(`${month.periodEnd}T00:00:00.000Z`)
      } : {})
    };

    const [items, totalItems, aggregate] = await Promise.all([
      this.db.employeePayrollBatch.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          branchId: true,
          frequency: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          totalGrossAmount: true,
          totalAdjustmentAmount: true,
          totalNetAmount: true,
          totalPaidAmount: true,
          totalRemainingAmount: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { lines: true } }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.db.employeePayrollBatch.count({ where }),
      this.db.employeePayrollBatch.aggregate({
        where,
        _sum: {
          totalGrossAmount: true,
          totalAdjustmentAmount: true,
          totalNetAmount: true,
          totalPaidAmount: true,
          totalRemainingAmount: true
        }
      })
    ]);

    const sums = aggregate._sum;
    return {
      items: items.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        branchId: item.branchId,
        frequency: item.frequency,
        periodStart: isoDate(item.periodStart),
        periodEnd: isoDate(item.periodEnd),
        status: item.status,
        employeeCount: item._count.lines,
        totalGrossAmount: item.totalGrossAmount,
        totalAdjustmentAmount: item.totalAdjustmentAmount,
        totalNetAmount: item.totalNetAmount,
        totalPaidAmount: item.totalPaidAmount,
        totalRemainingAmount: item.totalRemainingAmount,
        createdAt: isoDateTime(item.createdAt),
        updatedAt: isoDateTime(item.updatedAt)
      })),
      summary: {
        totalGrossAmount: sums.totalGrossAmount ?? 0,
        totalAdjustmentAmount: sums.totalAdjustmentAmount ?? 0,
        totalNetAmount: sums.totalNetAmount ?? 0,
        totalPaidAmount: sums.totalPaidAmount ?? 0,
        totalRemainingAmount: sums.totalRemainingAmount ?? 0
      },
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize)
      }
    };
  }

  async detail(batchId: number) {
    const batch = await this.db.employeePayrollBatch.findUnique({
      where: { id: batchId },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        calculatedBy: { select: { id: true, name: true } },
        finalizedBy: { select: { id: true, name: true } },
        cancelledBy: { select: { id: true, name: true } },
        lines: {
          orderBy: [{ employeeCode: 'asc' }, { id: 'asc' }],
          include: {
            adjustments: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              include: {
                createdBy: { select: { id: true, name: true } },
                reversedBy: { select: { id: true, name: true } }
              }
            },
            payments: {
              orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
              include: {
                createdBy: { select: { id: true, name: true } },
                reversedBy: { select: { id: true, name: true } }
              }
            }
          }
        }
      }
    });
    if (!batch) throw ApiError.notFound('Không tìm thấy bảng lương');

    let sourceStale = false;
    if ((batch.status === 'DRAFT' || batch.status === 'CALCULATED') && batch.calculatedAt && batch.lines.length > 0) {
      const employeeIds = [...new Set(batch.lines.map(line => line.employeeId))];
      const periodEndExclusive = new Date(batch.periodEnd);
      periodEndExclusive.setUTCDate(periodEndExclusive.getUTCDate() + 1);
      const [employees, compensations, sessions, schedules] = await Promise.all([
        this.db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, updatedAt: true } }),
        this.db.employeeCompensation.findMany({
          where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: batch.periodEnd } },
          select: { id: true, createdAt: true }
        }),
        this.db.employeeAttendanceSession.findMany({
          where: {
            employeeId: { in: employeeIds },
            checkInAt: { gte: batch.periodStart, lt: periodEndExclusive }
          },
          select: { id: true, updatedAt: true }
        }),
        this.db.employeeScheduleRule.findMany({
          where: {
            employeeId: { in: employeeIds },
            branchId: batch.branchId,
            startDate: { lte: batch.periodEnd },
            OR: [{ endDate: null }, { endDate: { gte: batch.periodStart } }]
          },
          select: { id: true, updatedAt: true }
        })
      ]);
      const sourceTimestamps = [
        ...employees.map(row => row.updatedAt),
        ...compensations.map(row => row.createdAt),
        ...sessions.map(row => row.updatedAt),
        ...schedules.map(row => row.updatedAt)
      ];
      sourceStale = sourceTimestamps.some(timestamp => timestamp > batch.calculatedAt!);
    }

    return {
      id: batch.id,
      code: batch.code,
      name: batch.name,
      branch: batch.branch,
      frequency: batch.frequency,
      periodStart: isoDate(batch.periodStart),
      periodEnd: isoDate(batch.periodEnd),
      status: batch.status,
      totalGrossAmount: batch.totalGrossAmount,
      totalAdjustmentAmount: batch.totalAdjustmentAmount,
      totalNetAmount: batch.totalNetAmount,
      totalPaidAmount: batch.totalPaidAmount,
      totalRemainingAmount: batch.totalRemainingAmount,
      version: batch.version,
      createdBy: batch.createdBy,
      calculatedBy: batch.calculatedBy,
      finalizedBy: batch.finalizedBy,
      cancelledBy: batch.cancelledBy,
      calculatedAt: batch.calculatedAt ? isoDateTime(batch.calculatedAt) : null,
      finalizedAt: batch.finalizedAt ? isoDateTime(batch.finalizedAt) : null,
      cancelledAt: batch.cancelledAt ? isoDateTime(batch.cancelledAt) : null,
      cancelReason: batch.cancelReason,
      createdAt: isoDateTime(batch.createdAt),
      updatedAt: isoDateTime(batch.updatedAt),
      sourceStale,
      lines: batch.lines.map(line => ({
        ...line,
        employmentStartDate: line.employmentStartDate ? isoDate(line.employmentStartDate) : null,
        employmentEndDate: line.employmentEndDate ? isoDate(line.employmentEndDate) : null,
        calculatedAt: isoDateTime(line.calculatedAt),
        createdAt: isoDateTime(line.createdAt),
        updatedAt: isoDateTime(line.updatedAt),
        adjustments: line.adjustments.map(adjustment => ({
          ...adjustment,
          createdAt: isoDateTime(adjustment.createdAt),
          reversedAt: adjustment.reversedAt ? isoDateTime(adjustment.reversedAt) : null
        })),
        payments: line.payments.map(payment => ({
          ...payment,
          paidAt: isoDateTime(payment.paidAt),
          createdAt: isoDateTime(payment.createdAt),
          reversedAt: payment.reversedAt ? isoDateTime(payment.reversedAt) : null
        }))
      }))
    };
  }

  async exportRows(batchId: number): Promise<{ batchCode: string; rows: EmployeePayrollExportRow[] }> {
    const detail = await this.detail(batchId);
    return {
      batchCode: detail.code,
      rows: detail.lines.map(line => ({
        batchCode: detail.code,
        batchName: detail.name,
        status: detail.status,
        periodStart: detail.periodStart,
        periodEnd: detail.periodEnd,
        employeeCode: line.employeeCode,
        employeeName: line.employeeName,
        departmentName: line.departmentName,
        jobTitleName: line.jobTitleName,
        bankName: line.bankName,
        bankAccountNumber: line.bankAccountNumber,
        bankAccountName: line.bankAccountName,
        completedSessions: line.completedSessions,
        actualMinutes: line.actualMinutes,
        confirmedAbsences: line.confirmedAbsences,
        grossAmount: line.grossAmount,
        bonusAmount: line.bonusAmount,
        deductionAmount: line.deductionAmount,
        netAmount: line.netAmount,
        paidAmount: line.paidAmount,
        remainingAmount: line.remainingAmount,
        warningCodes: Array.isArray(line.warningCodes)
          ? line.warningCodes.filter((code): code is string => typeof code === 'string')
          : []
      }))
    };
  }
}
