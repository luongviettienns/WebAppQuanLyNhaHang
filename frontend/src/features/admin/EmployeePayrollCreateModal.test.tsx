import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const { native } = vi.hoisted(() => ({ native: (name: string) => { const Component = (props: any) => React.createElement(name, props, props.children); Component.displayName = name; return Component; } }));
vi.mock('react-native', () => ({
  Modal: native('Modal'), Pressable: native('Pressable'), ScrollView: native('ScrollView'), StyleSheet: { create: (styles: any) => styles },
  Text: native('Text'), TextInput: native('TextInput'), View: native('View'), useWindowDimensions: () => ({ width: 1024 })
}));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceBase: '#fff', surfaceCanvas: '#f5f7fa', surfaceRaised: '#fff', textPrimary: '#172033', textSecondary: '#667085', borderSubtle: '#dfe7f1', primary: '#0b74e5', interactivePrimary: '#0b74e5', interactiveSecondary: '#eaf3ff', textInverse: '#fff', danger: '#b42318' } }) }));
import { EmployeePayrollCreateModal } from './EmployeePayrollCreateModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const employees = [
  { id: 2, code: 'NV002', name: 'An', phone: '0901', status: 'WORKING' as const },
  { id: 4, code: 'NV004', name: 'Bình', phone: '0902', status: 'WORKING' as const }
] as any;

describe('EmployeePayrollCreateModal', () => {
  it('defaults to the previous complete month and validates custom selection before one-shot submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollCreateModal visible employees={employees} now={new Date('2026-01-15T05:00:00Z')} onClose={() => {}} onSubmit={onSubmit} />); });
    expect(screen.root.findByProps({ testID: 'payroll-create-month' }).props.value).toBe('2025-12');
    await act(async () => screen.root.findByProps({ testID: 'payroll-scope-custom' }).props.onPress());
    expect(screen.root.findByProps({ testID: 'payroll-create-save' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => screen.root.findByProps({ testID: 'payroll-employee-2' }).props.onPress());
    await act(async () => { await screen.root.findByProps({ testID: 'payroll-create-save' }).props.onPress(); });
    expect(onSubmit).toHaveBeenCalledWith({ branchId: 1, month: '2025-12', scope: 'CUSTOM', employeeIds: [2] });
  });

  it('preserves month/scope/selection after a server failure and blocks duplicate pending submit', async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_, fail) => { reject = fail; });
    const onSubmit = vi.fn().mockReturnValue(pending);
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollCreateModal visible employees={employees} now={new Date('2026-10-01T00:00:00Z')} onClose={() => {}} onSubmit={onSubmit} />); });
    await act(async () => screen.root.findByProps({ testID: 'payroll-scope-custom' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'payroll-employee-4' }).props.onPress());
    const save = screen.root.findByProps({ testID: 'payroll-create-save' });
    act(() => { void save.props.onPress(); void save.props.onPress(); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('Kỳ lương bị chồng')));
    expect(screen.root.findByProps({ testID: 'payroll-create-error' }).props.children).toBe('Kỳ lương bị chồng');
    expect(screen.root.findByProps({ testID: 'payroll-create-month' }).props.value).toBe('2026-09');
    expect(screen.root.findByProps({ testID: 'payroll-employee-4' }).props.accessibilityState.selected).toBe(true);
  });
});
