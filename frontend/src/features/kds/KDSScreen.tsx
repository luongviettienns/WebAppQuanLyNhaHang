import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import {
  AlertTriangle,
  ChefHat,
  Clock3,
  Moon,
  PackageX,
  RefreshCw,
  ShoppingBag,
  Sun,
  Trash2,
  Utensils,
  X
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { MenuItemDto, OrderDto } from '../../api/contracts';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { KitchenWasteModal } from './KitchenWasteModal';
import { radii, spacing, typography } from '../../theme';
import {
  AppIcon,
  Button,
  EmptyState,
  InlineAlert,
  ScreenHeader,
  StatusBadge,
  Surface
} from '../../ui';
import type { StatusTone } from '../../ui';

type KdsStatus = 'PENDING' | 'PREPARING' | 'READY';

const statusConfig: Record<KdsStatus, {
  title: string;
  description: string;
  emptyDescription: string;
  tone: StatusTone;
  actionLabel: string;
  icon: LucideIcon;
}> = {
  PENDING: {
    title: 'Chờ chế biến',
    description: 'Ticket mới từ quầy và khách',
    emptyDescription: 'Ticket mới sẽ xuất hiện tại đây.',
    tone: 'warning',
    actionLabel: 'Bắt đầu chế biến',
    icon: Clock3
  },
  PREPARING: {
    title: 'Đang chế biến',
    description: 'Món đang được thực hiện',
    emptyDescription: 'Chưa có ticket nào đang chế biến.',
    tone: 'info',
    actionLabel: 'Chuyển sang sẵn sàng',
    icon: ChefHat
  },
  READY: {
    title: 'Sẵn sàng',
    description: 'Chờ giao tại quầy hoặc bàn',
    emptyDescription: 'Chưa có ticket nào chờ giao.',
    tone: 'success',
    actionLabel: 'Đã giao khách',
    icon: Utensils
  }
};

const statuses: KdsStatus[] = ['PENDING', 'PREPARING', 'READY'];

const getElapsedInfo = (createdAt: string, now: number): { text: string; label: string; tone: StatusTone } => {
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const text = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (minutes < 3) return { text, label: 'Đúng tiến độ', tone: 'success' };
  if (minutes < 5) return { text, label: 'Cần chú ý', tone: 'warning' };
  return { text, label: 'Trễ đơn', tone: 'danger' };
};

interface TicketProps {
  order: OrderDto;
  now: number;
  updating: boolean;
  onTransition: (order: OrderDto) => void;
  undoRemainingSec?: number;
  onUndo?: (order: OrderDto) => void;
}

const OrderTicket: React.FC<TicketProps> = ({ order, now, updating, onTransition, undoRemainingSec, onUndo }) => {
  const { theme } = useTheme();
  const status = order.status as KdsStatus;
  const config = statusConfig[status];
  const elapsed = getElapsedInfo(order.createdAt, now);
  const edgeColor = {
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
    info: theme.focusRing,
    neutral: theme.borderStrong
  }[elapsed.tone];
  const serviceLabel = order.orderType === 'DINE_IN'
    ? `Bàn ${order.tableNumber ?? order.tableId ?? 'chưa gán'}`
    : `Mang đi · Số nhận món ${order.buzzerNumber ?? 'chưa gán'}`;

  return (
    <View testID={`kds-card-${order.code}`}>
      <Surface level="raised" style={[styles.ticket, { borderLeftColor: edgeColor }]}>
        <View
          accessibilityLabel={`${config.title}, đơn ${order.code}, ${serviceLabel}, thời gian chờ ${elapsed.text}, ${elapsed.label}`}
          style={[styles.ticketHeader, { borderBottomColor: theme.borderSubtle }]}
        >
          <View style={styles.ticketIdentity}>
            <Text style={[styles.orderCode, { color: theme.textPrimary }]}>{order.code}</Text>
            <View style={styles.serviceRow}>
              <AppIcon icon={order.orderType === 'DINE_IN' ? Utensils : ShoppingBag} color={theme.textSecondary} size={16} />
              <Text style={[styles.serviceText, { color: theme.textSecondary }]}>{serviceLabel}</Text>
            </View>
          </View>
          <View style={styles.timerGroup}>
            <Text style={[styles.timer, { color: theme.textPrimary }]}>{elapsed.text}</Text>
            <Text style={[styles.timerLabel, { color: theme.textSecondary }]}>{elapsed.label}</Text>
          </View>
        </View>

        <View style={styles.ticketStatus}>
          <StatusBadge tone={config.tone} label={config.title} icon={config.icon} />
        </View>

        <View style={styles.ticketBody}>
          {order.items.map((item, index) => (
            <View key={item.id || index} style={styles.itemRow}>
              <Text style={[styles.quantity, { color: theme.textPrimary }]}>{item.quantity}×</Text>
              <View style={styles.itemDetails}>
                <Text style={[styles.itemName, { color: theme.textPrimary }]}>{item.menuItemName || `Món #${item.menuItemId}`}</Text>
                {(item.selectedModifiersJson || []).map((modifier, modifierIndex) => (
                  <Text key={`${modifier.optionId}-${modifierIndex}`} style={[styles.itemMeta, { color: theme.textSecondary }]}>
                    {modifier.groupName}: {modifier.optionName}
                  </Text>
                ))}
                {item.notes ? (
                  <Text style={[styles.itemNote, { color: theme.warning }]}>Ghi chú món: {item.notes}</Text>
                ) : null}
              </View>
            </View>
          ))}

          {order.notes ? (
            <View style={[styles.orderNote, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.orderNoteLabel, { color: theme.warning }]}>Lời dặn đơn</Text>
              <Text style={[styles.orderNoteText, { color: theme.textPrimary }]}>{order.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.ticketFooter, { borderTopColor: theme.borderSubtle }]}>
          {undoRemainingSec !== undefined && undoRemainingSec > 0 && onUndo ? (
            <View style={styles.undoFooterRow}>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`kds-undo-btn-${order.code}`}
                  variant="secondary"
                  label={`Hoàn tác (${undoRemainingSec}s)`}
                  icon={RefreshCw}
                  loading={updating}
                  onPress={() => onUndo(order)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID={`kds-action-btn-${order.code}`}
                  variant="primary"
                  label={config.actionLabel}
                  icon={config.icon}
                  loading={updating}
                  onPress={() => onTransition(order)}
                />
              </View>
            </View>
          ) : (
            <Button
              testID={`kds-action-btn-${order.code}`}
              variant="primary"
              label={config.actionLabel}
              icon={config.icon}
              loading={updating}
              onPress={() => onTransition(order)}
            />
          )}
        </View>
      </Surface>
    </View>
  );
};

interface LaneProps {
  status: KdsStatus;
  orders: OrderDto[];
  now: number;
  updatingOrderId: number | null;
  desktop: boolean;
  onTransition: (order: OrderDto) => void;
  readyOrderTimestamps: Record<number, number>;
  onUndo: (order: OrderDto) => void;
}

const StatusLane: React.FC<LaneProps> = ({
  status,
  orders,
  now,
  updatingOrderId,
  desktop,
  onTransition,
  readyOrderTimestamps,
  onUndo
}) => {
  const { theme } = useTheme();
  const config = statusConfig[status];

  return (
    <Surface level="sunken" style={[styles.lane, desktop ? styles.laneDesktop : styles.laneTablet]}>
      <View style={[styles.laneHeader, { borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.laneTitleRow}>
          <Text accessibilityRole="header" style={[styles.laneTitle, { color: theme.textPrimary }]}>{config.title}</Text>
          <View style={[styles.laneCount, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
            <Text style={[styles.laneCountText, { color: theme.textPrimary }]}>{orders.length}</Text>
          </View>
        </View>
        <Text style={[styles.laneDescription, { color: theme.textSecondary }]}>{config.description}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.laneTickets} showsVerticalScrollIndicator={false}>
        {orders.length === 0 ? (
          <EmptyState title="Chưa có ticket" description={config.emptyDescription} />
        ) : (
          orders.map((order) => {
            let undoRemainingSec = 0;
            if (order.status === 'READY') {
              const readyMs = readyOrderTimestamps[order.id] || (order.readyAt ? new Date(order.readyAt).getTime() : 0);
              if (readyMs > 0) {
                const elapsedSec = Math.floor((now - readyMs) / 1000);
                if (elapsedSec < 10) {
                  undoRemainingSec = 10 - elapsedSec;
                }
              }
            }
            return (
              <OrderTicket
                key={order.id}
                order={order}
                now={now}
                updating={updatingOrderId === order.id}
                onTransition={onTransition}
                undoRemainingSec={undoRemainingSec}
                onUndo={onUndo}
              />
            );
          })
        )}
      </ScrollView>
    </Surface>
  );
};

interface SegmentProps {
  status: KdsStatus;
  count: number;
  selected: boolean;
  onPress: () => void;
}

const StatusSegment: React.FC<SegmentProps> = ({ status, count, selected, onPress }) => {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const label = `${statusConfig[status].title}, ${count} ticket`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.segment,
        {
          backgroundColor: selected || pressed ? theme.interactiveSecondary : theme.surfaceBase,
          borderColor: focused ? theme.focusRing : selected ? theme.borderStrong : theme.borderSubtle,
          borderWidth: focused ? 3 : 1
        }
      ]}
    >
      <Text style={[styles.segmentLabel, { color: theme.textPrimary }]}>{statusConfig[status].title}</Text>
      <Text style={[styles.segmentCount, { color: theme.textSecondary }]}>{count}</Text>
    </Pressable>
  );
};

export const KDSScreen: React.FC = () => {
  const { theme, isDark, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isDesktop = width >= 1200;
  const {
    kdsOrders,
    isLoadingKDS,
    kdsError,
    fetchKDSOrders,
    updateOrderStatus,
    categories,
    fetchMenu,
    toggleMenuItemSoldOut,
    lowStockAlerts,
    fetchLowStockAlerts
  } = useRestaurant();

  const [activeMobileStatus, setActiveMobileStatus] = useState<KdsStatus>('PENDING');
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isSoldOutModalOpen, setIsSoldOutModalOpen] = useState(false);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);
  const [soldOutError, setSoldOutError] = useState<string | null>(null);

  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);

  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);

  useEffect(() => {
    fetchLowStockAlerts();
    const interval = setInterval(fetchLowStockAlerts, 30000);
    return () => clearInterval(interval);
  }, [fetchLowStockAlerts]);

  useEffect(() => {
    fetchKDSOrders();
  }, [fetchKDSOrders]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ordersByStatus = statuses.reduce<Record<KdsStatus, OrderDto[]>>(
    (grouped, status) => ({ ...grouped, [status]: kdsOrders.filter((order) => order.status === status) }),
    { PENDING: [], PREPARING: [], READY: [] }
  );

  const [readyOrderTimestamps, setReadyOrderTimestamps] = useState<Record<number, number>>({});

  const handleTransition = async (order: OrderDto) => {
    const nextStatus = ({
      PENDING: 'PREPARING',
      PREPARING: 'READY',
      READY: 'COMPLETED'
    } as Partial<Record<OrderDto['status'], 'PREPARING' | 'READY' | 'COMPLETED'>>)[order.status];

    if (!nextStatus) return;
    setUpdatingOrderId(order.id);
    const result = await updateOrderStatus(order.id, nextStatus);
    setUpdatingOrderId(null);
    if (!result.success) {
      showToast({
        type: 'error',
        title: 'Lỗi cập nhật',
        message: result.error || 'Không thể cập nhật trạng thái đơn'
      });
    } else {
      if (nextStatus === 'READY') {
        setReadyOrderTimestamps((prev) => ({ ...prev, [order.id]: Date.now() }));
      }
      const destination = order.orderType === 'DINE_IN'
        ? `Bàn ${order.tableNumber ?? order.tableId ?? ''}`
        : `Mang đi (Số ${order.buzzerNumber ?? ''})`;
      if (nextStatus === 'PREPARING') {
        showToast({
          type: 'info',
          title: 'Bắt đầu nấu món 🍳',
          message: `Đơn ${order.code} (${destination}) đã chuyển sang Đang chế biến.`
        });
      } else if (nextStatus === 'READY') {
        showToast({
          type: 'success',
          title: 'Món đã nấu xong! 🎉',
          message: `Đơn ${order.code} (${destination}) đã sẵn sàng giao cho khách (Có thể hoàn tác trong 10s).`
        });
      } else if (nextStatus === 'COMPLETED') {
        showToast({
          type: 'success',
          title: 'Đã hoàn tất giao món ✨',
          message: `Đã giao thành công đơn ${order.code} (${destination}).`
        });
      }
    }
  };

  const handleUndoReady = async (order: OrderDto) => {
    setUpdatingOrderId(order.id);
    const result = await updateOrderStatus(order.id, 'PREPARING');
    setUpdatingOrderId(null);
    if (!result.success) {
      showToast({
        type: 'error',
        title: 'Lỗi hoàn tác',
        message: result.error || 'Không thể hoàn tác trạng thái đơn'
      });
    } else {
      setReadyOrderTimestamps((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      showToast({
        type: 'info',
        title: 'Đã hoàn tác ↩️',
        message: `Đơn ${order.code} đã quay lại Đang chế biến.`
      });
    }
  };

  const handleToggleSoldOut = async (item: MenuItemDto) => {
    setTogglingItemId(item.id);
    setSoldOutError(null);
    const result = await toggleMenuItemSoldOut(item.id, !item.isAvailable);
    setTogglingItemId(null);
    if (!result.success) {
      setSoldOutError(result.error || 'Cập nhật món hết hàng thất bại');
      showToast({
        type: 'error',
        title: 'Cập nhật thất bại',
        message: result.error || 'Không thể cập nhật trạng thái món ăn'
      });
    } else {
      showToast({
        type: 'info',
        message: !item.isAvailable ? `Đã mở bán lại món "${item.name}"` : `Đã báo hết món (86) "${item.name}"`
      });
    }
  };

  const openSoldOutModal = () => {
    fetchMenu();
    setIsSoldOutModalOpen(true);
  };

  const connectionTone: StatusTone = kdsError ? 'danger' : isLoadingKDS ? 'warning' : 'success';
  const connectionState = kdsError ? 'Đồng bộ thất bại' : isLoadingKDS ? 'Đang đồng bộ' : 'Đã đồng bộ';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.header, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <View testID="kds-screen-title">
          <ScreenHeader
            title="KDS bếp"
            description={`${kdsOrders.length} ticket đang xử lý`}
            leading={<AppIcon icon={ChefHat} color={theme.primary} size={32} />}
          />
        </View>
        <View style={[styles.headerUtility, !isMobile && styles.headerUtilityWide]}>
          <View style={styles.connectionGroup}>
            <Text style={[styles.connectionLabel, { color: theme.textSecondary }]}>Đồng bộ ticket</Text>
            <StatusBadge tone={connectionTone} label={connectionState} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.headerActions}>
            {lowStockAlerts.length > 0 && (
              <Button
                variant="danger"
                label={`Cảnh báo kho (${lowStockAlerts.length})`}
                icon={AlertTriangle}
                onPress={() => setIsLowStockModalOpen(true)}
              />
            )}
            <Button
              variant="secondary"
              label="Báo hao hụt"
              icon={Trash2}
              onPress={() => {
                fetchMenu();
                fetchLowStockAlerts();
                setIsWasteModalOpen(true);
              }}
            />
            <Button variant="secondary" label="Báo hết món" icon={PackageX} onPress={openSoldOutModal} />
            <Button variant="quiet" label="Làm mới" icon={RefreshCw} onPress={() => { fetchKDSOrders(); fetchLowStockAlerts(); }} />
            <Button
              variant="quiet"
              label={isDark ? 'Giao diện sáng' : 'Giao diện tối'}
              icon={isDark ? Sun : Moon}
              onPress={toggleTheme}
            />
          </ScrollView>
        </View>
      </View>

      {lowStockAlerts.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Xem chi tiết nguyên liệu sắp hết"
          onPress={() => setIsLowStockModalOpen(true)}
          style={[styles.lowStockBanner, { backgroundColor: theme.surfaceRaised, borderColor: theme.warning }]}
        >
          <AppIcon icon={AlertTriangle} color={theme.warning} size={18} />
          <Text style={[styles.lowStockBannerText, { color: theme.textPrimary }]} numberOfLines={1}>
            Cảnh báo nguyên liệu sắp hết: {lowStockAlerts.map((i) => `${i.name} (còn ${i.currentStock} ${i.unit})`).join(' · ')}
          </Text>
        </Pressable>
      ) : null}

      {kdsError ? (
        <View style={styles.alertArea}>
          <InlineAlert title="Không thể đồng bộ ticket" message={`${kdsError}. Kiểm tra kết nối rồi thử lại.`} />
          <Button variant="secondary" label="Thử lại" icon={RefreshCw} onPress={fetchKDSOrders} />
        </View>
      ) : null}

      {isLoadingKDS && kdsOrders.length === 0 ? (
        <View style={styles.centerState} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.stateText, { color: theme.textSecondary }]}>Đang đồng bộ ticket bếp...</Text>
        </View>
      ) : kdsError && kdsOrders.length === 0 ? null : isMobile ? (
        <View style={styles.mobileBoard}>
          <View accessibilityRole="tablist" style={styles.mobileSegments}>
            {statuses.map((status) => (
              <StatusSegment
                key={status}
                status={status}
                count={ordersByStatus[status].length}
                selected={activeMobileStatus === status}
                onPress={() => setActiveMobileStatus(status)}
              />
            ))}
          </View>
          <ScrollView contentContainerStyle={styles.mobileTickets} showsVerticalScrollIndicator={false}>
            {ordersByStatus[activeMobileStatus].length === 0 ? (
              <EmptyState title="Chưa có ticket" description={statusConfig[activeMobileStatus].emptyDescription} />
            ) : (
              ordersByStatus[activeMobileStatus].map((order) => {
                let undoRemainingSec = 0;
                if (order.status === 'READY') {
                  const readyMs = readyOrderTimestamps[order.id] || (order.readyAt ? new Date(order.readyAt).getTime() : 0);
                  if (readyMs > 0) {
                    const elapsedSec = Math.floor((now - readyMs) / 1000);
                    if (elapsedSec < 10) {
                      undoRemainingSec = 10 - elapsedSec;
                    }
                  }
                }
                return (
                  <OrderTicket
                    key={order.id}
                    order={order}
                    now={now}
                    updating={updatingOrderId === order.id}
                    onTransition={handleTransition}
                    undoRemainingSec={undoRemainingSec}
                    onUndo={handleUndoReady}
                  />
                );
              })
            )}
          </ScrollView>
        </View>
      ) : isDesktop ? (
        <View style={styles.desktopBoard}>
          {statuses.map((status) => (
            <StatusLane
              key={status}
              status={status}
              orders={ordersByStatus[status]}
              now={now}
              updatingOrderId={updatingOrderId}
              desktop
              onTransition={handleTransition}
              readyOrderTimestamps={readyOrderTimestamps}
              onUndo={handleUndoReady}
            />
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tabletBoard}>
          {statuses.map((status) => (
            <StatusLane
              key={status}
              status={status}
              orders={ordersByStatus[status]}
              now={now}
              updatingOrderId={updatingOrderId}
              desktop={false}
              onTransition={handleTransition}
              readyOrderTimestamps={readyOrderTimestamps}
              onUndo={handleUndoReady}
            />
          ))}
        </ScrollView>
      )}

      <Modal visible={isSoldOutModalOpen} transparent animationType="slide" onRequestClose={() => setIsSoldOutModalOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <Surface level="raised" style={styles.soldOutModal}>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.borderSubtle }]}>
                <View style={styles.modalTitleGroup}>
                  <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.textPrimary }]}>Trạng thái phục vụ món</Text>
                  <Text style={[styles.modalDescription, { color: theme.textSecondary }]}>Cập nhật món hết hàng cho quầy và khách đặt QR.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đóng quản lý món"
                  onPress={() => setIsSoldOutModalOpen(false)}
                  style={({ pressed }) => [styles.modalClose, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
                >
                  <AppIcon icon={X} color={theme.textPrimary} />
                </Pressable>
              </View>

              {soldOutError ? (
                <View style={styles.modalAlert}>
                  <InlineAlert title="Chưa thể cập nhật" message={soldOutError} />
                </View>
              ) : null}

              <ScrollView contentContainerStyle={styles.soldOutList} showsVerticalScrollIndicator={false}>
                {categories.map((category) => (
                  <View key={category.id} style={styles.categorySection}>
                    <Text accessibilityRole="header" style={[styles.categoryTitle, { color: theme.textPrimary }]}>{category.name}</Text>
                    <View style={[styles.categoryItems, { borderColor: theme.borderSubtle }]}>
                      {(category.menuItems || []).map((item, index) => {
                        const isToggling = togglingItemId === item.id;
                        return (
                          <View
                            key={item.id}
                            style={[styles.soldOutRow, index > 0 && { borderTopColor: theme.borderSubtle, borderTopWidth: 1 }]}
                          >
                            <View style={styles.soldOutCopy}>
                              <Text style={[styles.soldOutName, { color: theme.textPrimary }]}>{item.name}</Text>
                              <StatusBadge tone={item.isAvailable ? 'success' : 'danger'} label={item.isAvailable ? 'Đang phục vụ' : 'Tạm hết món'} />
                            </View>
                            <Button
                              variant={item.isAvailable ? 'danger' : 'secondary'}
                              label={item.isAvailable ? 'Báo hết món' : 'Mở bán lại'}
                              loading={isToggling}
                              onPress={() => handleToggleSoldOut(item)}
                            />
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </SafeAreaView>
          </Surface>
        </View>
      </Modal>

      {/* Modal Cảnh Báo Tồn Kho Thấp */}
      <Modal visible={isLowStockModalOpen} transparent animationType="fade" onRequestClose={() => setIsLowStockModalOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <Surface level="raised" style={[styles.soldOutModal, { backgroundColor: theme.surfaceBase, maxWidth: 520, borderRadius: radii.md, padding: spacing.lg }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <AppIcon icon={AlertTriangle} color={theme.warning} size={22} />
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Cảnh Báo Tồn Kho Thấp ⚠️</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={() => setIsLowStockModalOpen(false)} style={styles.modalClose}>
                <AppIcon icon={X} color={theme.textSecondary} size={22} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 260 }}>
              {lowStockAlerts.map((item) => (
                <View key={item.id} style={[styles.alertRow, { borderBottomColor: theme.borderSubtle }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: typography.families.bodySemibold, color: theme.textPrimary, fontSize: typography.sizes.sm }}>
                      {item.name} ({item.sku})
                    </Text>
                    <Text style={{ fontFamily: typography.families.body, color: theme.textSecondary, fontSize: typography.sizes.xs }}>
                      Ngưỡng an toàn: {item.minThreshold} {item.unit}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: typography.families.operationalBold, color: item.isDepleted ? theme.danger : theme.warning, fontSize: typography.sizes.md }}>
                    {item.currentStock} {item.unit}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
              <View style={{ flex: 1 }}>
                <Button variant="secondary" label="Báo hết món liên quan" icon={PackageX} onPress={() => { setIsLowStockModalOpen(false); openSoldOutModal(); }} />
              </View>
              <View style={{ width: 100 }}>
                <Button variant="primary" label="Đã hiểu" onPress={() => setIsLowStockModalOpen(false)} />
              </View>
            </View>
          </Surface>
        </View>
      </Modal>

      {isWasteModalOpen && <KitchenWasteModal
        onClose={() => setIsWasteModalOpen(false)}
        onRecorded={() => { fetchLowStockAlerts(); }}
      />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { borderBottomWidth: 1, gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerUtility: { gap: spacing.md },
  headerUtilityWide: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  connectionGroup: { alignItems: 'flex-start', gap: spacing.xs },
  connectionLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  headerActions: { gap: spacing.sm },
  alertArea: { alignItems: 'stretch', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  centerState: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  stateText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  desktopBoard: { flex: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  tabletBoard: { gap: spacing.md, padding: spacing.md },
  lane: { overflow: 'hidden' },
  laneDesktop: { flex: 1 },
  laneTablet: { width: 360 },
  laneHeader: { borderBottomWidth: 1, gap: spacing.xs, padding: spacing.md },
  laneTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  laneTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, lineHeight: typography.lineHeights.xl },
  laneDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  laneCount: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 28, minWidth: 28, paddingHorizontal: spacing.sm },
  laneCountText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, fontVariant: [...typography.numeric.fontVariant] },
  laneTickets: { gap: spacing.md, padding: spacing.md },
  ticket: { borderLeftWidth: 4, overflow: 'hidden' },
  ticketHeader: { alignItems: 'flex-start', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', padding: spacing.md },
  ticketIdentity: { flex: 1, gap: spacing.xs },
  orderCode: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, fontVariant: [...typography.numeric.fontVariant] },
  serviceRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  serviceText: { flexShrink: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  timerGroup: { alignItems: 'flex-end' },
  timer: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, fontVariant: [...typography.numeric.fontVariant] },
  timerLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  ticketStatus: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  ticketBody: { gap: spacing.md, padding: spacing.md },
  itemRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  quantity: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md, fontVariant: [...typography.numeric.fontVariant], minWidth: 28 },
  itemDetails: { flex: 1, gap: 2 },
  itemName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  itemMeta: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  itemNote: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  orderNote: { borderRadius: radii.xs, borderWidth: 1, gap: spacing.xs, padding: spacing.sm },
  orderNoteLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  orderNoteText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  ticketFooter: { borderTopWidth: 1, padding: spacing.sm },
  undoFooterRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  mobileBoard: { flex: 1 },
  mobileSegments: { flexDirection: 'row', gap: spacing.xs, padding: spacing.sm },
  segment: { alignItems: 'center', borderRadius: radii.sm, flex: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  segmentLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, textAlign: 'center' },
  segmentCount: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.sm, fontVariant: [...typography.numeric.fontVariant] },
  mobileTickets: { gap: spacing.md, padding: spacing.md },
  modalBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.md },
  soldOutModal: { maxHeight: '90%', maxWidth: 720, overflow: 'hidden', width: '100%' },
  modalSafeArea: { flexShrink: 1 },
  modalHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  modalTitleGroup: { flex: 1, gap: spacing.xs },
  modalTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  modalDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  modalClose: { alignItems: 'center', borderRadius: radii.sm, height: 44, justifyContent: 'center', width: 44 },
  modalAlert: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  soldOutList: { padding: spacing.lg },
  categorySection: { gap: spacing.sm, marginBottom: spacing.lg },
  categoryTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  categoryItems: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  soldOutRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', minHeight: 68, padding: spacing.md },
  soldOutCopy: { flex: 1, gap: spacing.xs },
  soldOutName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  lowStockBanner: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  lowStockBannerText: {
    flex: 1,
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  alertRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm
  },
});
