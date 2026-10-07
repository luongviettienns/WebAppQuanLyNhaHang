import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { fetchSupplierReportApi, SupplierReportData } from '../../api/reports';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { DateRangeBar, getPresetDates } from './DateRangeBar';

const formatMoney = (val: number): string => `${Math.round(val).toLocaleString('vi-VN')} đ`;

export const SupplierReportScreen: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const presets = getPresetDates();

  const [from, setFrom] = useState<string>(presets.today.from);
  const [to, setTo] = useState<string>(presets.today.to);
  const [data, setData] = useState<SupplierReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSupplierReportApi(token, { from: fromDate, to: toDate });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải báo cáo nhà cung cấp');
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
      testID="supplier-report-screen"
      style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.headerCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>
          Báo cáo Nhà cung cấp & Mua hàng
        </Text>
        <Text style={[styles.pageSub, { color: theme.textSecondary }]}>
          Thống kê số lượng phiếu nhập hàng, tổng tiền mua, đã thanh toán và công nợ tồn đọng với từng nhà cung ứng
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
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang phân tích dữ liệu mua hàng & công nợ...</Text>
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
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Nhà cung cấp giao dịch</Text>
              <Text testID="kpi-sup-count" style={[styles.kpiValue, { color: theme.primary }]}>
                {data.summary.totalSuppliers}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>có nhập hàng / trả tiền</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng giá trị mua hàng</Text>
              <Text testID="kpi-sup-purchase" style={[styles.kpiValue, { color: '#D97706' }]}>
                {formatMoney(data.summary.totalPurchaseValue)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>tổng tiền nhập kho</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Đã thanh toán NCC</Text>
              <Text testID="kpi-sup-paid" style={[styles.kpiValue, { color: '#059669' }]}>
                {formatMoney(data.summary.totalPaid)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>đã chi trả</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng công nợ hiện tại</Text>
              <Text testID="kpi-sup-debt" style={[styles.kpiValue, { color: '#DC2626' }]}>
                {formatMoney(data.summary.outstandingDebt)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>còn phải trả</Text>
            </View>
          </View>

          {/* Supplier Table */}
          <View style={[styles.tableCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableTitle, { color: theme.textPrimary }]}>
                Chi tiết Nhà cung cấp ({data.suppliers.length})
              </Text>
            </View>

            <View style={[styles.tableHead, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.colHeader, { flex: 1.2, color: theme.textSecondary }]}>Mã / Tên NCC</Text>
              <Text style={[styles.colHeader, { flex: 1, color: theme.textSecondary }]}>Điện thoại</Text>
              <Text style={[styles.colHeader, { flex: 0.8, textAlign: 'right', color: theme.textSecondary }]}>Số đơn nhập</Text>
              <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>Tổng tiền nhập</Text>
              <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>Đã trả NCC</Text>
              <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>Nợ hiện tại</Text>
            </View>

            {data.suppliers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Không có dữ liệu nhà cung cấp nào
                </Text>
              </View>
            ) : (
              data.suppliers.map((s) => (
                <View
                  key={s.supplierId}
                  testID={`sup-row-${s.supplierId}`}
                  style={[styles.tableRow, { borderColor: theme.borderSubtle }]}
                >
                  <View style={{ flex: 1.2 }}>
                    <Text style={[styles.rowMain, { color: theme.textPrimary }]}>{s.name}</Text>
                    <Text style={[styles.rowCode, { color: theme.textSecondary }]}>{s.code}</Text>
                  </View>
                  <Text style={[styles.cellText, { flex: 1, color: theme.textPrimary }]}>{s.phone || '-'}</Text>
                  <Text style={[styles.cellText, { flex: 0.8, textAlign: 'right', color: theme.textPrimary }]}>
                    {s.receiptCount}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', color: '#D97706', fontFamily: typography.families.bodySemibold }]}>
                    {formatMoney(s.totalAmount)}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', color: '#059669', fontFamily: typography.families.bodyMedium }]}>
                    {formatMoney(s.paidAmount)}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', color: s.currentDebt > 0 ? '#DC2626' : theme.textSecondary, fontFamily: typography.families.bodyBold }]}>
                    {formatMoney(s.currentDebt)}
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
