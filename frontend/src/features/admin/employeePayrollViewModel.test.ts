import { describe, expect, it } from 'vitest';
import type { EmployeePayrollDetailDto, EmployeePayrollLineDto } from '../../api/employeePayroll';
import {
  buildEmployeePayrollDetailModel,
  formatPayrollHours,
  formatPayrollVnd,
  groupPayrollWarnings,
  payrollBasisLabel,
  payrollStatusLabel,
  previousCompletePayrollMonth
} from './employeePayrollViewModel';

const line = (overrides: Partial<EmployeePayrollLineDto> = {}): EmployeePayrollLineDto => ({
  id: 1, employeeId: 4, employeeCode: 'NV000004', employeeName: 'Nguyễn Minh Anh',
  departmentName: 'Phục vụ', jobTitleName: 'Nhân viên', bankName: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN MINH ANH',
  activeCalendarDays: 30, periodCalendarDays: 30, scheduledShifts: 22, completedSessions: 20, actualMinutes: 9_690,
  confirmedAbsences: 1, missingCheckouts: 0, reviewRequiredCount: 0,
  grossAmount: 12_000_000, bonusAmount: 500_000, deductionAmount: 100_000, commissionAmount: 0, commissionDeferredDebitAmount: 0, netAmount: 12_400_000, paidAmount: 2_400_000, remainingAmount: 10_000_000,
  calculationStatus: 'READY', warningCodes: ['UNSCHEDULED_ATTENDANCE', 'CONFIRMED_ABSENCE'],
  sourceSnapshot: { compensationTerms: [{ id: 1, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: '2026-01-01' }] },
  calculatedAt: '2026-09-30T08:00:00.000Z', adjustments: [], payments: [], ...overrides
});

const detail = (overrides: Partial<EmployeePayrollDetailDto> = {}): EmployeePayrollDetailDto => ({
  id: 1, code: 'BL202609001', name: 'Bảng lương tháng 9/2026', branch: { id: 1, code: 'MAIN', name: 'Chi nhánh trung tâm' },
  frequency: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'CALCULATED',
  totalGrossAmount: 12_000_000, totalAdjustmentAmount: 400_000, totalCommissionAmount: 0, totalCommissionDeferredDebitAmount: 0, totalNetAmount: 12_400_000, totalPaidAmount: 2_400_000, totalRemainingAmount: 10_000_000,
  createdAt: '2026-09-30T08:00:00.000Z', updatedAt: '2026-09-30T08:00:00.000Z', version: 1, sourceStale: false,
  createdBy: { id: 1, name: 'Admin' }, calculatedBy: { id: 1, name: 'Admin' }, finalizedBy: null, cancelledBy: null,
  calculatedAt: '2026-09-30T08:00:00.000Z', finalizedAt: null, cancelledAt: null, cancelReason: null, lines: [line()], ...overrides
});

describe('employee payroll view model', () => {
  it('selects the previous complete business month across a year boundary', () => {
    expect(previousCompletePayrollMonth(new Date('2026-01-15T05:00:00.000Z'))).toEqual({
      month: '2025-12', periodStart: '2025-12-01', periodEnd: '2025-12-31'
    });
    expect(previousCompletePayrollMonth(new Date('2026-03-01T00:00:00.000Z')).month).toBe('2026-02');
  });

  it('uses truthful Vietnamese labels and actual time/currency formatting', () => {
    expect(payrollStatusLabel('DRAFT')).toBe('Đang tạo');
    expect(payrollStatusLabel('CALCULATED')).toBe('Tạm tính');
    expect(payrollStatusLabel('FINALIZED')).toBe('Đã chốt lương');
    expect(payrollBasisLabel('PER_SHIFT')).toBe('Theo ca thực tế');
    expect(formatPayrollHours(9_690)).toBe('161 giờ 30 phút');
    expect(formatPayrollHours(120)).toBe('2 giờ');
    expect(formatPayrollVnd(12_400_000)).toBe('12.400.000 ₫');
  });

  it('separates finalization blockers from informational warnings in stable order', () => {
    expect(groupPayrollWarnings([
      'CONFIRMED_ABSENCE', 'MISSING_CHECK_OUT', 'UNSCHEDULED_ATTENDANCE', 'COMPENSATION_MISSING'
    ])).toEqual({
      blockers: [
        { code: 'COMPENSATION_MISSING', label: 'Thiếu thiết lập lương' },
        { code: 'MISSING_CHECK_OUT', label: 'Thiếu giờ ra' }
      ],
      information: [
        { code: 'UNSCHEDULED_ATTENDANCE', label: 'Có chấm công ngoài lịch' },
        { code: 'CONFIRMED_ABSENCE', label: 'Có vắng mặt đã xác nhận' }
      ]
    });
  });

  it('projects expandable employee rows, exact totals and stale-source guidance', () => {
    const model = buildEmployeePayrollDetailModel(detail({ sourceStale: true }));

    expect(model.sourceState).toEqual({ tone: 'warning', label: 'Nguồn dữ liệu đã thay đổi', action: 'Tính lại trước khi chốt lương' });
    expect(model.lines[0]).toMatchObject({
      employeeLabel: 'Nguyễn Minh Anh · NV000004', actualTime: '161 giờ 30 phút',
      gross: '12.000.000 ₫', adjustment: '+400.000 ₫', net: '12.400.000 ₫', paid: '2.400.000 ₫', remaining: '10.000.000 ₫'
    });
    expect(model.totals).toEqual({ gross: '12.000.000 ₫', adjustment: '+400.000 ₫', net: '12.400.000 ₫', paid: '2.400.000 ₫', remaining: '10.000.000 ₫' });
    expect(model.lines[0].warnings.information).toHaveLength(2);
  });
});
