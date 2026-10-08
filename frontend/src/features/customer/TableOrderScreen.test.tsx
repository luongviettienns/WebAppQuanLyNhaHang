import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { restaurant, toast, native, declarePayment } = vi.hoisted(() => ({
  declarePayment: vi.fn(),
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
    React.createElement('View', null, data?.map((item: any, idx: number) => React.createElement(React.Fragment, { key: item.id ?? idx }, renderItem({ item, index: idx })))),
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
      'Bell', 'Check', 'ChefHat', 'ChevronLeft', 'ChevronRight', 'Copy', 'CreditCard',
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
  CustomerCartModal: (props: any) => React.createElement('CustomerCartModal', props)
}));

vi.mock('../../api/reservations', () => ({ declareQrOrderPaymentApi: declarePayment }));

vi.mock('../../lib/notificationHelper', () => ({
  notificationHelper: {
    getPermissionStatus: () => 'granted',
    requestPermission: vi.fn().mockResolvedValue(true),
    vibrate: vi.fn(),
    notifyOrderPreparing: vi.fn(),
    notifyOrderReady: vi.fn(),
    notifyOrderCompleted: vi.fn()
  }
}));

import { TableOrderScreen } from './TableOrderScreen';

describe('Customer TableOrderScreen - Refresh and Session Orders', () => {
  let screen: ReactTestRenderer;
  const initialTables = structuredClone(restaurant.tables);
  const text = () => screen.root.findAllByType('Text').map((node) => node.props.children).flat(Infinity).join(' ').replace(/\s+/g, ' ');
  const sessionOrder = (id: number, session: string, finalAmount = 35000, tableId = 4) => ({
    ...initialTables[0].orders[0], id, code: `VISIT-${id}`, tableId, tableSessionId: session, finalAmount
  });
  const refresh = async () => {
    await act(async () => { await screen.root.findByProps({ testID: 'customer-refresh-btn' }).props.onPress(); });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    restaurant.tables = structuredClone(initialTables);
    restaurant.activeTableOrder = null;
    restaurant.latestOrderStatusChanged = null;
    restaurant.cart = [];
    declarePayment.mockReset();
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
    vi.useRealTimers();
  });

  it('discards cached paid orders and closes their payment modal after the table is cleaned', async () => {
    const oldOrder = sessionOrder(101, 'old-visit');
    restaurant.tables = [{ ...initialTables[0], currentSessionId: 'old-visit', orders: [oldOrder] }] as any;
    restaurant.activeTableOrder = oldOrder as any;
    await act(async () => { screen = create(<TableOrderScreen tableNumber={4} />); });
    await act(async () => { screen.root.findByProps({ testID: 'customer-header-payment-btn' }).props.onPress(); });
    expect(text()).toContain('Thanh toán VietQR');
    restaurant.tables = [{ ...initialTables[0], currentSessionId: null, orders: [] }] as any;
    await refresh();
    expect(text()).not.toContain('VISIT-101');
    expect(text()).not.toContain('Thanh toán VietQR');
    expect(screen.root.findAllByType('Pressable').filter((node) => node.props.testID === 'customer-header-payment-btn')).toHaveLength(0);
  });

  it('totals only orders from the current table visit and replaces the old selected batch', async () => {
    const oldOrder = sessionOrder(101, 'old-visit', 90000);
    restaurant.tables = [{ ...initialTables[0], currentSessionId: 'old-visit', orders: [oldOrder] }] as any;
    restaurant.activeTableOrder = oldOrder as any;
    await act(async () => { screen = create(<TableOrderScreen tableNumber={4} />); });
    restaurant.tables = [{ ...initialTables[0], currentSessionId: 'new-visit', orders: [
      sessionOrder(201, 'new-visit', 35000), sessionOrder(202, 'new-visit', 15000),
      oldOrder, sessionOrder(203, 'new-visit', 20000, 5)
    ] }] as any;
    await refresh();
    expect(text()).toContain('VISIT-201');
    expect(text()).not.toContain('VISIT-101');
    await act(async () => { screen.root.findByProps({ testID: 'customer-header-payment-btn' }).props.onPress(); });
    expect(screen.root.findByProps({ accessibilityLabel: 'Mã VietQR thanh toán chuyển khoản ngân hàng' }).props.source.uri).toContain('amount=50000');
  });

  it('refreshes the public guest table during polling so an ended visit disappears', async () => {
    vi.useFakeTimers();
    restaurant.tables = [{ ...initialTables[0], currentSessionId: 'old-visit', orders: [sessionOrder(101, 'old-visit')] }] as any;
    await act(async () => { screen = create(<TableOrderScreen tableNumber={4} />); });
    restaurant.tables = [{ ...initialTables[0], currentSessionId: null, orders: [] }] as any;
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(text()).not.toContain('VISIT-101');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([null, 'current-visit'])('sends the observed visit %s when ordering and keeps a newly started visit visible', async (marker) => {
    restaurant.tables = [{ ...initialTables[0], currentSessionId: marker, orders: [] }] as any;
    restaurant.cart = [{ id: 'cart-1' }] as any;
    const order = { ...sessionOrder(301, marker || 'started-visit'), paymentStatus: 'UNPAID', status: 'PENDING' };
    restaurant.createDineInOrder.mockResolvedValue({ success: true, order });
    declarePayment.mockResolvedValue({ order, amountDue: 35000, transferContent: 'THU VISIT-301' });
    await act(async () => { screen = create(<TableOrderScreen tableNumber={4} />); });
    await act(async () => { await screen.root.findAllByType('CustomerCartModal')[0].props.onSubmitOrder(); });
    expect(restaurant.createDineInOrder).toHaveBeenCalledWith(4, undefined, 'test-token-4', undefined, undefined, marker);
    expect(text()).toContain('VISIT-301');
    expect(text()).toContain('Thanh toán order');
    // The authoritative poll confirms the same created visit before cleaning it.
    restaurant.tables = [{ ...initialTables[0], currentSessionId: order.tableSessionId, orders: [order] }] as any;
    await refresh();
    expect(text()).toContain('Thanh toán order VISIT-301');
    restaurant.tables = [{ ...initialTables[0], currentSessionId: null, orders: [] }] as any;
    await refresh();
    expect(text()).not.toContain('VISIT-301');
  });

  it('keeps a created order when polling already observed its newly started visit before POST resolves', async () => {
    restaurant.tables = [{ ...initialTables[0], currentSessionId: null, orders: [] }] as any;
    restaurant.cart = [{ id: 'cart-1' }] as any;
    const order = { ...sessionOrder(301, 'started-visit'), paymentStatus: 'UNPAID', status: 'PENDING' };
    let resolveCreation!: (result: any) => void;
    restaurant.createDineInOrder.mockImplementationOnce(() => new Promise((resolve) => { resolveCreation = resolve; }));
    declarePayment.mockResolvedValue({ order, amountDue: 35000, transferContent: 'THU VISIT-301' });
    await act(async () => { screen = create(<TableOrderScreen tableNumber={4} />); });
    await act(async () => { screen.root.findAllByType('CustomerCartModal')[0].props.onSubmitOrder(); });
    restaurant.tables = [{ ...initialTables[0], currentSessionId: 'started-visit', orders: [order] }] as any;
    await refresh();
    await act(async () => { resolveCreation({ success: true, order }); });
    expect(text()).toContain('Thanh toán order VISIT-301');
  });

  it('ignores delayed kitchen events belonging to a previous visit at the same table', async () => {
    restaurant.tables = [{ ...initialTables[0], currentSessionId: 'new-visit', orders: [sessionOrder(201, 'new-visit')] }] as any;
    await act(async () => { screen = create(<TableOrderScreen tableNumber={4} />); });
    toast.showToast.mockClear();
    restaurant.latestOrderStatusChanged = { orderId: 101, tableId: 4, tableNumber: 4, status: 'READY' } as any;
    await act(async () => { screen.root.findAllByType('CustomerCartModal')[0].props.onChangeOrderNotes('test'); });
    expect(text()).toContain('VISIT-201');
    expect(text()).not.toContain('Món ăn đã sẵn sàng');
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('does not let an earlier empty guest response hide a newly created visit', async () => {
    restaurant.tables = [{ ...initialTables[0], currentSessionId: null, orders: [] }] as any;
    restaurant.cart = [{ id: 'cart-1' }] as any;
    const order = { ...sessionOrder(301, 'started-visit'), paymentStatus: 'UNPAID', status: 'PENDING' };
    restaurant.createDineInOrder.mockResolvedValueOnce({ success: true, order });
    declarePayment.mockResolvedValueOnce({ order, amountDue: 35000, transferContent: 'THU VISIT-301' });
    await act(async () => { screen = create(<TableOrderScreen tableNumber={4} />); });
    let resolveGuestRead!: (response: any) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { resolveGuestRead = resolve; }));
    let refreshPending!: Promise<void>;
    await act(async () => { refreshPending = screen.root.findByProps({ testID: 'customer-refresh-btn' }).props.onPress(); });
    await act(async () => { screen.root.findAllByType('CustomerCartModal')[0].props.onSubmitOrder(); });
    await act(async () => {
      resolveGuestRead({ ok: true, json: async () => ({ data: { table: restaurant.tables[0] } }) });
      await refreshPending;
    });
    expect(text()).toContain('VISIT-301');
    expect(text()).toContain('Thanh toán order VISIT-301');
  });

  it('ignores a payment declaration that resolves after the visit has been cleaned', async () => {
    restaurant.tables = [{ ...initialTables[0], currentSessionId: 'old-visit', orders: [] }] as any;
    restaurant.cart = [{ id: 'cart-1' }] as any;
    const order = { ...sessionOrder(301, 'old-visit'), paymentStatus: 'UNPAID', status: 'PENDING' };
    restaurant.createDineInOrder.mockResolvedValueOnce({ success: true, order });
    let resolveDeclaration!: (declaration: any) => void;
    declarePayment.mockImplementationOnce(() => new Promise((resolve) => { resolveDeclaration = resolve; }));
    await act(async () => { screen = create(<TableOrderScreen tableNumber={4} />); });
    await act(async () => { screen.root.findAllByType('CustomerCartModal')[0].props.onSubmitOrder(); });
    restaurant.tables = [{ ...initialTables[0], currentSessionId: null, orders: [] }] as any;
    await refresh();
    await act(async () => { resolveDeclaration({ order, amountDue: 35000, transferContent: 'THU VISIT-301' }); });
    expect(text()).not.toContain('VISIT-301');
    expect(text()).not.toContain('Thanh toán order');
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

  it('opens real VietQR payment modal with bank info and copy buttons', async () => {
    await act(async () => {
      screen = create(<TableOrderScreen tableNumber={4} />);
    });

    // Nút "Thanh toán" hiển thị
    const paymentBtn = screen.root.findByProps({ testID: 'customer-header-payment-btn' });
    expect(paymentBtn).toBeDefined();

    // Bấm nút thanh toán để mở Modal
    await act(async () => {
      paymentBtn.props.onPress();
    });

    const allTexts = screen.root.findAllByType('Text').map((t) => t.props.children).flat(Infinity).join(' ');
    // Chứa thông tin tài khoản thật đã cấu hình
    expect(allTexts).toContain('Thanh toán VietQR');
    expect(allTexts).toContain('10001317794');
    expect(allTexts).toContain('PHAN VAN KHANH');
    expect(allTexts).toContain('NCB (Ngân hàng Quốc Dân)');

    // Kiểm tra ảnh VietQR thật được render với đúng link api vietqr
    const qrImage = screen.root.findByProps({ accessibilityLabel: 'Mã VietQR thanh toán chuyển khoản ngân hàng' });
    expect(qrImage).toBeDefined();
    expect(qrImage.props.source.uri).toContain('img.vietqr.io/image/970423-10001317794-compact2.png');
    expect(qrImage.props.source.uri).toContain('amount=35000');

    // Kiểm tra các nút sao chép
    const copyAmountBtn = screen.root.findByProps({ testID: 'copy-amount-btn' });
    expect(copyAmountBtn).toBeDefined();

    const copyAccountBtn = screen.root.findByProps({ testID: 'copy-account-btn' });
    expect(copyAccountBtn).toBeDefined();

    const copyContentBtn = screen.root.findByProps({ testID: 'copy-content-btn' });
    expect(copyContentBtn).toBeDefined();

    await act(async () => {
      copyAccountBtn.props.onPress();
    });

    expect(toast.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        message: expect.stringContaining('10001317794')
      })
    );
  });
});
