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
  fetchInventoryBalanceReportApi: vi.fn()
}));

import { fetchInventoryBalanceReportApi } from '../../api/reports';
import { InventoryBalanceReportScreen } from './InventoryBalanceReportScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockInvData = {
  timeframe: { from: '2026-09-25T00:00:00Z', to: '2026-09-25T23:59:59Z', date: '2026-09-25' },
  summary: {
    totalIngredients: 2,
    totalInventoryValue: 1240000,
    lowStockCount: 1,
    totalStockInQuantity: 32,
    totalStockOutQuantity: 20,
    totalWasteQuantity: 5,
    totalWasteValue: 100000
  },
  items: [
    {
      ingredientId: 1,
      sku: 'ING-FLOUR',
      name: 'Bột mì làm bánh',
      unit: 'kg',
      costPerUnit: 20000,
      minThreshold: 15,
      openingStock: 40,
      stockIn: 30,
      stockOut: 20,
      waste: 5,
      manualAdjust: 2,
      closingStock: 47,
      inventoryValue: 940000,
      isLowStock: false
    },
    {
      ingredientId: 2,
      sku: 'ING-CHEESE',
      name: 'Phô mai Cheddar',
      unit: 'kg',
      costPerUnit: 150000,
      minThreshold: 5,
      openingStock: 2,
      stockIn: 2,
      stockOut: 2,
      waste: 0,
      manualAdjust: 0,
      closingStock: 2,
      inventoryValue: 300000,
      isLowStock: true
    }
  ]
};

describe('InventoryBalanceReportScreen', () => {
  beforeEach(() => {
    vi.mocked(fetchInventoryBalanceReportApi).mockResolvedValue(mockInvData);
  });

  it('renders summary KPIs and detailed inventory rows', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<InventoryBalanceReportScreen />);
    });

    expect(fetchInventoryBalanceReportApi).toHaveBeenCalledWith('admin-token', expect.any(Object));

    const root = screen.root.findByProps({ testID: 'inventory-balance-screen' });
    expect(root).toBeDefined();

    // Verify presence of rows
    const flourRow = screen.root.findByProps({ testID: 'inv-row-ING-FLOUR' });
    expect(flourRow).toBeDefined();
    const cheeseRow = screen.root.findByProps({ testID: 'inv-row-ING-CHEESE' });
    expect(cheeseRow).toBeDefined();

    const allText = screen.root.findAllByType('Text').map((node: any) => node.props.children).flat().join(' ');
    expect(allText).toContain('1.240.000 đ'); // Total inventory value
    expect(allText).toContain('Bột mì làm bánh');
    expect(allText).toContain('Phô mai Cheddar');
    expect(allText).toContain('Đủ tồn');
    expect(allText).toContain('Thiếu hàng');

    await act(async () => screen.unmount());
  });

  it('triggers search when text input changes', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<InventoryBalanceReportScreen />);
    });

    const searchInput = screen.root.findByProps({ testID: 'inv-search-input' });
    await act(async () => {
      searchInput.props.onChangeText('bột mì');
    });

    expect(fetchInventoryBalanceReportApi).toHaveBeenLastCalledWith(
      'admin-token',
      expect.objectContaining({ search: 'bột mì' })
    );

    await act(async () => screen.unmount());
  });
});
