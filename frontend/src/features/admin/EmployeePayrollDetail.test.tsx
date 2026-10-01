import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { EmployeePayrollDetailDto } from '../../api/employeePayroll';

const { native } = vi.hoisted(() => ({ native: (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; } }));
vi.mock('react-native', () => ({ Pressable: native('Pressable'), ScrollView: native('ScrollView'), StyleSheet: { create: (s: any) => s }, Text: native('Text'), TextInput: native('TextInput'), View: native('View') }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceBase: '#fff', surfaceCanvas: '#f5f7fa', surfaceRaised: '#fff', surfaceSunken: '#f4f6f8', textPrimary: '#172033', textSecondary: '#667085', textInverse: '#fff', borderSubtle: '#dfe7f1', primary: '#0b74e5', interactiveSecondary: '#eaf3ff', warning: '#a86100', danger: '#b42318', success: '#15803d' } }) }));
import { EmployeePayrollDetail } from './EmployeePayrollDetail';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const detail = (status: EmployeePayrollDetailDto['status'] = 'CALCULATED'): EmployeePayrollDetailDto => ({
  id: 1, code: 'BL202609001', name: 'Bảng lương tháng 9/2026', branch: { id: 1, code: 'MAIN', name: 'Trung tâm' }, frequency: 'MONTHLY',
  periodStart: '2026-09-01', periodEnd: '2026-09-30', status, totalGrossAmount: 12_000_000, totalAdjustmentAmount: 0, totalCommissionAmount: 0, totalCommissionDeferredDebitAmount: 0, totalNetAmount: 12_000_000,
  totalPaidAmount: 0, totalRemainingAmount: 12_000_000, createdAt: '', updatedAt: '', version: 1, sourceStale: false,
  createdBy: { id: 1, name: 'Admin' }, calculatedBy: { id: 1, name: 'Admin' }, finalizedBy: null, cancelledBy: null,
  calculatedAt: '', finalizedAt: null, cancelledAt: null, cancelReason: null,
  lines: [{
    id: 10, employeeId: 4, employeeCode: 'NV004', employeeName: 'Nguyễn Minh Anh', departmentName: 'Phục vụ', jobTitleName: 'Nhân viên',
    bankName: 'VCB', bankAccountNumber: '0123', bankAccountName: 'NGUYEN MINH ANH', activeCalendarDays: 30, periodCalendarDays: 30,
    scheduledShifts: 22, completedSessions: 20, actualMinutes: 9600, confirmedAbsences: 1, missingCheckouts: 0, reviewRequiredCount: 0,
    grossAmount: 12_000_000, bonusAmount: 0, deductionAmount: 0, commissionAmount: 0, commissionDeferredDebitAmount: 0, netAmount: 12_000_000, paidAmount: 0, remainingAmount: 12_000_000,
    calculationStatus: 'READY', warningCodes: ['UNSCHEDULED_ATTENDANCE', 'CONFIRMED_ABSENCE'], sourceSnapshot: { compensationTerms: [{ payBasis: 'MONTHLY' }] },
    calculatedAt: '', adjustments: [], payments: []
  }]
});

