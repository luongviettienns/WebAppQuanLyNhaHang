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
  fetchChannelReportApi: vi.fn()
}));

import { fetchChannelReportApi } from '../../api/reports';
import { ChannelReportScreen } from './ChannelReportScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockChannelData = {
  timeframe: { from: '2026-10-01T00:00:00Z', to: '2026-10-08T23:59:59Z' },
  summary: {
    totalOrders: 15,
    grossSales: 3500000,
    discounts: 200000,
    netRevenue: 3300000
  },
  channels: [
    {
      channel: 'DINE_IN',
      orderCount: 10,
      grossSales: 2200000,
      discounts: 100000,
      netRevenue: 2100000,
      sharePercent: 63.6
    },
    {
      channel: 'TAKE_AWAY',
      orderCount: 3,
      grossSales: 700000,
      discounts: 50000,
      netRevenue: 650000,
      sharePercent: 19.7
    },
    {
      channel: 'DELIVERY',
      orderCount: 2,
      grossSales: 600000,
      discounts: 50000,
      netRevenue: 550000,
      sharePercent: 16.7
    }
  ],
  deliveryPartners: [
    {
      partnerId: 1,
      code: 'GRAB',
      name: 'GrabFood',
      orderCount: 2,
      netRevenue: 550000
    }
  ]
};

describe('ChannelReportScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sales channel and delivery partner breakdowns with KPI cards', async () => {
    vi.mocked(fetchChannelReportApi).mockResolvedValueOnce(mockChannelData as any);

    let screen: any;
    await act(async () => {
      screen = create(<ChannelReportScreen />);
    });

    expect(screen.root.findByProps({ testID: 'channel-report-screen' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'kpi-chn-orders' }).props.children).toBe(15);
    expect(screen.root.findByProps({ testID: 'chn-row-DINE_IN' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'chn-row-TAKE_AWAY' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'chn-row-DELIVERY' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'dp-row-1' })).toBeDefined();

    await act(async () => screen.unmount());
  });

  it('handles error state gracefully', async () => {
    vi.mocked(fetchChannelReportApi).mockRejectedValueOnce(new Error('Server error'));

    let screen: any;
    await act(async () => {
      screen = create(<ChannelReportScreen />);
    });

    expect(screen.root.findByProps({ testID: 'channel-report-screen' })).toBeDefined();
    expect(screen.root.findAllByProps({ testID: 'kpi-chn-orders' })).toHaveLength(0);

    await act(async () => screen.unmount());
  });
});
