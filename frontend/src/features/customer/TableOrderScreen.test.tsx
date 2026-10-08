import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { restaurant, toast, native } = vi.hoisted(() => ({
  native: (name: string) => {
    const Component = (props: any) => React.createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  },
  toast: { showToast: vi.fn() },
  restaurant: {
    categories: [{ id: 1, name: 'Gà rán' }],
    allMenuItems: [{ id: 1, name: 'Gà Giòn Cay', price: 35000, isAvailable: true }],
    filteredMenuItems: [{ id: 1, name: 'Gà Giòn Cay', price: 35000, isAvailable: true }],
    selectedCategoryId: 1,
    selectCategory: vi.fn(),
    isLoadingMenu: false,
    selectedMenuItemForModal: null,
    isModifierModalOpen: false,
    openModifierModal: vi.fn(),
    closeModifierModal: vi.fn(),
    cart: [],
    cartSubtotal: 0,
    cartVat: 0,
    cartTotal: 0,
    cartItemCount: 0,
    addToCart: vi.fn(),
    updateCartQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    createDineInOrder: vi.fn(),
    tables: [
      {
        id: 4,
        tableNumber: 4,
        status: 'OCCUPIED',
        orders: [
          {
            id: 101,
            code: 'CRISPY-20261008-0001',
            status: 'PREPARING',
            paymentStatus: 'PAID',
            totalAmount: 35000,
            vatAmount: 2800,
            finalAmount: 35000,
            createdAt: new Date().toISOString(),
            items: [
              {
                id: 1,
                menuItemId: 1,
                menuItemName: 'Gà Giòn Cay',
                quantity: 1,
                subtotal: 35000,
                selectedModifiersJson: []
              }
            ]
          }
        ]
      }
    ],
    fetchTables: vi.fn(),
    activeTableOrder: null,
    latestOrderStatusChanged: null,
    latestOrderPaymentChanged: null,
    orderPaymentsRevision: 0
  }
}));

vi.mock('../../api/config', () => ({
  getApiBaseUrl: () => 'http://127.0.0.1:4000'
}));

vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'),
  FlatList: ({ data, renderItem }: any) =>
    React.createElement('View', null, data?.map((item: any, idx: number) => renderItem({ item, index: idx }))),
  Image: native('Image'),
  Modal: ({ children, visible }: any) => (visible ? React.createElement('View', null, children) : null),
  Platform: { OS: 'web' },
  Pressable: native('Pressable'),
  SafeAreaView: native('SafeAreaView'),
  ScrollView: ({ children }: any) => React.createElement('View', null, children),
  StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 },
  Text: native('Text'),
  TextInput: native('TextInput'),
  View: native('View'),
  useWindowDimensions: () => ({ width: 1280, height: 800 })
}));

vi.mock('lucide-react-native', () => {
  const Icon = native('Icon');
  return Object.fromEntries(
    [
      'Bell', 'Check', 'ChefHat', 'ChevronLeft', 'ChevronRight', 'CreditCard',
      'Plus', 'QrCode', 'ReceiptText', 'RefreshCw', 'ShoppingBag', 'UtensilsCrossed', 'X'
    ].map((key) => [key, Icon])
  );
});

vi.mock('../../contexts/RestaurantContext', () => ({
  useRestaurant: () => restaurant
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      surfaceCanvas: '#f8fafc',
      surfaceBase: '#ffffff',
      surfaceRaised: '#f1f5f9',
      surfaceSunken: '#e2e8f0',
      borderSubtle: '#cbd5e1',
      borderStrong: '#94a3b8',
      textPrimary: '#0f172a',
      textSecondary: '#64748b',
      textInverse: '#ffffff',
      primary: '#e11d48',
      interactivePrimary: '#e11d48',
      interactiveSecondary: '#ffe4e6',
      interactiveSecondaryPressed: '#fecdd3',
      overlay: 'rgba(0,0,0,0.5)'
    }
  })
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => toast
}));

