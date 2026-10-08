import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Bell, Check, ChefHat, ChevronLeft, ChevronRight, Copy, CreditCard, Plus, ReceiptText, RefreshCw, ShoppingBag, UtensilsCrossed, X } from 'lucide-react-native';
import { DiningTableDto, MenuItemDto, OrderDto, OrderStatus, VoucherValidationResultDto } from '../../api/contracts';
import { getApiBaseUrl } from '../../api/config';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { elevation, radii, spacing, statusColors, typography } from '../../theme';
import { AppIcon, BrandMark, Button, InlineAlert, StatusBadge, Surface } from '../../ui';
import type { StatusTone } from '../../ui';
import { MenuCategoryPills } from '../pos/MenuCategoryPills';
import { MenuItemCard } from '../pos/MenuItemCard';
import { ModifierModal } from '../pos/ModifierModal';
import { CustomerCartModal } from './CustomerCartModal';
import { notificationHelper } from '../../lib/notificationHelper';
import { declareQrOrderPaymentApi, QrOrderPaymentDeclaration } from '../../api/reservations';

interface Props {
  tableNumber?: number;
  qrCodeToken?: string;
  reservationAccessToken?: string;
}

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const formatTableNumber = (value: number) => value.toString().padStart(2, '0');

const isOrderInTableSession = (order: OrderDto | null | undefined, table: DiningTableDto | null): boolean => {
  if (!order || !table || order.status === 'CANCELLED' || (order.tableId != null && order.tableId !== table.id)) return false;
  // Undefined supports legacy callers; the live API always supplies a nullable marker.
  if (table.currentSessionId === undefined) return order.tableSessionId === undefined;
  return table.currentSessionId !== null && order.tableSessionId === table.currentSessionId && order.tableId === table.id;
};

const orderStatusConfig = (order: Pick<OrderDto, 'status' | 'paymentStatus' | 'payLaterAuthorized'>): { label: string; tone: StatusTone } => {
  if (order.status === 'PENDING' && order.paymentStatus !== 'PAID' && !order.payLaterAuthorized) return { label: 'Chờ xác nhận tiền', tone: 'warning' };
  if (order.status === 'PENDING' && order.paymentStatus === 'PAID') return { label: 'Đã xác nhận thanh toán', tone: 'info' };
  if (order.status === 'PREPARING') return { label: 'Đang chuẩn bị', tone: 'info' };
  if (order.status === 'READY') return { label: 'Sẵn sàng phục vụ', tone: 'success' };
  if (order.status === 'COMPLETED') return { label: 'Đã phục vụ', tone: 'neutral' };
  if (order.status === 'CANCELLED') return { label: 'Đã hủy', tone: 'danger' };
  return { label: 'Đã nhận đơn', tone: 'warning' };
};
const orderSteps = [
  { title: 'Đã nhận đơn', description: 'Nhà hàng đã nhận được yêu cầu của bạn.', icon: Check },
  { title: 'Đang chuẩn bị', description: 'Bếp đang chuẩn bị các món trong đơn.', icon: ChefHat },
  { title: 'Sẵn sàng phục vụ', description: 'Nhân viên sẽ mang món đến bàn ngay.', icon: UtensilsCrossed }
] as const;

