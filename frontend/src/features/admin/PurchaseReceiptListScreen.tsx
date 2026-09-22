import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Plus,
  ReceiptText,
  RefreshCw,
  Search
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  PurchaseReceiptDto,
  PurchaseReceiptListFilter,
  PurchaseReceiptStatus
} from '../../api/contracts';
import {
  downloadPurchaseReceiptExportApi,
  fetchPurchaseReceiptsApi
} from '../../api/purchaseReceipts';
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
  formatReceiptDate,
  formatReceiptMoney,
  getPurchaseReceiptStatusPresentation,
  getReceiptListFilterSummary
} from './purchaseReceiptListViewModel';

export interface PurchaseReceiptListScreenProps {
  onCreateReceipt: () => void;
  onOpenReceipt: (id: number) => void;
}

const initialFilter: PurchaseReceiptListFilter = {
  status: ['DRAFT', 'POSTED'],
  page: 1,
  pageSize: 50
};

const statusOptions: Array<{ value: PurchaseReceiptStatus; label: string }> = [
  { value: 'DRAFT', label: 'Phiếu tạm' },
  { value: 'POSTED', label: 'Đã nhập hàng' },
  { value: 'CANCELLED', label: 'Đã hủy' }
];

function triggerDownload(blob: Blob, fileName: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return false;
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
  return true;
}

