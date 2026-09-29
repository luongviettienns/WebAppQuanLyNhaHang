import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createNativeComponent } = vi.hoisted(() => ({
  createNativeComponent: (name: string) => {
    const Component = (props: any) => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  }
}));
const api = vi.hoisted(() => ({
  fetchEmployeeScheduleWeekApi: vi.fn(), fetchEmployeeScheduleShiftsApi: vi.fn(), createEmployeeScheduleBatchApi: vi.fn(),
  patchEmployeeScheduleRuleApi: vi.fn(), deleteEmployeeScheduleRuleApi: vi.fn(), createWorkShiftApi: vi.fn(),
  previewEmployeeScheduleImportApi: vi.fn(), commitEmployeeScheduleImportApi: vi.fn(),
  downloadEmployeeScheduleExportApi: vi.fn(), downloadEmployeeScheduleTemplateApi: vi.fn(), fetchEmployeesApi: vi.fn(), showToast: vi.fn()
}));
const screenState = vi.hoisted(() => ({
  width: 1280, employeeSchedulesRevision: 0, employeesRevision: 0, platform: 'web',
  appStateListener: null as null | ((state: string) => void), appStateRemove: vi.fn()
}));

vi.mock('react-native', () => ({
  ActivityIndicator: createNativeComponent('ActivityIndicator'), AppState: { addEventListener: vi.fn((_event: string, listener: (state: string) => void) => {
    screenState.appStateListener = listener;
    return { remove: screenState.appStateRemove };
  }) }, Alert: { alert: vi.fn() }, Modal: createNativeComponent('Modal'),
  Platform: { get OS() { return screenState.platform; } }, Pressable: createNativeComponent('Pressable'), ScrollView: createNativeComponent('ScrollView'),
  StyleSheet: { create: (styles: any) => styles }, Text: createNativeComponent('Text'), TextInput: createNativeComponent('TextInput'),
  View: createNativeComponent('View'), useWindowDimensions: () => ({ width: screenState.width, height: 900 })
}));
vi.mock('lucide-react-native', () => {
  const Icon = createNativeComponent('Icon');
  return { CalendarDays: Icon, ChevronLeft: Icon, ChevronRight: Icon, Download: Icon, FileSpreadsheet: Icon, Search: Icon, Upload: Icon, Plus: Icon, X: Icon };
});
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({
  employeeSchedulesRevision: screenState.employeeSchedulesRevision, employeesRevision: screenState.employeesRevision
}) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  mode: 'light', surfaceCanvas: '#F4F3F0', surfaceBase: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#ECEAE6',
  textPrimary: '#24211F', textSecondary: '#6B6560', textInverse: '#FFFFFF', borderSubtle: '#D8D4CE', borderStrong: '#BDB7AF',
  focusRing: '#0F6CBD', primary: '#B42318', success: '#15803D', danger: '#B42318', warning: '#C66A15',
  interactivePrimary: '#B42318', interactivePrimaryPressed: '#8F1C13', interactiveSecondary: '#FFF1DD',
  interactiveSecondaryPressed: '#F8D9B2', interactiveQuiet: '#F4F3F0', interactiveDanger: '#B42318', interactiveDangerPressed: '#8F1C13'
} }) }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: api.showToast }) }));
vi.mock('../../api/employeeScheduleManagement', () => api);
vi.mock('../../api/employeeManagement', () => ({ fetchEmployeesApi: api.fetchEmployeesApi }));
vi.mock('../../ui', () => ({
  AppIcon: () => React.createElement('Icon'),
  Button: ({ label, onPress, disabled, loading, testID }: any) => React.createElement('Pressable', { onPress, disabled: disabled || loading, loading, testID }, React.createElement('Text', null, label)),
  EmptyState: ({ title, description, action, testID }: any) => React.createElement('View', { testID }, React.createElement('Text', null, title), React.createElement('Text', null, description), action),
  Field: ({ label, testID, accessibilityLabel, ...props }: any) => React.createElement('View', null, React.createElement('Text', null, label), React.createElement('TextInput', { testID, accessibilityLabel, ...props })),
  InlineAlert: ({ title, message, testID }: any) => React.createElement('Text', { testID }, `${title || ''}: ${message}`),
  ScreenHeader: ({ title, description, actions }: any) => React.createElement('View', null, React.createElement('Text', null, title), React.createElement('Text', null, description), actions),
  Surface: ({ children, style, ...props }: any) => React.createElement('View', { ...props, style }, children)
}));

