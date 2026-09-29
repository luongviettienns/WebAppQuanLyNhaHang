import { describe, expect, it, vi } from 'vitest';
import { EmployeePayrollQueryService } from './employee-payroll.query.service';

const batch = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  code: 'BL202609003',
  name: 'Bảng lương tháng 9/2026',
  branchId: 1,
  frequency: 'MONTHLY',
  periodStart: new Date('2026-09-01T00:00:00.000Z'),
  periodEnd: new Date('2026-09-30T00:00:00.000Z'),
  status: 'CALCULATED',
  totalGrossAmount: 12_000_000,
  totalAdjustmentAmount: 500_000,
  totalNetAmount: 12_500_000,
  totalPaidAmount: 2_000_000,
  totalRemainingAmount: 10_500_000,
  createdAt: new Date('2026-09-30T08:00:00.000Z'),
  updatedAt: new Date('2026-09-30T08:00:00.000Z'),
  _count: { lines: 2 },
  ...overrides
});

describe('EmployeePayrollQueryService', () => {
  it('lists deterministic pages and calculates summary across the full filtered result', async () => {
    const findMany = vi.fn().mockResolvedValue([
      batch(),
      batch({ id: 2, code: 'BL202609002', createdAt: new Date('2026-09-30T07:00:00.000Z') })
    ]);
    const count = vi.fn().mockResolvedValue(7);
    const aggregate = vi.fn().mockResolvedValue({
      _sum: {
        totalGrossAmount: 70_000_000,
        totalAdjustmentAmount: 1_000_000,
        totalNetAmount: 71_000_000,
        totalPaidAmount: 21_000_000,
        totalRemainingAmount: 50_000_000
      }
    });
    const service = new EmployeePayrollQueryService({
      employeePayrollBatch: { findMany, count, aggregate }
    } as never);

    const result = await service.list({
      branchId: 1,
      search: 'tháng 9',
      frequency: 'MONTHLY',
      status: ['CALCULATED', 'FINALIZED'],
      periodMonth: '2026-09',
      page: 2,
      pageSize: 2
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branchId: 1,
        frequency: 'MONTHLY',
        status: { in: ['CALCULATED', 'FINALIZED'] },
        periodStart: new Date('2026-09-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-30T00:00:00.000Z'),
        OR: [
          { code: { contains: 'tháng 9' } },
          { name: { contains: 'tháng 9' } }
        ]
      }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 2,
      take: 2
    }));
    expect(count).toHaveBeenCalledWith({ where: expect.any(Object) });
    expect(aggregate).toHaveBeenCalledWith({ where: expect.any(Object), _sum: expect.any(Object) });
    expect(result).toMatchObject({
      pagination: { page: 2, pageSize: 2, totalItems: 7, totalPages: 4 },
      summary: {
        totalGrossAmount: 70_000_000,
        totalAdjustmentAmount: 1_000_000,
        totalNetAmount: 71_000_000,
        totalPaidAmount: 21_000_000,
        totalRemainingAmount: 50_000_000
      }
    });
    expect(result.items.map(item => item.code)).toEqual(['BL202609003', 'BL202609002']);
    expect(result.items[0]).not.toHaveProperty('nationalId');
    expect(result.items[0]).not.toHaveProperty('attendanceCode');
  });

  it('returns frozen detail sources and histories without leaking employee credentials', async () => {
    const calculatedAt = new Date('2026-09-30T08:00:00.000Z');
    const detailBatch = {
      ...batch({ calculatedAt, status: 'CALCULATED', version: 2 }),
      branch: { id: 1, code: 'MAIN', name: 'Chi nhánh trung tâm' },
      createdBy: { id: 1, name: 'Admin' },
      calculatedBy: { id: 1, name: 'Admin' },
      finalizedBy: null,
      cancelledBy: null,
      finalizedAt: null,
      cancelledAt: null,
      cancelReason: null,
      lines: [{
        id: 31,
        payrollBatchId: 3,
        employeeId: 8,
        employeeCode: 'NV000008',
        employeeName: 'Nguyễn Minh Anh',
        departmentName: 'Phục vụ',
        jobTitleName: 'Nhân viên',
        bankName: 'VCB',
        bankAccountNumber: '0123456789',
        bankAccountName: 'NGUYEN MINH ANH',
        employmentStartDate: new Date('2026-01-01T00:00:00.000Z'),
        employmentEndDate: null,
        activeCalendarDays: 30,
        periodCalendarDays: 30,
        scheduledShifts: 20,
        completedSessions: 19,
        actualMinutes: 9_120,
        confirmedAbsences: 1,
        missingCheckouts: 0,
        reviewRequiredCount: 0,
        grossAmount: 12_000_000,
        bonusAmount: 500_000,
        deductionAmount: 0,
        netAmount: 12_500_000,
        paidAmount: 2_000_000,
        remainingAmount: 10_500_000,
        calculationStatus: 'READY',
        warningCodes: ['CONFIRMED_ABSENCE'],
        sourceSnapshot: {
          compensationTerms: [{ id: 4, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: '2026-01-01' }],
          attendanceSessions: [{ id: 71, checkInAt: '2026-09-01T01:00:00.000Z', checkOutAt: '2026-09-01T05:00:00.000Z' }]
        },
        calculatedAt,
        createdAt: calculatedAt,
        updatedAt: calculatedAt,
        adjustments: [{
          id: 91, type: 'BONUS', amount: 500_000, reason: 'Thưởng', createdAt: calculatedAt,
          reversedAt: null, reverseReason: null, createdBy: { id: 1, name: 'Admin' }, reversedBy: null
        }],
        payments: [{
          id: 101, amount: 2_000_000, method: 'BANK_TRANSFER', externalReference: 'PAY-1', note: null,
          status: 'SUCCESS', paidAt: calculatedAt, createdAt: calculatedAt, reversedAt: null, reverseReason: null,
          createdBy: { id: 1, name: 'Admin' }, reversedBy: null
        }]
      }]
    };
    const service = new EmployeePayrollQueryService({
      employeePayrollBatch: {
        findUnique: vi.fn().mockResolvedValue(detailBatch),
        findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn()
      },
      employee: { findMany: vi.fn().mockResolvedValue([{ id: 8, updatedAt: new Date('2026-09-30T09:00:00.000Z') }]) },
      employeeCompensation: { findMany: vi.fn().mockResolvedValue([{ id: 4, createdAt: new Date('2026-01-01T00:00:00.000Z') }]) },
      employeeAttendanceSession: { findMany: vi.fn().mockResolvedValue([{ id: 71, updatedAt: new Date('2026-09-30T07:00:00.000Z') }]) },
      employeeScheduleRule: { findMany: vi.fn().mockResolvedValue([]) }
    } as never);

    const result = await service.detail(3);

    expect(result.sourceStale).toBe(true);
    expect(result.lines[0]).toMatchObject({
      employeeCode: 'NV000008',
      bankAccountNumber: '0123456789',
      warningCodes: ['CONFIRMED_ABSENCE'],
      sourceSnapshot: detailBatch.lines[0].sourceSnapshot,
      adjustments: [{ id: 91, createdBy: { id: 1, name: 'Admin' } }],
      payments: [{ id: 101, createdBy: { id: 1, name: 'Admin' } }]
    });
    expect(result.lines[0]).not.toHaveProperty('nationalId');
    expect(result.lines[0]).not.toHaveProperty('attendanceCode');
  });

  it('never marks a finalized frozen batch stale and returns a stable not-found error', async () => {
    const finalized = {
      ...batch({ status: 'FINALIZED', calculatedAt: new Date('2026-09-30T08:00:00.000Z'), version: 3 }),
      branch: { id: 1, code: 'MAIN', name: 'Chi nhánh trung tâm' },
      createdBy: { id: 1, name: 'Admin' }, calculatedBy: null, finalizedBy: { id: 1, name: 'Admin' }, cancelledBy: null,
      finalizedAt: new Date('2026-09-30T09:00:00.000Z'), cancelledAt: null, cancelReason: null, lines: []
    };
    const findUnique = vi.fn().mockResolvedValueOnce(finalized).mockResolvedValueOnce(null);
    const service = new EmployeePayrollQueryService({
      employeePayrollBatch: { findUnique, findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
      employee: { findMany: vi.fn() }, employeeCompensation: { findMany: vi.fn() },
      employeeAttendanceSession: { findMany: vi.fn() }, employeeScheduleRule: { findMany: vi.fn() }
    } as never);

    expect((await service.detail(3)).sourceStale).toBe(false);
    await expect(service.detail(999)).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});
