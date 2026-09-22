import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  Download,
  Filter,
  Package,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Wrench
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  InventoryCatalogFilter,
  InventoryCatalogRowDto,
  InventoryCatalogExportFormat,
  InventoryManagementGroup,
  InventoryStockStatus,
  MenuType
} from '../../api/contracts';
import { downloadInventoryCatalogExportApi, fetchInventoryCatalogApi } from '../../api/inventoryCatalog';
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
import {
  formatCatalogNumber,
  formatInventorySummary,
  getInventoryRowActionTarget,
  getInventoryRowKey,
  getInventoryStatusPresentation
} from './inventoryCatalogViewModel';

interface InventoryCatalogScreenProps {
  onOpenLegacyOperations: (row?: InventoryCatalogRowDto) => void;
  onOpenPurchaseReceipts: () => void;
  onOpenInventoryChecks: () => void;
  onOpenInventoryWastes: () => void;
  onOpenSuppliers: () => void;
}

const initialFilter: InventoryCatalogFilter = {
  page: 1,
  pageSize: 50,
  sortBy: 'sku',
  sortOrder: 'asc',
  stockStatus: 'ALL',
  isActive: 'true'
};

const reservedInventoryMenus = ['Hóa đơn đầu vào', 'Trả hàng nhập'];

function formatStock(row: InventoryCatalogRowDto): string {
  if (row.stockQuantity === null) return '—';
  return `${row.stockQuantity.toLocaleString('vi-VN')} ${row.unit}`;
}

function formatCost(row: InventoryCatalogRowDto): string {
  return row.costPrice === null ? '—' : `${row.costPrice.toLocaleString('vi-VN')} đ`;
}

