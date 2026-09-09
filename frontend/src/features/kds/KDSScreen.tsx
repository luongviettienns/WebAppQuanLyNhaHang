import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { typography, spacing } from '../../theme';
import { OrderDto, OrderStatus } from '../../api/contracts';

type FilterTab = 'ALL' | 'PENDING' | 'PREPARING' | 'READY';

export const KDSScreen: React.FC = () => {
  const { theme, isDark, toggleTheme } = useTheme();
  const { kdsOrders, isLoadingKDS, kdsError, fetchKDSOrders, updateOrderStatus } = useRestaurant();

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // Load KDS orders on mount
  useEffect(() => {
    fetchKDSOrders();
  }, [fetchKDSOrders]);

  // Live timer tick every 1 second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter orders by tab
  const filteredOrders = kdsOrders.filter((order) => {
    if (activeTab === 'ALL') return true;
    return order.status === activeTab;
  });

  // Calculate order counts for tabs
  const pendingCount = kdsOrders.filter((o) => o.status === 'PENDING').length;
  const preparingCount = kdsOrders.filter((o) => o.status === 'PREPARING').length;
  const readyCount = kdsOrders.filter((o) => o.status === 'READY').length;

  // Handle status transition button press
  const handleTransition = async (order: OrderDto) => {
    let nextStatus: 'PREPARING' | 'READY' | 'COMPLETED';

    if (order.status === 'PENDING') {
      nextStatus = 'PREPARING';
    } else if (order.status === 'PREPARING') {
      nextStatus = 'READY';
    } else if (order.status === 'READY') {
      nextStatus = 'COMPLETED';
    } else {
      return;
    }

    setUpdatingOrderId(order.id);
    const result = await updateOrderStatus(order.id, nextStatus);
    setUpdatingOrderId(null);

    if (!result.success) {
      Alert.alert('Lỗi cập nhật', result.error || 'Không thể cập nhật trạng thái đơn');
    }
  };

  // Helper: Format elapsed time and urgency
  const getElapsedInfo = (createdAt: string) => {
    const elapsedSeconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (mins < 3) {
      return {
        text: formatted,
        urgency: 'NORMAL',
        bgColor: isDark ? '#052E16' : '#DCFCE7',
        textColor: isDark ? '#4ADE80' : '#166534',
        borderColor: '#16A34A',
        label: 'Tốt'
      };
    } else if (mins < 5) {
      return {
        text: formatted,
        urgency: 'WARNING',
        bgColor: isDark ? '#422006' : '#FEF9C3',
        textColor: isDark ? '#FACC15' : '#854D0E',
        borderColor: '#CA8A04',
        label: 'Cần chú ý'
      };
    } else {
      return {
        text: formatted,
        urgency: 'DELAYED',
        bgColor: isDark ? '#450A0A' : '#FEE2E2',
        textColor: isDark ? '#F87171' : '#991B1B',
        borderColor: '#DC2626',
        label: 'Trễ đơn'
      };
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* 1. KDS Header with Theme Switcher & Refresh */}
      <View style={[styles.header, { backgroundColor: isDark ? '#0F172A' : '#0284C7', borderBottomColor: theme.border }]}>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.title}>🍳 KDS BẾP (KITCHEN DISPLAY SYSTEM)</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#E0F2FE' }]}>
            {kdsOrders.length} đơn hàng đang xử lý thời gian thực
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: isDark ? '#1E293B' : '#0369A1' }]}
            onPress={fetchKDSOrders}
            accessibilityLabel="Làm mới danh sách đơn"
          >
            <Text style={styles.headerBtnText}>🔄 Làm mới</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: isDark ? '#334155' : '#0369A1' }]}
            onPress={toggleTheme}
            accessibilityLabel="Chuyển chế độ Sáng / Tối KDS"
          >
            <Text style={styles.headerBtnText}>
              {isDark ? '☀️ Giao diện Sáng' : '🌙 Giao diện Tối'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Status Filter Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: theme.backgroundSecondary, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'ALL' && [styles.activeTab, { borderBottomColor: theme.primary }]]}
          onPress={() => setActiveTab('ALL')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'ALL' ? theme.primary : theme.textMuted }]}>
            Tất cả ({kdsOrders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'PENDING' && [styles.activeTab, { borderBottomColor: '#EA580C' }]]}
          onPress={() => setActiveTab('PENDING')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'PENDING' ? '#EA580C' : theme.textMuted }]}>
            ⏳ Chờ làm ({pendingCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'PREPARING' && [styles.activeTab, { borderBottomColor: '#2563EB' }]]}
          onPress={() => setActiveTab('PREPARING')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'PREPARING' ? '#2563EB' : theme.textMuted }]}>
            👨‍🍳 Đang nấu ({preparingCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'READY' && [styles.activeTab, { borderBottomColor: '#16A34A' }]]}
          onPress={() => setActiveTab('READY')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'READY' ? '#16A34A' : theme.textMuted }]}>
            ✅ Đã xong ({readyCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Main KDS Content */}
      {isLoadingKDS && kdsOrders.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>
            Đang tải đơn hàng KDS...
          </Text>
        </View>
      ) : kdsError ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorTitle, { color: theme.danger }]}>⚠️ {kdsError}</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: theme.primary }]} onPress={fetchKDSOrders}>
            <Text style={styles.retryBtnText}>Thử lại kết nối</Text>
          </TouchableOpacity>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Bếp Trống - Không có đơn hàng cần làm!
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>
            Mọi món ăn đã hoàn tất hoặc chưa có đơn hàng mới từ POS/QR.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.cardsGrid}>
          {filteredOrders.map((order) => {
            const elapsed = getElapsedInfo(order.createdAt);
            const isUpdating = updatingOrderId === order.id;

            return (
              <View
                key={order.id}
                style={[
                  styles.orderCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: elapsed.urgency === 'DELAYED' ? '#DC2626' : theme.border,
                    borderWidth: elapsed.urgency === 'DELAYED' ? 2 : 1
                  }
                ]}
              >
                {/* Card Header */}
                <View style={[styles.cardHeader, { borderBottomColor: theme.border }]}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.orderCode, { color: theme.text }]}>
                      #{order.code.slice(-4)}
                    </Text>
                    <View
                      style={[
                        styles.orderTypeBadge,
                        {
                          backgroundColor:
                            order.orderType === 'DINE_IN'
                              ? isDark ? '#1E3A8A' : '#DBEAFE'
                              : isDark ? '#431407' : '#FFEDD5'
                        }
                      ]}
                    >
                      <Text
                        style={[
                          styles.orderTypeText,
                          {
                            color:
                              order.orderType === 'DINE_IN'
                                ? isDark ? '#93C5FD' : '#1D4ED8'
                                : isDark ? '#FDBA74' : '#C2410C'
                          }
                        ]}
                      >
                        {order.orderType === 'DINE_IN'
                          ? `🍽️ Bàn ${order.tableNumber ? String(order.tableNumber).padStart(2, '0') : '?'}`
                          : `🛍️ Mang đi (Buzzer #${order.buzzerNumber || '?'})`}
                      </Text>
                    </View>
                  </View>

                  {/* Prep Timer Badge */}
                  <View style={[styles.timerBadge, { backgroundColor: elapsed.bgColor, borderColor: elapsed.borderColor }]}>
                    <Text style={[styles.timerText, { color: elapsed.textColor }]}>
                      ⏱️ {elapsed.text}
                    </Text>
                    <Text style={[styles.timerLabel, { color: elapsed.textColor }]}>
                      {elapsed.label}
                    </Text>
                  </View>
                </View>

                {/* Card Items List */}
                <View style={styles.cardBody}>
                  {order.items.map((item, idx) => (
                    <View key={item.id || idx} style={styles.itemRow}>
                      <View style={[styles.quantityPill, { backgroundColor: theme.primary }]}>
                        <Text style={styles.quantityText}>{item.quantity}x</Text>
                      </View>
                      <View style={styles.itemDetails}>
                        <Text style={[styles.itemName, { color: theme.text }]}>
                          {item.menuItemName}
                        </Text>
                        {item.selectedModifiersJson && item.selectedModifiersJson.length > 0 && (
                          <View style={styles.modifiersList}>
                            {item.selectedModifiersJson.map((mod: any, mIdx: number) => (
                              <Text key={mIdx} style={[styles.modifierText, { color: theme.textMuted }]}>
                                • {mod.groupName}: {mod.optionName}
                              </Text>
                            ))}
                          </View>
                        )}
                        {item.notes ? (
                          <Text style={styles.itemNoteText}>
                            📝 Ghi chú: {item.notes}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}

                  {order.notes ? (
                    <View style={[styles.orderNoteBox, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                      <Text style={[styles.orderNoteText, { color: theme.text }]}>
                        📌 Lời dặn: {order.notes}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Card Action Button (Touch Target >= 56px) */}
                <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                  {order.status === 'PENDING' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#EA580C' }]}
                      onPress={() => handleTransition(order)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.actionBtnText}>👨‍🍳 BẮT ĐẦU NẤU</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {order.status === 'PREPARING' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#16A34A' }]}
                      onPress={() => handleTransition(order)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.actionBtnText}>✅ HOÀN THÀNH MÓN</Text>
                      )}
                    </TouchableOpacity>
                  )}

                  {order.status === 'READY' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#0284C7' }]}
                      onPress={() => handleTransition(order)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.actionBtnText}>🛎️ ĐÃ GIAO KHÁCH</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1
  },
  headerTitleGroup: {
    flex: 1
  },
  title: {
    color: '#FFFFFF',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    marginTop: spacing.xs
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  headerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)'
  },
  headerBtnText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md
  },
  tab: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent'
  },
  activeTab: {
    // borderBottomColor set dynamically
  },
  tabText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm
  },
  errorTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.md
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 8
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: spacing.md
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.xs
  },
  emptySubtitle: {
    fontSize: typography.sizes.sm,
    textAlign: 'center'
  },
  cardsGrid: {
    padding: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  orderCard: {
    width: 340,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1
  },
  cardHeaderLeft: {
    flex: 1
  },
  orderCode: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.xs
  },
  orderTypeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 6
  },
  orderTypeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  timerBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center'
  },
  timerText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  timerLabel: {
    fontSize: 10,
    fontWeight: typography.weights.medium
  },
  cardBody: {
    padding: spacing.md
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm
  },
  quantityPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm
  },
  quantityText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  itemDetails: {
    flex: 1
  },
  itemName: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    lineHeight: 20
  },
  modifiersList: {
    marginTop: 2
  },
  modifierText: {
    fontSize: typography.sizes.xs,
    lineHeight: 16
  },
  itemNoteText: {
    color: '#EA580C',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    marginTop: 2
  },
  orderNoteBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 6
  },
  orderNoteText: {
    fontSize: typography.sizes.xs,
    fontStyle: 'italic'
  },
  cardFooter: {
    padding: spacing.sm,
    borderTopWidth: 1
  },
  actionBtn: {
    height: spacing.touchTargetKDS, // 56px
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5
  }
});
