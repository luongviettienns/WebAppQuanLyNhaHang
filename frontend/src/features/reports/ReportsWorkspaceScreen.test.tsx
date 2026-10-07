import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  View: 'View',
  Text: 'Text',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'web' },
  useWindowDimensions: () => ({ width: 1200, height: 800 }),
  StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin' }) }));
vi.mock('../../api/endOfDayReports', () => ({
  buildEndOfDayReportQuery: () => '',
  fetchEndOfDayReportApi: vi.fn().mockRejectedValue(new Error('Offline')),
  downloadEndOfDayReportApi: vi.fn()
}));
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      surfaceCanvas: '#fff',
      surfaceBase: '#fff',
      borderSubtle: '#ccc',
      textPrimary: '#111',
      textSecondary: '#555',
      primary: '#078',
      interactiveSecondary: '#eef'
    }
  })
}));
vi.mock('./DashboardScreen', () => ({
  DashboardScreen: () => React.createElement('Text', null, 'Legacy sales dashboard')
}));
vi.mock('./InventoryBalanceReportScreen', () => ({
  InventoryBalanceReportScreen: () => React.createElement('Text', null, 'Inventory balance report')
}));
vi.mock('./ProfitAndLossReportScreen', () => ({
  ProfitAndLossReportScreen: () => React.createElement('Text', null, 'Profit and loss report')
}));

import { DashboardScreen } from './DashboardScreen';
import { InventoryBalanceReportScreen } from './InventoryBalanceReportScreen';
import { ProfitAndLossReportScreen } from './ProfitAndLossReportScreen';
import { ReportsWorkspaceScreen } from './ReportsWorkspaceScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Reports workspace', () => {
  it('defaults to Cuối ngày, and can switch to Sales, Goods, Finance, and back', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<ReportsWorkspaceScreen />);
    });
    expect(screen.root.findByProps({ testID: 'reports-workspace-end-of-day' }).props.accessibilityState.selected).toBe(true);
    expect(screen.root.findAllByType(DashboardScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(InventoryBalanceReportScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(ProfitAndLossReportScreen)).toHaveLength(0);

    // Switch to Sales
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-sales' }).props.onPress();
    });
    expect(screen.root.findAllByType(DashboardScreen)).toHaveLength(1);
    expect(screen.root.findByProps({ testID: 'reports-workspace-sales' }).props.accessibilityState.selected).toBe(true);

    // Switch to Goods
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-goods' }).props.onPress();
    });
    expect(screen.root.findAllByType(InventoryBalanceReportScreen)).toHaveLength(1);
    expect(screen.root.findByProps({ testID: 'reports-workspace-goods' }).props.accessibilityState.selected).toBe(true);

    // Switch to Finance
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-finance' }).props.onPress();
    });
    expect(screen.root.findAllByType(ProfitAndLossReportScreen)).toHaveLength(1);
    expect(screen.root.findByProps({ testID: 'reports-workspace-finance' }).props.accessibilityState.selected).toBe(true);

    // Return to Cuối ngày
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-end-of-day' }).props.onPress();
    });
    expect(screen.root.findAllByType(DashboardScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(InventoryBalanceReportScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(ProfitAndLossReportScreen)).toHaveLength(0);
    expect(screen.root.findByProps({ testID: 'reports-workspace-end-of-day' }).props.accessibilityState.selected).toBe(true);

    await act(async () => screen.unmount());
  });

  it('accessibly disables the remaining four sections', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<ReportsWorkspaceScreen />);
    });
    expect(screen.root.findAllByProps({ accessibilityRole: 'tab' })).toHaveLength(8);
    for (const [key, label] of [
      ['customers', 'Khách hàng'],
      ['suppliers', 'Nhà cung cấp'],
      ['employees', 'Nhân viên'],
      ['channels', 'Kênh bán hàng']
    ]) {
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