import { EmployeeScheduleScreen } from './EmployeeScheduleScreen';
import type { EmployeeScheduleWeekDto } from '../../api/employeeScheduleManagement';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const weekData = (withOccurrence = false, withSecondEmployee = false, occurrenceDate = '2026-09-30'): EmployeeScheduleWeekDto => ({
  weekStart: '2026-09-28', weekEnd: '2026-10-04',
  employees: [{
    id: 5, code: 'NV00005', name: 'Nguyễn An', status: 'WORKING', department: { id: 2, name: 'Bếp' }, jobTitle: null,
    occurrences: withOccurrence ? [{ ruleId: 12, employeeId: 5, shiftId: 2, recurrenceType: 'WEEKLY', workDate: occurrenceDate, ruleStartDate: '2026-09-07', ruleEndDate: null, dayOfWeek: occurrenceDate === '2026-09-28' ? 1 : 3, shiftCode: 'MORNING', shiftName: 'Ca sáng', startMinute: 480, endMinute: 720 }] : [],
    compensation: { amount: 640000, status: 'ESTIMATED' }
  }, ...(withSecondEmployee ? [{ id: 6, code: 'NV00006', name: 'Trần Bình', status: 'WORKING' as const, department: null, jobTitle: null, occurrences: [], compensation: { amount: null, status: 'COMPENSATION_NOT_CONFIGURED' as const } }] : [])],
  pagination: { page: 1, pageSize: 50, totalRows: withSecondEmployee ? 2 : 1, totalPages: 1 }
});