describe('EmployeePayrollDetail', () => {
  it('expands employee truthfully with actual time, planned shift context and separated warnings', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollDetail detail={detail()} onChanged={async () => {}} />); });
    await act(async () => screen.root.findByProps({ testID: 'payroll-line-10' }).props.onPress());
    const text = screen.root.findAllByType('Text').flatMap((node: any) => node.props.children).join(' ');
    expect(text).toContain('Thời gian làm thực tế');
    expect(text).toContain('160 giờ');
    expect(text).toContain('Ca theo lịch: 22');
    expect(text).toContain('Thông tin');
    expect(text).toContain('Có chấm công ngoài lịch');
    expect(text).not.toContain('Giờ kế hoạch = giờ thực tế');
  });

  it('shows lifecycle actions only in the appropriate batch state', async () => {
    let calculated: any; let finalized: any;
    await act(async () => { calculated = create(<EmployeePayrollDetail detail={detail('CALCULATED')} onChanged={async () => {}} />); });
    expect(calculated.root.findByProps({ testID: 'payroll-action-recalculate' })).toBeDefined();
    expect(calculated.root.findByProps({ testID: 'payroll-action-finalize' })).toBeDefined();
    expect(() => calculated.root.findByProps({ testID: 'payroll-line-pay-10' })).toThrow();
    await act(async () => { finalized = create(<EmployeePayrollDetail detail={detail('FINALIZED')} onChanged={async () => {}} />); });
    expect(() => finalized.root.findByProps({ testID: 'payroll-action-recalculate' })).toThrow();
    await act(async () => finalized.root.findByProps({ testID: 'payroll-line-10' }).props.onPress());
    expect(finalized.root.findByProps({ testID: 'payroll-line-pay-10' })).toBeDefined();
  });

  it('shows frozen sources and append-only histories with reasoned reversal actions', async () => {
    const calculatedDetail = detail('CALCULATED');
    calculatedDetail.lines[0].sourceSnapshot = {
      compensationTerms: [{ id: 1, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: '2026-09-01' }],
      attendanceSessions: [{ id: 91, businessDate: '2026-09-02', checkInAt: '2026-09-02T01:00:00.000Z', checkOutAt: '2026-09-02T05:00:00.000Z' }]
    };
    calculatedDetail.lines[0].adjustments = [{ id: 71, type: 'BONUS', amount: 500_000, reason: 'Thưởng tốt', createdAt: '', reversedAt: null, reverseReason: null }];
    const reverseAdjustment = vi.fn().mockResolvedValue(undefined);
    let calculated: any;
    await act(async () => { calculated = create(<EmployeePayrollDetail detail={calculatedDetail} onChanged={async () => {}} onReverseAdjustment={reverseAdjustment} />); });
    await act(async () => calculated.root.findByProps({ testID: 'payroll-line-10' }).props.onPress());
    const calculatedText = JSON.stringify(calculated.toJSON());
    expect(calculatedText).toContain('Nguồn tính lương đã đóng băng');
    expect(calculatedText).toContain('12.000.000');
    expect(calculatedText).toContain('Thưởng tốt');
    await act(async () => calculated.root.findByProps({ testID: 'payroll-adjustment-reverse-71' }).props.onPress());
    await act(async () => calculated.root.findByProps({ testID: 'payroll-reverse-reason' }).props.onChangeText('Ghi nhận nhầm'));
    await act(async () => { calculated.root.findByProps({ testID: 'payroll-reverse-confirm' }).props.onPress(); await Promise.resolve(); });
    expect(reverseAdjustment).toHaveBeenCalledWith(10, 71, 'Ghi nhận nhầm');

    const finalizedDetail = detail('FINALIZED');
    finalizedDetail.totalPaidAmount = 2_000_000;
    finalizedDetail.lines[0].paidAmount = 2_000_000;
    finalizedDetail.lines[0].remainingAmount = 10_000_000;
    finalizedDetail.lines[0].payments = [{ id: 81, amount: 2_000_000, method: 'BANK_TRANSFER', status: 'SUCCESS', externalReference: 'FT001', note: null, paidAt: '2026-09-30T02:00:00.000Z', reversedAt: null, reverseReason: null }];
    const reversePayment = vi.fn().mockResolvedValue(undefined);
    let finalized: any;
    await act(async () => { finalized = create(<EmployeePayrollDetail detail={finalizedDetail} onChanged={async () => {}} onReversePayment={reversePayment} />); });
    await act(async () => finalized.root.findByProps({ testID: 'payroll-line-10' }).props.onPress());
    expect(JSON.stringify(finalized.toJSON())).toContain('FT001');
    expect(finalized.root.findByProps({ testID: 'payroll-payment-reverse-81' })).toBeDefined();
  });

  it('renders the frozen settings versions and holidays used by the payroll calculation', async () => {
    const calculatedDetail = detail('CALCULATED');
    calculatedDetail.lines[0].sourceSnapshot = {
      settings: {
        payrollPolicy: { id: 11, revision: 4, effectiveFrom: '2026-09-01', values: { frequency: 'MONTHLY' } },
        attendancePolicies: [{ id: 12, revision: 2, effectiveFrom: '2026-09-01', values: { attendanceMode: 'SHIFT' } }],
        workweekPolicies: [{ id: 13, revision: 3, effectiveFrom: '2026-09-01', values: { sunday: false } }],
        holidays: [{ id: 14, revision: 5, name: 'Quốc khánh', startDate: '2026-09-02', endDate: '2026-09-02', archivedAt: null }]
      }
    };
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollDetail detail={calculatedDetail} onChanged={async () => {}} />); });
    await act(async () => screen.root.findByProps({ testID: 'payroll-line-10' }).props.onPress());
    const snapshot = screen.root.findByProps({ testID: 'payroll-settings-snapshot-10' });
    const text = snapshot.findAllByType('Text').map((node: any) => String(node.props.children)).join(' ');
    expect(text).toContain('Chính sách lương #11 · phiên bản 4');
    expect(text).toContain('Chấm công #12 · phiên bản 2');
    expect(text).toContain('Ngày làm việc #13 · phiên bản 3');
    expect(text).toContain('Quốc khánh');
    expect(text).toContain('phiên bản 5');
  });
});
