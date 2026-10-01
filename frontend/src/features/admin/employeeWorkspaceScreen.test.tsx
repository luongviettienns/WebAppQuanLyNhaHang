import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const { native } = vi.hoisted(() => ({ native: (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; } }));
vi.mock('react-native', () => ({ Pressable: native('Pressable'), StyleSheet: { create: (s: any) => s }, Text: native('Text'), View: native('View') }));
vi.mock('lucide-react-native', () => { const Icon = native('Icon'); return { Banknote: Icon, CalendarDays: Icon, Clock3: Icon, Settings: Icon, Users: Icon }; });
vi.mock('../../ui', () => ({ AppIcon: () => React.createElement('Icon') }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceBase: '#fff', surfaceCanvas: '#f4f3f0', interactiveSecondary: '#fff1dd', primary: '#b42318', textPrimary: '#24211f', textSecondary: '#6b6560', borderSubtle: '#d8d4ce' } }) }));
vi.mock('./EmployeeManagementScreen', () => ({ EmployeeManagementScreen: () => React.createElement('View', { testID: 'employee-directory-screen' }, React.createElement('Text', null, 'Danh sách nhân viên mock')) }));
vi.mock('./EmployeeScheduleScreen', () => ({ EmployeeScheduleScreen: () => React.createElement('View', { testID: 'employee-schedule-screen' }, React.createElement('Text', null, 'Lịch làm việc mock')) }));
vi.mock('./EmployeeAttendanceScreen', () => ({ EmployeeAttendanceScreen: () => React.createElement('View', { testID: 'employee-attendance-screen' }, React.createElement('Text', null, 'Bảng chấm công mock')) }));
vi.mock('./EmployeePayrollScreen', () => ({ EmployeePayrollScreen: () => React.createElement('View', { testID: 'employee-payroll-screen' }, React.createElement('Text', null, 'Bảng lương mock')) }));
vi.mock('./EmployeeSettingsScreen', () => ({ EmployeeSettingsScreen: ({ onNavigate }: any) => React.createElement('View', { testID: 'employee-settings-screen' }, React.createElement('Pressable', { testID: 'settings-go-schedule', onPress: () => onNavigate('employee-schedule') })) }));
import { EmployeeWorkspaceScreen } from './EmployeeWorkspaceScreen';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('employee workspace', () => {
  it('keeps the directory as the default view and switches only inside the Admin employee workspace', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeWorkspaceScreen />); });
    const tabIds = screen.root.findByProps({ accessibilityRole: 'tablist' }).findAllByProps({ accessibilityRole: 'tab' })
      .map((tab: any) => tab.props.testID).filter((id: string, index: number, values: string[]) => index === 0 || values[index - 1] !== id);
    expect(tabIds).toEqual([
      'employee-workspace-directory', 'employee-workspace-schedule', 'employee-workspace-attendance', 'employee-workspace-payroll', 'employee-workspace-settings'
    ]);
    expect(screen.root.findByProps({ testID: 'employee-directory-screen' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'employee-workspace-schedule' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-schedule-screen' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'employee-workspace-attendance' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-attendance-screen' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'employee-workspace-payroll' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-payroll-screen' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'employee-workspace-settings' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-settings-screen' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'settings-go-schedule' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-schedule-screen' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'employee-workspace-directory' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-directory-screen' })).toBeDefined();
    await act(async () => screen.unmount());
  });
});
