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
vi.mock('./CustomerReportScreen', () => ({
  CustomerReportScreen: () => React.createElement('Text', null, 'Customer report')
}));
vi.mock('./SupplierReportScreen', () => ({
  SupplierReportScreen: () => React.createElement('Text', null, 'Supplier report')
}));
vi.mock('./EmployeeReportScreen', () => ({
  EmployeeReportScreen: () => React.createElement('Text', null, 'Employee report')
}));
vi.mock('./ChannelReportScreen', () => ({
  ChannelReportScreen: () => React.createElement('Text', null, 'Channel report')
}));

import { ChannelReportScreen } from './ChannelReportScreen';
import { CustomerReportScreen } from './CustomerReportScreen';
import { DashboardScreen } from './DashboardScreen';
import { EmployeeReportScreen } from './EmployeeReportScreen';
import { InventoryBalanceReportScreen } from './InventoryBalanceReportScreen';
import { ProfitAndLossReportScreen } from './ProfitAndLossReportScreen';
import { ReportsWorkspaceScreen } from './ReportsWorkspaceScreen';
import { SupplierReportScreen } from './SupplierReportScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Reports workspace', () => {
  it('defaults to Cuối ngày, and can switch across all 8 report modules and back', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<ReportsWorkspaceScreen />);
    });
    expect(screen.root.findByProps({ testID: 'reports-workspace-end-of-day' }).props.accessibilityState.selected).toBe(true);
    expect(screen.root.findAllByType(DashboardScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(InventoryBalanceReportScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(ProfitAndLossReportScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(CustomerReportScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(SupplierReportScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(EmployeeReportScreen)).toHaveLength(0);
    expect(screen.root.findAllByType(ChannelReportScreen)).toHaveLength(0);

    // Switch to Sales
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-sales' }).props.onPress();
    });
    expect(screen.root.findAllByType(DashboardScreen)).toHaveLength(1);

    // Switch to Goods
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-goods' }).props.onPress();
    });
    expect(screen.root.findAllByType(InventoryBalanceReportScreen)).toHaveLength(1);

    // Switch to Customers
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-customers' }).props.onPress();
    });
    expect(screen.root.findAllByType(CustomerReportScreen)).toHaveLength(1);

    // Switch to Suppliers
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-suppliers' }).props.onPress();
    });
    expect(screen.root.findAllByType(SupplierReportScreen)).toHaveLength(1);

    // Switch to Employees
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-employees' }).props.onPress();
    });
    expect(screen.root.findAllByType(EmployeeReportScreen)).toHaveLength(1);

    // Switch to Channels
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-channels' }).props.onPress();
    });
    expect(screen.root.findAllByType(ChannelReportScreen)).toHaveLength(1);

    // Switch to Finance
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-finance' }).props.onPress();
    });
    expect(screen.root.findAllByType(ProfitAndLossReportScreen)).toHaveLength(1);

    // Return to Cuối ngày
    await act(async () => {
      screen.root.findByProps({ testID: 'reports-workspace-end-of-day' }).props.onPress();
    });
    expect(screen.root.findByProps({ testID: 'reports-workspace-end-of-day' }).props.accessibilityState.selected).toBe(true);

    await act(async () => screen.unmount());
  });

  it('enables all 8 sections without any disabled tabs', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<ReportsWorkspaceScreen />);
    });
    expect(screen.root.findAllByProps({ accessibilityRole: 'tab' })).toHaveLength(8);
    for (const [key, label] of [
      ['end-of-day', 'Cuối ngày'],
      ['sales', 'Bán hàng'],
      ['goods', 'Hàng hóa'],
      ['customers', 'Khách hàng'],
      ['suppliers', 'Nhà cung cấp'],
      ['employees', 'Nhân viên'],
      ['channels', 'Kênh bán hàng'],
      ['finance', 'Tài chính']
    ]) {
      const tab = screen.root.findByProps({ testID: `reports-workspace-${key}` });
      expect(tab.props.disabled).toBe(false);
      expect(tab.props.accessibilityState.disabled).toBe(false);
      expect(tab.props.accessibilityLabel).toBe(label);
      expect(typeof tab.props.onPress).toBe('function');
    }
    await act(async () => screen.unmount());
  });
});
