import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { list, createSession, revoke } = vi.hoisted(() => ({ list: vi.fn(), createSession: vi.fn(), revoke: vi.fn() }));
const { native } = vi.hoisted(() => ({ native: (name: string) => {
  const Component = (props: any) => React.createElement(name, props, props.children);
  Component.displayName = name;
  return Component;
} }));
vi.mock('../../api/employeeAttendance', () => ({
  fetchAttendanceKioskSessionsApi: list, createAttendanceKioskSessionApi: createSession, revokeAttendanceKioskSessionApi: revoke
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'), Modal: native('Modal'), Pressable: native('Pressable'),
  ScrollView: native('ScrollView'), StyleSheet: { create: (styles: any) => styles }, Text: native('Text'),
  TextInput: native('TextInput'), View: native('View')
}));
vi.mock('lucide-react-native', () => { const Icon = native('Icon'); return { Copy: Icon, Plus: Icon, RefreshCw: Icon, ShieldCheck: Icon, Trash2: Icon, X: Icon }; });
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  surfaceBase: '#fff', surfaceCanvas: '#f4f3f0', surfaceSunken: '#eee', primary: '#b42318', textPrimary: '#24211f',
  textSecondary: '#6b6560', borderSubtle: '#d8d4ce', danger: '#b42318', interactiveSecondary: '#fff1dd'
} }) }));
vi.mock('../../theme', () => ({ radii: { md: 8, sm: 4 }, spacing: { xs: 4, sm: 8, md: 12, lg: 20 }, typography: {
  families: { bodySemibold: 'Inter', body: 'Inter' }, sizes: { xs: 11, sm: 13, md: 16, lg: 20 }
} }));
import { EmployeeAttendanceKioskSessionsModal } from './EmployeeAttendanceKioskSessionsModal';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const activeSession = { id: 23, branchId: 1, branchCode: 'MAIN', deviceName: 'Kiosk quầy', createdAt: '2026-09-29T01:00:00Z',
  expiresAt: '2026-09-30T01:00:00Z', revokedAt: null, lastUsedAt: null };

describe('EmployeeAttendanceKioskSessionsModal', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue([activeSession]);
    createSession.mockReset().mockResolvedValue({ session: { ...activeSession, id: 24 }, secret: 'one-time-secret' });
    revoke.mockReset().mockResolvedValue({ session: { ...activeSession, revokedAt: '2026-09-29T02:00:00Z' } });
  });

  it('issues a branch-scoped session and reveals its one-time credential without putting it in a URL', async () => {
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceKioskSessionsModal visible branchId={1} onClose={vi.fn()} />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-device-name' }).props.onChangeText('Kiosk quầy'); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-session-create' }).props.onPress(); await Promise.resolve(); });
    expect(createSession).toHaveBeenCalledWith('admin-token', { branchId: 1, deviceName: 'Kiosk quầy', expiresInMinutes: 480 });
    expect(screen.root.findByProps({ testID: 'kiosk-one-time-secret' }).props.children).toContain('one-time-secret');
    expect(screen.root.findByProps({ testID: 'kiosk-device-url' }).props.children).toBe('/kiosk-cham-cong');
    await act(async () => screen.unmount());
  });

  it('can revoke an active device session and refreshes the displayed status', async () => {
    list.mockResolvedValueOnce([activeSession]).mockResolvedValueOnce([{ ...activeSession, revokedAt: '2026-09-29T02:00:00Z' }]);
    let screen: any;
    await act(async () => { screen = create(<EmployeeAttendanceKioskSessionsModal visible branchId={1} onClose={vi.fn()} />); await Promise.resolve(); });
    await act(async () => { screen.root.findByProps({ testID: 'kiosk-session-revoke-23' }).props.onPress(); await Promise.resolve(); });
    expect(revoke).toHaveBeenCalledWith('admin-token', 23);
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.root.findAllByType('Text').some((node: any) => String(node.props.children).includes('Đã thu hồi'))).toBe(true);
    await act(async () => screen.unmount());
  });
});
