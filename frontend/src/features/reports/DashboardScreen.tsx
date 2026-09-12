import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Eye, Gauge, ReceiptText, RefreshCw, TrendingUp } from 'lucide-react-native';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  useWindowDimensions
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { DailyReportDto, OrderDto } from '../../api/contracts';
import { brandColors, radii, spacing, statusColors, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, StatusBadge, Surface } from '../../ui';
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
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const { fetchDailyReport, kdsOrders } = useRestaurant();

  const [currentDateStr, setCurrentDateStr] = useState<string>(() => formatVietnamDate(new Date()));
  const [report, setReport] = useState<DailyReportDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Receipt Modal State
  const [receiptOrder, setReceiptOrder] = useState<OrderDto | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const isMobile = width < 768;

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

  const getSOSTag = (sec: number): { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' } => {
    if (sec === 0) return { label: 'Chưa có dữ liệu', tone: 'neutral' };
    if (sec <= 180) return { label: 'Dưới 3 phút', tone: 'success' };
    if (sec <= 300) return { label: 'Trong 3–5 phút', tone: 'warning' };
    return { label: 'Trên 5 phút', tone: 'danger' };
  };

  const sosTag = getSOSTag(report?.averagePrepTimeSec || 0);

  // Completed sample orders from KDS store to preview receipt
  const completedOrders = kdsOrders.filter((o) => o.status === 'COMPLETED');
  const completedCount = report?.completedOrders || 0;
  const cancelledCount = report?.cancelledOrders || 0;
  const pendingCount = Math.max(0, (report?.totalOrders || 0) - completedCount - cancelledCount);
  const maxTopSellerQuantity = Math.max(1, ...(report?.topSellers || []).map((item) => item.quantitySold));
  const reportPalette = {
    primary: brandColors.primary,
    secondary: brandColors.secondary,
    neutral: statusColors.neutral.border
  };

  const openReceipt = (order: OrderDto) => {
    setReceiptOrder(order);
    setIsReceiptModalOpen(true);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.reportHeader, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <ScreenHeader title="Hiệu quả bán hàng" description="Số liệu theo ngày, tính trên các đơn đã hoàn tất." leading={<AppIcon icon={TrendingUp} color={theme.primary} size={22} />} />
        <View style={[styles.dateToolbar, isMobile && styles.dateToolbarMobile]}>
          <View style={styles.dateSelector}>
            <Pressable accessibilityRole="button" accessibilityLabel="Ngày trước" onPress={handlePrevDay} style={({ pressed }) => [styles.dateButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}>
              <AppIcon icon={ChevronLeft} color={theme.textPrimary} size={18} />
            </Pressable>
            <View style={styles.dateCopy}>
              <View style={styles.dateLabelRow}>
                <AppIcon icon={CalendarDays} color={theme.textSecondary} size={17} />
                <Text style={[styles.dateMainText, { color: theme.textPrimary }]}>{formatDisplayDateVN(currentDateStr)}</Text>
              </View>
              <Text style={[styles.dateSubText, { color: theme.textSecondary }]}>{currentDateStr === formatVietnamDate(new Date()) ? 'Hôm nay · Asia/Ho_Chi_Minh' : 'Dữ liệu lịch sử'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Ngày sau" onPress={handleNextDay} style={({ pressed }) => [styles.dateButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}>
              <AppIcon icon={ChevronRight} color={theme.textPrimary} size={18} />
            </Pressable>
          </View>
          <View style={styles.dateActions}>
            <Button variant="quiet" label="Hôm nay" onPress={handleToday} />
            <Button variant="secondary" label="Tải lại" icon={RefreshCw} loading={isLoading} onPress={() => void loadReport(currentDateStr)} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, isMobile && styles.scrollContentMobile]} refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => loadReport(currentDateStr)} />}>
        {errorMessage && (
          <View style={styles.feedbackStack}>
            <InlineAlert title="Không thể tải báo cáo" message={`${errorMessage}. Kiểm tra kết nối rồi thử lại.`} />
            <View style={styles.retryButton}><Button variant="secondary" label="Thử lại" icon={RefreshCw} onPress={() => void loadReport(currentDateStr)} /></View>
          </View>
        )}

        <View style={[styles.kpiLayout, isMobile && styles.kpiLayoutMobile]}>
          <View testID="kpi-revenue" style={isMobile ? styles.revenueWrapMobile : styles.revenueWrap}>
            <Surface level="raised" style={[styles.revenuePanel, { borderLeftColor: theme.primary }]}>
              <View style={styles.metricLabelRow}>
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Doanh thu thuần</Text>
                <AppIcon icon={TrendingUp} color={theme.primary} size={20} />
              </View>
              <Text style={[styles.revenueValue, { color: theme.textPrimary }]}>{report ? report.totalRevenue.toLocaleString('vi-VN') : 0} đ</Text>
              <Text style={[styles.metricDescription, { color: theme.textSecondary }]}>Doanh thu từ đơn hoàn tất, đã bao gồm VAT 8%.</Text>
            </Surface>
          </View>

          <View style={styles.supportingMetrics}>
            <View testID="kpi-orders" style={styles.supportingMetricWide}>
              <Surface level="raised" style={styles.metricPanel}>
                <View style={styles.metricLabelRow}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Đơn hàng</Text>
                  <AppIcon icon={ReceiptText} color={theme.textSecondary} size={18} />
                </View>
                <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{report?.totalOrders || 0}</Text>
                <View style={styles.badgeRow}>
                  <StatusBadge tone="success" label={`${completedCount} hoàn tất`} />
                  <StatusBadge tone="danger" label={`${cancelledCount} đã hủy`} />
                </View>
              </Surface>
            </View>
            <View testID="kpi-aov" style={styles.supportingMetric}>
              <Surface level="raised" style={styles.metricPanel}>
                <View style={styles.metricLabelRow}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Giá trị đơn trung bình</Text>
                  <AppIcon icon={Gauge} color={theme.textSecondary} size={18} />
                </View>
                <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{report ? report.averageOrderValue.toLocaleString('vi-VN') : 0} đ</Text>
                <Text style={[styles.metricDescription, { color: theme.textSecondary }]}>Trên mỗi đơn hoàn tất.</Text>
              </Surface>
            </View>
            <View testID="kpi-sos" style={styles.supportingMetric}>
              <Surface level="raised" style={styles.metricPanel}>
                <View style={styles.metricLabelRow}>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Tốc độ phục vụ</Text>
                  <AppIcon icon={Clock3} color={theme.textSecondary} size={18} />
                </View>
                <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{report && report.averagePrepTimeSec > 0 ? `${prepMinutes}p ${prepSeconds}s` : '--'}</Text>
                <StatusBadge tone={sosTag.tone} label={sosTag.label} />
              </Surface>
            </View>
          </View>
        </View>

        <View style={[styles.decisionGrid, isMobile && styles.decisionGridMobile]}>
          <Surface level="raised" style={styles.outcomePanel}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>Kết quả đơn hàng</Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>Tỷ trọng hoàn tất, hủy và đang xử lý trong ngày.</Text>
            </View>
            {report && report.totalOrders > 0 ? (
              <>
                <View accessibilityLabel="Phân bổ kết quả đơn hàng" style={[styles.outcomeBar, { backgroundColor: theme.surfaceSunken }]}>
                  {completedCount > 0 && <View style={{ backgroundColor: reportPalette.primary, flex: completedCount }} />}
                  {pendingCount > 0 && <View style={{ backgroundColor: reportPalette.secondary, flex: pendingCount }} />}
                  {cancelledCount > 0 && <View style={{ backgroundColor: reportPalette.neutral, flex: cancelledCount }} />}
                </View>
                <View style={styles.outcomeLegend}>
                  <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: reportPalette.primary }]} /><Text style={[styles.legendText, { color: theme.textSecondary }]}>Hoàn tất {completedCount}</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: reportPalette.secondary }]} /><Text style={[styles.legendText, { color: theme.textSecondary }]}>Đang xử lý {pendingCount}</Text></View>
                  <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: reportPalette.neutral }]} /><Text style={[styles.legendText, { color: theme.textSecondary }]}>Đã hủy {cancelledCount}</Text></View>
                </View>
              </>
            ) : <EmptyState title="Chưa có đơn hàng" description="Chọn ngày khác hoặc tải lại sau khi ca bán hàng bắt đầu." />}
          </Surface>

          <Surface level="raised" style={styles.topItemsPanel}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>Món bán chạy</Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>Xếp hạng theo số phần trong các đơn hoàn tất.</Text>
            </View>
            {report?.topSellers && report.topSellers.length > 0 ? (
              <View style={styles.topSellerList}>
                {report.topSellers.map((item, index) => (
                  <View key={item.menuItemId} style={styles.topSellerRow}>
                    <Text style={[styles.rank, { color: theme.textSecondary }]}>{index + 1}</Text>
                    <View style={styles.topSellerInfo}>
                      <View style={styles.topSellerCopy}>
                        <Text style={[styles.topSellerName, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.topSellerQuantity, { color: theme.textSecondary }]}>{item.quantitySold} phần</Text>
                      </View>
                      <View style={[styles.itemBarTrack, { backgroundColor: theme.surfaceSunken }]}><View style={[styles.itemBarFill, { backgroundColor: reportPalette.primary, width: `${Math.max(8, (item.quantitySold / maxTopSellerQuantity) * 100)}%` as `${number}%` }]} /></View>
                      <Text style={[styles.topSellerRevenue, { color: theme.textSecondary }]}>{item.revenue.toLocaleString('vi-VN')} đ doanh thu</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : <EmptyState title="Chưa có xếp hạng" description="Món bán chạy sẽ xuất hiện khi có đơn hoàn tất trong ngày." />}
          </Surface>
        </View>

        <Surface level="raised" style={styles.receiptPanel}>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary }]}>Đối soát hóa đơn</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>Mở bản ghi hóa đơn của các đơn đã hoàn tất trong phiên.</Text>
          </View>
          {completedOrders.length > 0 ? (
            <View>
              {completedOrders.slice(0, 5).map((order, index) => (
                <View key={order.id} style={[styles.orderSnapshotRow, index < Math.min(completedOrders.length, 5) - 1 && { borderBottomColor: theme.borderSubtle, borderBottomWidth: 1 }]}>
                  <View style={styles.orderSnapshotInfo}>
                    <Text style={[styles.orderCode, { color: theme.textPrimary }]}>#{order.code}</Text>
                    <Text style={[styles.orderMeta, { color: theme.textSecondary }]}>{order.orderType === 'DINE_IN' ? `Bàn ${order.tableNumber ?? order.tableId}` : 'Mang về'} · {order.finalAmount.toLocaleString('vi-VN')} đ</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Xem hóa đơn #${order.code}`} onPress={() => openReceipt(order)} style={({ pressed }) => [styles.receiptButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}>
                    <AppIcon icon={Eye} color={theme.textPrimary} size={17} />
                    <Text style={[styles.receiptButtonText, { color: theme.textPrimary }]}>Xem hóa đơn</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : <EmptyState title="Chưa có hóa đơn trong phiên" description="Hóa đơn đã hoàn tất sẽ xuất hiện ở đây để đối soát." />}
        </Surface>
      </ScrollView>

      <ReceiptModal
        visible={isReceiptModalOpen}
        order={receiptOrder}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  reportHeader: { borderBottomWidth: 1, gap: spacing.md, padding: spacing.lg },
  dateToolbar: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg, justifyContent: 'space-between' },
  dateToolbarMobile: { alignItems: 'stretch', flexDirection: 'column' },
  dateSelector: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  dateButton: { alignItems: 'center', borderRadius: radii.md, height: spacing.touchTargetMobile, justifyContent: 'center', width: spacing.touchTargetMobile },
  dateCopy: { alignItems: 'center', minWidth: 212 },
  dateLabelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  dateMainText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  dateSubText: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  dateActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  scrollContent: { gap: spacing.lg, padding: spacing.lg },
  scrollContentMobile: { padding: spacing.md },
  feedbackStack: { gap: spacing.sm },
  retryButton: { alignSelf: 'flex-start' },
  kpiLayout: { flexDirection: 'row', gap: spacing.md },
  kpiLayoutMobile: { flexDirection: 'column' },
  revenueWrap: { flex: 1.35 },
  revenueWrapMobile: { width: '100%' },
  revenuePanel: { borderLeftWidth: 4, gap: spacing.md, height: '100%', justifyContent: 'center', minHeight: 184, padding: spacing.xl },
  supportingMetrics: { flex: 2, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  supportingMetricWide: { flexBasis: 248, flexGrow: 1.25 },
  supportingMetric: { flexBasis: 212, flexGrow: 1 },
  metricPanel: { gap: spacing.sm, height: '100%', minHeight: 184, padding: spacing.lg },
  metricLabelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  metricLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  revenueValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.display, fontVariant: ['tabular-nums'], lineHeight: typography.lineHeights.display },
  metricValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, fontVariant: ['tabular-nums'], lineHeight: typography.lineHeights.xl },
  metricDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  decisionGrid: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.lg },
  decisionGridMobile: { flexDirection: 'column' },
  outcomePanel: { flex: 0.8, gap: spacing.lg, padding: spacing.lg },
  topItemsPanel: { flex: 1.2, gap: spacing.md, padding: spacing.lg },
  sectionHeader: { gap: 2 },
  sectionTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, lineHeight: typography.lineHeights.lg },
  sectionSubtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  outcomeBar: { borderRadius: radii.xs, flexDirection: 'row', height: spacing.md, overflow: 'hidden' },
  outcomeLegend: { gap: spacing.sm },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  legendSwatch: { borderRadius: radii.xs, height: spacing.sm, width: spacing.sm },
  legendText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  topSellerList: { gap: spacing.md },
  topSellerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  rank: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, textAlign: 'center', width: spacing.xl },
  topSellerInfo: { flex: 1, gap: spacing.xs },
  topSellerCopy: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  topSellerName: { flex: 1, fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  topSellerQuantity: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  itemBarTrack: { borderRadius: radii.xs, height: spacing.xs, overflow: 'hidden' },
  itemBarFill: { borderRadius: radii.xs, height: '100%' },
  topSellerRevenue: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, fontVariant: ['tabular-nums'] },
  receiptPanel: { gap: spacing.md, padding: spacing.lg },
  orderSnapshotRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', minHeight: 64, paddingVertical: spacing.sm },
  orderSnapshotInfo: { flex: 1, gap: 2 },
  orderCode: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md },
  orderMeta: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  receiptButton: { alignItems: 'center', borderRadius: radii.md, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: spacing.touchTargetMobile, paddingHorizontal: spacing.md },
  receiptButtonText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }
});
