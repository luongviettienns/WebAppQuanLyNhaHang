import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { EmployeeReportData, fetchEmployeeReportApi } from '../../api/reports';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { DateRangeBar, getPresetDates } from './DateRangeBar';

const formatMoney = (val: number): string => `${Math.round(val).toLocaleString('vi-VN')} đ`;

export const EmployeeReportScreen: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const presets = getPresetDates();

  const [from, setFrom] = useState<string>(presets.today.from);
  const [to, setTo] = useState<string>(presets.today.to);
  const [data, setData] = useState<EmployeeReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEmployeeReportApi(token, { from: fromDate, to: toDate });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải báo cáo nhân viên');
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
      testID="employee-report-screen"
      style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.headerCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>
          Báo cáo Hiệu suất & Hoa hồng Nhân viên
        </Text>
        <Text style={[styles.pageSub, { color: theme.textSecondary }]}>
          Theo dõi số lượt phục vụ, doanh thu bán hàng mang lại và mức hoa hồng tạm tính của từng nhân viên
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
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang kết xuất số liệu nhân viên...</Text>
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
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Nhân viên bán hàng</Text>
              <Text testID="kpi-emp-count" style={[styles.kpiValue, { color: theme.primary }]}>
                {data.summary.totalEmployees}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>đang làm việc</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng đơn phục vụ</Text>
              <Text testID="kpi-emp-orders" style={[styles.kpiValue, { color: theme.textPrimary }]}>
                {data.summary.totalOrders}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>lượt order</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng doanh thu mang lại</Text>
              <Text testID="kpi-emp-revenue" style={[styles.kpiValue, { color: '#059669' }]}>
                {formatMoney(data.summary.totalRevenue)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>doanh số phục vụ</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Tổng hoa hồng tạm tính</Text>
              <Text testID="kpi-emp-commission" style={[styles.kpiValue, { color: '#7C3AED' }]}>
                {formatMoney(data.summary.totalCommission)}
              </Text>
              <Text style={[styles.kpiSub, { color: theme.textSecondary }]}>thưởng doanh số</Text>
            </View>
          </View>

          {/* Employee Table */}
          <View style={[styles.tableCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableTitle, { color: theme.textPrimary }]}>
                Bảng xếp hạng & Phân bổ nhân sự ({data.employees.length})
              </Text>
            </View>

            <View style={[styles.tableHead, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.colHeader, { flex: 1.2, color: theme.textSecondary }]}>Mã NV / Họ tên</Text>
              <Text style={[styles.colHeader, { flex: 1, color: theme.textSecondary }]}>Vị trí</Text>
              <Text style={[styles.colHeader, { flex: 0.8, textAlign: 'right', color: theme.textSecondary }]}>Số đơn</Text>
              <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>Doanh thu</Text>
              <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', color: theme.textSecondary }]}>Hoa hồng</Text>
            </View>

            {data.employees.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  Không có dữ liệu nhân viên nào
                </Text>
              </View>
            ) : (
              data.employees.map((emp) => (
                <View
                  key={emp.employeeId}
                  testID={`emp-row-${emp.employeeId}`}
                  style={[styles.tableRow, { borderColor: theme.borderSubtle }]}
                >
                  <View style={{ flex: 1.2 }}>
                    <Text style={[styles.rowMain, { color: theme.textPrimary }]}>{emp.fullName}</Text>
                    <Text style={[styles.rowCode, { color: theme.textSecondary }]}>{emp.code}</Text>
                  </View>
                  <Text style={[styles.cellText, { flex: 1, color: theme.textSecondary }]}>{emp.role}</Text>
                  <Text style={[styles.cellText, { flex: 0.8, textAlign: 'right', color: theme.textPrimary }]}>
                    {emp.orderCount}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', color: '#059669', fontFamily: typography.families.bodyBold }]}>
                    {formatMoney(emp.revenue)}
                  </Text>
                  <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', color: '#7C3AED', fontFamily: typography.families.bodySemibold }]}>
                    {formatMoney(emp.commission)}
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