export const TableOrderScreen: React.FC<Props> = ({ tableNumber = 4, qrCodeToken, reservationAccessToken }) => {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const {
    categories,
    allMenuItems,
    filteredMenuItems,
    selectedCategoryId,
    selectCategory,
    isLoadingMenu,
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
    createDineInOrder,
    tables,
    fetchTables,
    activeTableOrder,
    latestOrderStatusChanged,
    latestOrderPaymentChanged,
    orderPaymentsRevision
  } = useRestaurant();

  const [currentOrder, setCurrentOrder] = useState<OrderDto | null>(null);
  const [paymentDeclaration, setPaymentDeclaration] = useState<QrOrderPaymentDeclaration | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isVietQRModalOpen, setIsVietQRModalOpen] = useState(false);
  const [isNotifPromptModalOpen, setIsNotifPromptModalOpen] = useState(false);
  const [isBrowsingMenu, setIsBrowsingMenu] = useState(false);
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<VoucherValidationResultDto | null>(null);
  const [guestTable, setGuestTable] = useState<DiningTableDto | null>(null);
  const [guestTableError, setGuestTableError] = useState<string | null>(null);
  const [resolvedQrToken, setResolvedQrToken] = useState<string | null>(qrCodeToken || null);
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(
    notificationHelper.getPermissionStatus()
  );

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [vietQrConfig, setVietQrConfig] = useState<{ bankId: string; accountNumber: string; accountName: string } | null>(null);
  const [copySuccessMessage, setCopySuccessMessage] = useState<string | null>(null);
  const guestTableRequestRef = useRef(0);

  const copyText = useCallback(async (value: string, label: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
      setCopySuccessMessage(`Đã sao chép ${label}!`);
      showToast({
        type: 'success',
        message: `Đã sao chép ${label}: ${value}`
      });
    } catch {
      setCopySuccessMessage(`Hãy chọn và sao chép ${label}.`);
    }
    setTimeout(() => setCopySuccessMessage(null), 3000);
  }, [showToast]);

  const loadGuestTable = useCallback(async () => {
    const requestId = ++guestTableRequestRef.current;
    setGuestTableError(null);
    try {
      if (qrCodeToken) {
        const response = await fetch(`${getApiBaseUrl()}/api/tables/qr/${encodeURIComponent(qrCodeToken)}`);
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error?.message || 'Mã QR bàn không hợp lệ');
        }
        if (requestId !== guestTableRequestRef.current) return;
        setGuestTable(json.data.table);
        setResolvedQrToken(qrCodeToken);
        if (json.data.vietQrConfig) {
          setVietQrConfig(json.data.vietQrConfig);
        }
        return json.data.table;
      } else if (tableNumber) {
        // Tu dong nhan dien va lay token hop le theo so ban tu server
        const response = await fetch(`${getApiBaseUrl()}/api/tables/by-number/${tableNumber}`);
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error?.message || `Không thể tải thông tin Bàn ${tableNumber}`);
        }
        if (requestId !== guestTableRequestRef.current) return;
        setGuestTable(json.data.table);
        if (json.data.qrCodeToken) {
          setResolvedQrToken(json.data.qrCodeToken);
        }
        if (json.data.vietQrConfig) {
          setVietQrConfig(json.data.vietQrConfig);
        }
        return json.data.table;
      }
    } catch (err: any) {
      if (requestId === guestTableRequestRef.current) setGuestTableError(err.message || 'Không thể tải thông tin bàn');
    }
  }, [qrCodeToken, tableNumber]);

  useEffect(() => {
    void loadGuestTable();
  }, [loadGuestTable]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        loadGuestTable(),
        fetchTables()
      ]);
      showToast({
        type: 'success',
        title: 'Đã làm mới dữ liệu 🔄',
        message: 'Thông tin bàn và tiến độ đơn hàng đã được cập nhật mới nhất.'
      });
    } catch {
      showToast({
        type: 'error',
        title: 'Làm mới không thành công',
        message: 'Vui lòng kiểm tra lại kết nối mạng.'
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [loadGuestTable, fetchTables, showToast]);

  const effectiveQrToken = qrCodeToken || resolvedQrToken;
  const table = guestTable || tables.find((t) => t.tableNumber === tableNumber) || null;
  const currentTableRef = useRef(table);
  currentTableRef.current = table;
  const tableId = table?.id;
  const displayTableNumber = table?.tableNumber ?? tableNumber;
  const allTableOrders = useMemo(() => (table?.orders || []).filter((order) => isOrderInTableSession(order, table)), [table]);
  const liveOrder =
    (selectedOrderId ? allTableOrders.find((o) => o.id === selectedOrderId) : null) ||
    (isOrderInTableSession(currentOrder, table) ? currentOrder : null) ||
    (isOrderInTableSession(activeTableOrder, table) ? activeTableOrder : null) ||
    allTableOrders[0] ||
    null;

  const totalTableAmount =
    allTableOrders.length > 0
      ? allTableOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0)
      : liveOrder?.finalAmount || 0;

  const effectiveVietQrConfig = vietQrConfig || {
    bankId: '970423',
    accountNumber: '10001317794',
    accountName: 'PHAN VAN KHANH'
  };

  const qrAmountToPay = totalTableAmount > 0 ? totalTableAmount : (liveOrder?.finalAmount || 0);
  const qrTransferContent = liveOrder?.code ? `THU ${liveOrder.code}` : `BAN${formatTableNumber(displayTableNumber)}`;
  const vietQrQuery = new URLSearchParams({
    amount: String(qrAmountToPay),
    addInfo: qrTransferContent,
    accountName: effectiveVietQrConfig.accountName
  });
  const liveVietQrUrl = `https://img.vietqr.io/image/${encodeURIComponent(effectiveVietQrConfig.bankId)}-${encodeURIComponent(effectiveVietQrConfig.accountNumber)}-compact2.png?${vietQrQuery.toString()}`;

  const batchScrollRef = useRef<ScrollView>(null);

  const scrollBatches = useCallback((offset: number) => {
    if (batchScrollRef.current) {
      if (Platform.OS === 'web') {
        const node = (batchScrollRef.current as any)?.getScrollableNode?.() || batchScrollRef.current;
        if (node && typeof node.scrollLeft === 'number') {
          if (typeof node.scrollBy === 'function') {
            node.scrollBy({ left: offset, behavior: 'smooth' });
          } else {
            node.scrollLeft += offset;
          }
          return;
        }
      }
      batchScrollRef.current?.scrollTo({ x: offset > 0 ? 300 : 0, animated: true });
    }
  }, []);

  // Luu vet status da thong bao de chan triet de viec spam chuong / rung / toast
  const lastNotifiedStatusKeyRef = useRef<string | null>(null);
  const isFirstMountRef = useRef<boolean>(true);
  const previousVisitRef = useRef({ tableId: table?.id, sessionId: table?.currentSessionId });

  useEffect(() => {
    const previous = previousVisitRef.current;
    previousVisitRef.current = { tableId: table?.id, sessionId: table?.currentSessionId };
    if (previous.tableId === table?.id && previous.sessionId === table?.currentSessionId) return;
    setCurrentOrder((order) => isOrderInTableSession(order, table) ? order : null);
    setSelectedOrderId(null);
    setIsVietQRModalOpen(false);
    setPaymentDeclaration((declaration) => isOrderInTableSession(declaration?.order, table) ? declaration : null);
    setOrderError(null);
    lastNotifiedStatusKeyRef.current = null;
    isFirstMountRef.current = true;
  }, [table]);

  // Fallback polling dinh ky nhe nhang (4.5s) de dong bo trang thai khi dien thoai mo khoa man hinh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTables();
      void loadGuestTable();
    }, 4500);
    return () => clearInterval(interval);
  }, [fetchTables, loadGuestTable]);

  // Ham thong bao chuyen trang thai cho khach (dam bao moi cap orderId + status chi kich hoat 1 lan duy nhat)
  const notifyStatusTransition = useCallback((orderId: number, status: OrderStatus) => {
    const statusKey = `${orderId}_${status}`;
    if (lastNotifiedStatusKeyRef.current === statusKey) {
      return;
    }
    lastNotifiedStatusKeyRef.current = statusKey;

    if (status === 'PREPARING') {
        notificationHelper.notifyOrderPreparing(formatTableNumber(displayTableNumber));
      showToast({
        type: 'info',
        title: 'Đang nấu món 🍳',
        message: `Bếp đã bắt đầu chuẩn bị các món ăn cho Bàn ${formatTableNumber(displayTableNumber)}!`
      });
    } else if (status === 'READY') {
      notificationHelper.notifyOrderReady(formatTableNumber(displayTableNumber));
      showToast({
        type: 'success',
        title: 'Món ăn đã xong! 🎉',
        message: `Món ăn đã nấu xong! Nhân viên đang bưng ra Bàn ${formatTableNumber(displayTableNumber)} cho bạn.`,
        duration: 6000
      });
    } else if (status === 'COMPLETED') {
      notificationHelper.notifyOrderCompleted(formatTableNumber(displayTableNumber));
      showToast({
        type: 'success',
        title: 'Hoàn tất đơn hàng ✨',
        message: `Đơn hàng Bàn ${formatTableNumber(displayTableNumber)} đã hoàn thành. Chúc bạn ngon miệng!`
      });
    }
  }, [displayTableNumber, showToast]);

  // Danh dau moc trang thai ban dau de khong ban thong bao don hang cu khi moi vao trang
  useEffect(() => {
    if (isFirstMountRef.current && liveOrder) {
      lastNotifiedStatusKeyRef.current = `${liveOrder.id}_${liveOrder.status}`;
      isFirstMountRef.current = false;
    }
  }, [liveOrder]);

  // Tu dong cap nhat don hang hien tai khi du lieu ban an thay doi (polling fallback)
  useEffect(() => {
    const latestTableOrder = allTableOrders[0];
    if (latestTableOrder) {
      if (!selectedOrderId) {
        setSelectedOrderId(latestTableOrder.id);
      }
      setCurrentOrder((prev) => {
        if (!prev || prev.id !== latestTableOrder.id || prev.status !== latestTableOrder.status || prev.paymentStatus !== latestTableOrder.paymentStatus || prev.payLaterAuthorized !== latestTableOrder.payLaterAuthorized) {
          return latestTableOrder;
        }
        return prev;
      });

      // Neu trang thai tren server thay doi do polling bat duoc thi van thong bao an toan 1 lan
      if (!isFirstMountRef.current) {
        notifyStatusTransition(latestTableOrder.id, latestTableOrder.status);
      }
    }
  }, [allTableOrders, selectedOrderId, notifyStatusTransition]);

  useEffect(() => {
    if (orderPaymentsRevision > 0) {
      void fetchTables();
      void loadGuestTable();
    }
  }, [orderPaymentsRevision, fetchTables, loadGuestTable]);

  useEffect(() => {
    if (!currentOrder || (!currentOrder.payLaterAuthorized && currentOrder.paymentStatus !== 'PAID')) return;
    setPaymentDeclaration(null);
  }, [currentOrder]);

  useEffect(() => {
    if (!latestOrderPaymentChanged || latestOrderPaymentChanged.orderId !== liveOrder?.id) return;
    setCurrentOrder((previous) => previous?.id === latestOrderPaymentChanged.orderId ? {
      ...previous,
      paymentStatus: latestOrderPaymentChanged.paymentStatus,
      payLaterAuthorized: latestOrderPaymentChanged.payLaterAuthorized ?? previous.payLaterAuthorized
    } : previous);
  }, [latestOrderPaymentChanged, liveOrder?.id]);

  // Lang nghe socket cap nhat tien do don hang theo thoi gian thuc cho khach
  useEffect(() => {
    if (!latestOrderStatusChanged) return;
    const matchingOrder = allTableOrders.find((order) => order.id === latestOrderStatusChanged.orderId) ||
      (liveOrder?.id === latestOrderStatusChanged.orderId ? liveOrder : null);

    if (matchingOrder) {
      setCurrentOrder((prev) => {
        const base = prev?.id === matchingOrder.id && isOrderInTableSession(prev, table) ? prev : matchingOrder;
        if (base) {
          const updated = {
            ...base,
            status: latestOrderStatusChanged.status,
            prepTimeSec: latestOrderStatusChanged.prepTimeSec ?? base.prepTimeSec,
            preparingAt: latestOrderStatusChanged.preparingAt ?? base.preparingAt,
            readyAt: latestOrderStatusChanged.readyAt ?? base.readyAt,
            completedAt: latestOrderStatusChanged.completedAt ?? base.completedAt
          };
          if (base === prev && base.status === updated.status && base.prepTimeSec === updated.prepTimeSec &&
              base.preparingAt === updated.preparingAt && base.readyAt === updated.readyAt && base.completedAt === updated.completedAt) return prev;
          return updated;
        }
        return prev;
      });

      notifyStatusTransition(latestOrderStatusChanged.orderId, latestOrderStatusChanged.status);
    }
  }, [latestOrderStatusChanged, allTableOrders, liveOrder, table, notifyStatusTransition]);

  const handleEnableNotification = async () => {
    setIsNotifPromptModalOpen(false);
    const granted = await notificationHelper.requestPermission();
    setNotifPermission(notificationHelper.getPermissionStatus());
    if (granted) {
      notificationHelper.vibrate([200]);
      showToast({
        type: 'success',
        title: 'Đã bật thông báo! 🔔',
        message: 'Hệ thống sẽ rung chuông và thông báo khi món ăn sẵn sàng.'
      });
    } else {
      showToast({
        type: 'info',
        message: 'Bạn có thể bật lại thông báo bất cứ lúc nào trong cài đặt trình duyệt.'
      });
    }
  };

  const handleCardPress = (item: MenuItemDto) => {
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      openModifierModal(item);
    } else {
      addToCart(item, 1, []);
      showToast({
        type: 'success',
        message: `Đã thêm "${item.name}" vào giỏ hàng`
      });
    }
  };

  const handleSendToKitchen = async () => {
    if (cart.length === 0) return;
    if (!tableId) {
      setOrderError(guestTableError || 'Không xác định được bàn từ mã QR');
      return;
    }
    setIsSubmitting(true);
    setOrderError(null);

    // Xin quyen thong bao trinh duyet khi khach dat mon
    notificationHelper.requestPermission().catch(() => {});

    const tokenToSend = effectiveQrToken || (table as any)?.qrCodeToken || undefined;
    const observedSessionId = table?.currentSessionId;
    const result = await createDineInOrder(tableId, orderNotes.trim() || undefined, tokenToSend, appliedVoucher?.code, reservationAccessToken, observedSessionId);
    setIsSubmitting(false);

    if (result.success && result.order) {
      let order = result.order;
      const latestTable = currentTableRef.current;
      if (latestTable?.id !== tableId ||
          (latestTable.currentSessionId !== observedSessionId && !isOrderInTableSession(order, latestTable))) return;
      // Adopt the new marker immediately: the guest read can still be refreshing after POST.
      if (order.tableSessionId != null) {
        ++guestTableRequestRef.current;
        const updatedTable = { ...latestTable, currentSessionId: order.tableSessionId,
          orders: [order, ...(latestTable.orders || []).filter((existing) => existing.id !== order.id && existing.tableSessionId === order.tableSessionId)] };
        currentTableRef.current = updatedTable;
        setGuestTable(updatedTable);
      }
      if (tokenToSend) {
        let declaration: QrOrderPaymentDeclaration;
        try {
          declaration = await declareQrOrderPaymentApi(order.id, reservationAccessToken ? { reservationAccessToken } : { qrCodeToken: tokenToSend });
          if (!isOrderInTableSession(order, currentTableRef.current)) return;
          setPaymentDeclaration(declaration);
          order = declaration.order;
        } catch (failure: any) {
          if (!isOrderInTableSession(order, currentTableRef.current)) return;
          setCurrentOrder(order);
          setOrderError(failure.message || 'Order đã tạo nhưng chưa thể khai báo thanh toán. Vui lòng nhờ thu ngân kiểm tra.');
          setIsBrowsingMenu(false); setIsCartModalOpen(false); setOrderNotes('');
          return;
        }
        setCurrentOrder(order);
        setSelectedOrderId(result.order.id);
        setIsBrowsingMenu(false);
        setIsCartModalOpen(false);
        setOrderNotes('');
        setAppliedVoucher(null);
        showToast(declaration.amountDue > 0 ? {
          type: 'info', title: 'Order đang chờ thanh toán',
          message: `Chuyển ${formatVND(declaration.amountDue)} và chờ thu ngân xác nhận. Bếp chưa nhận order.`
        } : {
          type: 'success', title: 'Đặt món thành công!',
          message: `Tiền cọc đã đủ thanh toán; order bàn ${formatTableNumber(displayTableNumber)} đã được gửi xuống bếp.`
        });
      } else {
        setCurrentOrder(order);
        setSelectedOrderId(result.order.id);
        setIsBrowsingMenu(false);
        setIsCartModalOpen(false);
        setOrderNotes('');
        setAppliedVoucher(null);
        showToast({
          type: 'success',
          title: 'Đặt món thành công!',
          message: `Order bàn ${formatTableNumber(displayTableNumber)} đã được gửi xuống bếp.`
        });
      }

      // Sau khi dat mon thanh cong, hoi khach co muon nhan thong bao va rung chuong khong
      if (notificationHelper.getPermissionStatus() === 'default') {
        setTimeout(() => {
          setIsNotifPromptModalOpen(true);
        }, 500);
      }
    } else {
      setOrderError(result.error || 'Không thể gửi đơn xuống bếp');
      showToast({
        type: 'error',
        title: 'Không thể gửi đơn',
        message: result.error || 'Vui lòng thử lại'
      });
    }
  };

  const getStepProgress = (status?: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return 1;
      case 'PREPARING':
        return 2;
      case 'READY':
      case 'COMPLETED':
        return 3;
      default:
        return 0;
    }
  };

  const isAwaitingPayment = !!liveOrder && liveOrder.status === 'PENDING' && liveOrder.paymentStatus !== 'PAID' && !liveOrder.payLaterAuthorized;
  const currentStep = isAwaitingPayment ? 0 : getStepProgress(liveOrder?.status);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.customerHeader, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.tableIdentity}>
          {liveOrder && isBrowsingMenu ? (
            <Pressable
              testID="customer-back-to-session-orders"
              accessibilityRole="button"
              accessibilityLabel="Quay lại xem đơn và tiến độ món"
              onPress={() => setIsBrowsingMenu(false)}
              style={({ pressed }) => [
                styles.headerBackButton,
                { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceRaised, borderColor: theme.borderSubtle }
              ]}
            >
              <AppIcon icon={ChevronLeft} color={theme.textPrimary} size={20} />
            </Pressable>
          ) : (
            <BrandMark compact size="small" />
          )}
          <View style={styles.tableIdentityCopy}>
            <Text style={[styles.headerHint, { color: theme.textSecondary }]}>
              {liveOrder && isBrowsingMenu ? `Đơn ${liveOrder.code}` : (allTableOrders.length > 0 ? `Phiên ăn (${allTableOrders.length} đợt)` : 'Đặt món tại bàn')}
            </Text>
            <Text style={[styles.tableIdentityNumber, { color: theme.textPrimary }]}>Bàn {formatTableNumber(displayTableNumber)}</Text>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          {/* Nút Làm mới (Refresh) */}
          <Pressable
            testID="customer-refresh-btn"
            accessibilityRole="button"
            accessibilityLabel="Làm mới thông tin bàn và đơn hàng"
            onPress={() => void handleRefresh()}
            disabled={isRefreshing}
            style={({ pressed }) => [
              styles.headerRefreshButton,
              {
                backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceRaised,
                borderColor: theme.borderSubtle,
                opacity: isRefreshing ? 0.6 : 1
              }
            ]}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <AppIcon icon={RefreshCw} color={theme.textPrimary} size={18} />
            )}
          </Pressable>

          {/* Nút Xem đơn bàn khi đang ở Thực đơn */}
          {liveOrder && isBrowsingMenu && (
            <Pressable
              testID="customer-view-session-btn"
              accessibilityRole="button"
              accessibilityLabel={`Xem đơn của bàn (${allTableOrders.length} đợt)`}
              onPress={() => setIsBrowsingMenu(false)}
              style={({ pressed }) => [
                styles.headerSessionButton,
                {
                  backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceRaised,
                  borderColor: theme.primary
                }
              ]}
            >
              <AppIcon icon={ReceiptText} color={theme.primary} size={16} />
              <Text style={[styles.headerSessionText, { color: theme.primary }]}>
                {allTableOrders.length > 1 ? `Đơn bàn (${allTableOrders.length})` : 'Xem đơn'}
              </Text>
            </Pressable>
          )}

          {/* Nút Thanh toán */}
          {liveOrder && (
            <Pressable
              testID="customer-header-payment-btn"
              accessibilityRole="button"
              accessibilityLabel={'Thanh toán ' + formatVND(totalTableAmount)}
              onPress={() => setIsVietQRModalOpen(true)}
              style={({ pressed }) => [
                styles.headerPayment,
                { backgroundColor: pressed ? theme.interactiveSecondaryPressed : theme.interactiveSecondary }
              ]}
            >
              <AppIcon icon={CreditCard} color={theme.primary} size={18} />
              <Text style={[styles.headerPaymentText, { color: theme.primary }]}>
                {allTableOrders.length > 1 ? `Thanh toán (${formatVND(totalTableAmount)})` : 'Thanh toán'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {liveOrder && !isBrowsingMenu ? (
        <ScrollView contentContainerStyle={styles.progressContent} showsVerticalScrollIndicator={false}>
          {cartItemCount > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Bạn đang có ${cartItemCount} món trong giỏ hàng. Chạm để xem và gửi bếp.`}
              onPress={() => setIsCartModalOpen(true)}
              style={[
                styles.pendingCartAlert,
                { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
              ]}
            >
              <View style={styles.pendingCartAlertLeft}>
                <View style={[styles.cartBadge, { backgroundColor: theme.primary }]}>
                  <AppIcon icon={ShoppingBag} color={theme.textInverse} size={15} />
                </View>
                <View style={styles.cartBarCopyText}>
                  <Text style={[styles.pendingCartAlertTitle, { color: theme.primary }]}>
                    Giỏ hàng có {cartItemCount} món chưa gửi bếp ({formatVND(cartTotal)})
                  </Text>
                  <Text style={[styles.pendingCartAlertSub, { color: theme.textSecondary }]}>
                    Chạm để xem giỏ hàng hoặc gửi tiếp đợt món mới
                  </Text>
                </View>
              </View>
              <AppIcon icon={ChevronRight} color={theme.primary} size={18} />
            </Pressable>
          )}

          <View style={styles.progressHeading}>
            <View style={styles.progressHeadingCopy}>
              <Text accessibilityRole="header" style={[styles.screenTitle, { color: theme.textPrimary }]}>
                {allTableOrders.length > 1 ? `Đơn hàng (${allTableOrders.length} đợt gọi)` : 'Đơn của bạn'}
              </Text>
              <Text style={[styles.orderCode, { color: theme.textSecondary }]}>
                {allTableOrders.length > 1
                  ? `Đang xem Đợt #${liveOrder.code} · ${new Date(liveOrder.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                  : `Mã đơn ${liveOrder.code}`}
              </Text>
            </View>
            <StatusBadge {...orderStatusConfig(liveOrder)} />
          </View>
          {isAwaitingPayment && <InlineAlert title="Đang chờ thu ngân xác nhận thanh toán" message="Bếp chưa nhận món. Đơn sẽ được gửi xuống bếp sau khi thu ngân đối chiếu tiền đã vào tài khoản." />}

          {/* Thanh chon dot don hang khi co nhieu dot goi mon */}
          {allTableOrders.length > 1 && (
            <View style={styles.batchSelectorContainer}>
              <View style={styles.batchSelectorHeader}>
                <View style={styles.batchSelectorTitleRow}>
                  <Text style={[styles.batchSelectorLabel, { color: theme.textSecondary }]}>
                    Chọn đợt để xem tiến độ nấu:
                  </Text>
                  <Text style={[styles.batchTotalHint, { color: theme.primary }]}>
                    Tổng bàn: {formatVND(totalTableAmount)}
                  </Text>
                </View>
                {allTableOrders.length > 2 && (
                  <View style={styles.batchNavControls}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Cuộn đợt sang trái"
                      onPress={() => scrollBatches(-180)}
                      style={({ pressed }) => [
                        styles.batchNavBtn,
                        {
                          backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase,
                          borderColor: theme.borderSubtle
                        }
                      ]}
                    >
                      <AppIcon icon={ChevronLeft} color={theme.textPrimary} size={15} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Cuộn đợt sang phải"
                      onPress={() => scrollBatches(180)}
                      style={({ pressed }) => [
                        styles.batchNavBtn,
                        {
                          backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase,
                          borderColor: theme.borderSubtle
                        }
                      ]}
                    >
                      <AppIcon icon={ChevronRight} color={theme.textPrimary} size={15} />
                    </Pressable>
                  </View>
                )}
              </View>
              <View
                style={styles.batchListWrapper}
                {...(Platform.OS === 'web'
                  ? {
                      onWheel: (e: any) => {
                        const delta = e.deltaY || e.deltaX;
                        if (delta && batchScrollRef.current) {
                          const node = (batchScrollRef.current as any)?.getScrollableNode?.() || batchScrollRef.current;
                          if (node && typeof node.scrollLeft === 'number') {
                            node.scrollLeft += delta;
                          }
                        }
                      }
                    }
                  : {})}
              >
                <ScrollView
                  ref={batchScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.batchList}
                >
                  {allTableOrders.map((order, idx) => {
                    const isSelected = order.id === liveOrder?.id;
                    const batchNumber = allTableOrders.length - idx;
                    const statusCfg = orderStatusConfig(order);
                    return (
                      <Pressable
                        key={order.id}
                        onPress={() => {
                          setSelectedOrderId(order.id);
                          setCurrentOrder(order);
                        }}
                        style={({ pressed }) => [
                          styles.batchChip,
                          {
                            backgroundColor: isSelected ? theme.interactivePrimary : theme.surfaceRaised,
                            borderColor: isSelected ? theme.interactivePrimary : theme.borderSubtle,
                            opacity: pressed ? 0.85 : 1
                          }
                        ]}
                      >
                        <Text
                          style={[
                            styles.batchChipTitle,
                            { color: isSelected ? theme.textInverse : theme.textPrimary }
                          ]}
                        >
                          Đợt {batchNumber} (#{order.code})
                        </Text>
                        <View
                          style={[
                            styles.batchChipBadge,
                            {
                              backgroundColor: isSelected
                                ? 'rgba(255,255,255,0.25)'
                                : statusColors.order[order.status]?.background || theme.surfaceSunken
                            }
                          ]}
                        >
                          <Text
                            style={[
                              styles.batchChipStatus,
                              {
                                color: isSelected ? theme.textInverse : statusColors.order[order.status]?.text || theme.textSecondary
                              }
                            ]}
                          >
                            {statusCfg.label}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Banner nhanh nhan thong bao neu chua cap quyen */}
          {liveOrder.status !== 'COMPLETED' && notifPermission === 'default' && (
            <Surface level="raised" style={[styles.notifOptInBanner, { borderColor: statusColors.info.border, backgroundColor: statusColors.info.background }]}>
              <View style={styles.notifOptInLeft}>
                <View style={[styles.notifOptInIconCircle, { backgroundColor: '#DBEAFE' }]}>
                  <AppIcon icon={Bell} color="#2563EB" size={18} />
                </View>
                <View style={styles.notifOptInCopy}>
                  <Text style={[styles.notifOptInTitle, { color: statusColors.info.text }]}>Nhận thông báo khi món xong?</Text>
                  <Text style={[styles.notifOptInSubtitle, { color: theme.textSecondary }]}>Rung máy và chuông reo báo nhân viên bưng món ra</Text>
                </View>
              </View>
              <Pressable
                onPress={handleEnableNotification}
                style={({ pressed }) => [styles.notifOptInButton, { backgroundColor: theme.interactivePrimary, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.notifOptInButtonText, { color: theme.textInverse }]}>Bật ngay</Text>
              </Pressable>
            </Surface>
          )}

          {liveOrder.status === 'READY' && (
            <View style={[styles.readyBanner, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
              <View style={[styles.readyBannerIcon, { backgroundColor: '#DCFCE7' }]}>
                <AppIcon icon={UtensilsCrossed} color="#16A34A" size={24} />
              </View>
              <View style={styles.readyBannerCopy}>
                <Text style={[styles.readyBannerTitle, { color: '#15803D' }]}>Món ăn đã xong! 🎉</Text>
                <Text style={[styles.readyBannerText, { color: '#166534' }]}>
                  Nhân viên đang bưng món ra Bàn {formatTableNumber(displayTableNumber)} cho bạn. Vui lòng ngồi chờ giây lát nhé!
                </Text>
              </View>
            </View>
          )}

          {liveOrder.status === 'PREPARING' && (
            <View style={[styles.readyBanner, { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' }]}>
              <View style={[styles.readyBannerIcon, { backgroundColor: '#DBEAFE' }]}>
                <AppIcon icon={ChefHat} color="#2563EB" size={24} />
              </View>
              <View style={styles.readyBannerCopy}>
                <Text style={[styles.readyBannerTitle, { color: '#1D4ED8' }]}>Bếp đang nấu món 🍳</Text>
                <Text style={[styles.readyBannerText, { color: '#1E40AF' }]}>
                  Đầu bếp đang chế biến các món ăn nóng hổi cho Bàn {formatTableNumber(displayTableNumber)}.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.timeline}>
            {orderSteps.map((step, index) => {
              const stepNumber = index + 1;
              const completed = currentStep >= stepNumber;
              const current = currentStep === stepNumber;
              return (
                <View key={step.title} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View
                      style={[
                        styles.timelineMarker,
                        {
                          backgroundColor: completed ? theme.interactivePrimary : theme.surfaceBase,
                          borderColor: completed ? theme.interactivePrimary : theme.borderStrong
                        }
                      ]}
                    >
                      <AppIcon icon={step.icon} color={completed ? theme.textInverse : theme.textSecondary} size={17} />
                    </View>
                    {index < orderSteps.length - 1 && (
                      <View style={[styles.timelineLine, { backgroundColor: currentStep > stepNumber ? theme.interactivePrimary : theme.borderSubtle }]} />
                    )}
                  </View>
                  <View style={[styles.timelineCopy, { borderBottomColor: theme.borderSubtle }]}>
                    <Text style={[styles.timelineTitle, { color: completed ? theme.textPrimary : theme.textSecondary }]}>
                      {step.title}{current ? ' · Hiện tại' : ''}
                    </Text>
                    <Text style={[styles.timelineDescription, { color: theme.textSecondary }]}>{step.description}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.orderSection}>
            <View style={styles.orderSectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                {allTableOrders.length > 1 ? 'Danh sách món theo đợt' : 'Món đã gọi'}
              </Text>
              {allTableOrders.length > 1 && (
                <Text style={[styles.batchCountBadge, { color: theme.textSecondary }]}>
                  {allTableOrders.length} đợt gọi món
                </Text>
              )}
            </View>

            {allTableOrders.length > 1 ? (
              <View style={styles.batchCardsContainer}>
                {allTableOrders.map((batchOrder, bIdx) => {
                  const batchNumber = allTableOrders.length - bIdx;
                  const isCurrentBatch = batchOrder.id === liveOrder?.id;
                  return (
                    <Pressable
                      key={batchOrder.id}
                      onPress={() => {
                        setSelectedOrderId(batchOrder.id);
                        setCurrentOrder(batchOrder);
                      }}
                      style={({ pressed }) => [
                        styles.batchOrderCard,
                        {
                          backgroundColor: theme.surfaceBase,
                          borderColor: isCurrentBatch ? theme.interactivePrimary : theme.borderSubtle,
                          borderWidth: isCurrentBatch ? 2 : 1,
                          opacity: pressed ? 0.9 : 1
                        }
                      ]}
                    >
                      <View style={styles.batchOrderHeader}>
                        <View style={styles.batchOrderTitleGroup}>
                          <View style={styles.batchOrderTitleRow}>
                            <Text style={[styles.batchOrderTitle, { color: isCurrentBatch ? theme.primary : theme.textPrimary }]}>
                              Đợt {batchNumber} · Mã #{batchOrder.code} {isCurrentBatch ? '(Đang xem)' : ''}
                            </Text>
                            <StatusBadge {...orderStatusConfig(batchOrder)} />
                          </View>
                          <Text style={[styles.batchOrderTime, { color: theme.textSecondary }]}>
                            Đặt lúc {new Date(batchOrder.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.batchItemsList}>
                        {batchOrder.items?.map((item, iIdx) => (
                          <View
                            key={item.id || String(item.menuItemId) + '-' + iIdx}
                            style={[styles.batchItemRow, iIdx > 0 && { borderTopColor: theme.borderSubtle, borderTopWidth: 1 }]}
                          >
                            <View style={styles.itemDetailCol}>
                              <Text style={[styles.orderItemName, { color: theme.textPrimary }]}>
                                {item.quantity} × {item.menuItemName || `Món #${item.menuItemId}`}
                              </Text>
                              {(item.selectedModifiersJson || []).map((mod, mIdx) => (
                                <Text key={`${mod.optionId}-${mIdx}`} style={[styles.itemModifierText, { color: theme.textSecondary }]}>
                                  + {mod.groupName}: {mod.optionName}{mod.priceDelta > 0 ? ` (+${formatVND(mod.priceDelta)})` : ''}
                                </Text>
                              ))}
                              {item.notes ? (
                                <Text style={[styles.itemNotesText, { color: theme.textSecondary }]}>
                                  📝 Ghi chú: {item.notes}
                                </Text>
                              ) : null}
                            </View>
                            <Text style={[styles.orderItemPrice, { color: theme.textPrimary }]}>
                              {formatVND(item.subtotal)}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {batchOrder.notes ? (
                        <View style={[styles.batchOrderNotesBadge, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                          <Text style={[styles.batchOrderNotesText, { color: theme.textSecondary }]}>
                            💬 Ghi chú đợt: {batchOrder.notes}
                          </Text>
                        </View>
                      ) : null}

                      <View style={[styles.batchSubtotalRow, { borderTopColor: theme.borderSubtle }]}>
                        <Text style={[styles.batchSubtotalLabel, { color: theme.textSecondary }]}>Tiền đợt {batchNumber}:</Text>
                        <Text style={[styles.batchSubtotalValue, { color: theme.textPrimary }]}>
                          {formatVND(batchOrder.finalAmount)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                {/* Grand Total Summary Card */}
                <View style={[styles.grandTotalCard, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderStrong }]}>
                  <View>
                    <Text style={[styles.grandTotalLabel, { color: theme.textPrimary }]}>
                      Tổng thanh toán cả bàn ({allTableOrders.length} đợt gọi món)
                    </Text>
                    <Text style={[styles.vatNote, { color: theme.textSecondary }]}>Đã gồm thuế VAT 8%</Text>
                  </View>
                  <Text style={[styles.grandTotalValue, { color: theme.primary }]}>
                    {formatVND(totalTableAmount)}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.orderItems, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
                <View style={styles.singleOrderHeader}>
                  <View style={styles.singleOrderHeaderLeft}>
                    <Text style={[styles.singleOrderCode, { color: theme.textPrimary }]}>
                      Đơn #{liveOrder.code}
                    </Text>
                    <Text style={[styles.singleOrderTime, { color: theme.textSecondary }]}>
                      Đặt lúc {new Date(liveOrder.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <StatusBadge {...orderStatusConfig(liveOrder)} />
                </View>

                <View style={styles.singleOrderDivider} />

                {liveOrder.items?.map((item, index) => (
                  <View
                    key={item.id || String(item.menuItemId) + '-' + index}
                    style={[styles.orderItem, index > 0 && { borderTopColor: theme.borderSubtle, borderTopWidth: 1 }]}
                  >
                    <View style={styles.itemDetailCol}>
                      <Text style={[styles.orderItemName, { color: theme.textPrimary }]}>
                        {item.quantity} × {item.menuItemName || `Món #${item.menuItemId}`}
                      </Text>
                      {(item.selectedModifiersJson || []).map((mod, mIdx) => (
                        <Text key={`${mod.optionId}-${mIdx}`} style={[styles.itemModifierText, { color: theme.textSecondary }]}>
                          + {mod.groupName}: {mod.optionName}{mod.priceDelta > 0 ? ` (+${formatVND(mod.priceDelta)})` : ''}
                        </Text>
                      ))}
                      {item.notes ? (
                        <Text style={[styles.itemNotesText, { color: theme.textSecondary }]}>
                          📝 Ghi chú: {item.notes}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.orderItemPrice, { color: theme.textPrimary }]}>{formatVND(item.subtotal)}</Text>
                  </View>
                ))}

                {liveOrder.notes ? (
                  <View style={[styles.batchOrderNotesBadge, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                    <Text style={[styles.batchOrderNotesText, { color: theme.textSecondary }]}>
                      💬 Ghi chú: {liveOrder.notes}
                    </Text>
                  </View>
                ) : null}

                <View style={[styles.orderTotal, { borderTopColor: theme.borderSubtle }]}>
                  <View>
                    <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Tổng thanh toán</Text>
                    <Text style={[styles.vatNote, { color: theme.textSecondary }]}>Đã gồm VAT 8%</Text>
                  </View>
                  <Text style={[styles.totalValue, { color: theme.primary }]}>{formatVND(liveOrder.finalAmount)}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.progressActions}>
            <Button variant="secondary" label="Gọi thêm món" icon={Plus} onPress={() => setIsBrowsingMenu(true)} />
            <Button
              variant="primary"
              label={allTableOrders.length > 1 ? `Thanh toán cả bàn (${formatVND(totalTableAmount)})` : 'Thanh toán'}
              icon={CreditCard}
              onPress={() => setIsVietQRModalOpen(true)}
            />
          </View>
        </ScrollView>
      ) : (
        <View style={styles.menuArea}>
          <View style={styles.menuHeading}>
            <View>
              <Text accessibilityRole="header" style={[styles.screenTitle, { color: theme.textPrimary }]}>Thực đơn</Text>
              <Text style={[styles.menuDescription, { color: theme.textSecondary }]}>
                {liveOrder ? 'Chọn thêm món bạn muốn gọi thêm vào bàn.' : 'Chọn món bạn muốn gọi tại bàn.'}
              </Text>
            </View>
          </View>

          {allTableOrders.length > 0 && (
            <Pressable
              testID="customer-view-session-bar"
              accessibilityRole="button"
              accessibilityLabel={`Bàn đã có ${allTableOrders.length} đợt gọi món, tổng cộng ${formatVND(totalTableAmount)}. Chạm để xem chi tiết và tiến độ bếp.`}
              onPress={() => setIsBrowsingMenu(false)}
              style={[
                styles.sessionOrdersBar,
                { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
              ]}
            >
              <View style={styles.sessionOrdersBarLeft}>
                <View style={[styles.sessionOrdersBadge, { backgroundColor: theme.primary }]}>
                  <AppIcon icon={ReceiptText} color={theme.textInverse} size={16} />
                </View>
                <View style={styles.sessionOrdersTextGroup}>
                  <Text style={[styles.sessionOrdersBarTitle, { color: theme.primary }]}>
                    Bàn đã gọi {allTableOrders.length} đợt món · {formatVND(totalTableAmount)}
                  </Text>
                  <Text style={[styles.sessionOrdersBarSub, { color: theme.textSecondary }]}>
                    Chạm để xem chi tiết các món & tiến độ bếp đang nấu
                  </Text>
                </View>
              </View>
              <AppIcon icon={ChevronRight} color={theme.primary} size={18} />
            </Pressable>
          )}

          <MenuCategoryPills
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={selectCategory}
            totalItemCount={allMenuItems.length}
          />

          {guestTableError && (
            <InlineAlert title="Không mở được bàn" message={guestTableError} />
          )}

          {isLoadingMenu ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải thực đơn...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredMenuItems}
              keyExtractor={(item) => item.id.toString()}
              numColumns={2}
              contentContainerStyle={styles.listContent}
              columnWrapperStyle={styles.menuRow}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.menuColumn}>
                  <MenuItemCard item={item} onPress={handleCardPress} />
                </View>
              )}
            />
          )}

          {cartItemCount > 0 && (
            <View
              testID="customer-cart-summary"
              style={[styles.customerCartBar, elevation.floatingAction, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Xem giỏ hàng có ${cartItemCount} món, tổng cộng ${formatVND(cartTotal)}`}
                onPress={() => setIsCartModalOpen(true)}
                style={styles.cartSummaryCopy}
              >
                <View style={styles.cartHeadingRow}>
                  <View style={[styles.cartBadge, { backgroundColor: theme.primary }]}>
                    <AppIcon icon={ShoppingBag} color={theme.textInverse} size={15} />
                  </View>
                  <View style={styles.cartBarCopyText}>
                    <Text style={[styles.cartTitle, { color: theme.textPrimary }]}>Xem giỏ hàng ({cartItemCount})</Text>
                    <Text style={[styles.cartMeta, { color: theme.textSecondary }]}>Chạm để xem món & sửa</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.cartPrice, { color: theme.primary }]}>
                    {formatVND(appliedVoucher ? appliedVoucher.finalAmount : cartTotal)}
                  </Text>
                  {appliedVoucher && (
                    <Text style={{ fontSize: 11, color: theme.success, fontFamily: typography.families.bodyMedium }}>
                      🎟️ -{formatVND(appliedVoucher.discountAmount)}
                    </Text>
                  )}
                </View>
              </Pressable>
              <View style={styles.cartAction}>
                <Button
                  variant="primary"
                  label="Gửi món"
                  loading={isSubmitting}
                  onPress={() => void handleSendToKitchen()}
                />
              </View>
            </View>
          )}

          {orderError && (
            <View style={[styles.orderError, { bottom: cartItemCount > 0 ? 132 : spacing.lg }]}>
              <InlineAlert title="Chưa gửi được món" message={orderError} />
            </View>
          )}
        </View>
      )}

      <ModifierModal
        visible={isModifierModalOpen}
        item={selectedMenuItemForModal}
        onClose={closeModifierModal}
        onAddToCart={addToCart}
      />

      <Modal
        visible={isVietQRModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsVietQRModalOpen(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <SafeAreaView style={[styles.qrModal, elevation.modal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={[styles.qrHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.qrHeaderCopy}>
                <Text accessibilityRole="header" style={[styles.qrTitle, { color: theme.textPrimary }]}>Thanh toán VietQR</Text>
                <Text style={[styles.qrSubtitle, { color: theme.textSecondary }]}>
                  Bàn {formatTableNumber(displayTableNumber)} · {allTableOrders.length > 1 ? `${allTableOrders.length} đợt gọi món` : (liveOrder?.code ? `Đơn #${liveOrder.code}` : 'Chưa có đơn')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng thanh toán"
                onPress={() => setIsVietQRModalOpen(false)}
                style={({ pressed }) => [styles.closeButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
              >
                <AppIcon icon={X} color={theme.textPrimary} size={20} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.qrBody} showsVerticalScrollIndicator={false}>
              <Surface level="sunken" style={styles.qrCodePanel}>
                <Image
                  source={{ uri: liveVietQrUrl }}
                  accessibilityLabel="Mã VietQR thanh toán chuyển khoản ngân hàng"
                  style={styles.realQrImage}
                  resizeMode="contain"
                />
                <Text style={[styles.qrBankName, { color: theme.textPrimary }]}>
                  {effectiveVietQrConfig.bankId === '970423' ? 'NCB (Ngân hàng Quốc Dân)' : `Ngân hàng mã ${effectiveVietQrConfig.bankId}`}
                </Text>
                <Text style={[styles.qrAccount, { color: theme.textSecondary }]}>
                  STK: {effectiveVietQrConfig.accountNumber} · {effectiveVietQrConfig.accountName}
                </Text>
              </Surface>

              <View style={styles.paymentDetails}>
                <View style={styles.copyableRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Số tiền thanh toán</Text>
                    <Text style={[styles.qrAmount, { color: theme.primary }]}>{formatVND(qrAmountToPay)}</Text>
                  </View>
                  <Pressable
                    testID="copy-amount-btn"
                    accessibilityRole="button"
                    accessibilityLabel="Sao chép số tiền"
                    onPress={() => void copyText(String(qrAmountToPay), 'số tiền')}
                    style={({ pressed }) => [
                      styles.copyButton,
                      { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceRaised, borderColor: theme.borderSubtle }
                    ]}
                  >
                    <AppIcon icon={Copy} color={theme.primary} size={15} />
                    <Text style={[styles.copyButtonText, { color: theme.primary }]}>Sao chép</Text>
                  </Pressable>
                </View>

                <View style={styles.copyableRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Số tài khoản nhận</Text>
                    <Text selectable style={[styles.qrFieldText, { color: theme.textPrimary }]}>
                      {effectiveVietQrConfig.accountNumber}
                    </Text>
                  </View>
                  <Pressable
                    testID="copy-account-btn"
                    accessibilityRole="button"
                    accessibilityLabel="Sao chép số tài khoản"
                    onPress={() => void copyText(effectiveVietQrConfig.accountNumber, 'số tài khoản')}
                    style={({ pressed }) => [
                      styles.copyButton,
                      { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceRaised, borderColor: theme.borderSubtle }
                    ]}
                  >
                    <AppIcon icon={Copy} color={theme.primary} size={15} />
                    <Text style={[styles.copyButtonText, { color: theme.primary }]}>Sao chép</Text>
                  </Pressable>
                </View>

                <View style={styles.copyableRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Nội dung chuyển khoản (bắt buộc)</Text>
                    <Text selectable style={[styles.transferContentText, { color: theme.primary, backgroundColor: theme.surfaceSunken }]}>
                      {qrTransferContent}
                    </Text>
                  </View>
                  <Pressable
                    testID="copy-content-btn"
                    accessibilityRole="button"
                    accessibilityLabel="Sao chép nội dung chuyển khoản"
                    onPress={() => void copyText(qrTransferContent, 'nội dung chuyển khoản')}
                    style={({ pressed }) => [
                      styles.copyButton,
                      { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceRaised, borderColor: theme.borderSubtle }
                    ]}
                  >
                    <AppIcon icon={Copy} color={theme.primary} size={15} />
                    <Text style={[styles.copyButtonText, { color: theme.primary }]}>Sao chép</Text>
                  </Pressable>
                </View>
              </View>

              {copySuccessMessage ? (
                <Text style={{ color: theme.primary, textAlign: 'center', fontFamily: typography.families.bodyMedium }}>
                  ✓ {copySuccessMessage}
                </Text>
              ) : null}

              <InlineAlert
                tone="info"
                title="Hướng dẫn thanh toán"
                message="Mở ứng dụng ngân hàng quét mã QR ở trên hoặc chuyển khoản theo đúng STK và nội dung. Sau khi chuyển, thu ngân sẽ đối chiếu và xác nhận hóa đơn ngay."
              />

              <View style={styles.qrModalActions}>
                <Button
                  variant="primary"
                  label="Tôi đã chuyển tiền xong"
                  icon={Check}
                  onPress={() => {
                    setIsVietQRModalOpen(false);
                    showToast({
                      type: 'info',
                      title: 'Đã ghi nhận thanh toán',
                      message: 'Thu ngân đang đối chiếu tiền vào tài khoản. Cảm ơn bạn!'
                    });
                  }}
                />
                <Button variant="quiet" label="Đóng" onPress={() => setIsVietQRModalOpen(false)} />
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Modal hoi cap quyen thong bao sau khi khach dat mon */}
      <Modal
        animationType="fade"
        transparent
        visible={isNotifPromptModalOpen}
        onRequestClose={() => setIsNotifPromptModalOpen(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
          <SafeAreaView style={[styles.notifPromptModal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={styles.notifPromptContent}>
              <View style={[styles.notifPromptIconCircle, { backgroundColor: '#EFF6FF' }]}>
                <AppIcon icon={Bell} color="#2563EB" size={36} />
              </View>

              <Text style={[styles.notifPromptTitle, { color: theme.textPrimary }]}>
                Bật thông báo khi món đã xong?
              </Text>

              <Text style={[styles.notifPromptDesc, { color: theme.textSecondary }]}>
                Để bạn thoải mái trò chuyện và không phải chờ đợi sốt ruột, điện thoại sẽ rung và gửi thông báo ngay khi đầu bếp nấu xong món ăn cho Bàn {formatTableNumber(displayTableNumber)}.
              </Text>

              <View style={styles.notifPromptActions}>
                <Button
                  variant="primary"
                  label="🔔 Bật thông báo & Rung"
                  onPress={handleEnableNotification}
                />
                <Button
                  variant="quiet"
                  label="Để sau / Không cần"
                  onPress={() => setIsNotifPromptModalOpen(false)}
                />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Modal xem va chinh sua gio hang cho khach */}
      <CustomerCartModal
        visible={isCartModalOpen}
        tableNumber={displayTableNumber}
        cart={cart}
        cartItemCount={cartItemCount}
        cartSubtotal={cartSubtotal}
        cartVat={cartVat}
        cartTotal={cartTotal}
        appliedVoucher={appliedVoucher}
        onApplyVoucher={setAppliedVoucher}
        orderNotes={orderNotes}
        onChangeOrderNotes={setOrderNotes}
        onUpdateQuantity={updateCartQuantity}
        onRemoveItem={removeFromCart}
        onClearCart={() => {
          clearCart();
          setAppliedVoucher(null);
        }}
        onSubmitOrder={() => void handleSendToKitchen()}
        submitLabel={reservationAccessToken ? `Tạo order & thanh toán trước (${formatVND(cartTotal)})` : `Gửi đơn chờ xác nhận tiền (${formatVND(cartTotal)})`}
        isSubmitting={isSubmitting}
        onClose={() => setIsCartModalOpen(false)}
      />
      <Modal visible={!!paymentDeclaration && paymentDeclaration.amountDue > 0} transparent animationType="fade" onRequestClose={() => setPaymentDeclaration(null)}>
        <View style={[styles.paymentBackdrop, { backgroundColor: theme.overlay }]}>
          <View style={[styles.paymentModal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Thanh toán order {paymentDeclaration?.order.code}</Text>
            <Text style={{ color: theme.textSecondary }}>Order chưa được chuyển xuống bếp. Chuyển khoản và nhập đúng nội dung bên dưới; nhân viên sẽ đối chiếu trước khi bếp nhận món.</Text>
            <Text style={[styles.depositAmount, { color: theme.primary }]}>{formatVND(paymentDeclaration?.amountDue || 0)}</Text>
            {paymentDeclaration?.paymentInstructions ? <Image source={{ uri: paymentDeclaration.paymentInstructions.qrUrl }} accessibilityLabel="Mã VietQR thanh toán order" style={styles.paymentQr} /> : <Text style={{ color: theme.textSecondary }}>Nhà hàng chưa cấu hình QR nhận tiền. Vui lòng hỏi thu ngân thông tin chuyển khoản.</Text>}
            <Text selectable style={[styles.transferCode, { backgroundColor: theme.surfaceSunken, color: theme.textPrimary }]}>{paymentDeclaration?.transferContent}</Text>
            <Button variant="primary" label="Đã hiểu" onPress={() => setPaymentDeclaration(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  paymentBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.md },
  paymentModal: { alignItems: 'center', borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, maxWidth: 460, padding: spacing.lg, width: '100%' },
  depositAmount: { fontFamily: typography.families.bodyBold, fontSize: typography.sizes.xxl },
  paymentQr: { height: 220, width: 220 },
  transferCode: { borderRadius: radii.sm, fontFamily: typography.families.bodyBold, padding: spacing.md, textAlign: 'center', width: '100%' },
  container: { flex: 1 },
  customerHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  tableIdentity: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  tableIdentityCopy: { gap: 1 },
  headerHint: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  tableIdentityNumber: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant],
    lineHeight: typography.lineHeights.xl
  },
  headerPayment: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: spacing.touchTargetMobile,
    paddingHorizontal: spacing.md
  },
  headerPaymentText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  headerRightActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  headerRefreshButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    minWidth: 40,
    paddingHorizontal: spacing.xs
  },
  headerSessionButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm
  },
  headerSessionText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  sessionOrdersBar: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md
  },
  sessionOrdersBarLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm
  },
  sessionOrdersBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  sessionOrdersTextGroup: {
    flex: 1,
    gap: 2
  },
  sessionOrdersBarTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  sessionOrdersBarSub: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  menuArea: { flex: 1 },
  menuHeading: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  screenTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    lineHeight: typography.lineHeights.xl
  },
  menuDescription: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginTop: spacing.xs
  },
  listContent: { paddingBottom: 148, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  menuRow: { gap: spacing.md },
  menuColumn: { flex: 1, minWidth: 0 },
  centerContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  loadingText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    marginTop: spacing.md
  },
  customerCartBar: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    left: spacing.md,
    minHeight: 104,
    padding: spacing.md,
    position: 'absolute',
    right: spacing.md
  },
  cartSummaryCopy: { flex: 1, gap: 2 },
  cartHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  cartTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  cartMeta: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  cartPrice: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg,
    fontVariant: [...typography.numeric.fontVariant]
  },
  cartAction: { minWidth: 128 },
  orderError: { left: spacing.md, position: 'absolute', right: spacing.md },
  progressContent: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  progressHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  progressHeadingCopy: { flex: 1, gap: spacing.xs },
  orderCode: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.sm,
    fontVariant: [...typography.numeric.fontVariant]
  },
  readyBanner: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md
  },
  readyBannerIcon: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  readyBannerCopy: {
    flex: 1,
    gap: 2
  },
  readyBannerTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.md
  },
  readyBannerText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  timeline: { paddingTop: spacing.xs },
  timelineRow: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.md },
  timelineRail: { alignItems: 'center', width: 36 },
  timelineMarker: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  timelineLine: { flex: 1, minHeight: 40, width: 2 },
  timelineCopy: { borderBottomWidth: 1, flex: 1, gap: spacing.xs, minHeight: 76, paddingBottom: spacing.lg },
  timelineTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  timelineDescription: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  orderSection: { gap: spacing.sm },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  orderItems: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden', paddingHorizontal: spacing.md },
  orderItem: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: spacing.md },
  orderItemName: { flex: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  orderItemPrice: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm,
    fontVariant: [...typography.numeric.fontVariant]
  },
  orderTotal: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md
  },
  totalLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  vatNote: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, marginTop: 2 },
  totalValue: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant]
  },
  progressActions: { gap: spacing.sm },
  modalBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.md },
  qrModal: {
    borderRadius: radii.md,
    borderWidth: 1,
    maxHeight: '94%',
    maxWidth: 480,
    overflow: 'hidden',
    width: '100%'
  },
  qrHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg
  },
  qrHeaderCopy: { flex: 1, gap: 2 },
  qrTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    lineHeight: typography.lineHeights.xl
  },
  qrSubtitle: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  closeButton: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 },
  qrBody: { gap: spacing.lg, padding: spacing.lg },
  qrCodePanel: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  realQrImage: { height: 230, width: 230, borderRadius: radii.md },
  qrPlaceholder: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, height: 132, justifyContent: 'center', width: 132 },
  qrIllustrationHint: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, textAlign: 'center' },
  qrBankName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  qrAccount: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  paymentDetails: { gap: spacing.md },
  copyableRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingVertical: spacing.xs
  },
  copyButton: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  copyButtonText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  qrFieldText: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.md,
    marginTop: 2
  },
  transferContentText: {
    borderRadius: radii.xs,
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.md,
    letterSpacing: 0.5,
    marginTop: 2,
    padding: spacing.xs
  },
  qrModalActions: {
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  paymentLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  qrAmount: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant],
    marginTop: spacing.xs
  },
  transferContent: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.md,
    fontVariant: [...typography.numeric.fontVariant],
    marginTop: spacing.xs
  },
  notifPromptModal: {
    borderRadius: radii.lg,
    borderWidth: 1,
    maxWidth: 420,
    overflow: 'hidden',
    width: '92%'
  },
  notifPromptContent: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl
  },
  notifPromptIconCircle: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 64,
    justifyContent: 'center',
    width: 64
  },
  notifPromptTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg,
    textAlign: 'center'
  },
  notifPromptDesc: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.md,
    textAlign: 'center'
  },
  notifPromptActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    width: '100%'
  },
  notifOptInBanner: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.md
  },
  notifOptInLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm
  },
  notifOptInIconCircle: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  notifOptInCopy: {
    flex: 1,
    gap: 1
  },
  notifOptInTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  notifOptInSubtitle: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  notifOptInButton: {
    borderRadius: radii.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  notifOptInButtonText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  headerBackButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  batchSelectorContainer: {
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  batchSelectorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    paddingHorizontal: 2
  },
  batchSelectorTitleRow: {
    flex: 1,
    gap: 2
  },
  batchSelectorLabel: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  batchTotalHint: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xs
  },
  batchNavControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginLeft: spacing.sm
  },
  batchNavBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  batchListWrapper: {
    width: '100%'
  },
  batchList: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs
  },
  batchChip: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  batchChipTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  batchChipBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2
  },
  batchChipStatus: {
    fontFamily: typography.families.bodyMedium,
    fontSize: 10
  },
  orderSectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs
  },
  batchCountBadge: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  batchCardsContainer: {
    gap: spacing.md
  },
  batchOrderCard: {
    borderRadius: radii.md,
    overflow: 'hidden',
    padding: spacing.md
  },
  batchOrderHeader: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs
  },
  batchOrderTitleGroup: {
    flex: 1,
    gap: 2
  },
  batchOrderTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  batchOrderTime: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  batchItemsList: {
    gap: spacing.xs,
    paddingVertical: spacing.xs
  },
  batchItemRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs
  },
  batchSubtotalRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs
  },
  batchSubtotalLabel: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  batchSubtotalValue: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  grandTotalCard: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md
  },
  grandTotalLabel: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.sm
  },
  grandTotalValue: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg,
    fontVariant: [...typography.numeric.fontVariant]
  },
  itemDetailCol: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  itemModifierText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    paddingLeft: spacing.xs
  },
  itemNotesText: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
    paddingLeft: spacing.xs
  },
  batchOrderNotesBadge: {
    borderRadius: radii.sm,
    borderWidth: 1,
    marginTop: spacing.xs,
    padding: spacing.xs
  },
  batchOrderNotesText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  pendingCartAlert: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.md
  },
  pendingCartAlertLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm
  },
  pendingCartAlertTitle: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  pendingCartAlertSub: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  cartBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  cartBarCopyText: {
    gap: 2
  },
  batchOrderTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  singleOrderHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm
  },
  singleOrderHeaderLeft: {
    flex: 1,
    gap: 2
  },
  singleOrderHeaderRight: {
    alignItems: 'flex-end',
    gap: spacing.xs
  },
  singleOrderCode: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.md
  },
  singleOrderTime: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  singleOrderDivider: {
    borderBottomColor: '#E5E7EB',
    borderBottomWidth: 1,
    marginBottom: spacing.xs
  }
});
