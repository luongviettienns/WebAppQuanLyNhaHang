import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { fetchProfitAndLossReportApi, ProfitAndLossReportData } from '../../api/reports';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';

const formatMoney = (val: number): string => `${Math.round(val).toLocaleString('vi-VN')} đ`;

export const ProfitAndLossReportScreen: React.FC = () => {
  const { theme } = useTheme();
  const { token } = useAuth();

  const getTodayStr = () => {
    const now = new Date();
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
  };

  const [date, setDate] = useState<string>(getTodayStr());
  const [data, setData] = useState<ProfitAndLossReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchProfitAndLossReportApi(token, { date: targetDate });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải báo cáo tài chính lãi lỗ');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData(date);
  }, [loadData, date]);

  const setPreset = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
    setDate(dateStr);
  };

  return (
    <ScrollView
      testID="profit-and-loss-screen"
      style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}
      contentContainerStyle={styles.content}
    >
      {/* Header & Date Filter */}
      <View style={[styles.headerCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>
            Báo cáo Tài chính & Lãi Lỗ (P&L)
          </Text>
          <Text style={[styles.pageSub, { color: theme.textSecondary }]}>
            Kết quả kinh doanh hoạt động F&B thực tế theo giá niêm yết và chi phí thực phát sinh
          </Text>
        </View>

        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Ngày báo cáo:</Text>
          <TextInput
            testID="pnl-date-input"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            style={[styles.dateInput, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.surfaceCanvas }]}
          />
          <Pressable
            testID="pnl-today-preset"
            onPress={() => setPreset(0)}
            style={[styles.presetBtn, date === getTodayStr() && { backgroundColor: theme.interactiveSecondary }]}
          >
            <Text style={[styles.presetBtnText, { color: theme.textPrimary }]}>Hôm nay</Text>
          </Pressable>
          <Pressable
            testID="pnl-yesterday-preset"
            onPress={() => setPreset(1)}
            style={styles.presetBtn}
          >
            <Text style={[styles.presetBtnText, { color: theme.textSecondary }]}>Hôm qua</Text>
          </Pressable>
          <Pressable
            testID="pnl-refresh-btn"
            onPress={() => void loadData(date)}
            style={[styles.refreshBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.refreshBtnText}>Xem báo cáo</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang kết xuất báo cáo tài chính...</Text>
        </View>
      ) : error ? (
        <View style={[styles.errorCard, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
          <Text style={{ color: '#b91c1c', fontWeight: 'bold' }}>{error}</Text>
        </View>
      ) : data ? (
        <>
          {/* Main KPI Row */}
          <View style={styles.kpiGrid}>
            {/* KPI 1: Doanh thu thuần */}
            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>DOANH THU THUẦN</Text>
              <Text style={[styles.kpiValue, { color: theme.primary }]}>
                {formatMoney(data.revenue.netRevenue)}
              </Text>
              <Text style={[styles.kpiDetail, { color: theme.textSecondary }]}>
                {data.revenue.orderCount} đơn hoàn thành
              </Text>
            </View>

            {/* KPI 2: Giá vốn hàng bán */}
            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>GIÁ VỐN HÀNG BÁN (COGS)</Text>
              <Text style={[styles.kpiValue, { color: '#e11d48' }]}>
                {formatMoney(data.cogs.salesCogs)}
              </Text>
              <Text style={[styles.kpiDetail, { color: theme.textSecondary }]}>
                Xuất bán theo định mức BOM
              </Text>
            </View>

            {/* KPI 3: Lợi nhuận gộp */}
            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>LỢI NHUẬN GỘP</Text>
              <Text style={[styles.kpiValue, { color: '#059669' }]}>
                {formatMoney(data.cogs.grossProfit)}
              </Text>
              <Text style={[styles.kpiDetail, { color: theme.textSecondary }]}>
                {`Biên LN gộp: ${data.cogs.grossProfitMargin}%`}
              </Text>
            </View>

            {/* KPI 4: Lợi nhuận hoạt động thuần */}
            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>LỢI NHUẬN RÒNG HOẠT ĐỘNG</Text>
              <Text
                style={[
                  styles.kpiValue,
                  { color: data.netProfit.operatingProfit >= 0 ? '#16a34a' : '#dc2626' }
                ]}
              >
                {formatMoney(data.netProfit.operatingProfit)}
              </Text>
              <Text style={[styles.kpiDetail, { color: theme.textSecondary }]}>
                {`Biên LN ròng: ${data.netProfit.netProfitMargin}%`}
              </Text>
            </View>
          </View>

          {/* Detailed Statement Sections */}
          <View style={styles.twoColumnGrid}>
            {/* Left Column: Bảng Kết quả Kinh doanh */}
            <View style={[styles.detailCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Chi tiết Doanh thu & Chi phí</Text>

              <View style={styles.tableRow}>
                <Text style={[styles.rowLabelBold, { color: theme.textPrimary }]}>1. Doanh thu bán hàng gộp</Text>
                <Text style={[styles.rowValueBold, { color: theme.textPrimary }]}>{formatMoney(data.revenue.grossSales)}</Text>
              </View>
              <View style={styles.tableRowIndent}>
                <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>(-) Giảm giá, voucher khuyến mãi</Text>
                <Text style={[styles.rowValue, { color: '#e11d48' }]}>- {formatMoney(data.revenue.discountAmount)}</Text>
              </View>
              <View style={styles.tableRowIndent}>
                <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>(-) Trả hàng & hoàn tiền khách</Text>
                <Text style={[styles.rowValue, { color: '#e11d48' }]}>- {formatMoney(data.revenue.returnsAmount)}</Text>
              </View>

              <View style={[styles.tableRowDivider, { borderColor: theme.borderSubtle }]} />

              <View style={styles.tableRow}>
                <Text style={[styles.rowLabelBold, { color: theme.primary }]}>2. Doanh thu thuần</Text>
                <Text style={[styles.rowValueBold, { color: theme.primary }]}>{formatMoney(data.revenue.netRevenue)}</Text>
              </View>
              <View style={styles.tableRowIndent}>
                <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>Trong đó tiền thuế VAT đã thu (8%)</Text>
                <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{formatMoney(data.revenue.vatAmount)}</Text>
              </View>

              <View style={[styles.tableRowDivider, { borderColor: theme.borderSubtle }]} />

              <View style={styles.tableRow}>
                <Text style={[styles.rowLabelBold, { color: '#b91c1c' }]}>3. Giá vốn hàng bán (COGS)</Text>
                <Text style={[styles.rowValueBold, { color: '#b91c1c' }]}>- {formatMoney(data.cogs.salesCogs)}</Text>
              </View>

              <View style={[styles.tableRowDivider, { borderColor: theme.borderSubtle }]} />

              <View style={styles.tableRowHighlight}>
                <Text style={[styles.rowLabelBold, { color: '#059669' }]}>4. Lợi nhuận gộp</Text>
                <Text style={[styles.rowValueBold, { color: '#059669' }]}>{formatMoney(data.cogs.grossProfit)}</Text>
              </View>

              <View style={[styles.tableRowDivider, { borderColor: theme.borderSubtle }]} />

              <View style={styles.tableRow}>
                <Text style={[styles.rowLabelBold, { color: theme.textPrimary }]}>5. Chi phí hoạt động</Text>
                <Text style={[styles.rowValueBold, { color: '#b91c1c' }]}>- {formatMoney(data.operatingExpenses.totalExpenses)}</Text>
              </View>
              <View style={styles.tableRowIndent}>
                <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>- Hao hụt, phế phẩm hủy bếp</Text>
                <Text style={[styles.rowValue, { color: theme.textSecondary }]}>- {formatMoney(data.operatingExpenses.kitchenWasteCost)}</Text>
              </View>
              <View style={styles.tableRowIndent}>
                <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>- Chi phí vận hành sổ quỹ</Text>
                <Text style={[styles.rowValue, { color: theme.textSecondary }]}>- {formatMoney(data.operatingExpenses.cashExpenses)}</Text>
              </View>
              {data.operatingExpenses.payrollCost > 0 && (
                <View style={styles.tableRowIndent}>
                  <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>  (Trong đó chi trả lương nhân viên)</Text>
                  <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{formatMoney(data.operatingExpenses.payrollCost)}</Text>
                </View>
              )}

              <View style={[styles.tableRowDivider, { borderColor: theme.borderSubtle }]} />

              <View style={[styles.tableRowHighlight, { backgroundColor: '#f0fdf4', borderRadius: radii.sm, padding: spacing.sm }]}>
                <Text style={[styles.rowLabelBold, { fontSize: typography.sizes.md, color: '#15803d' }]}>6. LỢI NHUẬN THUẦN HOẠT ĐỘNG</Text>
                <Text style={[styles.rowValueBold, { fontSize: typography.sizes.md, color: '#15803d' }]}>{formatMoney(data.netProfit.operatingProfit)}</Text>
              </View>
            </View>

            {/* Right Column: Breakdown Charts / Summaries */}
            <View style={{ gap: spacing.lg }}>
              {/* Payment Methods */}
              <View style={[styles.detailCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
                <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Cơ cấu Thu tiền</Text>
                <View style={styles.tableRow}>
                  <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>Tiền mặt (Cash):</Text>
                  <Text style={[styles.rowValueBold, { color: theme.textPrimary }]}>{formatMoney(data.revenueByPaymentMethod.cash)}</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>Chuyển khoản (Bank Transfer):</Text>
                  <Text style={[styles.rowValueBold, { color: theme.textPrimary }]}>{formatMoney(data.revenueByPaymentMethod.bankTransfer)}</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>Khác / Ví điện tử:</Text>
                  <Text style={[styles.rowValueBold, { color: theme.textPrimary }]}>{formatMoney(data.revenueByPaymentMethod.other)}</Text>
                </View>
              </View>

              {/* Expense by Category */}
              <View style={[styles.detailCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
                <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Cơ cấu Chi phí Vận hành</Text>
                {data.expenseBreakdownByCategory.length === 0 ? (
                  <Text style={{ color: theme.textSecondary, fontStyle: 'italic', paddingVertical: spacing.sm }}>
                    Không có phiếu chi nào phát sinh trong ngày
                  </Text>
                ) : (
                  data.expenseBreakdownByCategory.map((cat, idx) => (
                    <View key={idx} style={styles.tableRow}>
                      <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{cat.categoryName}</Text>
                      <Text style={[styles.rowValue, { color: theme.textPrimary }]}>{formatMoney(cat.amount)}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  headerCard: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md
  },
  headerTitleRow: { gap: 4 },
  pageTitle: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.xl
  },
  pageSub: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  filterLabel: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  dateInput: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontSize: typography.sizes.sm,
    minWidth: 130
  },
  presetBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  presetBtnText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  refreshBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  refreshBtnText: {
    color: '#ffffff',
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  centerBox: {
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md
  },
  loadingText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm
  },
  errorCard: {
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs
  },
  kpiLabel: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 0.5
  },
  kpiValue: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.lg
  },
  kpiDetail: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  twoColumnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg
  },
  detailCard: {
    flex: 1,
    minWidth: 320,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm
  },
  cardTitle: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.md,
    marginBottom: spacing.xs
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3
  },
  tableRowIndent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingVertical: 2
  },
  tableRowHighlight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4
  },
  tableRowDivider: {
    borderTopWidth: 1,
    marginVertical: 4
  },
  rowLabel: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm
  },
  rowLabelBold: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.sm
  },
  rowValue: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm
  },
  rowValueBold: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.sm
  }
});
