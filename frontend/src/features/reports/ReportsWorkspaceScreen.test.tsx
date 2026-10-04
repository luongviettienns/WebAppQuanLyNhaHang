import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: 'Pressable', View: 'View', Text: 'Text', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceCanvas: '#fff', surfaceBase: '#fff', borderSubtle: '#ccc', textPrimary: '#111', textSecondary: '#555', primary: '#078', interactiveSecondary: '#eef' } }) }));
// The legacy Dashboard fetches daily data and subscribes to sockets; keep those outside shell tests.
vi.mock('./DashboardScreen', () => ({ DashboardScreen: () => React.createElement('Text', null, 'Legacy sales dashboard') }));
import { DashboardScreen } from './DashboardScreen';
import { ReportsWorkspaceScreen } from './ReportsWorkspaceScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Reports workspace', () => {
  it('defaults to Cuối ngày, switches Sales to the existing Dashboard, and returns to Cuối ngày', async () => {
    let screen: any;
    await act(async () => { screen = create(<ReportsWorkspaceScreen />); });
    expect(screen.root.findByProps({ testID: 'reports-workspace-end-of-day' }).props.accessibilityState.selected).toBe(true);
    expect(screen.root.findAllByType(DashboardScreen)).toHaveLength(0);
    await act(async () => { screen.root.findByProps({ testID: 'reports-workspace-sales' }).props.onPress(); });
    expect(screen.root.findAllByType(DashboardScreen)).toHaveLength(1);
    expect(screen.root.findByProps({ testID: 'reports-workspace-sales' }).props.accessibilityState.selected).toBe(true);
    await act(async () => { screen.root.findByProps({ testID: 'reports-workspace-end-of-day' }).props.onPress(); });
    expect(screen.root.findAllByType(DashboardScreen)).toHaveLength(0);
    await act(async () => screen.unmount());
  });

  it('accessibly disables the remaining six sections', async () => {
    let screen: any;
    await act(async () => { screen = create(<ReportsWorkspaceScreen />); });
    expect(screen.root.findAllByProps({ accessibilityRole: 'tab' })).toHaveLength(8);
    for (const [key, label] of [['goods', 'Hàng hóa'], ['customers', 'Khách hàng'], ['suppliers', 'Nhà cung cấp'], ['employees', 'Nhân viên'], ['channels', 'Kênh bán hàng'], ['finance', 'Tài chính']]) {
      const tab = screen.root.findByProps({ testID: `reports-workspace-${key}` });
      expect(tab.props.disabled).toBe(true);
      expect(tab.props.accessibilityState).toEqual({ selected: false, disabled: true });
      expect(tab.props.accessibilityLabel).toBe(label);
      expect(tab.props.accessibilityHint).toContain('Chưa khả dụng');
      expect(tab.props.onPress).toBeUndefined();
    }
    await act(async () => screen.unmount());
  });
});
