import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import {
  CategoryDto,
  MenuItemDto,
  SelectedModifierDto,
  DiningTableDto,
  OrderDto,
  OrderItemCreateDto,
  PaymentMethod,
  OrderType,
  SocketMenuItemSoldOutChangedPayload,
  SocketTableStatusChangedPayload,
  SocketOrderStatusChangedPayload,
  SocketOrderNewPayload,
  ApiResponse,
  MenuItemUpsertDto,
  DailyReportDto
} from '../api/contracts';
import { useAuth } from './AuthContext';
import { getApiBaseUrl, getSocketBaseUrl } from '../api/config';
import { IdempotencyKeyStore } from '../lib/idempotency';

export interface CartItem {
  menuItem: MenuItemDto;
  quantity: number;
  selectedModifiers: SelectedModifierDto[];
  unitPrice: number;
  subtotal: number;
  notes?: string;
}

interface RestaurantContextType {
  // Menu State
  categories: CategoryDto[];
  allMenuItems: MenuItemDto[];
  filteredMenuItems: MenuItemDto[];
  selectedCategoryId: number | null;
  isLoadingMenu: boolean;
  menuError: string | null;
  fetchMenu: () => Promise<void>;
  selectCategory: (categoryId: number | null) => void;

  // Modifier Modal State
  selectedMenuItemForModal: MenuItemDto | null;
  isModifierModalOpen: boolean;
  openModifierModal: (item: MenuItemDto) => void;
  closeModifierModal: () => void;

  // Cart State
  cart: CartItem[];
  cartSubtotal: number;
  cartVat: number;
  cartTotal: number;
  cartItemCount: number;
  addToCart: (
    item: MenuItemDto,
    quantity: number,
    selectedModifiers: SelectedModifierDto[],
    notes?: string
  ) => void;
  updateCartQuantity: (index: number, quantity: number) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;

  // Tables State (Floor Map & Smart Dine-in)
  tables: DiningTableDto[];
  isLoadingTables: boolean;
  activeTableId: number | null;
  activeTableOrder: OrderDto | null;
  fetchTables: () => Promise<void>;
  selectActiveTable: (tableId: number | null) => void;
  createOrder: (payload: {
    orderType: OrderType;
    tableId?: number | null;
    notes?: string;
  }) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  createDineInOrder: (tableId: number, notes?: string) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  payOrder: (orderId: number, paymentMethod: PaymentMethod) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  updateTableStatus: (tableId: number, status: 'AVAILABLE' | 'DIRTY' | 'NEED_CLEANING') => Promise<{ success: boolean; table?: DiningTableDto; error?: string }>;
  voidOrder: (orderId: number, reason: string) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;

  // KDS State (Bếp thời gian thực)
  kdsOrders: OrderDto[];
  isLoadingKDS: boolean;
  kdsError: string | null;
  fetchKDSOrders: () => Promise<void>;
  updateOrderStatus: (orderId: number, status: 'PREPARING' | 'READY' | 'COMPLETED') => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  toggleMenuItemSoldOut: (menuItemId: number, isAvailable: boolean) => Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }>;

  // Admin Menu Management & Reports
  createMenuItem: (payload: MenuItemUpsertDto) => Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }>;
  updateMenuItem: (id: number, payload: MenuItemUpsertDto) => Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }>;
  fetchDailyReport: (date?: string) => Promise<{ success: boolean; report?: DailyReportDto; error?: string }>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

const API_URL = getApiBaseUrl();
const SOCKET_URL = getSocketBaseUrl();

