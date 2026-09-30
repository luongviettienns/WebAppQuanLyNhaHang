import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchEmployeeSettingsApi: vi.fn(), createAttendancePolicyApi: vi.fn(), createPayrollPolicyApi: vi.fn(),
  createWorkweekPolicyApi: vi.fn(), createEmployeeHolidayApi: vi.fn(), updateEmployeeHolidayApi: vi.fn(),
  archiveEmployeeHolidayApi: vi.fn()
}));
const viewport = vi.hoisted(() => ({ width: 1200 }));
const native = vi.hoisted(() => (name: string) => {
  const Component = (props: any) => React.createElement(name, props, props.children);
  Component.displayName = name;
  return Component;
});
vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'), Modal: native('Modal'), Pressable: native('Pressable'),
  ScrollView: native('ScrollView'), StyleSheet: { create: (styles: any) => styles }, Switch: native('Switch'),
  Text: native('Text'), TextInput: native('TextInput'), View: native('View'), useWindowDimensions: () => ({ width: viewport.width, height: 800 })
}));
vi.mock('lucide-react-native', () => ({ CalendarDays: native('Icon'), Check: native('Icon'), Clock3: native('Icon'), Settings: native('Icon'), WalletCards: native('Icon') }));
vi.mock('../../ui', () => ({ AppIcon: () => React.createElement('Icon'), InlineAlert: (props: any) => React.createElement('Alert', props, props.message) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  surfaceCanvas: '#f5f7fa', surfaceBase: '#fff', surfaceRaised: '#fff', borderSubtle: '#d8dee8',
  primary: '#0877e8', interactiveSecondary: '#eaf4ff', textPrimary: '#172033', textSecondary: '#67748a',
  textInverse: '#fff', success: '#18864b', danger: '#c53b3b', disabled: '#a8b1bf'
} }) }));
vi.mock('../../api/employeeSettings', () => api);

