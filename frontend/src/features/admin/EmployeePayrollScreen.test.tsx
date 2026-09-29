import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native, getWidth, setWidth, revisions } = vi.hoisted(() => {
  let width = 1280;
  const revisionState = { payroll: 0, employees: 0, attendance: 0 };
  const component = (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; };
  return { native: component, getWidth: () => width, setWidth: (next: number) => { width = next; }, revisions: revisionState };
});

vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'), AppState: { addEventListener: () => ({ remove: vi.fn() }) }, Modal: native('Modal'), Platform: { OS: 'web' }, Pressable: native('Pressable'),
  ScrollView: native('ScrollView'), StyleSheet: { create: (s: any) => s }, Text: native('Text'), TextInput: native('TextInput'), View: native('View'),
  useWindowDimensions: () => ({ width: getWidth(), height: 800 })
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({ employeePayrollRevision: revisions.payroll, employeesRevision: revisions.employees, employeeAttendanceRevision: revisions.attendance }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceBase: '#fff', surfaceCanvas: '#f5f7fa', surfaceRaised: '#fff', surfaceSunken: '#f4f6f8', textPrimary: '#172033', textSecondary: '#667085', textInverse: '#fff', borderSubtle: '#dfe7f1', primary: '#0b74e5', interactiveSecondary: '#eaf3ff', warning: '#a86100', danger: '#b42318', success: '#15803d' } }) }));
vi.mock('../../api/employeePayroll', () => ({
  fetchEmployeePayrollsApi: vi.fn(), fetchEmployeePayrollDetailApi: vi.fn(), createEmployeePayrollApi: vi.fn(),
  recalculateEmployeePayrollApi: vi.fn(), finalizeEmployeePayrollApi: vi.fn(), cancelEmployeePayrollApi: vi.fn(),
  addEmployeePayrollAdjustmentApi: vi.fn(), recordEmployeePayrollPaymentApi: vi.fn(), downloadEmployeePayrollApi: vi.fn()
}));
vi.mock('../../api/employeeManagement', () => ({ fetchEmployeesApi: vi.fn() }));
vi.mock('./EmployeePayrollCreateModal', () => ({ EmployeePayrollCreateModal: (props: any) => React.createElement('Modal', { testID: 'payroll-create-modal', ...props }) }));
vi.mock('./EmployeePayrollDetail', () => ({ EmployeePayrollDetail: (props: any) => React.createElement('View', { testID: 'payroll-detail', ...props }, React.createElement('Text', null, props.detail.name)) }));

import { fetchEmployeesApi } from '../../api/employeeManagement';
import { downloadEmployeePayrollApi, fetchEmployeePayrollDetailApi, fetchEmployeePayrollsApi } from '../../api/employeePayroll';
import { EmployeePayrollScreen } from './EmployeePayrollScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const list = {
  items: [{ id: 1, code: 'BL000001', name: 'Bảng lương tháng 9/2026', branchId: 1, frequency: 'MONTHLY', periodStart: '2026-09-01', periodEnd: '2026-09-30', status: 'CALCULATED', employeeCount: 2, totalGrossAmount: 20_000_000, totalAdjustmentAmount: 500_000, totalNetAmount: 20_500_000, totalPaidAmount: 5_000_000, totalRemainingAmount: 15_500_000, createdAt: '', updatedAt: '' }],
  summary: { totalGrossAmount: 20_000_000, totalAdjustmentAmount: 500_000, totalNetAmount: 20_500_000, totalPaidAmount: 5_000_000, totalRemainingAmount: 15_500_000 },
  pagination: { page: 1, pageSize: 15, totalItems: 16, totalPages: 2 }
} as any;
const detail = { ...list.items[0], branch: { id: 1, code: 'MAIN', name: 'Trung tâm' }, version: 1, sourceStale: false, createdBy: { id: 1, name: 'Admin' }, calculatedBy: null, finalizedBy: null, cancelledBy: null, calculatedAt: null, finalizedAt: null, cancelledAt: null, cancelReason: null, lines: [] } as any;

