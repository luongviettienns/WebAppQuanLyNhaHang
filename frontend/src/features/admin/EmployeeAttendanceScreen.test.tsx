import React from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceExceptionListDto, AttendanceWeekDto } from '../../api/employeeAttendance';

const { fetchWeek, fetchExceptions, resolveConflict } = vi.hoisted(() => ({ fetchWeek: vi.fn(), fetchExceptions: vi.fn(), resolveConflict: vi.fn() }));
const { native } = vi.hoisted(() => ({ native: (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; } }));
vi.mock('../../api/employeeAttendance', () => ({
  fetchAttendanceWeekApi: fetchWeek, fetchAttendanceExceptionsApi: fetchExceptions,
  createManualAttendanceSessionApi: vi.fn(), updateAttendanceSessionApi: vi.fn(), markAttendanceAbsentApi: vi.fn(), resolveAttendanceAbsenceConflictApi: resolveConflict,
  AttendanceApiError: class AttendanceApiError extends Error {}
}));
vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'), AppState: { addEventListener: () => ({ remove: vi.fn() }) },
  Platform: { OS: 'web' }, Pressable: native('Pressable'), ScrollView: native('ScrollView'),
  StyleSheet: { create: (s: any) => s }, Text: native('Text'), TextInput: native('TextInput'),
  View: native('View'), useWindowDimensions: () => ({ width: 1100 })
}));
vi.mock('lucide-react-native', () => { const Icon = native('Icon'); return { CalendarDays: Icon, ChevronLeft: Icon, ChevronRight: Icon, ClipboardCheck: Icon, Monitor: Icon, Search: Icon }; });
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
const revisions = { attendance: 0, settings: 0 };
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({ employeeAttendanceRevision: revisions.attendance, employeeSettingsRevision: revisions.settings }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  surfaceBase: '#fff', surfaceCanvas: '#f4f3f0', surfaceRaised: '#fff', interactiveSecondary: '#fff1dd',
  primary: '#b42318', textPrimary: '#24211f', textSecondary: '#6b6560', borderSubtle: '#d8d4ce'
} }) }));
vi.mock('../../theme', () => ({ radii: { md: 8, sm: 4, pill: 99 }, spacing: { xs: 4, sm: 8, md: 12, lg: 20 }, typography: { families: { bodySemibold: 'Inter', body: 'Inter' }, sizes: { sm: 13, md: 15, lg: 20 } } }));
vi.mock('../../ui', () => ({ AppIcon: () => React.createElement('Icon') }));
vi.mock('./EmployeeAttendanceCorrectionModal', () => ({ EmployeeAttendanceCorrectionModal: (props: { visible: boolean; kind: string; row: { id: string } | null; onSubmit: (input: unknown) => void }) => React.createElement('View', { testID: 'attendance-correction-modal', visible: props.visible, kind: props.kind, rowId: props.row?.id, onSubmit: props.onSubmit }) }));
vi.mock('./EmployeeAttendanceKioskSessionsModal', () => ({ EmployeeAttendanceKioskSessionsModal: (props: { visible: boolean }) => React.createElement('View', { testID: 'attendance-kiosk-sessions-modal', visible: props.visible }) }));
import { EmployeeAttendanceScreen } from './EmployeeAttendanceScreen';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const week: AttendanceWeekDto = {
  branch: { id: 1, code: 'MAIN' }, weekStart: '2026-09-28', weekEnd: '2026-10-04', view: 'shift',
  rows: [{
    id: 'schedule:11:2026-09-29', kind: 'SCHEDULED', workDate: '2026-09-29', scheduleRuleId: 11, scheduleDate: '2026-09-29',
    employee: { id: 4, code: 'NV000004', name: 'An', departmentName: 'Bếp', jobTitleName: 'Đầu bếp' },
    shift: { name: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720 }, occurrenceStatus: 'NOT_CLOCKED',
    reviewConflict: false, disposition: null, classification: null, sessions: []
  }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 }
};

