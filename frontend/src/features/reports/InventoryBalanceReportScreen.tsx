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
import { fetchInventoryBalanceReportApi, InventoryBalanceReportData, InventoryBalanceRow } from '../../api/reports';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';

const formatMoney = (val: number): string => `${Math.round(val).toLocaleString('vi-VN')} đ`;
const formatQty = (val: number): string => Number(val.toFixed(2)).toString();

export const InventoryBalanceReportScreen: React.FC = () => {
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
  const [search, setSearch] = useState<string>('');
  const [data, setData] = useState<InventoryBalanceReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (targetDate: string, searchStr: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchInventoryBalanceReportApi(token, {
        date: targetDate,
        search: searchStr.trim() || undefined
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Không thể tải báo cáo xuất nhập tồn kho');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData(date, search);
  }, [loadData, date, search]);

  return (
    <ScrollView
      testID="inventory-balance-screen"
      style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}
      contentContainerStyle={styles.content}
    >
      {/* Header & Filter Card */}
      <View style={[styles.headerCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>
            Báo cáo Xuất - Nhập - Tồn Kho Nguyên Liệu
          </Text>
          <Text style={[styles.pageSub, { color: theme.textSecondary }]}>
            Đối soát dòng chảy nguyên vật liệu theo thời gian thực (Nhập mua, Xuất bán theo định mức BOM, Hao hụt bếp và Kiểm kê)
          </Text>
        </View>

        <View style={styles.filterRow}>
          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Ngày:</Text>
            <TextInput
              testID="inv-date-input"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.surfaceCanvas, minWidth: 120 }]}
            />
          </View>

          <View style={[styles.filterGroup, { flex: 1, minWidth: 200 }]}>
            <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Tìm kiếm:</Text>
            <TextInput
              testID="inv-search-input"
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm theo tên hoặc mã SKU nguyên liệu..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.surfaceCanvas, flex: 1 }]}
            />
          </View>

          <Pressable
            testID="inv-refresh-btn"
            onPress={() => void loadData(date, search)}
            style={[styles.refreshBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.refreshBtnText}>Làm mới</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang kết xuất báo cáo tồn kho...</Text>
        </View>
      ) : error ? (
        <View style={[styles.errorCard, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
          <Text style={{ color: '#b91c1c', fontWeight: 'bold' }}>{error}</Text>
        </View>
      ) : data ? (
        <>
          {/* Summary KPI Cards */}
          <View style={styles.kpiGrid}>
            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>TỔNG NGUYÊN LIỆU</Text>
              <Text style={[styles.kpiValue, { color: theme.textPrimary }]}>{data.summary.totalIngredients}</Text>
              <Text style={[styles.kpiDetail, { color: theme.textSecondary }]}>Mặt hàng theo dõi</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>TỔNG GIÁ TRỊ TỒN KHO</Text>
              <Text style={[styles.kpiValue, { color: theme.primary }]}>{formatMoney(data.summary.totalInventoryValue)}</Text>
              <Text style={[styles.kpiDetail, { color: theme.textSecondary }]}>Theo đơn giá vốn bình quân</Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>CẢNH BÁO THIẾU HÀNG</Text>
              <Text style={[styles.kpiValue, { color: data.summary.lowStockCount > 0 ? '#dc2626' : '#16a34a' }]}>
                {data.summary.lowStockCount}
              </Text>
              <Text style={[styles.kpiDetail, { color: theme.textSecondary }]}>
                Dưới hoặc bằng định mức an toàn
              </Text>
            </View>

            <View style={[styles.kpiCard, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>TỔNG BIẾN ĐỘNG TRONG KỲ</Text>
              <Text style={[styles.kpiValue, { fontSize: typography.sizes.md, color: theme.textPrimary }]}>
                Nhập: {formatQty(data.summary.totalStockInQuantity)} · Xuất: {formatQty(data.summary.totalStockOutQuantity)}
              </Text>
              <Text style={[styles.kpiDetail, { color: '#e11d48' }]}>
                Hao hụt hủy: {formatQty(data.summary.totalWasteQuantity)} ({formatMoney(data.summary.totalWasteValue)})
              </Text>
            </View>
          </View>

          {/* Table Container */}
          <View style={[styles.tableContainer, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.colHeader, { flex: 1.2, color: theme.textSecondary }]}>Mã SKU / Tên NL</Text>
              <Text style={[styles.colHeader, { width: 60, textAlign: 'center', color: theme.textSecondary }]}>ĐVT</Text>
              <Text style={[styles.colHeader, { width: 80, textAlign: 'right', color: theme.textSecondary }]}>Tồn đầu</Text>
              <Text style={[styles.colHeader, { width: 80, textAlign: 'right', color: '#16a34a' }]}>Nhập</Text>
              <Text style={[styles.colHeader, { width: 80, textAlign: 'right', color: '#2563eb' }]}>Xuất bán</Text>
              <Text style={[styles.colHeader, { width: 70, textAlign: 'right', color: '#dc2626' }]}>Hao hụt</Text>
              <Text style={[styles.colHeader, { width: 70, textAlign: 'right', color: theme.textSecondary }]}>Kiểm kê</Text>
              <Text style={[styles.colHeader, { width: 90, textAlign: 'right', color: theme.primary }]}>Tồn cuối</Text>
              <Text style={[styles.colHeader, { width: 110, textAlign: 'right', color: theme.textPrimary }]}>Giá trị tồn</Text>
              <Text style={[styles.colHeader, { width: 100, textAlign: 'center', color: theme.textSecondary }]}>Trạng thái</Text>
            </View>

            {data.items.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ color: theme.textSecondary }}>Không tìm thấy nguyên liệu nào phù hợp với bộ lọc</Text>
              </View>
            ) : (
              data.items.map((item: InventoryBalanceRow) => (
                <View
                  key={item.ingredientId}
                  testID={`inv-row-${item.sku}`}
                  style={[styles.tableDataRow, { borderTopColor: theme.borderSubtle }]}
                >
                  <View style={{ flex: 1.2 }}>
                    <Text style={[styles.skuText, { color: theme.textPrimary }]}>{item.sku}</Text>
                    <Text style={[styles.nameText, { color: theme.textSecondary }]}>{item.name}</Text>
                  </View>
                  <Text style={[styles.cellText, { width: 60, textAlign: 'center', color: theme.textSecondary }]}>
                    {item.unit}
                  </Text>
                  <Text style={[styles.cellText, { width: 80, textAlign: 'right', color: theme.textSecondary }]}>
                    {formatQty(item.openingStock)}
                  </Text>
                  <Text style={[styles.cellText, { width: 80, textAlign: 'right', color: '#16a34a', fontWeight: 'bold' }]}>
                    +{formatQty(item.stockIn)}
                  </Text>
                  <Text style={[styles.cellText, { width: 80, textAlign: 'right', color: '#2563eb' }]}>
                    -{formatQty(item.stockOut)}
                  </Text>
                  <Text style={[styles.cellText, { width: 70, textAlign: 'right', color: '#dc2626' }]}>
                    -{formatQty(item.waste)}
                  </Text>
                  <Text style={[styles.cellText, { width: 70, textAlign: 'right', color: theme.textSecondary }]}>
                    {item.manualAdjust >= 0 ? `+${formatQty(item.manualAdjust)}` : formatQty(item.manualAdjust)}
                  </Text>
                  <Text style={[styles.cellTextBold, { width: 90, textAlign: 'right', color: theme.primary }]}>
                    {formatQty(item.closingStock)}
                  </Text>
                  <Text style={[styles.cellTextBold, { width: 110, textAlign: 'right', color: theme.textPrimary }]}>
                    {formatMoney(item.inventoryValue)}
                  </Text>
                  <View style={{ width: 100, alignItems: 'center' }}>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: item.isLowStock ? '#fee2e2' : '#f0fdf4',
                          borderColor: item.isLowStock ? '#fca5a5' : '#86efac'
                        }
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: item.isLowStock ? '#b91c1c' : '#15803d' }
                        ]}
                      >
                        {item.isLowStock ? 'Thiếu hàng' : 'Đủ tồn'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
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
    gap: spacing.md
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  filterLabel: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontSize: typography.sizes.sm
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
  tableContainer: {
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: 'hidden'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#f8fafc',
    alignItems: 'center'
  },
  colHeader: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.xs
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    alignItems: 'center'
  },
  skuText: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.sm
  },
  nameText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  cellText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm
  },
  cellTextBold: {
    fontFamily: typography.families.bodyBold,
    fontSize: typography.sizes.sm
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1
  },
  badgeText: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.xs
  },
  emptyBox: {
    padding: spacing.xxl,
    alignItems: 'center'
  }
});
