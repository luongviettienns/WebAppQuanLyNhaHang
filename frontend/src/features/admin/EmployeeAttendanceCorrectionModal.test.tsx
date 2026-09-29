import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { AttendanceWeekRowDto } from '../../api/employeeAttendance';

const { native } = vi.hoisted(() => ({ native: (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; } }));
vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'), Modal: native('Modal'), Pressable: native('Pressable'),
  ScrollView: native('ScrollView'), StyleSheet: { create: (s: any) => s }, Text: native('Text'),
  TextInput: native('TextInput'), View: native('View')
}));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  surfaceBase: '#fff', surfaceCanvas: '#f4f3f0', primary: '#b42318', textPrimary: '#24211f',
  textSecondary: '#6b6560', borderSubtle: '#d8d4ce', interactiveSecondary: '#fff1dd'
} }) }));
vi.mock('../../theme', () => ({ radii: { md: 8, sm: 4 }, spacing: { xs: 4, sm: 8, md: 12, lg: 20 }, typography: { families: { bodySemibold: 'Inter', body: 'Inter' }, sizes: { sm: 13, md: 15, lg: 18 } } }));
import { EmployeeAttendanceCorrectionModal } from './EmployeeAttendanceCorrectionModal';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const scheduledRow = {
  id: 'schedule:11:2026-09-29', kind: 'SCHEDULED', workDate: '2026-09-29', scheduleRuleId: 11, scheduleDate: '2026-09-29',
  employee: { id: 4, code: 'NV000004', name: 'An', departmentName: null, jobTitleName: null },
  shift: { name: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720 },
  occurrenceStatus: 'NOT_CLOCKED', reviewConflict: false, disposition: null, classification: null, sessions: []
} satisfies AttendanceWeekRowDto;
const conflictRow: AttendanceWeekRowDto = {
  ...scheduledRow, occurrenceStatus: 'ATTENDED', reviewConflict: true,
  disposition: { id: 8, type: 'ABSENT', reason: 'Đã gọi xác nhận', createdAt: '2026-09-29T05:00:00.000Z' },
  sessions: [{ id: 31, checkInAt: '2026-09-29T01:07:00.000Z', checkOutAt: null, linkStatus: 'SCHEDULED',
    plannedShiftName: 'Ca sáng', plannedStartMinute: 480, plannedEndMinute: 720,
    classification: { sessionStatus: 'OPEN', linkStatus: 'SCHEDULED', checkInTiming: 'LATE', checkInAfterShiftEnd: false,
      checkInDeltaMinutes: 7, checkOutTiming: 'N/A', checkOutDeltaMinutes: null, checkInAt: '2026-09-29T01:07:00.000Z', checkOutAt: null } }]
};

describe('EmployeeAttendanceCorrectionModal', () => {
  it('requires a reason and real check-in time before submitting a manual session', async () => {
    const onSubmit = vi.fn();
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceCorrectionModal visible kind="manual" row={scheduledRow} saving={false} onCancel={vi.fn()} onSubmit={onSubmit} />); });
    expect(screen.root.findByProps({ testID: 'attendance-correction-save' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      screen.root.findByProps({ testID: 'attendance-check-in-input' }).props.onChangeText('2026-09-29T08:07:00+07:00');
      screen.root.findByProps({ testID: 'attendance-correction-reason' }).props.onChangeText('Kiosk mất kết nối');
    });
    await act(async () => screen.root.findByProps({ testID: 'attendance-correction-save' }).props.onPress());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 4, branchId: 1, checkInAt: '2026-09-29T08:07:00+07:00',
      scheduleRuleId: 11, scheduleDate: '2026-09-29', reason: 'Kiosk mất kết nối'
    }));
    await act(async () => screen.unmount());
  });

  it('requires an auditable reason before confirming absence', async () => {
    const onSubmit = vi.fn();
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceCorrectionModal visible kind="absent" row={scheduledRow} saving={false} onCancel={vi.fn()} onSubmit={onSubmit} />); });
    expect(screen.root.findByProps({ testID: 'attendance-correction-save' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => screen.root.findByProps({ testID: 'attendance-correction-reason' }).props.onChangeText('Đã xác minh với quản lý'));
    await act(async () => screen.root.findByProps({ testID: 'attendance-correction-save' }).props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({ branchId: 1, reason: 'Đã xác minh với quản lý' });
    await act(async () => screen.unmount());
  });

  it('explains the conflict resolution and only submits the reason, preserving actual punch data', async () => {
    const onSubmit = vi.fn();
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceCorrectionModal visible kind="resolve-conflict" row={conflictRow} saving={false} onCancel={vi.fn()} onSubmit={onSubmit} />); });
    expect(screen.root.findByProps({ testID: 'attendance-conflict-resolution-summary' })).toBeDefined();
    expect(screen.root.findAllByProps({ testID: 'attendance-check-in-input' })).toHaveLength(0);
    expect(screen.root.findByProps({ testID: 'attendance-correction-save' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => screen.root.findByProps({ testID: 'attendance-correction-reason' }).props.onChangeText('Giữ phiên thực tế đã xác minh'));
    await act(async () => screen.root.findByProps({ testID: 'attendance-correction-save' }).props.onPress());
    expect(onSubmit).toHaveBeenCalledWith({ reason: 'Giữ phiên thực tế đã xác minh' });
    await act(async () => screen.unmount());
  });
});
