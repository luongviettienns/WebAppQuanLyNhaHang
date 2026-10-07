import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';

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
  fetchProfitAndLossReportApi: vi.fn()
}));

import { fetchProfitAndLossReportApi } from '../../api/reports';
import { ProfitAndLossReportScreen } from './ProfitAndLossReportScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockPnlData = {
  timeframe: { from: '2026-09-20T00:00:00Z', to: '2026-09-20T23:59:59Z', date: '2026-09-20' },
  revenue: {
    grossSales: 200000,
    discountAmount: 20000,
    returnsAmount: 0,
    netRevenue: 194400,
    vatAmount: 14400,
    orderCount: 1
  },
  cogs: {
    salesCogs: 60000,
    grossProfit: 134400,
    grossProfitMargin: 69.1
  },
  operatingExpenses: {
    kitchenWasteCost: 15000,
    cashExpenses: 25000,
    payrollCost: 0,
    totalExpenses: 40000
  },
  netProfit: {
    operatingProfit: 94400,
    netProfitMargin: 48.6
  },
  revenueByPaymentMethod: {
    cash: 194400,
    bankTransfer: 0,
    other: 0
  },
  expenseBreakdownByCategory: [
    { categoryName: 'Văn phòng phẩm', amount: 25000 }
  ]
};

describe('ProfitAndLossReportScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProfitAndLossReportApi).mockResolvedValue(mockPnlData);
  });

  it('renders loading state and then loads financial KPIs correctly', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<ProfitAndLossReportScreen />);
    });

    expect(fetchProfitAndLossReportApi).toHaveBeenCalledWith('admin-token', expect.any(Object));

    // Verify presence of P&L screen testID
    const root = screen.root.findByProps({ testID: 'profit-and-loss-screen' });
    expect(root).toBeDefined();

    // Verify rendered values in UI
    const allText = screen.root.findAllByType('Text').map((node: any) => node.props.children).flat().join(' ');
    expect(allText).toContain('194.400 đ'); // Net revenue
    expect(allText).toContain('60.000 đ');  // COGS
    expect(allText).toContain('134.400 đ'); // Gross profit
    expect(allText).toContain('94.400 đ');  // Operating profit
    expect(allText).toContain('69.1%');    // Gross margin
    expect(allText).toContain('48.6%');    // Net margin

    await act(async () => screen.unmount());
  });

  it('allows clicking quick preset to change date', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<ProfitAndLossReportScreen />);
    });

    const yesterdayBtn = screen.root.findByProps({ testID: 'pnl-yesterday-preset' });
    await act(async () => {
      yesterdayBtn.props.onPress();
    });

    expect(fetchProfitAndLossReportApi).toHaveBeenCalledTimes(2);

    await act(async () => screen.unmount());
  });
});