export const RestaurantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token } = useAuth();

  // Menu State
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isLoadingMenu, setIsLoadingMenu] = useState<boolean>(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Modifier Modal State
  const [selectedMenuItemForModal, setSelectedMenuItemForModal] = useState<MenuItemDto | null>(null);
  const [isModifierModalOpen, setIsModifierModalOpen] = useState<boolean>(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);

  // Tables State
  const [tables, setTables] = useState<DiningTableDto[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState<boolean>(true);
  const [activeTableId, setActiveTableId] = useState<number | null>(null);
  const [activeTableOrder, setActiveTableOrder] = useState<OrderDto | null>(null);
  const orderIdempotency = useRef(new IdempotencyKeyStore());

  // KDS State (Bếp thời gian thực)
  const [kdsOrders, setKdsOrders] = useState<OrderDto[]>([]);
  const [isLoadingKDS, setIsLoadingKDS] = useState<boolean>(false);
  const [kdsError, setKdsError] = useState<string | null>(null);

  // 1. Fetch Menu from Backend API
  const fetchMenu = useCallback(async () => {
    setIsLoadingMenu(true);
    setMenuError(null);
    try {
      const response = await fetch(`${API_URL}/api/menu`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error?.message || 'Không thể tải thực đơn nhà hàng');
      }

      setCategories(json.data.categories || []);
    } catch (err: any) {
      console.error('Loi tai menu:', err);
      setMenuError(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setIsLoadingMenu(false);
    }
  }, []);

  // 2. Fetch Tables from Backend API
  const fetchTables = useCallback(async () => {
    setIsLoadingTables(true);
    try {
      const response = await fetch(`${API_URL}/api/tables`);
      const json = await response.json();

      if (response.ok) {
        setTables(json.data.tables || []);
      }
    } catch (err: any) {
      console.error('Loi tai danh sach ban:', err);
    } finally {
      setIsLoadingTables(false);
    }
  }, []);

  // 3. Fetch KDS Orders from Backend API
  const fetchKDSOrders = useCallback(async () => {
    setIsLoadingKDS(true);
    setKdsError(null);
    try {
      const response = await fetch(`${API_URL}/api/orders?status=PENDING,PREPARING,READY`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error?.message || 'Không thể tải danh sách đơn bếp');
      }

      setKdsOrders(json.data || []);
    } catch (err: any) {
      console.error('Lỗi tải đơn KDS:', err);
      setKdsError(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setIsLoadingKDS(false);
    }
  }, [token]);

  // 4. Update Order Status (FSM: PENDING -> PREPARING -> READY -> COMPLETED)
  const updateOrderStatus = useCallback(
    async (orderId: number, nextStatus: 'PREPARING' | 'READY' | 'COMPLETED') => {
      try {
        const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ status: nextStatus })
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error?.message || 'Không thể cập nhật trạng thái đơn');
        }

        const updatedOrder = json.data as OrderDto;
        setKdsOrders((prev) => {
          if (nextStatus === 'COMPLETED') {
            return prev.filter((o) => o.id !== orderId);
          }
          return prev.map((o) => (o.id === orderId ? { ...o, ...updatedOrder } : o));
        });

        return { success: true, order: updatedOrder };
      } catch (err: any) {
        console.error('Lỗi cập nhật trạng thái đơn bếp:', err);
        return { success: false, error: err.message || 'Lỗi kết nối máy chủ' };
      }
    },
    [token]
  );

  useEffect(() => {
    fetchMenu();
    fetchTables();
  }, [fetchMenu, fetchTables]);

  // 5. Real-time Socket.io listeners
  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      auth: token ? { token } : undefined
    });

    socket.on('connect', () => {
      console.log('⚡ Socket connected to Crispy Bite Server');
    });

    // 86'd Sold-out update
    socket.on('menu:itemSoldOutChanged', (payload: SocketMenuItemSoldOutChangedPayload) => {
      setCategories((prevCategories) =>
        prevCategories.map((cat) => ({
          ...cat,
          menuItems: cat.menuItems?.map((item) =>
            item.id === payload.menuItemId ? { ...item, isAvailable: payload.isAvailable } : item
          )
        }))
      );
    });

    // Table Status Changed
    socket.on('table:statusChanged', (payload: SocketTableStatusChangedPayload) => {
      setTables((prevTables) =>
        prevTables.map((t) =>
          t.id === payload.tableId
            ? { ...t, status: payload.status, currentOrderId: payload.currentOrderId }
            : t
        )
      );
    });

    // Order Status Changed
    socket.on('order:statusChanged', (payload: SocketOrderStatusChangedPayload) => {
      setActiveTableOrder((prev) => {
        if (prev && prev.id === payload.orderId) {
          return { ...prev, status: payload.status };
        }
        return prev;
      });

      setKdsOrders((prev) => {
        if (payload.status === 'COMPLETED' || payload.status === 'CANCELLED') {
          return prev.filter((o) => o.id !== payload.orderId);
        }
        return prev.map((o) =>
          o.id === payload.orderId
            ? {
                ...o,
                status: payload.status,
                prepTimeSec: payload.prepTimeSec ?? o.prepTimeSec,
                preparingAt: payload.preparingAt ?? o.preparingAt,
                readyAt: payload.readyAt ?? o.readyAt,
                completedAt: payload.completedAt ?? o.completedAt
              }
            : o
        );
      });
    });

    // Order New (Xuất hiện đơn mới từ POS hoặc QR khách)
    socket.on('order:new', (payload: SocketOrderNewPayload) => {
      // Re-fetch tables to sync fresh floor map
      fetchTables();
      if (payload?.order) {
        setKdsOrders((prev) => {
          const exists = prev.some((o) => o.id === payload.order.id);
          if (exists) return prev;
          return [...prev, payload.order];
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, fetchTables]);

  // 4. Computed Menu Items
  const allMenuItems = categories.flatMap((cat) => cat.menuItems || []);
  const filteredMenuItems =
    selectedCategoryId === null
      ? allMenuItems
      : categories.find((c) => c.id === selectedCategoryId)?.menuItems || [];

  const selectCategory = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId);
  };

  // 5. Modal Handlers
  const openModifierModal = (item: MenuItemDto) => {
    setSelectedMenuItemForModal(item);
    setIsModifierModalOpen(true);
  };

  const closeModifierModal = () => {
    setSelectedMenuItemForModal(null);
    setIsModifierModalOpen(false);
  };

  // 6. Cart Handlers
  const addToCart = (
    item: MenuItemDto,
    quantity: number,
    selectedModifiers: SelectedModifierDto[],
    notes?: string
  ) => {
    const modifierPriceTotal = selectedModifiers.reduce((sum, mod) => sum + mod.priceDelta, 0);
    const unitPrice = item.basePrice + modifierPriceTotal;
    const subtotal = unitPrice * quantity;

    const newItem: CartItem = {
      menuItem: item,
      quantity,
      selectedModifiers,
      unitPrice,
      subtotal,
      notes
    };

    setCart((prev) => [...prev, newItem]);
    closeModifierModal();
  };

  const updateCartQuantity = (index: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          quantity,
          subtotal: item.unitPrice * quantity
        };
      })
    );
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Cart financial calculations (8% VAT standard)
  const cartSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartVat = Math.round(cartSubtotal * 0.08); // 8% VAT
  const cartTotal = cartSubtotal + cartVat;
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // 7. Table & Dine-in Order Handlers
  const selectActiveTable = (tableId: number | null) => {
    setActiveTableId(tableId);
    if (!tableId) {
      setActiveTableOrder(null);
    }
  };

  const createOrder = async ({
    orderType,
    tableId,
    notes
  }: {
    orderType: OrderType;
    tableId?: number | null;
    notes?: string;
  }): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    if (cart.length === 0) {
      return { success: false, error: 'Giỏ hàng đang trống' };
    }

    if (orderType === 'DINE_IN' && !tableId) {
      return { success: false, error: 'Vui lòng chọn bàn ăn cho đơn tại chỗ' };
    }

    const itemsPayload: OrderItemCreateDto[] = cart.map((c) => ({
      menuItemId: c.menuItem.id,
      quantity: c.quantity,
      selectedModifiers: c.selectedModifiers.map(m => ({
        modifierGroupId: m.modifierGroupId,
        optionId: m.optionId
      })) as any,
      notes: c.notes
    }));

    const orderPayload = {
      ...(orderType === 'DINE_IN' && tableId ? { tableId } : {}),
      orderType,
      items: itemsPayload,
      notes
    };
    const idempotencyKey = orderIdempotency.current.get(JSON.stringify(orderPayload));

    try {
      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ ...orderPayload, idempotencyKey })
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể tạo đơn hàng' };
      }

      const order = (json as ApiResponse<{ order: OrderDto }>).data.order;
      orderIdempotency.current.complete(idempotencyKey);
      if (orderType === 'DINE_IN' && tableId) {
        setActiveTableId(tableId);
        setActiveTableOrder(order);
      }
      clearCart();
      await fetchTables();

      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi gửi đơn xuống bếp' };
    }
  };

  const createDineInOrder = async (
    tableId: number,
    notes?: string
  ): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    return createOrder({ orderType: 'DINE_IN', tableId, notes });
  };

  const payOrder = async (
    orderId: number,
    paymentMethod: PaymentMethod
  ): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    try {
      const response = await fetch(`${API_URL}/api/orders/${orderId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ paymentMethod })
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Thanh toán đơn hàng thất bại' };
      }

      const order = (json as ApiResponse<{ order: OrderDto }>).data.order;
      setActiveTableOrder((current) => current?.id === order.id ? null : current);
      await fetchTables();

      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi thanh toán' };
    }
  };

  const updateTableStatus = async (
    tableId: number,
    status: 'AVAILABLE' | 'DIRTY' | 'NEED_CLEANING'
  ): Promise<{ success: boolean; table?: DiningTableDto; error?: string }> => {
    try {
      const response = await fetch(`${API_URL}/api/tables/${tableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status })
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Cập nhật trạng thái bàn thất bại' };
      }

      const table = (json as ApiResponse<{ table: DiningTableDto }>).data.table;
      setTables((prev) => prev.map((t) => (t.id === table.id ? table : t)));
      return { success: true, table };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi cập nhật trạng thái bàn' };
    }
  };

  const voidOrder = async (
    orderId: number,
    reason: string
  ): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    try {
      const response = await fetch(`${API_URL}/api/orders/${orderId}/void`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ reason })
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Hủy đơn hàng thất bại' };
      }

      const order = (json as ApiResponse<{ order: OrderDto }>).data.order;
      setActiveTableOrder((current) => (current?.id === order.id ? null : current));
      await fetchTables();

      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi hủy đơn hàng' };
    }
  };

  const toggleMenuItemSoldOut = async (
    menuItemId: number,
    isAvailable: boolean
  ): Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }> => {
    try {
      const response = await fetch(`${API_URL}/api/menu/${menuItemId}/sold-out`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ isAvailable })
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể cập nhật trạng thái món' };
      }

      const updated = json.data.menuItem as MenuItemDto;
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          menuItems: cat.menuItems?.map((item) => (item.id === updated.id ? updated : item))
        }))
      );

      return { success: true, menuItem: updated };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi cập nhật món hết hàng' };
    }
  };

  const createMenuItem = async (
    payload: MenuItemUpsertDto
  ): Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }> => {
    try {
      const response = await fetch(`${API_URL}/api/menu`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể tạo món ăn mới' };
      }

      const created = json.data.menuItem as MenuItemDto;
      await fetchMenu();
      return { success: true, menuItem: created };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi tạo món ăn' };
    }
  };

  const updateMenuItem = async (
    id: number,
    payload: MenuItemUpsertDto
  ): Promise<{ success: boolean; menuItem?: MenuItemDto; error?: string }> => {
    try {
      const response = await fetch(`${API_URL}/api/menu/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể cập nhật món ăn' };
      }

      const updated = json.data.menuItem as MenuItemDto;
      await fetchMenu();
      return { success: true, menuItem: updated };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi cập nhật món ăn' };
    }
  };

  const fetchDailyReport = async (
    date?: string
  ): Promise<{ success: boolean; report?: DailyReportDto; error?: string }> => {
    try {
      const url = date ? `${API_URL}/api/reports/daily?date=${date}` : `${API_URL}/api/reports/daily`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể tải báo cáo doanh thu' };
      }

      return { success: true, report: json.data.report as DailyReportDto };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi tải báo cáo doanh thu' };
    }
  };

  return (
    <RestaurantContext.Provider
      value={{
        categories,
        allMenuItems,
        filteredMenuItems,
        selectedCategoryId,
        isLoadingMenu,
        menuError,
        fetchMenu,
        selectCategory,
        selectedMenuItemForModal,
        isModifierModalOpen,
        openModifierModal,
        closeModifierModal,
        cart,
        cartSubtotal,
        cartVat,
        cartTotal,
        cartItemCount,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        tables,
        isLoadingTables,
        activeTableId,
        activeTableOrder,
        fetchTables,
        selectActiveTable,
        createOrder,
        createDineInOrder,
        payOrder,
        updateTableStatus,
        voidOrder,
        kdsOrders,
        isLoadingKDS,
        kdsError,
        fetchKDSOrders,
        updateOrderStatus,
        toggleMenuItemSoldOut,
        createMenuItem,
        updateMenuItem,
        fetchDailyReport
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
};

export const useRestaurant = (): RestaurantContextType => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant phai duoc su dung ben trong RestaurantProvider');
  }
  return context;
};