import { EmployeeSettingsScreen } from './EmployeeSettingsScreen';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const workspace = () => ({
  branch: { id: 1, code: 'MAIN', name: 'Chi nhánh trung tâm' }, businessDate: '2026-09-30',
  revisions: { attendance: 2, payroll: 1, workweek: 1, holiday: 0 },
  effectivePolicies: {
    attendance: { id: 1, branchId: 1, effectiveFrom: '1970-01-01', revision: 2, attendanceMode: 'SHIFT', standardDayMinutes: 480, lateThresholdMinutes: 0, earlyLeaveThresholdMinutes: 0, allowUnscheduledAttendance: true, createdAt: '2026-09-01T00:00:00.000Z' },
    payroll: { id: 2, branchId: 1, effectiveFrom: '1970-01-01', revision: 1, frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE', createdAt: '2026-09-01T00:00:00.000Z' },
    workweek: { id: 3, branchId: 1, effectiveFrom: '1970-01-01', revision: 1, monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true, createdAt: '2026-09-01T00:00:00.000Z' }
  },
  history: { attendance: [], payroll: [], workweek: [] }, holidays: [],
  checklist: { completedCount: 4, totalCount: 5, steps: [
    { key: 'employees', destination: 'employee-directory', completed: true, count: 3 },
    { key: 'payroll', destination: 'employee-payroll', completed: false, count: 0 }
  ] },
  capabilities: {
    mobileAttendance: false, automaticAttendance: false, continuousShiftPunch: false, hourToDayConversion: false,
    automaticOvertime: false, scheduledHoursPayroll: false, automaticPayrollCreation: false, automaticPayrollRefresh: false,
    salaryTemplates: false, tax: false, insurance: false, hardwareTimeclock: false, zaloMiniApp: false
  }
} as any);

describe('EmployeeSettingsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewport.width = 1200;
    api.fetchEmployeeSettingsApi.mockResolvedValue(workspace());
    api.createAttendancePolicyApi.mockResolvedValue({});
    api.createPayrollPolicyApi.mockResolvedValue({});
    api.createWorkweekPolicyApi.mockResolvedValue({});
    api.createEmployeeHolidayApi.mockResolvedValue({});
  });

  it('renders truthful initialization progress and routes checklist actions', async () => {
    const onNavigate = vi.fn();
    let screen: any;
    await act(async () => { screen = create(<EmployeeSettingsScreen onNavigate={onNavigate} />); });
    expect(screen.root.findByProps({ testID: 'employee-settings-progress' }).props.children).toContain('4/5');
    await act(async () => screen.root.findByProps({ testID: 'settings-checklist-payroll' }).props.onPress());
    expect(onNavigate).toHaveBeenCalledWith('employee-payroll');
    expect(api.fetchEmployeeSettingsApi).toHaveBeenCalledWith('admin-token', 1);
  });

  it('creates independent attendance and payroll policy versions with current area revisions', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeSettingsScreen onNavigate={vi.fn()} />); });
    await act(async () => screen.root.findByProps({ testID: 'settings-nav-attendance' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'attendance-policy-add' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'policy-effective-date' }).props.onChangeText('2026-10-01'));
    await act(async () => screen.root.findByProps({ testID: 'attendance-late-threshold' }).props.onChangeText('5'));
    await act(async () => screen.root.findByProps({ testID: 'policy-save' }).props.onPress());
    expect(api.createAttendancePolicyApi).toHaveBeenCalledWith('admin-token', expect.objectContaining({
      branchId: 1, expectedAreaRevision: 2, effectiveFrom: '2026-10-01', lateThresholdMinutes: 5
    }));

    await act(async () => screen.root.findByProps({ testID: 'settings-nav-payroll' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'payroll-policy-add' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'policy-effective-date' }).props.onChangeText('2026-11-01'));
    await act(async () => screen.root.findByProps({ testID: 'policy-save' }).props.onPress());
    expect(api.createPayrollPolicyApi).toHaveBeenCalledWith('admin-token', {
      branchId: 1, expectedAreaRevision: 1, effectiveFrom: '2026-11-01', frequency: 'MONTHLY',
      periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE'
    });
  });

  it('creates a workweek version and holiday without sending unsupported capabilities', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeSettingsScreen onNavigate={vi.fn()} />); });
    await act(async () => screen.root.findByProps({ testID: 'settings-nav-calendar' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'workweek-policy-add' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'workweek-sunday' }).props.onValueChange(false));
    await act(async () => screen.root.findByProps({ testID: 'policy-effective-date' }).props.onChangeText('2026-10-05'));
    await act(async () => screen.root.findByProps({ testID: 'policy-save' }).props.onPress());
    expect(api.createWorkweekPolicyApi).toHaveBeenCalledWith('admin-token', expect.objectContaining({ expectedAreaRevision: 1, sunday: false }));

    await act(async () => screen.root.findByProps({ testID: 'holiday-add' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'holiday-name' }).props.onChangeText('Tết Dương lịch'));
    await act(async () => screen.root.findByProps({ testID: 'holiday-start' }).props.onChangeText('2027-01-01'));
    await act(async () => screen.root.findByProps({ testID: 'holiday-end' }).props.onChangeText('2027-01-01'));
    await act(async () => screen.root.findByProps({ testID: 'holiday-save' }).props.onPress());
    expect(api.createEmployeeHolidayApi).toHaveBeenCalledWith('admin-token', {
      branchId: 1, expectedHolidayRevision: 0, name: 'Tết Dương lịch', startDate: '2027-01-01', endDate: '2027-01-01', note: null
    });
  });

  it('shows a compact horizontal navigation and supports retry after a load error', async () => {
    viewport.width = 600;
    api.fetchEmployeeSettingsApi.mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValueOnce(workspace());
    let screen: any;
    await act(async () => { screen = create(<EmployeeSettingsScreen onNavigate={vi.fn()} />); });
    const alert = screen.root.findByType('Alert');
    expect(alert.props.message).toBe('Mất kết nối');
    await act(async () => { await alert.props.onAction(); });
    expect(screen.root.findByProps({ testID: 'employee-settings-progress' })).toBeDefined();
    expect(screen.root.findAllByType('ScrollView').some((node: any) => node.props.horizontal === true)).toBe(true);
  });

  it('updates and archives a future holiday with collection and row revisions', async () => {
    const current = workspace();
    current.revisions.holiday = 4;
    current.holidays = [{ id: 9, branchId: 1, name: 'Nghỉ đầu năm', startDate: '2027-01-01', endDate: '2027-01-02', note: null, revision: 3, archivedAt: null }];
    api.fetchEmployeeSettingsApi.mockResolvedValue(current);
    api.updateEmployeeHolidayApi.mockResolvedValue({}); api.archiveEmployeeHolidayApi.mockResolvedValue({});
    let screen: any;
    await act(async () => { screen = create(<EmployeeSettingsScreen onNavigate={vi.fn()} />); });
    await act(async () => screen.root.findByProps({ testID: 'settings-nav-calendar' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'holiday-row-9' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'holiday-name' }).props.onChangeText('Nghỉ năm mới'));
    await act(async () => screen.root.findByProps({ testID: 'holiday-save' }).props.onPress());
    expect(api.updateEmployeeHolidayApi).toHaveBeenCalledWith('admin-token', 9, expect.objectContaining({ expectedHolidayRevision: 4, expectedRowRevision: 3, name: 'Nghỉ năm mới' }));

    await act(async () => screen.root.findByProps({ testID: 'holiday-row-9' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'holiday-reason' }).props.onChangeText('Kỳ nghỉ tạo nhầm'));
    await act(async () => screen.root.findByProps({ testID: 'holiday-archive' }).props.onPress());
    expect(api.archiveEmployeeHolidayApi).toHaveBeenCalledWith('admin-token', 9, { branchId: 1, expectedHolidayRevision: 4, expectedRowRevision: 3, reason: 'Kỳ nghỉ tạo nhầm' });
  });
});