describe('EmployeeAttendanceScreen', () => {
  beforeEach(() => {
    revisions.attendance = 0; revisions.settings = 0;
    fetchWeek.mockReset().mockImplementation(async (_token: string, query: { view?: string }) => ({ ...week, view: query.view ?? 'shift' }));
    fetchExceptions.mockReset().mockResolvedValue({ branch: week.branch, weekStart: week.weekStart, weekEnd: week.weekEnd,
      status: 'OPEN', rows: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } satisfies AttendanceExceptionListDto);
    resolveConflict.mockReset().mockResolvedValue({});
  });

  it('refetches the attendance board when branch settings are invalidated', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    const before = fetchWeek.mock.calls.length;
    revisions.settings += 1;
    await act(async () => { screen.update(<EmployeeAttendanceScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    expect(fetchWeek.mock.calls.length).toBeGreaterThan(before);
  });

  it('loads the week for the MAIN branch and renders the unclocked state without inventing absence', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    expect(fetchWeek).toHaveBeenCalledWith('admin-token', expect.objectContaining({ weekStart: '2026-09-28', branchId: 1, view: 'shift' }));
    const text = screen.root.findAllByType('Text').map((node: ReactTestInstance) => String(node.props.children));
    expect(text.some((value: string) => value.includes('MAIN'))).toBe(true);
    expect(text.some((value: string) => value.includes('Chưa chấm công'))).toBe(true);
    expect(text.some((value: string) => value.includes('Vắng mặt'))).toBe(false);
    const dayHeaderIds = new Set(screen.root.findAll((node: ReactTestInstance) => String(node.props.testID ?? '').startsWith('attendance-day-')).map((node: ReactTestInstance) => node.props.testID));
    expect(dayHeaderIds.size).toBe(7);
    await act(async () => { screen.root.findByProps({ testID: 'attendance-row-schedule:11:2026-09-29' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'attendance-correction-modal' }).props).toMatchObject({ visible: true, kind: 'manual', rowId: 'schedule:11:2026-09-29' });
    await act(async () => screen.unmount());
  });

  it('switches view using the same weekly endpoint and opens the exception queue', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'attendance-view-employee' }).props.onPress(); await Promise.resolve(); });
    expect(fetchWeek).toHaveBeenLastCalledWith('admin-token', expect.objectContaining({ view: 'employee', weekStart: '2026-09-28' }));
    await act(async () => { screen.root.findByProps({ testID: 'attendance-open-exceptions' }).props.onPress(); await Promise.resolve(); });
    expect(fetchExceptions).toHaveBeenCalledWith('admin-token', expect.objectContaining({ status: 'OPEN', branchId: 1 }));
    expect(screen.root.findByProps({ testID: 'attendance-exceptions-panel' })).toBeDefined();
    await act(async () => { screen.root.findByProps({ testID: 'attendance-open-kiosk-sessions' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'attendance-kiosk-sessions-modal' }).props.visible).toBe(true);
    await act(async () => screen.unmount());
  });

  it('fetches every page so a busy week is not silently truncated at the first hundred rows', async () => {
    const firstPage = { ...week, pagination: { page: 1, pageSize: 100, total: 101, totalPages: 2 } };
    const secondRow = { ...week.rows[0], id: 'schedule:12:2026-09-29', scheduleRuleId: 12,
      employee: { ...week.rows[0].employee, id: 5, name: 'Bình', code: 'NV000005' } };
    fetchWeek.mockImplementation(async (_token: string, query: { page?: number; view?: string }) => query.page === 1
      ? { ...firstPage, view: query.view ?? 'shift' }
      : { ...week, rows: [secondRow], pagination: { page: 2, pageSize: 100, total: 101, totalPages: 2 }, view: query.view ?? 'shift' });
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    expect(fetchWeek).toHaveBeenCalledTimes(2);
    expect(screen.root.findAllByType('Text').some((node: ReactTestInstance) => String(node.props.children).includes('Bình'))).toBe(true);
    await act(async () => screen.unmount());
  });

  it('resolves an absence conflict by keeping the actual session and sending the disposition id with reason', async () => {
    const conflictRow = {
      ...week.rows[0], occurrenceStatus: 'ATTENDED' as const, reviewConflict: true,
      disposition: { id: 55, type: 'ABSENT' as const, reason: 'Đã gọi xác nhận', createdAt: '2026-09-29T05:30:00.000Z' },
      sessions: [{ id: 91, checkInAt: '2026-09-29T01:07:00.000Z', checkOutAt: null, linkStatus: 'SCHEDULED' as const,
        plannedShiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720,
        classification: { sessionStatus: 'OPEN' as const, linkStatus: 'SCHEDULED' as const, checkInTiming: 'LATE' as const,
          checkInAfterShiftEnd: false, checkInDeltaMinutes: 7, checkOutTiming: 'N/A' as const, checkOutDeltaMinutes: null,
          checkInAt: '2026-09-29T01:07:00.000Z', checkOutAt: null } }]
    };
    fetchExceptions.mockResolvedValue({ branch: week.branch, weekStart: week.weekStart, weekEnd: week.weekEnd, status: 'OPEN',
      rows: [{ ...conflictRow, exceptionType: 'REVIEW_CONFLICT', status: 'OPEN' }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } } satisfies AttendanceExceptionListDto);
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceScreen initialWeekStart="2026-09-28" />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'attendance-open-exceptions' }).props.onPress(); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'attendance-resolve-conflict-schedule:11:2026-09-29' }).props.onPress(); });
    const modal = screen.root.findByProps({ testID: 'attendance-correction-modal' });
    expect(modal.props).toMatchObject({ visible: true, kind: 'resolve-conflict' });
    await act(async () => { await modal.props.onSubmit({ reason: 'Giữ phiên thực tế đã xác minh' }); });
    expect(resolveConflict).toHaveBeenCalledWith('admin-token', 55, { reason: 'Giữ phiên thực tế đã xác minh' });
    await act(async () => screen.unmount());
  });
});
