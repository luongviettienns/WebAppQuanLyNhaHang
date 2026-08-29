import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';
import {
  CategoryDto,
  MenuItemDto,
  SelectedModifierDto,
  SocketMenuItemSoldOutChangedPayload
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
}

const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || API_URL;

export const RestaurantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token } = useAuth();

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isLoadingMenu, setIsLoadingMenu] = useState<boolean>(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Modifier Modal State
  const [selectedMenuItemForModal, setSelectedMenuItemForModal] = useState<MenuItemDto | null>(null);
  const [isModifierModalOpen, setIsModifierModalOpen] = useState<boolean>(false);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);

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

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // 2. Real-time Socket.io listener for 86'd Sold-out changes
  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true
    });

    socket.on('connect', () => {
      console.log('⚡ Socket connected to Crispy Bite Server');
    });

    socket.on('menu:itemSoldOutChanged', (payload: SocketMenuItemSoldOutChangedPayload) => {
      console.log('📢 Nhan su kien 86d thay doi:', payload);
      setCategories((prevCategories) =>
        prevCategories.map((cat) => ({
          ...cat,
          menuItems: cat.menuItems?.map((item) =>
            item.id === payload.menuItemId ? { ...item, isAvailable: payload.isAvailable } : item
          )
        }))
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // 3. Computed Menu Items
  const allMenuItems = categories.flatMap((cat) => cat.menuItems || []);
  const filteredMenuItems =
    selectedCategoryId === null
      ? allMenuItems
      : categories.find((c) => c.id === selectedCategoryId)?.menuItems || [];

  const selectCategory = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId);
  };

  // 4. Modal Handlers
  const openModifierModal = (item: MenuItemDto) => {
    setSelectedMenuItemForModal(item);
    setIsModifierModalOpen(true);
  };

  const closeModifierModal = () => {
    setSelectedMenuItemForModal(null);
    setIsModifierModalOpen(false);
  };

  // 5. Cart Handlers
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
        clearCart
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
