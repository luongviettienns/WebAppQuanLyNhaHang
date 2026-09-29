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
  periodStart: '2026-09-01', periodEnd: '2026-09-30', status, totalGrossAmount: 12_000_000, totalAdjustmentAmount: 0, totalNetAmount: 12_000_000,
  totalPaidAmount: 0, totalRemainingAmount: 12_000_000, createdAt: '', updatedAt: '', version: 1, sourceStale: false,
  createdBy: { id: 1, name: 'Admin' }, calculatedBy: { id: 1, name: 'Admin' }, finalizedBy: null, cancelledBy: null,
  calculatedAt: '', finalizedAt: null, cancelledAt: null, cancelReason: null,
  lines: [{
    id: 10, employeeId: 4, employeeCode: 'NV004', employeeName: 'Nguyễn Minh Anh', departmentName: 'Phục vụ', jobTitleName: 'Nhân viên',
    bankName: 'VCB', bankAccountNumber: '0123', bankAccountName: 'NGUYEN MINH ANH', activeCalendarDays: 30, periodCalendarDays: 30,
    scheduledShifts: 22, completedSessions: 20, actualMinutes: 9600, confirmedAbsences: 1, missingCheckouts: 0, reviewRequiredCount: 0,
    grossAmount: 12_000_000, bonusAmount: 0, deductionAmount: 0, netAmount: 12_000_000, paidAmount: 0, remainingAmount: 12_000_000,
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
});
