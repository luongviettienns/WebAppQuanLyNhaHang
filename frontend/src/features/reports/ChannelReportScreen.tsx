import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { ChannelReportData, fetchChannelReportApi } from '../../api/reports';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { DateRangeBar, getPresetDates } from './DateRangeBar';

const formatMoney = (val: number): string => `${Math.round(val).toLocaleString('vi-VN')} đ`;

const CHANNEL_LABELS: Record<string, string> = {
  DINE_IN: 'Tại bàn (Dine-in)',
  TAKE_AWAY: 'Mang về (Take-away)',
  DELIVERY: 'Giao hàng (Delivery)'
};

export const ChannelReportScreen: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const presets = getPresetDates();

  const [from, setFrom] = useState<string>(presets.today.from);
  const [to, setTo] = useState<string>(presets.today.to);
  const [data, setData] = useState<ChannelReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchChannelReportApi(token, { from: fromDate, to: toDate });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải báo cáo kênh bán hàng');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData(from, to);
  }, [loadData, from, to]);

  const handleRangeChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  };

  return (
    <ScrollView
      testID="channel-report-screen"
      style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.headerCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>
          Báo cáo Kênh bán hàng & Đối tác Giao nhận
        </Text>
        <Text style={[styles.pageSub, { color: theme.textSecondary }]}>
          Phân tích cơ cấu doanh thu theo phương thức phục vụ và hiệu quả từ các đối tác giao hàng
        </Text>
      </View>

      <DateRangeBar
        from={from}
        to={to}
        onRangeChange={handleRangeChange}
        onRefresh={() => void loadData(from, to)}
        loading={loading}
      />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang phân tích kênh bán & đối tác...</Text>
        </View>
      ) : error ? (
        <View style={[styles.errorBox, { backgroundColor: '#FEE2E2', borderColor: '#F87171' }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : data ? (
        <View style={styles.dataArea}>
          {/* KPI Summary Cards */}
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng đơn hoàn thành</Text>
              <Text testID="kpi-chn-orders" style={[styles.kpiValue, { color: theme.primary }]}>
                {data.summary.totalOrders}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>mọi kênh bán</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Doanh thu gộp (Gross)</Text>
              <Text testID="kpi-chn-gross" style={[styles.kpiValue, { color: theme.textPrimary }]}>
                {formatMoney(data.summary.grossSales)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>trước chiết khấu</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng giảm giá / Voucher</Text>
              <Text testID="kpi-chn-discounts" style={[styles.kpiValue, { color: '#DC2626' }]}>
                {formatMoney(data.summary.discounts)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>khuyến mãi đã trừ</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Doanh thu thuần (Net)</Text>
              <Text testID="kpi-chn-net" style={[styles.kpiValue, { color: '#059669' }]}>
                {formatMoney(data.summary.netRevenue)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>thực tế thu về</Text>
            </View>
          </View>

          {/* Section 1: Breakdown by Channel */}
          <View style={[styles.tableCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableTitle, { color: theme.textPrimary }]}>
                1. Tỷ trọng Doanh thu theo Kênh bán
              </Text>
            </View>

            <View style={[styles.tableHead, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.colHeader, { flex: 1.5, color: theme.textSecondary }]}>Kênh bán hàng</Text>
              <Text style={[styles.colHeader, { flex: 0.8, textAlign: 'right', color: theme.textSecondary }]}>Số đơn</Text>
              <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>Doanh thu gộp</Text>
              <Text style={[styles.colHeader, { flex: 1, textAlign: 'right', color: theme.textSecondary }]}>Giảm giá</Text>
              <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>Doanh thu thuần</Text>
              <Text style={[styles.colHeader, { flex: 0.8, textAlign: 'right', color: theme.textSecondary }]}>Tỷ trọng</Text>
            </View>

            {data.channels.map((ch) => (
              <View
                key={ch.channel}
                testID={`chn-row-${ch.channel}`}
                style={[styles.tableRow, { borderColor: theme.borderSubtle }]}
              >
                <Text style={[styles.rowMain, { flex: 1.5, color: theme.textPrimary, fontFamily: typography.families.bodySemibold }]}>
                  {CHANNEL_LABELS[ch.channel] || ch.channel}
                </Text>
                <Text style={[styles.cellText, { flex: 0.8, textAlign: 'right', color: theme.textPrimary }]}>
                  {ch.orderCount}
                </Text>
                <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', color: theme.textPrimary }]}>
                  {formatMoney(ch.grossSales)}
                </Text>
                <Text style={[styles.cellText, { flex: 1, textAlign: 'right', color: '#DC2626' }]}>
                  {formatMoney(ch.discounts)}
                </Text>
                <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', color: '#059669', fontFamily: typography.families.bodyBold }]}>
                  {formatMoney(ch.netRevenue)}
                </Text>
                <Text style={[styles.cellText, { flex: 0.8, textAlign: 'right', color: theme.primary, fontFamily: typography.families.bodyBold }]}>
                  {ch.sharePercent}%
                </Text>
              </View>
            ))}
          </View>

          {/* Section 2: Delivery Partners */}
          <View style={[styles.tableCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableTitle, { color: theme.textPrimary }]}>
                2. Chi tiết theo Đối tác giao nhận ({data.deliveryPartners.length})
              </Text>
            </View>

            <View style={[styles.tableHead, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.colHeader, { flex: 1.5, color: theme.textSecondary }]}>Mã / Tên đối tác</Text>
              <Text style={[styles.colHeader, { flex: 1, textAlign: 'right', color: theme.textSecondary }]}>Số đơn giao</Text>
              <Text style={[styles.colHeader, { flex: 1.5, textAlign: 'right', color: theme.textSecondary }]}>Doanh thu mang lại</Text>
            </View>

            {data.deliveryPartners.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Không có đơn hàng qua đối tác giao nhận trong khoảng thời gian này
                </Text>
              </View>
            ) : (
              data.deliveryPartners.map((dp) => (
                <View
                  key={dp.partnerId}
                  testID={`dp-row-${dp.partnerId}`}
                  style={[styles.tableRow, { borderColor: theme.borderSubtle }]}
                >
                  <View style={{ flex: 1.5 }}>
                    <Text style={[styles.rowMain, { color: theme.textPrimary }]}>{dp.name}</Text>
                    <Text style={[styles.rowCode, { color: theme.textSecondary }]}>{dp.code}</Text>
                  </View>
                  <Text style={[styles.cellText, { flex: 1, textAlign: 'right', color: theme.textPrimary }]}>
                    {dp.orderCount}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1.5, textAlign: 'right', color: '#059669', fontFamily: typography.families.bodyBold }]}>
                    {formatMoney(dp.netRevenue)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  headerCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs
  },
  pageTitle: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.lg
  },
  pageSub: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  centerBox: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm
  },
  loadingText: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.sm
  },
  errorBox: {
    padding: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1
  },
  errorText: {
    color: '#DC2626',
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.sm
  },
  dataArea: {
    gap: spacing.md
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs
  },
  kpiLabel: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  kpiValue: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.xl
  },
  kpiSub: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  tableCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: 'hidden'
  },
  tableHeaderRow: {
    padding: spacing.md
  },
  tableTitle: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.sm
  },
  tableHead: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1
  },
  colHeader: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1
  },
  rowMain: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  rowCode: {
    fontFamily: typography.families.body,
    fontSize: 10
  },
  cellText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  emptyBox: {
    padding: spacing.xl,
    alignItems: 'center'
  },
  emptyText: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  }
});
