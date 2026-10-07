import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { CustomerReportData, fetchCustomerReportApi } from '../../api/reports';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { DateRangeBar, getPresetDates } from './DateRangeBar';

const formatMoney = (val: number): string => `${Math.round(val).toLocaleString('vi-VN')} đ`;

export const CustomerReportScreen: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const presets = getPresetDates();

  const [from, setFrom] = useState<string>(presets.today.from);
  const [to, setTo] = useState<string>(presets.today.to);
  const [data, setData] = useState<CustomerReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCustomerReportApi(token, { from: fromDate, to: toDate });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải báo cáo khách hàng');
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
      testID="customer-report-screen"
      style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.headerCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>
          Báo cáo Khách hàng & Hội viên
        </Text>
        <Text style={[styles.pageSub, { color: theme.textSecondary }]}>
          Thống kê lượt mua, doanh thu đóng góp, tích điểm và giá trị trung bình đơn theo từng khách hàng
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
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang phân tích dữ liệu khách hàng...</Text>
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
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Khách hàng mua hàng</Text>
              <Text testID="kpi-cust-count" style={[styles.kpiValue, { color: theme.primary }]}>
                {data.summary.totalCustomers}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>có phát sinh đơn</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng lượt đơn hàng</Text>
              <Text testID="kpi-cust-orders" style={[styles.kpiValue, { color: theme.textPrimary }]}>
                {data.summary.totalOrders}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>đơn hoàn thành</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Doanh thu từ khách hàng</Text>
              <Text testID="kpi-cust-revenue" style={[styles.kpiValue, { color: '#059669' }]}>
                {formatMoney(data.summary.totalRevenue)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>thực thu</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Giá trị TB / Đơn</Text>
              <Text testID="kpi-cust-aov" style={[styles.kpiValue, { color: '#2563EB' }]}>
                {formatMoney(data.summary.avgOrderValue)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>AOV</Text>
            </View>
          </View>

          {/* Customer Table */}
          <View style={[styles.tableCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableTitle, { color: theme.textPrimary }]}>
                Danh sách Khách hàng ({data.customers.length})
              </Text>
            </View>

            <View style={[styles.tableHead, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.colHeader, { flex: 1.2, color: theme.textSecondary }]}>Mã KH / Tên</Text>
              <Text style={[styles.colHeader, { flex: 1, color: theme.textSecondary }]}>Điện thoại</Text>
              <Text style={[styles.colHeader, { flex: 0.8, color: theme.textSecondary }]}>Hạng / Điểm</Text>
              <Text style={[styles.colHeader, { flex: 0.8, textAlign: 'right', color: theme.textSecondary }]}>Số đơn</Text>
              <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>Tổng chi tiêu</Text>
              <Text style={[styles.colHeader, { flex: 1, textAlign: 'right', color: theme.textSecondary }]}>TB / Đơn</Text>
            </View>

            {data.customers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Không có dữ liệu khách hàng trong khoảng thời gian này
                </Text>
              </View>
            ) : (
              data.customers.map((c) => (
                <View
                  key={c.customerId}
                  testID={`cust-row-${c.customerId}`}
                  style={[styles.tableRow, { borderColor: theme.borderSubtle }]}
                >
                  <View style={{ flex: 1.2 }}>
                    <Text style={[styles.rowMain, { color: theme.textPrimary }]}>{c.name}</Text>
                    <Text style={[styles.rowCode, { color: theme.textSecondary }]}>{c.code}</Text>
                  </View>
                  <Text style={[styles.cellText, { flex: 1, color: theme.textPrimary }]}>{c.phone || '-'}</Text>
                  <View style={{ flex: 0.8 }}>
                    <Text style={[styles.cellText, { color: theme.primary, fontFamily: typography.families.bodySemibold }]}>
                      {c.tier}
                    </Text>
                    <Text style={[styles.rowCode, { color: theme.textSecondary }]}>{c.points} điểm</Text>
                  </View>
                  <Text style={[styles.cellText, { flex: 0.8, textAlign: 'right', color: theme.textPrimary }]}>
                    {c.orderCount}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', color: '#059669', fontFamily: typography.families.bodyBold }]}>
                    {formatMoney(c.totalSpent)}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1, textAlign: 'right', color: theme.textSecondary }]}>
                    {formatMoney(c.avgOrderValue)}
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