vi.mock('../../ui', () => ({
  AppIcon: () => null,
  BrandMark: () => null,
  Button: ({ label, onPress, ...props }: any) =>
    React.createElement('Pressable', { ...props, onPress, accessibilityLabel: label }, React.createElement('Text', null, label)),
  InlineAlert: ({ message }: any) => React.createElement('Text', null, message),
  StatusBadge: ({ label }: any) => React.createElement('Text', null, label),
  Surface: ({ children, ...props }: any) => React.createElement('View', props, children)
}));

vi.mock('../pos/MenuCategoryPills', () => ({
  MenuCategoryPills: () => null
}));

vi.mock('../pos/MenuItemCard', () => ({
  MenuItemCard: () => null
}));

vi.mock('../pos/ModifierModal', () => ({
  ModifierModal: () => null
}));

vi.mock('./CustomerCartModal', () => ({
  CustomerCartModal: () => null
}));

vi.mock('../../lib/notificationHelper', () => ({
  notificationHelper: {
    getPermissionStatus: () => 'granted',
    requestPermission: vi.fn(),
    vibrate: vi.fn(),
    notifyOrderPreparing: vi.fn(),
    notifyOrderReady: vi.fn(),
    notifyOrderCompleted: vi.fn()
  }
}));

import { TableOrderScreen } from './TableOrderScreen';

describe('Customer TableOrderScreen - Refresh and Session Orders', () => {
  let screen: ReactTestRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          table: restaurant.tables[0],
          qrCodeToken: 'test-token-4'
        }
      })
    }) as any;
  });

  afterEach(async () => {
    if (screen) {
      await act(async () => {
        screen.unmount();
      });
    }
  });

  it('renders refresh button and triggers refresh on press', async () => {
    await act(async () => {
      screen = create(<TableOrderScreen tableNumber={4} />);
    });

    const refreshBtn = screen.root.findByProps({ testID: 'customer-refresh-btn' });
    expect(refreshBtn).toBeDefined();

    await act(async () => {
      refreshBtn.props.onPress();
    });

    expect(restaurant.fetchTables).toHaveBeenCalled();
    expect(toast.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        title: expect.stringContaining('Đã làm mới dữ liệu')
      })
    );
  });

  it('allows customer to toggle between session order progress and browsing menu', async () => {
    await act(async () => {
      screen = create(<TableOrderScreen tableNumber={4} />);
    });

    // Ban dau vi da co don hang trong phien, hien thi man hinh tien do don hang
    const allTexts = screen.root.findAllByType('Text').map((t) => t.props.children).flat(Infinity).join(' ');
    expect(allTexts).toContain('CRISPY-20261008-0001');

    // Nút "Gọi thêm món" co mat tren man hinh tien do don
    const addMoreBtn = screen.root.findByProps({ accessibilityLabel: 'Gọi thêm món' });
    expect(addMoreBtn).toBeDefined();

    // Bam "Gọi thêm món" de chuyen sang duyet Menu
    await act(async () => {
      addMoreBtn.props.onPress();
    });

    // Khi o menu: Thanh bao don hang cua ban (sessionOrdersBar) va nut xem don tren header xuat hien
    const sessionBar = screen.root.findByProps({ testID: 'customer-view-session-bar' });
    expect(sessionBar).toBeDefined();

    const headerSessionBtn = screen.root.findByProps({ testID: 'customer-view-session-btn' });
    expect(headerSessionBtn).toBeDefined();

    // Bam nut tren bar de quay lai xem don cua ban va tien do bep
    await act(async () => {
      sessionBar.props.onPress();
    });

    // Quay lai man hinh tien do don
    const textsAfterBack = screen.root.findAllByType('Text').map((t) => t.props.children).flat(Infinity).join(' ');
    expect(textsAfterBack).toContain('CRISPY-20261008-0001');
  });
});
