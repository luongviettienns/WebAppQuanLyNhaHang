import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createNativeComponent } = vi.hoisted(() => ({
  createNativeComponent: (name: string) => {
    const Component = (props: any) => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  }
}));

vi.mock('react-native', () => ({
  ActivityIndicator: createNativeComponent('ActivityIndicator'),
  Alert: { alert: vi.fn() },
  Platform: { OS: 'web' },
  Pressable: createNativeComponent('Pressable'),
  ScrollView: createNativeComponent('ScrollView'),
  StyleSheet: { create: (styles: any) => styles },
  Text: createNativeComponent('Text'),
  TextInput: createNativeComponent('TextInput'),
  View: createNativeComponent('View'),
  useWindowDimensions: () => ({ width: 1200, height: 800 })
}));
vi.mock('lucide-react-native', () => {
  const Icon = createNativeComponent('Icon');
  return { ArrowLeft: Icon, FileSpreadsheet: Icon, Plus: Icon, Trash2: Icon };
});
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: {
    surfaceCanvas: '#fff', surfaceBase: '#fff', surfaceRaised: '#fff', surfaceSunken: '#f7f7f7',
    borderSubtle: '#ddd', borderStrong: '#aaa', textPrimary: '#111', textSecondary: '#555',
    textTertiary: '#777', primary: '#06f', interactivePrimary: '#06f', interactivePrimaryPressed: '#05c',
    interactiveSecondary: '#eef', interactiveSecondaryPressed: '#dde', interactiveQuiet: '#fff', focusRing: '#06f',
    interactiveDanger: '#f00', interactiveDangerPressed: '#c00', surfaceWarning: '#fff4db'
  }, isDark: false })
}));
vi.mock('../../ui', () => ({
  AppIcon: () => React.createElement('Icon'),
  Button: ({ label, onPress, disabled, testID }: any) => React.createElement('Pressable', { onPress, disabled, testID }, React.createElement('Text', null, label)),
  EmptyState: ({ title }: any) => React.createElement('Text', null, title),
  InlineAlert: ({ title, message }: any) => React.createElement('Text', null, String(title || '') + ': ' + message),
  ScreenHeader: ({ title }: any) => React.createElement('Text', null, title),
  StatusBadge: ({ label }: any) => React.createElement('Text', null, label),
  Surface: ({ children }: any) => React.createElement('View', null, children)
}));
vi.mock('../../api/inventory', () => ({
  fetchIngredientsApi: vi.fn(async () => [{
    id: 2, sku: 'NL-02', name: 'Dầu ăn', unit: 'lít', currentStock: 3, minThreshold: 0,
    costPerUnit: 12000, isActive: true, isLowStock: false, isNegative: false, totalValue: 36000,
    createdAt: '', updatedAt: ''
  }])
}));
vi.mock('../../api/inventoryWastes', () => ({
  completeInventoryWasteApi: vi.fn(),
  fetchInventoryWasteDetailApi: vi.fn(),
  previewInventoryWasteImportApi: vi.fn(),
  saveInventoryWasteDraftApi: vi.fn()
}));

import { InventoryWasteComposerScreen } from './InventoryWasteComposerScreen';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('inventory waste composer', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('keeps completion disabled until a valid row and a note are provided', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<InventoryWasteComposerScreen mode="create" onFinished={vi.fn()} onCancel={vi.fn()} />);
      await Promise.resolve();
    });

    expect(screen.root.findByProps({ testID: 'inventory-waste-complete' }).props.disabled).toBe(true);

    await act(async () => {
      screen.root.findByProps({ testID: 'inventory-waste-add-2' }).props.onPress();
    });
    expect(screen.root.findByProps({ testID: 'inventory-waste-complete' }).props.disabled).toBe(true);

    await act(async () => {
      screen.root.findByProps({ testID: 'inventory-waste-note' }).props.onChangeText('Hàng hỏng');
    });
    expect(screen.root.findByProps({ testID: 'inventory-waste-complete' }).props.disabled).toBe(false);
  });
});