describe('EmployeePayrollScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks(); setWidth(1280); revisions.payroll = 0; revisions.employees = 0; revisions.attendance = 0;
    vi.mocked(fetchEmployeePayrollsApi).mockResolvedValue(list);
    vi.mocked(fetchEmployeePayrollDetailApi).mockResolvedValue(detail);
    vi.mocked(downloadEmployeePayrollApi).mockResolvedValue(new Blob(['payroll']));
    vi.mocked(fetchEmployeesApi).mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, summary: { totalCount: 0, workingCount: 0, resignedCount: 0 } });
  });

  it('renders truthful payroll columns and uses the full filtered summary', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollScreen />); await Promise.resolve(); });
    const text = JSON.stringify(screen.toJSON());
    expect(text).toContain('Kỳ hạn trả'); expect(text).toContain('Kỳ làm việc'); expect(text).toContain('Tổng lương');
    expect(text).toContain('Đã trả nhân viên'); expect(text).toContain('Còn cần trả'); expect(text).toContain('15.500.000');
    expect(fetchEmployeePayrollsApi).toHaveBeenCalledWith('admin-token', expect.objectContaining({ page: 1, pageSize: 15 }));
  });

  it('filters, paginates and expands a payroll row to fetch fresh detail', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'payroll-filter-finalized' }).props.onPress(); await Promise.resolve(); });
    expect(fetchEmployeePayrollsApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ status: ['FINALIZED'], page: 1 }));
    await act(async () => { screen.root.findByProps({ testID: 'payroll-page-next' }).props.onPress(); await Promise.resolve(); });
    expect(fetchEmployeePayrollsApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ page: 2 }));
    await act(async () => { screen.root.findByProps({ testID: 'payroll-row-1' }).props.onPress(); await Promise.resolve(); });
    expect(fetchEmployeePayrollDetailApi).toHaveBeenCalledWith('admin-token', 1);
    expect(screen.root.findByProps({ testID: 'payroll-detail' })).toBeDefined();
  });

  it('opens the create modal and collapses filters on compact screens', async () => {
    setWidth(600);
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollScreen />); await Promise.resolve(); });
    expect(screen.root.findByProps({ testID: 'payroll-filters-toggle' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'payroll-create-modal' }).props.visible).toBe(false);
    await act(async () => screen.root.findByProps({ testID: 'payroll-create-open' }).props.onPress());
    expect(screen.root.findByProps({ testID: 'payroll-create-modal' }).props.visible).toBe(true);
  });

  it('debounces search and exports the explicitly expanded payroll', async () => {
    vi.useFakeTimers();
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollScreen />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'payroll-search' }).props.onChangeText('tháng 9'); });
    await act(async () => { vi.advanceTimersByTime(249); await Promise.resolve(); });
    expect(fetchEmployeePayrollsApi).not.toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ search: 'tháng 9' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); await Promise.resolve(); await Promise.resolve(); });
    expect(fetchEmployeePayrollsApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ search: 'tháng 9', page: 1 }));
    await act(async () => { screen.root.findByProps({ testID: 'payroll-row-1' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'payroll-export' }).props.onPress(); await Promise.resolve(); });
    expect(downloadEmployeePayrollApi).toHaveBeenCalledWith('admin-token', 1, 'xlsx');
    vi.useRealTimers();
  });

  it('refetches from invalidation revisions while preserving an open create modal', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeePayrollScreen />); await Promise.resolve(); });
    await act(async () => screen.root.findByProps({ testID: 'payroll-create-open' }).props.onPress());
    const initialCalls = vi.mocked(fetchEmployeePayrollsApi).mock.calls.length;
    revisions.payroll += 1;
    await act(async () => { screen.update(<EmployeePayrollScreen />); await Promise.resolve(); });
    expect(vi.mocked(fetchEmployeePayrollsApi).mock.calls.length).toBeGreaterThan(initialCalls);
    expect(screen.root.findByProps({ testID: 'payroll-create-modal' }).props.visible).toBe(true);

    await act(async () => { screen.root.findByProps({ testID: 'payroll-row-1' }).props.onPress(); await Promise.resolve(); });
    const detailCallsBeforeSourceRevision = vi.mocked(fetchEmployeePayrollDetailApi).mock.calls.length;
    vi.mocked(fetchEmployeePayrollDetailApi).mockResolvedValue({ ...detail, sourceStale: true });
    revisions.attendance += 1;
    await act(async () => { screen.update(<EmployeePayrollScreen />); await Promise.resolve(); });
    expect(vi.mocked(fetchEmployeePayrollDetailApi).mock.calls.length).toBeGreaterThan(detailCallsBeforeSourceRevision);
    expect(screen.root.findByProps({ testID: 'payroll-detail' }).props.detail.sourceStale).toBe(true);
    expect(screen.root.findByProps({ testID: 'payroll-create-modal' }).props.visible).toBe(true);
  });
});
