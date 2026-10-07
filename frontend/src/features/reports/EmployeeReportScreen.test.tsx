import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      surfaceCanvas: '#f8fafc',
      surfaceBase: '#ffffff',
      borderSubtle: '#e2e8f0',
      textPrimary: '#0f172a',
      textSecondary: '#64748b',
      primary: '#0ea5e9',
      interactiveSecondary: '#e0f2fe'
    }
  })
}));
vi.mock('../../api/reports', () => ({
  fetchEmployeeReportApi: vi.fn()
}));

import { fetchEmployeeReportApi } from '../../api/reports';
import { EmployeeReportScreen } from './EmployeeReportScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockEmployeeData = {
  timeframe: { from: '2026-10-01T00:00:00Z', to: '2026-10-08T23:59:59Z' },
  summary: {
    totalEmployees: 2,
    totalOrders: 10,
    totalRevenue: 2500000,
    totalCommission: 125000
  },
  employees: [
    {
      employeeId: 1,
      code: 'NV001',
      fullName: 'Thu Ngân 1',
      role: 'CASHIER',
      orderCount: 6,
      revenue: 1500000,
      commission: 75000
    },
    {
      employeeId: 2,
      code: 'NV002',
      fullName: 'Phục Vụ 2',
      role: 'WAITER',
      orderCount: 4,
      revenue: 1000000,
      commission: 50000
    }
  ]
};

describe('EmployeeReportScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders employee performance report with summary and list', async () => {
    vi.mocked(fetchEmployeeReportApi).mockResolvedValueOnce(mockEmployeeData as any);

    let screen: any;
    await act(async () => {
      screen = create(<EmployeeReportScreen />);
    });

    expect(screen.root.findByProps({ testID: 'employee-report-screen' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'kpi-emp-count' }).props.children).toBe(2);
    expect(screen.root.findByProps({ testID: 'kpi-emp-orders' }).props.children).toBe(10);
    expect(screen.root.findByProps({ testID: 'emp-row-1' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'emp-row-2' })).toBeDefined();

    await act(async () => screen.unmount());
  });

  it('handles error state gracefully', async () => {
    vi.mocked(fetchEmployeeReportApi).mockRejectedValueOnce(new Error('Auth failed'));

    let screen: any;
    await act(async () => {
      screen = create(<EmployeeReportScreen />);
    });

    expect(screen.root.findByProps({ testID: 'employee-report-screen' })).toBeDefined();
    expect(screen.root.findAllByProps({ testID: 'kpi-emp-count' })).toHaveLength(0);

    await act(async () => screen.unmount());
  });
});
