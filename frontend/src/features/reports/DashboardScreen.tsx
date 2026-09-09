import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { DailyReportDto, OrderDto } from '../../api/contracts';
import { typography, spacing } from '../../theme';
import { ReceiptModal } from '../pos/ReceiptModal';

function formatVietnamDate(dateObj: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dateObj); // returns YYYY-MM-DD
}

function formatDisplayDateVN(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `Ngày ${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export const DashboardScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { fetchDailyReport, kdsOrders } = useRestaurant();

  const [currentDateStr, setCurrentDateStr] = useState<string>(() => formatVietnamDate(new Date()));
  const [report, setReport] = useState<DailyReportDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Receipt Modal State
  const [receiptOrder, setReceiptOrder] = useState<OrderDto | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);

  const loadReport = useCallback(
    async (date: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await fetchDailyReport(date);
      setIsLoading(false);
      if (res.success && res.report) {
        setReport(res.report);
      } else {
        setErrorMessage(res.error || 'Không thể tải dữ liệu báo cáo');
      }
    },
    [fetchDailyReport]
  );

  useEffect(() => {
    loadReport(currentDateStr);
  }, [currentDateStr, loadReport]);

  const handlePrevDay = () => {
    const current = new Date(`${currentDateStr}T12:00:00+07:00`);
    current.setDate(current.getDate() - 1);
    setCurrentDateStr(formatVietnamDate(current));
  };

  const handleNextDay = () => {
    const current = new Date(`${currentDateStr}T12:00:00+07:00`);
    current.setDate(current.getDate() + 1);
    setCurrentDateStr(formatVietnamDate(current));
  };

  const handleToday = () => {
    setCurrentDateStr(formatVietnamDate(new Date()));
  };

  // SOS Time formatting
  const prepMinutes = report ? Math.floor(report.averagePrepTimeSec / 60) : 0;
  const prepSeconds = report ? report.averagePrepTimeSec % 60 : 0;

  const getSOSTag = (sec: number) => {
    if (sec === 0) return { label: 'Chưa có dữ liệu', bg: '#E2E8F0', text: '#475569' };
    if (sec <= 180) return { label: '⚡ Siêu Nhanh (< 3p)', bg: '#D1FAE5', text: '#065F46' };
    if (sec <= 300) return { label: '⏱️ Chuẩn (3 - 5p)', bg: '#FEF3C7', text: '#B45309' };
    return { label: '⚠️ Chậm trễ (> 5p)', bg: '#FEE2E2', text: '#B91C1C' };
  };

  const sosTag = getSOSTag(report?.averagePrepTimeSec || 0);

  // Completed sample orders from KDS store to preview receipt
  const completedOrders = kdsOrders.filter((o) => o.status === 'COMPLETED');

  const openReceipt = (order: OrderDto) => {
    setReceiptOrder(order);
    setIsReceiptModalOpen(true);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Date Navigation Bar */}
      <View style={[styles.dateBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.dateSelector}>
          <TouchableOpacity
            style={[styles.dateNavBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
            onPress={handlePrevDay}
            accessibilityLabel="Xem ngày hôm trước"
          >
            <Text style={[styles.dateNavBtnText, { color: theme.text }]}>◀ Trước</Text>
          </TouchableOpacity>

          <View style={styles.dateCenterInfo}>
            <Text style={[styles.dateMainText, { color: theme.text }]}>
              {formatDisplayDateVN(currentDateStr)}
            </Text>
            <Text style={[styles.dateSubText, { color: theme.textMuted }]}>
              {currentDateStr === formatVietnamDate(new Date()) ? '• Hôm nay (Asia/Ho_Chi_Minh)' : '• Lịch sử'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.dateNavBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
            onPress={handleNextDay}
            accessibilityLabel="Xem ngày hôm sau"
          >
            <Text style={[styles.dateNavBtnText, { color: theme.text }]}>Sau ▶</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dateRightActions}>
          <TouchableOpacity
            style={[styles.todayBtn, { borderColor: theme.border }]}
            onPress={handleToday}
          >
            <Text style={[styles.todayBtnText, { color: theme.primary }]}>Hôm Nay</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.refreshBtn, { backgroundColor: theme.primary }]}
            onPress={() => loadReport(currentDateStr)}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.refreshBtnText}>🔄 Tải Lại</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Report Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => loadReport(currentDateStr)} />}
      >
        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}

        {/* 4 Primary KPI Cards */}
        <View style={styles.kpiGrid}>
          {/* KPI 1: Doanh Thu */}
          <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.kpiHeader}>
              <Text style={[styles.kpiTitle, { color: theme.textMuted }]}>TỔNG DOANH THU</Text>
              <Text style={styles.kpiIcon}>💵</Text>
            </View>
            <Text style={[styles.kpiValue, { color: isDark ? '#10B981' : '#059669' }]}>
              {report ? report.totalRevenue.toLocaleString('vi-VN') : 0} đ
            </Text>
            <Text style={[styles.kpiSub, { color: theme.textMuted }]}>
              Đã bao gồm VAT 8% (Chỉ tính đơn Hoàn tất)
            </Text>
          </View>

          {/* KPI 2: Tổng Số Đơn */}
          <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.kpiHeader}>
              <Text style={[styles.kpiTitle, { color: theme.textMuted }]}>TỔNG ĐƠN HÀNG</Text>
              <Text style={styles.kpiIcon}>🧾</Text>
            </View>
            <Text style={[styles.kpiValue, { color: theme.text }]}>
              {report ? report.totalOrders : 0} đơn
            </Text>
            <View style={styles.orderBreakdownRow}>
              <Text style={[styles.orderStatusPill, { color: '#059669' }]}>
                ✓ {report?.completedOrders || 0} xong
              </Text>
              <Text style={[styles.orderStatusPill, { color: '#DC2626' }]}>
                ✕ {report?.cancelledOrders || 0} hủy
              </Text>
            </View>
          </View>

          {/* KPI 3: Giá Trị Đơn Trung Bình (AOV) */}
          <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.kpiHeader}>
              <Text style={[styles.kpiTitle, { color: theme.textMuted }]}>GIÁ TRỊ TRUNG BÌNH (AOV)</Text>
              <Text style={styles.kpiIcon}>🎯</Text>
            </View>
            <Text style={[styles.kpiValue, { color: theme.text }]}>
              {report ? report.averageOrderValue.toLocaleString('vi-VN') : 0} đ
            </Text>
            <Text style={[styles.kpiSub, { color: theme.textMuted }]}>Trên mỗi đơn hàng hoàn tất</Text>
          </View>

          {/* KPI 4: Tốc Độ Phục Vụ SOS */}
          <View style={[styles.kpiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.kpiHeader}>
              <Text style={[styles.kpiTitle, { color: theme.textMuted }]}>TỐC ĐỘ PHỤC VỤ (SOS)</Text>
              <Text style={styles.kpiIcon}>⏱️</Text>
            </View>
            <Text style={[styles.kpiValue, { color: theme.text }]}>
              {report && report.averagePrepTimeSec > 0 ? `${prepMinutes}p ${prepSeconds}s` : '--'}
            </Text>
            <View style={[styles.sosBadge, { backgroundColor: sosTag.bg }]}>
              <Text style={[styles.sosBadgeText, { color: sosTag.text }]}>{sosTag.label}</Text>
            </View>
          </View>
        </View>

        {/* Top 5 Món Bán Chạy Nhất Section */}
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              🏆 Top 5 Món Bán Chạy Nhất Trong Ngày
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
              Xếp hạng theo số lượng phần ăn bán ra từ các đơn hoàn tất
            </Text>
          </View>

          {report?.topSellers && report.topSellers.length > 0 ? (
            <View style={styles.topSellerList}>
              {report.topSellers.map((item, index) => {
                const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

                return (
                  <View
                    key={item.menuItemId}
                    style={[
                      styles.topSellerRow,
                      { borderBottomColor: theme.border },
                      index === report.topSellers.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{rankIcons[index] || `#${index + 1}`}</Text>
                    </View>

                    <View style={styles.topSellerInfo}>
                      <Text style={[styles.topSellerName, { color: theme.text }]}>{item.name}</Text>
                      <Text style={[styles.topSellerSub, { color: theme.textMuted }]}>
                        Doanh thu món: {item.revenue.toLocaleString('vi-VN')} đ
                      </Text>
                    </View>

                    <View style={[styles.qtyBadge, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7' }]}>
                      <Text style={[styles.qtyText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                        {item.quantitySold} phần
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyTopSellerBox}>
              <Text style={styles.emptyIcon}>🍽️</Text>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Chưa có món ăn nào được hoàn tất trong ngày này
              </Text>
            </View>
          )}
        </View>

        {/* Completed Orders & Immutable Receipt Snapshots */}
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              🧾 Xem Hóa Đơn Snapshot Bất Biến (Audit Trail)
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
              Kiểm tra tính bất biến của hóa đơn snapshot theo từng đơn hàng đã thanh toán
            </Text>
          </View>

          {completedOrders.length > 0 ? (
            <View style={styles.completedOrdersList}>
              {completedOrders.slice(0, 5).map((ord) => (
                <View key={ord.id} style={[styles.orderSnapshotRow, { borderBottomColor: theme.border }]}>
                  <View style={styles.orderSnapshotInfo}>
                    <Text style={[styles.orderCode, { color: theme.text }]}>#{ord.code}</Text>
                    <Text style={[styles.orderMeta, { color: theme.textMuted }]}>
                      {ord.orderType === 'DINE_IN' ? `Bàn ${ord.tableNumber ?? ord.tableId}` : 'Mang về'} •{' '}
                      {ord.finalAmount.toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.viewReceiptBtn, { backgroundColor: isDark ? '#334155' : '#EEF2FF', borderColor: isDark ? '#475569' : '#C7D2FE' }]}
                    onPress={() => openReceipt(ord)}
                    accessibilityLabel={`Xem hóa đơn #${ord.code}`}
                  >
                    <Text style={[styles.viewReceiptBtnText, { color: isDark ? '#818CF8' : '#4F46E5' }]}>
                      👁️ Xem Hóa Đơn PDF
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyTopSellerBox}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Chưa có đơn hàng nào trong bộ nhớ phiên làm việc
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Immutable Receipt Modal */}
      <ReceiptModal
        visible={isReceiptModalOpen}
        order={receiptOrder}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  dateNavBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center'
  },
  dateNavBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  dateCenterInfo: {
    alignItems: 'center'
  },
  dateMainText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  dateSubText: {
    fontSize: 10,
    marginTop: 1
  },
  dateRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  todayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center'
  },
  todayBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  refreshBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center'
  },
  refreshBtnText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: spacing.md,
    borderRadius: 8
  },
  errorText: {
    color: '#B91C1C',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  kpiTitle: {
    fontSize: 11,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5
  },
  kpiIcon: {
    fontSize: 18
  },
  kpiValue: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.extraBold,
    marginVertical: spacing.xs
  },
  kpiSub: {
    fontSize: 11
  },
  orderBreakdownRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 2
  },
  orderStatusPill: {
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  sosBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: spacing.xs
  },
  sosBadgeText: {
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  sectionHeader: {
    marginBottom: spacing.md
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  sectionSubtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  topSellerList: {
    gap: spacing.sm
  },
  topSellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1
  },
  rankBadge: {
    width: 36,
    alignItems: 'center'
  },
  rankText: {
    fontSize: 18
  },
  topSellerInfo: {
    flex: 1,
    marginLeft: spacing.sm
  },
  topSellerName: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  topSellerSub: {
    fontSize: 11,
    marginTop: 2
  },
  qtyBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16
  },
  qtyText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  emptyTopSellerBox: {
    alignItems: 'center',
    padding: spacing.xl
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: spacing.xs
  },
  emptyText: {
    fontSize: typography.sizes.xs
  },
  completedOrdersList: {
    gap: spacing.xs
  },
  orderSnapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1
  },
  orderSnapshotInfo: {
    flex: 1
  },
  orderCode: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  orderMeta: {
    fontSize: 11,
    marginTop: 2
  },
  viewReceiptBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center'
  },
  viewReceiptBtnText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  }
});
