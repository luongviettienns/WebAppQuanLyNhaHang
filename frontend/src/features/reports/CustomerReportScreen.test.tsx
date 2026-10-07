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
  fetchCustomerReportApi: vi.fn()
}));

import { fetchCustomerReportApi } from '../../api/reports';
import { CustomerReportScreen } from './CustomerReportScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockCustomerData = {
  timeframe: { from: '2026-10-01T00:00:00Z', to: '2026-10-08T23:59:59Z' },
  summary: {
    totalCustomers: 2,
    totalOrders: 5,
    totalRevenue: 1500000,
    avgOrderValue: 300000
  },
  customers: [
    {
      customerId: 1,
      code: 'KH000001',
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      tier: 'GOLD',
      points: 150,
      orderCount: 3,
      totalSpent: 900000,
      avgOrderValue: 300000
    },
    {
      customerId: 2,
      code: 'KH000002',
      name: 'Trần Thị B',
      phone: '0912345678',
      tier: 'SILVER',
      points: 80,
      orderCount: 2,
      totalSpent: 600000,
      avgOrderValue: 300000
    }
  ]
};

describe('CustomerReportScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders customer report with KPI cards and table rows', async () => {
    vi.mocked(fetchCustomerReportApi).mockResolvedValueOnce(mockCustomerData as any);

    let screen: any;
    await act(async () => {
      screen = create(<CustomerReportScreen />);
    });

    expect(screen.root.findByProps({ testID: 'customer-report-screen' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'kpi-cust-count' }).props.children).toBe(2);
    expect(screen.root.findByProps({ testID: 'kpi-cust-orders' }).props.children).toBe(5);
    expect(screen.root.findByProps({ testID: 'cust-row-1' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'cust-row-2' })).toBeDefined();

    await act(async () => screen.unmount());
  });

  it('handles error state gracefully', async () => {
    vi.mocked(fetchCustomerReportApi).mockRejectedValueOnce(new Error('Network error'));

    let screen: any;
    await act(async () => {
      screen = create(<CustomerReportScreen />);
    });

    expect(screen.root.findByProps({ testID: 'customer-report-screen' })).toBeDefined();
    expect(screen.root.findAllByProps({ testID: 'kpi-cust-count' })).toHaveLength(0);

    await act(async () => screen.unmount());
  });
});
