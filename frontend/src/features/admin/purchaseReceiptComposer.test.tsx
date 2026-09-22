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
  return { ArrowLeft: Icon, Check: Icon, FileSpreadsheet: Icon, Plus: Icon, Trash2: Icon };
});

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({ inventoryRevision: 0 }) }));
vi.mock('./SupplierFormModal', () => ({ SupplierFormModal: ({ onSaved, visible }: any) => visible ? React.createElement('Pressable', { testID: 'quick-supplier-result', onPress: () => onSaved({ id: 77, code: 'NCC77', name: 'Đại lý mới', isActive: true }) }) : null }));
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
  InlineAlert: ({ title, message }: any) => React.createElement('Text', null, `${title}: ${message}`),
  ScreenHeader: ({ title }: any) => React.createElement('Text', null, title),
  StatusBadge: ({ label }: any) => React.createElement('Text', null, label),
  Surface: ({ children }: any) => React.createElement('View', null, children)
}));
vi.mock('../../api/inventory', () => ({
  fetchIngredientsApi: vi.fn(async () => []),
}));
vi.mock('../../api/suppliers', () => ({
  fetchSuppliersApi: vi.fn(async () => ({ items: [], pagination: { page: 1, pageSize: 100, totalRows: 0, totalPages: 0 } }))
}));
vi.mock('../../api/purchaseReceipts', () => ({
  fetchPurchaseReceiptDetailApi: vi.fn(),
  previewPurchaseReceiptImportApi: vi.fn(),
  savePurchaseReceiptDraftApi: vi.fn(async () => ({
    id: 42,
    receiptCode: 'PN000042',
    supplierId: null,
    supplier: null,
    receivedAt: '2026-09-21T00:00:00.000Z',
    invoiceNumber: null,
    invoiceDate: null,
    status: 'DRAFT',
    subtotalAmount: 0,
    discountAmount: 0,
    payableAmount: 0,
    paidAmount: 0,
    outstandingAmount: 0,
    note: null,
    lines: [],
    createdByUserId: null,
    postedByUserId: null,
    postedAt: null,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z'
  })),
  postPurchaseReceiptApi: vi.fn()
}));

import { savePurchaseReceiptDraftApi, postPurchaseReceiptApi } from '../../api/purchaseReceipts';
import { PurchaseReceiptComposerScreen } from './PurchaseReceiptComposerScreen';
import { fetchIngredientsApi } from '../../api/inventory';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('purchase receipt composer', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('does not call post when saving a draft', async () => {
    let screen: any;
    await act(async () => {
      screen = create(<PurchaseReceiptComposerScreen mode="create" onFinished={vi.fn()} />);
      await Promise.resolve();
    });

    await act(async () => {
      screen!.root.findByProps({ testID: 'purchase-receipt-save-draft' }).props.onPress();
      await Promise.resolve();
    });

    expect(savePurchaseReceiptDraftApi).toHaveBeenCalledTimes(1);
    expect(postPurchaseReceiptApi).not.toHaveBeenCalled();
  });

  it('selects a quick-created supplier without losing receipt lines', async () => {
    vi.mocked(fetchIngredientsApi).mockResolvedValueOnce([{
      id: 8, sku: 'NL8', name: 'Bột mì', unit: 'kg', currentStock: 10, costPerUnit: 20000,
      minThreshold: 0, isActive: true, isLowStock: false, isNegative: false, totalValue: 200000, createdAt: '', updatedAt: ''
    }]);
    let screen: any;
    await act(async () => { screen = create(<PurchaseReceiptComposerScreen mode="create" onFinished={vi.fn()} />); });
    await act(async () => { screen.root.findAllByType('Pressable').find((node: any) => node.findAllByType('Text').some((text: any) => text.props.children === 'NL8')).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'purchase-receipt-add-supplier' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'quick-supplier-result' }).props.onPress(); });
    await act(async () => { screen.root.findByProps({ testID: 'purchase-receipt-save-draft' }).props.onPress(); });
    expect(savePurchaseReceiptDraftApi).toHaveBeenLastCalledWith('token', null, expect.objectContaining({ supplierId: 77, lines: [expect.objectContaining({ ingredientId: 8, quantity: 1, unitCost: 20000 })] }));
    await act(async () => screen.unmount());
  });
});