export const PurchaseReceiptListScreen: React.FC<PurchaseReceiptListScreenProps> = ({
  onCreateReceipt,
  onOpenReceipt
}) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { inventoryRevision } = useRestaurant();
  const { width } = useWindowDimensions();
  const isMobile = width < 820;
  const [filter, setFilter] = useState<PurchaseReceiptListFilter>(initialFilter);
  const [searchInput, setSearchInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPurchaseReceiptsApi>> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  const currentFilter = useMemo<PurchaseReceiptListFilter>(() => ({
    ...filter,
    search: searchInput,
    from: fromInput || undefined,
    to: toInput || undefined
  }), [filter, fromInput, searchInput, toInput]);

  const loadReceipts = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setData(await fetchPurchaseReceiptsApi(token, currentFilter));
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể tải danh sách phiếu nhập hàng');
    } finally {
      setIsLoading(false);
    }
  }, [currentFilter, token]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts, inventoryRevision]);

  const updateFilter = (patch: Partial<PurchaseReceiptListFilter>) => {
    setFilter(current => ({ ...current, ...patch, page: 1 }));
  };

  const toggleStatus = (status: PurchaseReceiptStatus) => {
    const selected = filter.status ?? [];
    const next = selected.includes(status)
      ? selected.filter(item => item !== status)
      : [...selected, status];
    updateFilter({ status: next });
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    setErrorMessage(null);
    try {
      const blob = await downloadPurchaseReceiptExportApi(token, currentFilter, format);
      if (!triggerDownload(blob, `Phieu_nhap_hang_${new Date().toISOString().slice(0, 10)}.${format}`)) {
        setErrorMessage('File đã được tạo. Tải file hiện hỗ trợ trên giao diện Web.');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Không thể xuất phiếu nhập hàng');
    } finally {
      setExporting(null);
    }
  };

  const filterSummary = getReceiptListFilterSummary(filter);
  const items = data?.items ?? [];

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.surfaceCanvas }]} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Phiếu nhập hàng"
        description="Theo dõi phiếu tạm, phiếu đã nhập và công nợ nhà cung cấp"
        leading={<View style={[styles.headerIcon, { backgroundColor: theme.interactiveSecondary }]}><AppIcon icon={ReceiptText} color={theme.primary} /></View>}
        actions={(
          <View style={styles.headerActions}>
            <Button variant="secondary" label="CSV" icon={Download} loading={exporting === 'csv'} onPress={() => handleExport('csv')} />
            <Button variant="secondary" label="XLSX" icon={FileSpreadsheet} loading={exporting === 'xlsx'} onPress={() => handleExport('xlsx')} />
            <Button variant="primary" label="Nhập hàng" icon={Plus} onPress={onCreateReceipt} />
          </View>
        )}
      />

      {errorMessage && <InlineAlert message={errorMessage} tone="danger" />}

      <View style={[styles.toolbar, isMobile && styles.toolbarMobile]}>
        <View style={[styles.searchBox, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}>
          <AppIcon icon={Search} color={theme.textSecondary} size={18} />
          <TextInput
            accessibilityLabel="Tìm theo mã phiếu nhập"
            value={searchInput}
            onChangeText={(value) => { setSearchInput(value); updateFilter({ page: 1 }); }}
            placeholder="Theo mã phiếu nhập"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.textPrimary }]}
          />
        </View>
        <Button variant="quiet" label="Làm mới" icon={RefreshCw} loading={isLoading} onPress={loadReceipts} />
      </View>

      <View style={[styles.mainLayout, isMobile && styles.mainLayoutMobile]}>
        <Surface level="base" style={[styles.filterPanel, isMobile && styles.filterPanelMobile, { borderColor: theme.borderSubtle }]}>
          <Text style={[styles.panelTitle, { color: theme.textPrimary }]}>Bộ lọc</Text>
          <View style={styles.filterGroup}>
            <View style={styles.filterLabelLine}>
              <AppIcon icon={CalendarDays} color={theme.textSecondary} size={16} />
              <Text style={[styles.filterLabel, { color: theme.textPrimary }]}>Thời gian</Text>
            </View>
            <Pressable onPress={() => { setFromInput(''); setToInput(''); updateFilter({ from: undefined, to: undefined }); }} style={[styles.allTimeButton, { borderColor: !fromInput && !toInput ? theme.primary : theme.borderSubtle, backgroundColor: !fromInput && !toInput ? theme.interactiveSecondary : theme.surfaceBase }]}>
              <View style={[styles.radio, { borderColor: !fromInput && !toInput ? theme.primary : theme.borderSubtle }]}>{!fromInput && !toInput && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}</View>
              <Text style={[styles.choiceText, { color: theme.textPrimary }]}>Toàn thời gian</Text>
            </Pressable>
            <View style={styles.dateRow}>
              <TextInput
                accessibilityLabel="Từ ngày"
                value={fromInput}
                onChangeText={(value) => { setFromInput(value); updateFilter({ from: value || undefined }); }}
                placeholder="Từ ngày YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
                style={[styles.dateInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]}
              />
              <TextInput
                accessibilityLabel="Đến ngày"
                value={toInput}
                onChangeText={(value) => { setToInput(value); updateFilter({ to: value || undefined }); }}
                placeholder="Đến ngày YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
                style={[styles.dateInput, { borderColor: theme.borderSubtle, color: theme.textPrimary }]}
              />
            </View>
          </View>

          <View style={styles.filterGroup}>
            <Text style={[styles.filterLabel, { color: theme.textPrimary }]}>Trạng thái</Text>
            {statusOptions.map(option => {
              const active = filterSummary.statuses.includes(option.value);
              return (
                <Pressable key={option.value} onPress={() => toggleStatus(option.value)} style={styles.statusChoice}>
                  <View style={[styles.checkbox, { borderColor: active ? theme.primary : theme.borderSubtle, backgroundColor: active ? theme.primary : theme.surfaceBase }]}>{active && <AppIcon icon={Check} color="#FFFFFF" size={14} />}</View>
                  <Text style={[styles.choiceText, { color: theme.textPrimary }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.filterNote, { borderTopColor: theme.borderSubtle }]}>
            <Text style={[styles.noteLabel, { color: theme.textSecondary }]}>Đang lọc</Text>
            <Text style={[styles.noteValue, { color: theme.textPrimary }]}>{filterSummary.statuses.length} trạng thái · {filterSummary.search ? 'Có từ khóa' : 'Không có từ khóa'}</Text>
          </View>
        </Surface>

        <Surface level="raised" style={styles.tableSurface}>
          {isLoading && !data ? (
            <View style={styles.stateContainer}><ActivityIndicator color={theme.primary} size="large" /><Text style={[styles.stateText, { color: theme.textSecondary }]}>Đang tải phiếu nhập hàng...</Text></View>
          ) : data && items.length === 0 ? (
            <EmptyState title="Chưa có phiếu nhập phù hợp" description="Thử thay đổi bộ lọc hoặc tạo một phiếu nhập hàng mới." action={<Button variant="primary" label="Nhập hàng" icon={Plus} onPress={onCreateReceipt} />} />
          ) : data ? (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.tableMinWidth}>
                <View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}>
                  <Text style={[styles.headerCell, styles.codeColumn, { color: theme.textPrimary }]}>Mã nhập hàng</Text>
                  <Text style={[styles.headerCell, styles.timeColumn, { color: theme.textPrimary }]}>Thời gian</Text>
                  <Text style={[styles.headerCell, styles.supplierColumn, { color: theme.textPrimary }]}>Nhà cung cấp</Text>
                  <Text style={[styles.headerCell, styles.payableColumn, styles.alignRight, { color: theme.textPrimary }]}>Cần trả NCC</Text>
                  <Text style={[styles.headerCell, styles.statusColumn, { color: theme.textPrimary }]}>Trạng thái</Text>
                </View>
                <View style={[styles.totalRow, { borderBottomColor: theme.borderSubtle }]}>
                  <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Tổng cần trả theo bộ lọc</Text>
                  <Text style={[styles.totalValue, { color: theme.textPrimary }]}>{formatReceiptMoney(data.totalPayableAmount)}</Text>
                </View>
                {items.map(item => <ReceiptRow key={item.id} item={item} theme={theme} onPress={() => onOpenReceipt(item.id)} />)}
                <View style={[styles.paginationBar, { borderTopColor: theme.borderSubtle }]}>
                  <Text style={[styles.secondary, { color: theme.textSecondary }]}>Trang {data.pagination.page} / {Math.max(data.pagination.totalPages, 1)} · {data.pagination.totalRows.toLocaleString('vi-VN')} phiếu</Text>
                  <View style={styles.paginationActions}>
                    <Button variant="quiet" label="Trước" icon={ChevronLeft} disabled={data.pagination.page <= 1} onPress={() => updateFilter({ page: data.pagination.page - 1 })} />
                    <Button variant="quiet" label="Sau" icon={ChevronRight} disabled={data.pagination.page >= data.pagination.totalPages} onPress={() => updateFilter({ page: data.pagination.page + 1 })} />
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : null}
        </Surface>
      </View>
    </ScrollView>
  );
};

const ReceiptRow: React.FC<{ item: PurchaseReceiptDto; theme: any; onPress: () => void }> = ({ item, theme, onPress }) => {
  const status = getPurchaseReceiptStatusPresentation(item.status);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Mở phiếu ${item.receiptCode}`} onPress={onPress} style={({ pressed }) => [styles.tableRow, { borderBottomColor: theme.borderSubtle, backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceRaised }]}>
      <Text style={[styles.cell, styles.codeColumn, styles.code, { color: theme.primary }]}>{item.receiptCode}</Text>
      <Text style={[styles.cell, styles.timeColumn, { color: theme.textPrimary }]}>{formatReceiptDate(item.receivedAt)}</Text>
      <View style={[styles.cell, styles.supplierColumn]}>
        <Text style={[styles.supplierName, { color: theme.textPrimary }]}>{item.supplier?.name || 'Chưa chọn nhà cung cấp'}</Text>
        {item.supplier?.code && <Text style={[styles.secondary, { color: theme.textSecondary }]}>{item.supplier.code}</Text>}
      </View>
      <Text style={[styles.cell, styles.payableColumn, styles.numeric, styles.alignRight, { color: theme.textPrimary }]}>{formatReceiptMoney(item.payableAmount)}</Text>
      <View style={[styles.cell, styles.statusColumn]}><StatusBadge tone={status.tone} label={status.label} /></View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.lg },
  headerIcon: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
  toolbar: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  toolbarMobile: { alignItems: 'stretch', flexDirection: 'column' },
  searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, minHeight: 42 },
  mainLayout: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.lg },
  mainLayoutMobile: { flexDirection: 'column' },
  filterPanel: { borderRadius: radii.md, borderWidth: 1, gap: spacing.lg, padding: spacing.md, width: 260 },
  filterPanelMobile: { width: '100%' },
  panelTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  filterGroup: { gap: spacing.sm },
  filterLabelLine: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  filterLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  allTimeButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 40, paddingHorizontal: spacing.sm },
  radio: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 2, height: 18, justifyContent: 'center', width: 18 },
  radioDot: { borderRadius: radii.pill, height: 8, width: 8 },
  dateRow: { gap: spacing.xs },
  dateInput: { borderRadius: radii.md, borderWidth: 1, fontFamily: typography.families.body, fontSize: typography.sizes.xs, minHeight: 38, paddingHorizontal: spacing.sm },
  statusChoice: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 32 },
  checkbox: { alignItems: 'center', borderRadius: 5, borderWidth: 1, height: 19, justifyContent: 'center', width: 19 },
  choiceText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  filterNote: { borderTopWidth: 1, gap: 3, paddingTop: spacing.md },
  noteLabel: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs },
  noteValue: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  tableSurface: { flex: 1, minHeight: 360, overflow: 'hidden' },
  tableMinWidth: { minWidth: 920, width: '100%' },
  tableHeader: { borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerCell: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.xs },
  totalRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'flex-end', minHeight: 44, paddingHorizontal: spacing.md },
  totalLabel: { flex: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm, textAlign: 'right' },
  totalValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, marginLeft: spacing.md, minWidth: 190, textAlign: 'right' },
  tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 64, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cell: { justifyContent: 'center', paddingHorizontal: spacing.xs },
  codeColumn: { width: 150 },
  timeColumn: { width: 180 },
  supplierColumn: { width: 300 },
  payableColumn: { width: 190 },
  statusColumn: { width: 160 },
  code: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  supplierName: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  numeric: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  alignRight: { textAlign: 'right' },
  secondary: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, marginTop: 2 },
  stateContainer: { alignItems: 'center', gap: spacing.md, justifyContent: 'center', minHeight: 300 },
  stateText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  paginationBar: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  paginationActions: { flexDirection: 'row', gap: spacing.sm }
});
