import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import {
  CategoryDto,
  MenuItemDto,
  SelectedModifierDto,
  DiningTableDto,
  OrderDto,
  OrderItemCreateDto,
  PaymentMethod,
  SocketMenuItemSoldOutChangedPayload,
  SocketTableStatusChangedPayload,
  SocketOrderStatusChangedPayload,
  SocketOrderNewPayload,
  ApiResponse
} from '../api/contracts';
import { useAuth } from './AuthContext';

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
  createDineInOrder: (tableId: number, notes?: string) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
  payOrder: (orderId: number, paymentMethod: PaymentMethod) => Promise<{ success: boolean; order?: OrderDto; error?: string }>;
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || API_URL;

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

  useEffect(() => {
    fetchMenu();
    fetchTables();
  }, [fetchMenu, fetchTables]);

  // 3. Real-time Socket.io listeners
  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true
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
    });

    // Order New
    socket.on('order:new', (_payload: SocketOrderNewPayload) => {
      // Re-fetch tables to sync fresh floor map
      fetchTables();
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

  const createDineInOrder = async (
    tableId: number,
    notes?: string
  ): Promise<{ success: boolean; order?: OrderDto; error?: string }> => {
    if (cart.length === 0) {
      return { success: false, error: 'Giỏ hàng đang trống' };
    }

    const itemsPayload: OrderItemCreateDto[] = cart.map((c) => ({
      menuItemId: c.menuItem.id,
      quantity: c.quantity,
      selectedModifiers: c.selectedModifiers,
      notes: c.notes
    }));

    const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    try {
      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          tableId,
          orderType: 'DINE_IN',
          items: itemsPayload,
          notes,
          idempotencyKey
        })
      });

      const json = await response.json();
      if (!response.ok) {
        return { success: false, error: json.error?.message || 'Không thể tạo đơn hàng' };
      }

      const order = (json as ApiResponse<{ order: OrderDto }>).data.order;
      setActiveTableOrder(order);
      clearCart();
      await fetchTables();

      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi gửi đơn xuống bếp' };
    }
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
      setActiveTableOrder(null);
      await fetchTables();

      return { success: true, order };
    } catch (err: any) {
      return { success: false, error: err.message || 'Lỗi kết nối khi thanh toán' };
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
        createDineInOrder,
        payOrder
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