describe('employee schedule screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-29T12:00:00+07:00'));
    screenState.width = 1280; screenState.employeeSchedulesRevision = 0; screenState.employeesRevision = 0;
    screenState.platform = 'web'; screenState.appStateListener = null;
    api.fetchEmployeeScheduleWeekApi.mockResolvedValue(weekData());
    api.fetchEmployeeScheduleShiftsApi.mockResolvedValue([
      { id: 2, code: 'MORNING', name: 'Ca sáng', startMinute: 480, endMinute: 720, isActive: true },
      { id: 3, code: 'AFTERNOON', name: 'Ca chiều', startMinute: 780, endMinute: 1020, isActive: true }
    ]);
    api.createEmployeeScheduleBatchApi.mockResolvedValue({ createdCount: 1, rules: [] });
    api.patchEmployeeScheduleRuleApi.mockResolvedValue({ updated: true, createdCount: 1, rules: [] });
    api.deleteEmployeeScheduleRuleApi.mockResolvedValue({ deleted: true });
    api.fetchEmployeesApi.mockResolvedValue({ items: [{ id: 5, code: 'NV00005', name: 'Nguyễn An', status: 'WORKING' }], pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, summary: { totalCount: 1, workingCount: 1, resignedCount: 0 } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('reveals + Thêm lịch in a selected blank cell and prefills employee and exact date', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-29' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'schedule-add-cell-button' })).toBeDefined();
    expect(screen.root.findAllByProps({ testID: 'employee-schedule-modal' })).toHaveLength(0);
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-cell-button' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-schedule-modal' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'schedule-date' }).props.value).toBe('2026-09-29');
    expect(screen.root.findByProps({ testID: 'schedule-employee-5' })).toBeDefined();
    await act(async () => screen.unmount());
  });

  it('saves a new batch and refreshes the selected week immediately', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-29' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-cell-button' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-shift-2' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-save' }).props.onPress(); await Promise.resolve(); });
    expect(api.createEmployeeScheduleBatchApi).toHaveBeenCalledWith('admin-token', expect.objectContaining({ employeeIds: [5], shiftIds: [2], startDate: '2026-09-29' }));
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenCalledTimes(2);
    expect(screen.root.findAllByProps({ testID: 'employee-schedule-modal' })).toHaveLength(0);
    await act(async () => screen.unmount());
  });

  it('keeps save pending controls disabled and confirms success after the server responds', async () => {
    let finishSave!: (value: { createdCount: number; rules: [] }) => void;
    api.createEmployeeScheduleBatchApi.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-29' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-cell-button' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-shift-2' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-save' }).props.onPress(); await Promise.resolve(); });
    expect(screen.root.findByProps({ testID: 'schedule-save' }).props.loading).toBe(true);
    expect(screen.root.findByProps({ testID: 'schedule-cancel' }).props.disabled).toBe(true);

    await act(async () => { finishSave({ createdCount: 1, rules: [] }); await Promise.resolve(); await Promise.resolve(); });
    expect(api.showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Đã thêm lịch' }));
    expect(screen.root.findAllByProps({ testID: 'employee-schedule-modal' })).toHaveLength(0);
    await act(async () => screen.unmount());
  });

  it('opens an occupied occurrence for edit and preserves the selected scope', async () => {
    api.fetchEmployeeScheduleWeekApi.mockResolvedValue(weekData(true));
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-occurrence-12-2026-09-30' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-schedule-modal' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'schedule-scope-following' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-save' }).props.onPress(); await Promise.resolve(); });
    expect(api.patchEmployeeScheduleRuleApi).toHaveBeenCalledWith('admin-token', 12, expect.objectContaining({ workDate: '2026-09-30', scope: 'following', shiftIds: [2] }));
    await act(async () => screen.unmount());
  });

  it('moves to the adjacent week and searches employees through the week API', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-week-next' }).props.onPress(); await Promise.resolve(); });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ weekStart: '2026-10-05' }));
    await act(async () => { screen.root.findByProps({ testID: 'schedule-search' }).props.onChangeText('Nguyễn'); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ search: 'Nguyễn' }));
    await act(async () => screen.unmount());
  });

  it('supports a multi-employee weekly batch with an explicit end date', async () => {
    api.fetchEmployeeScheduleWeekApi.mockResolvedValue(weekData(false, true));
    api.fetchEmployeesApi.mockResolvedValueOnce({ items: [
      { id: 5, code: 'NV00005', name: 'Nguyễn An', status: 'WORKING' },
      { id: 6, code: 'NV00006', name: 'Trần Bình', status: 'WORKING' }
    ], pagination: { page: 1, pageSize: 25, totalRows: 2, totalPages: 1 }, summary: { totalCount: 2, workingCount: 2, resignedCount: 0 } });
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-29' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-cell-button' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-employee-6' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-shift-2' }).props.onPress(); screen.root.findByProps({ testID: 'schedule-shift-3' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-repeat-toggle' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-end-date' }).props.onChangeText('2026-10-27'); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-save' }).props.onPress(); await Promise.resolve(); });
    expect(api.createEmployeeScheduleBatchApi).toHaveBeenCalledWith('admin-token', {
      employeeIds: [5, 6], shiftIds: [2, 3], startDate: '2026-09-29', repeatWeekly: true, endDate: '2026-10-27'
    });
    await act(async () => screen.unmount());
  });

  it('keeps the modal and entered date visible when the server rejects a schedule conflict', async () => {
    api.createEmployeeScheduleBatchApi.mockRejectedValue(new Error('Ca làm bị chồng giờ'));
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-29' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-cell-button' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-shift-2' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-save' }).props.onPress(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(screen.root.findByProps({ testID: 'employee-schedule-modal' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'schedule-date' }).props.value).toBe('2026-09-29');
    expect(JSON.stringify(screen.toJSON())).toContain('Ca làm bị chồng giờ');
    await act(async () => screen.unmount());
  });

  it('creates a custom shift from the add-schedule modal and selects it for the batch', async () => {
    api.createWorkShiftApi.mockResolvedValue({ id: 9, code: 'LATE', name: 'Ca trễ', startMinute: 1320, endMinute: 1440, isActive: true });
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-29' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-cell-button' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-shift' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-new-shift-code' }).props.onChangeText('LATE'); screen.root.findByProps({ testID: 'schedule-new-shift-name' }).props.onChangeText('Ca trễ'); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-new-shift-start' }).props.onChangeText('22:00'); screen.root.findByProps({ testID: 'schedule-new-shift-end' }).props.onChangeText('24:00'); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-create-shift' }).props.onPress(); await Promise.resolve(); });
    expect(api.createWorkShiftApi).toHaveBeenCalledWith('admin-token', { code: 'LATE', name: 'Ca trễ', startMinute: 1320, endMinute: 1440 });
    expect(screen.root.findByProps({ testID: 'schedule-shift-9' }).props.accessibilityState.checked).toBe(true);
    await act(async () => screen.unmount());
  });

  it('requires explicit confirmation before deleting an occurrence or recurring range', async () => {
    api.fetchEmployeeScheduleWeekApi.mockResolvedValue(weekData(true));
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-occurrence-12-2026-09-30' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-delete-start' }).props.onPress(); });
    expect(api.deleteEmployeeScheduleRuleApi).not.toHaveBeenCalled();
    await act(async () => { screen.root.findByProps({ testID: 'schedule-delete-confirm' }).props.onPress(); await Promise.resolve(); });
    expect(api.deleteEmployeeScheduleRuleApi).toHaveBeenCalledWith('admin-token', 12, { workDate: '2026-09-30', scope: 'occurrence' });
    await act(async () => screen.unmount());
  });

  it('paginates employee rows and exposes import and week export actions', async () => {
    const twoPageResponse = weekData();
    twoPageResponse.pagination.totalRows = 51;
    twoPageResponse.pagination.totalPages = 2;
    api.fetchEmployeeScheduleWeekApi.mockResolvedValue(twoPageResponse);
    api.downloadEmployeeScheduleExportApi.mockResolvedValue(new Blob(['schedule']));
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-page-next' }).props.onPress(); await Promise.resolve(); });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ page: 2, pageSize: 50 }));
    await act(async () => { screen.root.findByProps({ testID: 'schedule-import' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'employee-schedule-import-modal' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'schedule-import-cancel' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-export-csv' }).props.onPress(); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(api.downloadEmployeeScheduleExportApi).toHaveBeenCalledWith('admin-token', '2026-09-28', 'csv');
    await act(async () => screen.unmount());
  });

  it('reloads only for schedule socket revisions and keeps the week grid horizontally scrollable on mobile', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenCalledTimes(1);
    await act(async () => {
      screenState.employeesRevision += 1;
      screen.update(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />);
    });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenCalledTimes(1);
    await act(async () => {
      screenState.employeeSchedulesRevision += 1;
      screen.update(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />);
      await Promise.resolve();
    });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenCalledTimes(2);
    await act(async () => {
      screenState.width = 390;
      screen.update(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />);
    });
    const horizontalGrid = screen.root.findAllByType('ScrollView').find((node: any) => node.props.horizontal);
    expect(horizontalGrid.props.contentContainerStyle.minWidth).toBeGreaterThan(390);
    expect(JSON.stringify(screen.toJSON())).toContain('Excel');
    await act(async () => screen.unmount());
  });

  it('preserves unsaved modal input when a schedule refresh replaces employee data', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-29' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-cell-button' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-date' }).props.onChangeText('2026-10-01'); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-shift-2' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-repeat-toggle' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-end-date' }).props.onChangeText('2026-10-27'); });

    const refreshedWeek = weekData();
    refreshedWeek.employees[0].name = 'Nguyễn An (đã cập nhật)';
    api.fetchEmployeeScheduleWeekApi.mockResolvedValueOnce(refreshedWeek);
    await act(async () => {
      screenState.employeeSchedulesRevision += 1;
      screen.update(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />);
      await Promise.resolve();
    });

    expect(screen.root.findByProps({ testID: 'schedule-date' }).props.value).toBe('2026-10-01');
    expect(screen.root.findByProps({ testID: 'schedule-shift-2' }).props.accessibilityState.checked).toBe(true);
    expect(screen.root.findByProps({ testID: 'schedule-repeat-toggle' }).props.accessibilityState.checked).toBe(true);
    expect(screen.root.findByProps({ testID: 'schedule-end-date' }).props.value).toBe('2026-10-27');
    expect(JSON.stringify(screen.toJSON())).toContain('Nguyễn An (đã cập nhật)');
    await act(async () => screen.unmount());
  });

  it('renders past shifts read-only while keeping their recorded details visible', async () => {
    api.fetchEmployeeScheduleWeekApi.mockResolvedValue(weekData(true, false, '2026-09-28'));
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    const pastShift = screen.root.findByProps({ testID: 'schedule-occurrence-12-2026-09-28' });
    expect(pastShift.props.onPress).toBeUndefined();
    expect(pastShift.props.accessibilityRole).not.toBe('button');
    expect(screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-28' }).props.disabled).toBe(true);
    expect(screen.root.findAllByProps({ testID: 'schedule-add-cell-button' })).toHaveLength(0);
    expect(pastShift.findAllByType('Text').map((node: any) => node.children.join('')).join(' ')).toContain('Ca sáng');
    await act(async () => screen.unmount());
  });

  it('keeps the employee identity column outside the horizontally scrolling day grid', async () => {
    screenState.width = 390;
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    const fixedColumn = screen.root.findByProps({ testID: 'schedule-fixed-employee-column' });
    const dayScroll = screen.root.findByProps({ testID: 'schedule-days-scroll' });
    let ancestor = fixedColumn.parent;
    let nestedInDayScroll = false;
    while (ancestor) { if (ancestor === dayScroll) nestedInDayScroll = true; ancestor = ancestor.parent; }
    expect(dayScroll.props.horizontal).toBe(true);
    expect(nestedInDayScroll).toBe(false);
    expect(screen.root.findByProps({ testID: 'schedule-employee-name-5' })).toBeDefined();
    await act(async () => screen.unmount());
  });

  it('can select a working employee from another schedule page in one atomic batch', async () => {
    api.fetchEmployeesApi
      .mockResolvedValueOnce({ items: [{ id: 5, code: 'NV00005', name: 'Nguyễn An', status: 'WORKING' }], pagination: { page: 1, pageSize: 25, totalRows: 51, totalPages: 3 }, summary: { totalCount: 51, workingCount: 51, resignedCount: 0 } })
      .mockResolvedValueOnce({ items: [{ id: 51, code: 'NV00051', name: 'Trần Mai', status: 'WORKING' }], pagination: { page: 2, pageSize: 25, totalRows: 51, totalPages: 3 }, summary: { totalCount: 51, workingCount: 51, resignedCount: 0 } });
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-cell-5-2026-09-29' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-add-cell-button' }).props.onPress(); await Promise.resolve(); });
    expect(api.fetchEmployeesApi).toHaveBeenCalledWith('admin-token', expect.objectContaining({ status: 'WORKING', page: 1, pageSize: 25 }));
    await act(async () => { screen.root.findByProps({ testID: 'schedule-employee-page-next' }).props.onPress(); await Promise.resolve(); });
    expect(screen.root.findByProps({ testID: 'schedule-employee-51' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'schedule-employee-51' }).props.onPress(); screen.root.findByProps({ testID: 'schedule-shift-2' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'schedule-save' }).props.onPress(); await Promise.resolve(); });
    expect(api.createEmployeeScheduleBatchApi).toHaveBeenCalledWith('admin-token', expect.objectContaining({ employeeIds: [5, 51], shiftIds: [2] }));
    await act(async () => screen.unmount());
  });

  it('refetches after browser focus and visible-tab events and removes both listeners on unmount', async () => {
    const listeners = { window: new Map<string, () => void>(), document: new Map<string, () => void>() };
    const windowStub = { addEventListener: vi.fn((name: string, handler: () => void) => listeners.window.set(name, handler)), removeEventListener: vi.fn((name: string) => listeners.window.delete(name)) };
    const documentStub = { visibilityState: 'visible', addEventListener: vi.fn((name: string, handler: () => void) => listeners.document.set(name, handler)), removeEventListener: vi.fn((name: string) => listeners.document.delete(name)) };
    vi.stubGlobal('window', windowStub); vi.stubGlobal('document', documentStub);
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { listeners.window.get('focus')?.(); await Promise.resolve(); });
    await act(async () => { listeners.document.get('visibilitychange')?.(); await Promise.resolve(); });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenCalledTimes(3);
    await act(async () => screen.unmount());
    expect(windowStub.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(documentStub.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('refetches the schedule when a native app returns to the active state', async () => {
    screenState.platform = 'ios';
    let screen: any;
    await act(async () => { screen = create(<EmployeeScheduleScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenCalledTimes(1);
    expect(screenState.appStateListener).toBeTypeOf('function');
    await act(async () => { screenState.appStateListener?.('background'); await Promise.resolve(); });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenCalledTimes(1);
    await act(async () => { screenState.appStateListener?.('active'); await Promise.resolve(); });
    expect(api.fetchEmployeeScheduleWeekApi).toHaveBeenCalledTimes(2);
    await act(async () => screen.unmount());
    expect(screenState.appStateRemove).toHaveBeenCalledOnce();
  });
});