export const InventoryCatalogScreen: React.FC<InventoryCatalogScreenProps> = ({ onOpenLegacyOperations, onOpenPurchaseReceipts, onOpenInventoryChecks, onOpenInventoryWastes, onOpenSuppliers }) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { categories, inventoryRevision } = useRestaurant();
  const [filter, setFilter] = useState<InventoryCatalogFilter>(initialFilter);
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchInventoryCatalogApi>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<InventoryCatalogExportFormat | null>(null);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const next = await fetchInventoryCatalogApi(token, { ...filter, search: searchInput });
      setData(next);
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể tải danh sách kho hàng');
    } finally {
      setIsLoading(false);
    }
  }, [filter, searchInput, token]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog, inventoryRevision]);

  const summary = useMemo(() => data ? formatInventorySummary(data.summary) : null, [data]);

  const updateFilter = (patch: Partial<InventoryCatalogFilter>) => {
    setFilter(current => ({ ...current, ...patch, page: 1 }));
  };

  const handleExport = async (format: InventoryCatalogExportFormat) => {
    setExporting(format);
    setErrorMessage(null);
    try {
      const blob = await downloadInventoryCatalogExportApi(token, { ...filter, search: searchInput }, format);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `Danh_sach_kho_${new Date().toISOString().slice(0, 10)}.${format}`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.URL.revokeObjectURL(url);
      } else {
        setErrorMessage('File đã được tạo. Tải file hiện hỗ trợ trên giao diện Web.');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể xuất danh sách kho hàng');
    } finally {
      setExporting(null);
    }
  };

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.surfaceCanvas }]} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Kho hàng"
        description="Danh sách kho hàng hợp nhất nguyên vật liệu và món bán · Chỉ đọc"
        leading={<View style={[styles.headerIcon, { backgroundColor: theme.interactiveSecondary }]}><AppIcon icon={Package} color={theme.primary} /></View>}
        actions={(
          <View style={styles.headerActions}>
            <Button variant="secondary" label="CSV" icon={Download} loading={exporting === 'csv'} onPress={() => handleExport('csv')} />
            <Button variant="primary" label="Xuất XLSX" icon={Download} loading={exporting === 'xlsx'} onPress={() => handleExport('xlsx')} />
          </View>
        )}
      />

      <Surface level="base" style={[styles.reservedBar, { borderColor: theme.borderSubtle }]}>
        <View style={styles.reservedHeading}>
          <AppIcon icon={Wrench} color={theme.textSecondary} size={16} />
          <Text style={[styles.reservedTitle, { color: theme.textSecondary }]}>Nghiệp vụ kho</Text>
        </View>
        <View style={styles.reservedItems}>
          <Pressable onPress={() => onOpenLegacyOperations()} style={[styles.reservedItem, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSunken }]}>
            <Text style={[styles.reservedLabel, { color: theme.textPrimary }]}>Nguyên liệu / BOM</Text>
          </Pressable>
          <Pressable onPress={() => onOpenLegacyOperations()} style={[styles.reservedItem, { borderColor: theme.borderSubtle, backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.reservedLabel, { color: theme.primary }]}>Thêm nguyên liệu</Text>
          </Pressable>
          <Pressable onPress={() => onOpenLegacyOperations()} style={[styles.reservedItem, { borderColor: theme.borderSubtle, backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.reservedLabel, { color: theme.primary }]}>Nhập Excel</Text>
          </Pressable>
          <Pressable onPress={onOpenPurchaseReceipts} style={[styles.reservedItem, { borderColor: theme.primary, backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.reservedLabel, { color: theme.primary }]}>Nhập hàng</Text>
          </Pressable>
          <Pressable onPress={onOpenInventoryChecks} style={[styles.reservedItem, { borderColor: theme.primary, backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.reservedLabel, { color: theme.primary }]}>Kiểm kho</Text>
          </Pressable>
          <Pressable onPress={onOpenInventoryWastes} style={[styles.reservedItem, { borderColor: theme.primary, backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.reservedLabel, { color: theme.primary }]}>Xuất hủy</Text>
          </Pressable>
          <Pressable onPress={onOpenSuppliers} style={[styles.reservedItem, { borderColor: theme.primary, backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.reservedLabel, { color: theme.primary }]}>Nhà cung cấp</Text>
          </Pressable>
          {reservedInventoryMenus.map(menu => (
            <View key={menu} style={[styles.reservedItem, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceSunken, opacity: 0.65 }]}>
              <Text style={[styles.reservedLabel, { color: theme.textSecondary }]}>{menu}</Text>
              <Text style={[styles.reservedHint, { color: theme.textSecondary }]}>Chưa triển khai</Text>
            </View>
          ))}
        </View>
      </Surface>

      <Surface level="raised" style={styles.filterSurface}>
        <View style={styles.filterTopLine}>
          <View style={[styles.searchBox, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}>
            <AppIcon icon={Search} color={theme.textSecondary} size={18} />
            <TextInput
              accessibilityLabel="Tìm mã hoặc tên hàng"
              value={searchInput}
              onChangeText={(value) => { setSearchInput(value); setFilter(current => ({ ...current, page: 1 })); }}
              onSubmitEditing={() => updateFilter({ search: searchInput })}
              placeholder="Tìm mã hoặc tên hàng"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.textPrimary }]}
            />
          </View>
          <Button variant="quiet" label="Làm mới" icon={RefreshCw} loading={isLoading} onPress={loadCatalog} />
        </View>

        <View style={styles.filterSection}>
          <View style={styles.filterLabelLine}><AppIcon icon={SlidersHorizontal} color={theme.textSecondary} size={16} /><Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Nhóm quản lý</Text></View>
          <View style={styles.chipRow}>
            {([['ALL', 'Tất cả'], ['MATERIAL', 'Nguyên vật liệu'], ['SELLABLE', 'Món bán']] as const).map(([value, label]) => {
              const active = value === 'ALL' ? !filter.managementGroup : filter.managementGroup === value;
              return <Pressable key={value} onPress={() => updateFilter({ managementGroup: value === 'ALL' ? undefined : value as InventoryManagementGroup })} style={[styles.filterChip, { borderColor: active ? theme.primary : theme.borderSubtle, backgroundColor: active ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={[styles.filterChipText, { color: active ? theme.primary : theme.textSecondary }]}>{label}</Text></Pressable>;
            })}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Nhóm món</Text>
          <View style={styles.chipRow}>
            <Pressable onPress={() => updateFilter({ categoryId: undefined })} style={[styles.filterChip, { borderColor: filter.categoryId === undefined ? theme.primary : theme.borderSubtle, backgroundColor: filter.categoryId === undefined ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={[styles.filterChipText, { color: filter.categoryId === undefined ? theme.primary : theme.textSecondary }]}>Tất cả nhóm</Text></Pressable>
            {categories.map(category => {
              const active = filter.categoryId === category.id;
              return <Pressable key={category.id} onPress={() => updateFilter({ categoryId: category.id })} style={[styles.filterChip, { borderColor: active ? theme.primary : theme.borderSubtle, backgroundColor: active ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={[styles.filterChipText, { color: active ? theme.primary : theme.textSecondary }]}>{category.name}</Text></Pressable>;
            })}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Loại món</Text>
          <View style={styles.chipRow}>
            {([['ALL', 'Tất cả'], ['FOOD', 'Món ăn'], ['DRINK', 'Đồ uống'], ['SERVICE', 'Dịch vụ'], ['OTHER', 'Khác']] as const).map(([value, label]) => {
              const active = value === 'ALL' ? filter.menuType === undefined : filter.menuType === value;
              return <Pressable key={value} onPress={() => updateFilter({ menuType: value === 'ALL' ? undefined : value as MenuType })} style={[styles.filterChip, { borderColor: active ? theme.primary : theme.borderSubtle, backgroundColor: active ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={[styles.filterChipText, { color: active ? theme.primary : theme.textSecondary }]}>{label}</Text></Pressable>;
            })}
          </View>
        </View>

        <View style={styles.filterSection}>
          <View style={styles.filterLabelLine}><AppIcon icon={Filter} color={theme.textSecondary} size={16} /><Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Trạng thái tồn</Text></View>
          <View style={styles.chipRow}>
            {([['ALL', 'Tất cả'], ['NORMAL', 'Bình thường'], ['LOW', 'Sắp hết'], ['NEGATIVE', 'Tồn âm'], ['NOT_TRACKED', 'Không theo dõi']] as const).map(([value, label]) => {
              const active = (filter.stockStatus ?? 'ALL') === value;
              return <Pressable key={value} onPress={() => updateFilter({ stockStatus: value as 'ALL' | InventoryStockStatus })} style={[styles.filterChip, { borderColor: active ? theme.primary : theme.borderSubtle, backgroundColor: active ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={[styles.filterChipText, { color: active ? theme.primary : theme.textSecondary }]}>{label}</Text></Pressable>;
            })}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: theme.textSecondary }]}>Hiển thị</Text>
          <View style={styles.chipRow}>
            {([['true', 'Đang kinh doanh'], ['false', 'Ngừng kinh doanh'], ['all', 'Tất cả']] as const).map(([value, label]) => {
              const active = (filter.isActive ?? 'true') === value;
              return <Pressable key={value} onPress={() => updateFilter({ isActive: value })} style={[styles.filterChip, { borderColor: active ? theme.primary : theme.borderSubtle, backgroundColor: active ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={[styles.filterChipText, { color: active ? theme.primary : theme.textSecondary }]}>{label}</Text></Pressable>;
            })}
          </View>
        </View>
      </Surface>

      {summary && (
        <View style={styles.summaryGrid}>
          {[
            ['Tổng dòng', summary.total, theme.primary],
            ['Đang theo dõi tồn', summary.tracked, theme.success],
            ['Cảnh báo tồn', summary.alerts, theme.warning],
            ['Giá trị tồn', summary.stockValue, theme.textPrimary]
          ].map(([label, value, color]) => (
            <Surface key={String(label)} level="raised" style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{label}</Text>
              <Text style={[styles.summaryValue, { color: color as string }]}>{value}</Text>
            </Surface>
          ))}
        </View>
      )}

      {errorMessage && <InlineAlert message={errorMessage} tone="danger" />}

      <Surface level="raised" style={styles.tableSurface}>
        {isLoading && !data ? (
          <View style={styles.stateContainer}><ActivityIndicator color={theme.primary} size="large" /><Text style={[styles.stateText, { color: theme.textSecondary }]}>Đang tải danh sách kho hàng...</Text></View>
        ) : data?.rows.length === 0 && data.summary.totalRows === 0 ? (
          <EmptyState title="Không có dữ liệu phù hợp" description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." />
        ) : data ? (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={styles.tableMinWidth}>
              <View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderColor: theme.borderSubtle }]}>
                <Text style={[styles.headerCell, styles.skuColumn, { color: theme.textPrimary }]}>Mã hàng</Text>
                <Text style={[styles.headerCell, styles.nameColumn, { color: theme.textPrimary }]}>Tên hàng</Text>
                <Text style={[styles.headerCell, styles.groupColumn, { color: theme.textPrimary }]}>Nhóm quản lý</Text>
                <Text style={[styles.headerCell, styles.costColumn, { color: theme.textPrimary }]}>Giá vốn</Text>
                <Text style={[styles.headerCell, styles.stockColumn, { color: theme.textPrimary }]}>Tồn kho</Text>
                <Text style={[styles.headerCell, styles.minColumn, { color: theme.textPrimary }]}>Định mức</Text>
                <Text style={[styles.headerCell, styles.statusColumn, { color: theme.textPrimary }]}>Trạng thái</Text>
                <Text style={[styles.headerCell, styles.actionColumn, { color: theme.textPrimary }]}>Điều hướng</Text>
              </View>
              {data.rows.map(row => {
                const status = getInventoryStatusPresentation(row.stockStatus);
                const target = getInventoryRowActionTarget(row);
                return (
                  <View key={getInventoryRowKey(row)} style={[styles.tableRow, { borderBottomColor: theme.borderSubtle }]}>
                    <Text style={[styles.cell, styles.skuColumn, styles.sku, { color: theme.primary }]}>{row.sku}</Text>
                    <View style={[styles.cell, styles.nameColumn]}><Text style={[styles.name, { color: theme.textPrimary }]}>{row.name}</Text><Text style={[styles.secondary, { color: theme.textSecondary }]}>{row.categoryName || row.unit}</Text></View>
                    <View style={[styles.cell, styles.groupColumn]}><Text style={[styles.body, { color: theme.textPrimary }]}>{row.managementGroup === 'MATERIAL' ? 'Nguyên vật liệu' : row.managementGroup === 'SELLABLE' ? 'Món bán' : 'Công cụ'}</Text>{row.menuType && <Text style={[styles.secondary, { color: theme.textSecondary }]}>{row.menuType}</Text>}</View>
                    <Text style={[styles.cell, styles.costColumn, styles.numeric, { color: theme.textPrimary }]}>{formatCost(row)}</Text>
                    <Text style={[styles.cell, styles.stockColumn, styles.numeric, { color: row.stockStatus === 'NEGATIVE' ? theme.danger : theme.textPrimary }]}>{formatStock(row)}</Text>
                    <Text style={[styles.cell, styles.minColumn, styles.numeric, { color: theme.textSecondary }]}>{formatCatalogNumber(row.minStock)}</Text>
                    <View style={[styles.cell, styles.statusColumn]}><StatusBadge tone={status.tone} label={status.label} /></View>
                    <View style={[styles.cell, styles.actionColumn]}>{target === 'unavailable' ? <Text style={[styles.secondary, { color: theme.textSecondary }]}>Chưa triển khai</Text> : <Button variant="quiet" label={target === 'ingredient' ? 'Mở nguyên liệu' : 'Mở món / BOM'} onPress={() => onOpenLegacyOperations(row)} />}</View>
                  </View>
                );
              })}
              <View style={[styles.paginationBar, { borderTopColor: theme.borderSubtle }]}>
                <Text style={[styles.secondary, { color: theme.textSecondary }]}>Trang {data.pagination.page} / {Math.max(data.pagination.totalPages, 1)} · {data.pagination.totalRows.toLocaleString('vi-VN')} dòng</Text>
                <View style={styles.paginationActions}>
                  <Button variant="quiet" label="Trước" disabled={data.pagination.page <= 1} onPress={() => updateFilter({ page: data.pagination.page - 1 })} />
                  <Button variant="quiet" label="Sau" disabled={data.pagination.page >= data.pagination.totalPages} onPress={() => updateFilter({ page: data.pagination.page + 1 })} />
                </View>
              </View>
            </View>
          </ScrollView>
        ) : null}
        {data && data.rows.length === 0 && data.summary.totalRows > 0 && (
          <EmptyState title="Trang hiện tại không còn dữ liệu" description="Dữ liệu đã thay đổi. Hãy quay về trang đầu để tiếp tục xem danh sách." action={<Button variant="secondary" label="Về trang đầu" onPress={() => updateFilter({ page: 1 })} />} />
        )}
      </Surface>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg },
  headerIcon: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  reservedBar: { borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  reservedHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  reservedTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  reservedItems: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reservedItem: { borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  reservedLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  reservedHint: { fontFamily: typography.families.body, fontSize: 11 },
  filterSurface: { gap: spacing.md, padding: spacing.md },
  filterTopLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, minHeight: 42 },
  filterSection: { gap: spacing.xs },
  filterLabelLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  filterLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  filterChip: { borderRadius: radii.pill, borderWidth: 1, minHeight: 36, paddingHorizontal: spacing.md, paddingVertical: 8 },
  filterChipText: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryCard: { flex: 1, gap: spacing.xs, minWidth: 180, padding: spacing.md },
  summaryLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  summaryValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  tableSurface: { minHeight: 280, overflow: 'hidden' },
  tableMinWidth: { minWidth: 1120 },
  tableHeader: { borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerCell: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 68, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cell: { justifyContent: 'center', paddingHorizontal: spacing.xs },
  skuColumn: { width: 150 },
  nameColumn: { width: 250 },
  groupColumn: { width: 170 },
  costColumn: { width: 130 },
  stockColumn: { width: 140 },
  minColumn: { width: 100 },
  statusColumn: { width: 150 },
  actionColumn: { width: 190 },
  sku: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  name: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.md },
  body: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  secondary: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, marginTop: 2 },
  numeric: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  stateContainer: { alignItems: 'center', gap: spacing.md, justifyContent: 'center', minHeight: 260 },
  stateText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  paginationBar: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  paginationActions: { flexDirection: 'row', gap: spacing.sm }
});
