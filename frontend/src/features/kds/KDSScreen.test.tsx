import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { optionsApi, wasteApi, storage, restaurant } = vi.hoisted(() => ({
  optionsApi: vi.fn(), wasteApi: vi.fn(), storage: new Map<string, string>(),
  restaurant: { kdsOrders: [], isLoadingKDS: false, kdsError: null, categories: [], lowStockAlerts: [],
    fetchKDSOrders: vi.fn(), updateOrderStatus: vi.fn(), fetchMenu: vi.fn(), toggleMenuItemSoldOut: vi.fn(), fetchLowStockAlerts: vi.fn() }
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', Pressable: 'Pressable', SafeAreaView: 'SafeAreaView', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
  StyleSheet: { create: (value: unknown) => value }, useWindowDimensions: () => ({ width: 1280, height: 800 })
}));
vi.mock('lucide-react-native', () => Object.fromEntries(['AlertTriangle','ChefHat','Clock3','Moon','PackageX','RefreshCw','ShoppingBag','Sun','Trash2','Utensils','X'].map(key => [key, () => null])));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'kitchen-token', user: { id: 3 } }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => restaurant }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceBase: '#fff', surfaceRaised: '#fff', textPrimary: '#111', textSecondary: '#333', borderSubtle: '#888', borderStrong: '#555', primary: '#b00', danger: '#b00' }, isDark: true, toggleTheme: vi.fn() }) }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../api/config', () => ({ getApiBaseUrl: () => 'http://localhost:4000' }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => storage.get(key) ?? null,
  setItem: async (key: string, value: string) => { storage.set(key, value); },
  removeItem: async (key: string) => { storage.delete(key); }
} }));
vi.mock('../../api/inventory', () => ({ fetchKitchenWasteOptionsApi: optionsApi, recordKitchenWasteApi: wasteApi }));
vi.mock('../../ui', () => ({
  AppIcon: () => null,
  Button: ({ label, loading, ...props }: any) => React.createElement('Pressable', { ...props, disabled: props.disabled || loading, accessibilityLabel: label }, React.createElement('Text', null, label)),
  Surface: ({ children, ...props }: any) => React.createElement('View', props, children),
  InlineAlert: ({ message }: any) => React.createElement('Text', null, message),
  ScreenHeader: ({ title }: any) => React.createElement('Text', null, title),
  EmptyState: () => null,
  StatusBadge: ({ label }: any) => React.createElement('Text', null, label)
}));
import { KDSScreen } from './KDSScreen';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const options = {
  ingredients: [{ id: 41, sku: 'ING-GA', name: 'Gà tươi', unit: 'kg', currentStock: 10 }, { id: 42, sku: 'ING-SOT', name: 'Sốt', unit: 'ml', currentStock: 1000 }],
  recipes: [{ menuItemId: 7, menuItemName: 'Gà rán', ingredients: [{ ingredientId: 41, name: 'Gà tươi', unit: 'kg', quantityRequired: 0.15, currentStock: 10 }, { ingredientId: 42, name: 'Sốt', unit: 'ml', quantityRequired: 20, currentStock: 1000 }] }, { menuItemId: 8, menuItemName: 'Chưa có BOM', ingredients: [] }]
};
let screen: ReactTestRenderer;
const press = async (testID: string) => { await act(async () => { screen.root.findByProps({ testID }).props.onPress(); }); };
const change = async (testID: string, value: string) => { await act(async () => { screen.root.findByProps({ testID }).props.onChangeText(value); }); };
const texts = () => screen.root.findAllByType('Text').map(node => node.props.children).flat(Infinity).join(' ').replace(/\s+/g, ' ');
const open = async () => {
  await act(async () => { screen = create(<KDSScreen />); });
  await act(async () => { screen.root.findByProps({ accessibilityLabel: 'Báo hao hụt' }).props.onPress(); });
};

describe('Kitchen waste workflow', () => {
  beforeEach(() => { vi.clearAllMocks(); storage.clear(); optionsApi.mockResolvedValue(options); wasteApi.mockResolvedValue({ totalCostAmount: 5000, deductedIngredients: [] }); });
  afterEach(async () => { if (screen) await act(async () => { screen.unmount(); }); });

  it('selects an ingredient outside alerts, accepts comma decimals and shows stock in its actual unit', async () => {
    await open();
    await press('waste-type-ingredient');
    await change('waste-search', 'gà');
    await press('waste-ingredient-41');
    await change('waste-quantity', '0,05');
    expect(texts()).toContain('kg');
    expect(texts()).toContain('9,95');
    await press('btn-confirm-submit-waste');
    expect(wasteApi.mock.calls[0][1]).toMatchObject({ type: 'INGREDIENT', ingredientId: 41, quantity: 0.05 });
    expect(wasteApi.mock.calls[0][2]).toEqual(expect.any(String));
  });

  it('previews all BOM ingredients and disables a dish without a recipe', async () => {
    await open();
    await press('waste-menu-7');
    await change('waste-quantity', '2');
    expect(texts()).toContain('0,3 kg');
    expect(texts()).toContain('40 ml');
    await press('waste-menu-8');
    expect(screen.root.findByProps({ testID: 'btn-confirm-submit-waste' }).props.disabled).toBe(true);
  });

  it('blocks invalid quantities before any stock request', async () => {
    await open(); await press('waste-type-ingredient'); await press('waste-ingredient-41');
    for (const value of ['0', '-1', '1.2.3', 'Infinity', '']) {
      await change('waste-quantity', value);
      expect(screen.root.findByProps({ testID: 'btn-confirm-submit-waste' }).props.disabled).toBe(true);
    }
    expect(wasteApi).not.toHaveBeenCalled();
  });

  it('keeps a pending request across remount after a lost response, reuses its key and unlocks after success', async () => {
    wasteApi.mockRejectedValueOnce(new Error('Mất kết nối'));
    await open(); await press('waste-type-ingredient'); await press('waste-ingredient-41'); await change('waste-quantity', '0.05');
    await press('btn-confirm-submit-waste');
    const first = wasteApi.mock.calls[0];
    expect(texts()).toContain('Mất kết nối');
    expect(screen.root.findByProps({ testID: 'waste-quantity' }).props.editable).toBe(false);
    await act(async () => screen.unmount());
    await open();
    await press('btn-confirm-submit-waste');
    expect(wasteApi.mock.calls[1]).toEqual(first);
    expect(storage.size).toBe(0);
    await act(async () => { screen.root.findByProps({ accessibilityLabel: 'Báo hao hụt' }).props.onPress(); });
    await press('waste-type-ingredient'); await press('waste-ingredient-41'); await change('waste-quantity', '0.05'); await press('btn-confirm-submit-waste');
    expect(wasteApi.mock.calls[2][2]).not.toBe(first[2]);
  });

  it('can replay an uncertain request even if its ingredient no longer appears in current options', async () => {
    wasteApi.mockRejectedValueOnce(new Error('Mất kết nối'));
    await open(); await press('waste-type-ingredient'); await press('waste-ingredient-41'); await change('waste-quantity', '0.05');
    await press('btn-confirm-submit-waste');
    const first = wasteApi.mock.calls[0];
    await act(async () => screen.unmount());
    optionsApi.mockResolvedValue({ ingredients: [], recipes: [] });
    await open();
    expect(screen.root.findByProps({ testID: 'btn-confirm-submit-waste' }).props.disabled).toBe(false);
    await press('btn-confirm-submit-waste');
    expect(wasteApi.mock.calls[1]).toEqual(first);
  });
});
