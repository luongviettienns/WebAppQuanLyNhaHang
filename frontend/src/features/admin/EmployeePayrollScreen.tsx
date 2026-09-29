import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { fetchEmployeesApi, type EmployeeListItemDto } from '../../api/employeeManagement';
import {
  addEmployeePayrollAdjustmentApi,
  cancelEmployeePayrollApi,
  createEmployeePayrollApi,
  downloadEmployeePayrollApi,
  fetchEmployeePayrollDetailApi,
  fetchEmployeePayrollsApi,
  finalizeEmployeePayrollApi,
  recalculateEmployeePayrollApi,
  recordEmployeePayrollPaymentApi,
  type CreateEmployeePayrollInput,
  type EmployeePayrollDetailDto,
  type EmployeePayrollListDto,
  type EmployeePayrollListItemDto,
  type PayrollBatchStatus,
  type PayrollPaymentInput
} from '../../api/employeePayroll';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { EmployeePayrollCreateModal } from './EmployeePayrollCreateModal';
import { EmployeePayrollDetail } from './EmployeePayrollDetail';
import { formatPayrollVnd, payrollStatusLabel } from './employeePayrollViewModel';

const PAGE_SIZE = 15;
const BRANCH_ID = 1;
const statusOptions: PayrollBatchStatus[] = ['DRAFT', 'CALCULATED', 'FINALIZED', 'CANCELLED'];
const idempotencyKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function periodLabel(item: EmployeePayrollListItemDto) {
  const toVi = (value: string) => value.split('-').reverse().join('/');
  return `${toVi(item.periodStart)} - ${toVi(item.periodEnd)}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}

export const EmployeePayrollScreen: React.FC = () => {
  const { token } = useAuth();
  const { employeePayrollRevision, employeesRevision, employeeAttendanceRevision } = useRestaurant();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 820;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [queryText, setQueryText] = useState('');
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState<PayrollBatchStatus[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EmployeePayrollListDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(!compact);
  const [createOpen, setCreateOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeListItemDto[]>([]);
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeHasMore, setEmployeeHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<EmployeePayrollDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const requestId = useRef(0);
  const revisionsRef = useRef({ employeePayrollRevision, employeesRevision, employeeAttendanceRevision });

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(queryText.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [queryText]);

  useEffect(() => { if (!compact) setFiltersOpen(true); }, [compact]);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true); setError('');
    try {
      const result = await fetchEmployeePayrollsApi(token, {
        branchId: BRANCH_ID, search: search || undefined, status: statuses.length ? statuses : undefined, page, pageSize: PAGE_SIZE
      });
      if (current === requestId.current) setData(result);
    } catch (caught) {
      if (current === requestId.current) setError(caught instanceof Error ? caught.message : 'Không thể tải danh sách bảng lương.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [page, search, statuses, token]);

  useEffect(() => { void load(); }, [load]);

  const loadDetail = useCallback(async (batchId: number) => {
    setDetailLoading(true); setError('');
    try { setDetail(await fetchEmployeePayrollDetailApi(token, batchId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể tải chi tiết bảng lương.'); }
    finally { setDetailLoading(false); }
  }, [token]);

  const refresh = useCallback(async () => {
    await load();
    if (expandedId !== null) await loadDetail(expandedId);
  }, [expandedId, load, loadDetail]);

  useEffect(() => {
    const previous = revisionsRef.current;
    const payrollChanged = previous.employeePayrollRevision !== employeePayrollRevision;
    const sourceChanged = previous.employeesRevision !== employeesRevision
      || previous.employeeAttendanceRevision !== employeeAttendanceRevision;
    revisionsRef.current = { employeePayrollRevision, employeesRevision, employeeAttendanceRevision };
    if (!payrollChanged && !sourceChanged) return;
    void load();
    if (expandedId !== null && (payrollChanged || (sourceChanged && detail?.status !== 'FINALIZED'))) {
      void loadDetail(expandedId);
    }
  }, [detail?.status, employeeAttendanceRevision, employeePayrollRevision, employeesRevision, expandedId, load, loadDetail]);

  useEffect(() => {
    const refreshWhenFocused = () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refresh();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', refreshWhenFocused);
    const subscription = Platform.OS === 'web' ? null : AppState.addEventListener('change', state => {
      if (state === 'active') refreshWhenFocused();
    });
    return () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', refreshWhenFocused);
      subscription?.remove();
    };
  }, [refresh]);

  const toggleStatus = (status: PayrollBatchStatus) => {
    setStatuses(current => current.includes(status) ? current.filter(item => item !== status) : [status]);
    setPage(1);
  };

  const openRow = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(id); setDetail(null); await loadDetail(id);
  };

  const loadEmployees = useCallback(async (nextPage = 1) => {
    const result = await fetchEmployeesApi(token, { status: 'WORKING', page: nextPage, pageSize: 25 });
    setEmployees(current => nextPage === 1 ? result.items : [...current, ...result.items.filter(item => !current.some(old => old.id === item.id))]);
    setEmployeePage(nextPage); setEmployeeHasMore(nextPage < result.pagination.totalPages);
  }, [token]);

  const openCreate = () => { setCreateOpen(true); void loadEmployees(1); };
  const createPayroll = async (input: CreateEmployeePayrollInput) => {
    await createEmployeePayrollApi(token, input, idempotencyKey('payroll-create'));
    setPage(1); await load();
  };

  const exportExpanded = async () => {
    if (expandedId === null) return;
    try {
      const blob = await downloadEmployeePayrollApi(token, expandedId, 'xlsx');
      downloadBlob(blob, `${detail?.code ?? 'bang-luong'}.xlsx`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không thể xuất bảng lương.'); }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <Text style={styles.screenTitle}>Bảng lương</Text>
        <TextInput testID="payroll-search" value={queryText} onChangeText={setQueryText} placeholder="Theo mã, tên bảng lương" style={styles.search} />
        {compact && <Pressable testID="payroll-filters-toggle" onPress={() => setFiltersOpen(value => !value)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Bộ lọc</Text></Pressable>}
        <View style={styles.toolbarActions}>
          <Pressable testID="payroll-create-open" onPress={openCreate} style={styles.primaryButton}><Text style={styles.primaryText}>+ Bảng tính lương</Text></Pressable>
          <Pressable testID="payroll-export" disabled={expandedId === null} onPress={() => void exportExpanded()} style={[styles.secondaryButton, expandedId === null && styles.disabled]}><Text style={styles.secondaryText}>Xuất file</Text></Pressable>
        </View>
      </View>

      <View style={styles.content}>
        {filtersOpen && (
          <View style={[styles.filters, compact && styles.filtersCompact]}>
            <Text style={styles.filterHeading}>Kỳ hạn trả lương</Text>
            <View style={styles.selectLike}><Text style={styles.bodyText}>Hàng tháng</Text></View>
            <Text style={styles.filterHeading}>Trạng thái</Text>
            {statusOptions.map(status => (
              <Pressable key={status} testID={`payroll-filter-${status.toLowerCase()}`} onPress={() => toggleStatus(status)} style={styles.checkRow}>
                <View style={[styles.checkbox, statuses.includes(status) && styles.checkboxSelected]}><Text style={styles.checkmark}>{statuses.includes(status) ? '✓' : ''}</Text></View>
                <Text style={styles.bodyText}>{payrollStatusLabel(status)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.main}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading && !data ? <ActivityIndicator color={theme.primary} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.table}>
                <View style={[styles.row, styles.headerRow]}>
                  <Text style={[styles.cell, styles.codeCell]}>Mã</Text><Text style={[styles.cell, styles.nameCell]}>Tên</Text>
                  <Text style={styles.cell}>Kỳ hạn trả</Text><Text style={[styles.cell, styles.periodCell]}>Kỳ làm việc</Text>
                  <Text style={styles.moneyCell}>Tổng lương</Text><Text style={styles.moneyCell}>Đã trả nhân viên</Text>
                  <Text style={styles.moneyCell}>Còn cần trả</Text><Text style={styles.cell}>Trạng thái</Text>
                </View>
                <View style={[styles.row, styles.summaryRow]}>
                  <Text style={[styles.cell, styles.codeCell]} /><Text style={[styles.cell, styles.nameCell]}>Tổng theo bộ lọc</Text>
                  <Text style={styles.cell} /><Text style={[styles.cell, styles.periodCell]} />
                  <Text style={styles.moneyCell}>{formatPayrollVnd(data?.summary.totalNetAmount ?? 0)}</Text>
                  <Text style={styles.moneyCell}>{formatPayrollVnd(data?.summary.totalPaidAmount ?? 0)}</Text>
                  <Text style={styles.moneyCell}>{formatPayrollVnd(data?.summary.totalRemainingAmount ?? 0)}</Text><Text style={styles.cell} />
                </View>
                {data?.items.map(item => (
                  <View key={item.id}>
                    <Pressable testID={`payroll-row-${item.id}`} onPress={() => void openRow(item.id)} style={[styles.row, expandedId === item.id && styles.selectedRow]}>
                      <Text style={[styles.cell, styles.codeCell]}>{item.code}</Text><Text style={[styles.cell, styles.nameCell]}>{item.name}</Text>
                      <Text style={styles.cell}>Hàng tháng</Text><Text style={[styles.cell, styles.periodCell]}>{periodLabel(item)}</Text>
                      <Text style={styles.moneyCell}>{formatPayrollVnd(item.totalNetAmount)}</Text><Text style={styles.moneyCell}>{formatPayrollVnd(item.totalPaidAmount)}</Text>
                      <Text style={styles.moneyCell}>{formatPayrollVnd(item.totalRemainingAmount)}</Text><Text style={styles.cell}>{payrollStatusLabel(item.status)}</Text>
                    </Pressable>
                    {expandedId === item.id && detailLoading && <ActivityIndicator color={theme.primary} />}
                    {expandedId === item.id && detail && (
                      <EmployeePayrollDetail
                        detail={detail}
                        onChanged={async () => { await refresh(); }}
                        onRecalculate={async () => { await recalculateEmployeePayrollApi(token, item.id, idempotencyKey('payroll-recalculate')); }}
                        onFinalize={async () => { await finalizeEmployeePayrollApi(token, item.id, idempotencyKey('payroll-finalize')); }}
                        onCancel={async reason => { await cancelEmployeePayrollApi(token, item.id, { reason }); }}
                        onAdjust={async (lineId, input) => { await addEmployeePayrollAdjustmentApi(token, item.id, lineId, input); }}
                        onPay={async (lineId, input: PayrollPaymentInput) => { await recordEmployeePayrollPaymentApi(token, item.id, lineId, input, idempotencyKey('payroll-payment')); }}
                      />
                    )}
                  </View>
                ))}
                {!loading && data?.items.length === 0 && <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có bảng lương</Text><Text style={styles.meta}>Tạo bảng tính lương từ dữ liệu nhân viên và chấm công thực tế.</Text></View>}
              </View>
            </ScrollView>
          )}
          <View style={styles.pagination}>
            <Text style={styles.meta}>Hiển thị {data?.pagination.pageSize ?? PAGE_SIZE} bản ghi · {data?.pagination.totalItems ?? 0} kết quả</Text>
            <Pressable disabled={(data?.pagination.page ?? 1) <= 1} onPress={() => setPage(value => Math.max(1, value - 1))} style={styles.pageButton}><Text style={styles.bodyText}>Trước</Text></Pressable>
            <Text style={styles.bodyText}>{data?.pagination.page ?? page}/{Math.max(1, data?.pagination.totalPages ?? 1)}</Text>
            <Pressable testID="payroll-page-next" disabled={page >= (data?.pagination.totalPages ?? 1)} onPress={() => setPage(value => value + 1)} style={styles.pageButton}><Text style={styles.bodyText}>Sau</Text></Pressable>
          </View>
        </View>
      </View>

      <EmployeePayrollCreateModal
        visible={createOpen}
        employees={employees}
        onClose={() => setCreateOpen(false)}
        onSubmit={createPayroll}
        hasMore={employeeHasMore}
        onLoadMore={() => void loadEmployees(employeePage + 1)}
      />
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: theme.surfaceCanvas },
  toolbar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, flexWrap: 'wrap' },
  screenTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, minWidth: 240 },
  search: { width: 450, maxWidth: '100%', minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.borderSubtle, borderRadius: 8, color: theme.textPrimary, backgroundColor: theme.surfaceBase },
  toolbarActions: { flexDirection: 'row', gap: 8, marginLeft: 'auto' }, primaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.primary }, primaryText: { color: theme.textInverse, fontWeight: '600' },
  secondaryButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.primary }, secondaryText: { color: theme.primary, fontWeight: '600' }, disabled: { opacity: 0.45 },
  content: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 8 }, filters: { width: 250, padding: 12, gap: 10, backgroundColor: theme.surfaceBase, borderRadius: 8 },
  filtersCompact: { position: 'absolute', zIndex: 3, left: 8, top: 0, borderWidth: 1, borderColor: theme.borderSubtle }, filterHeading: { color: theme.textPrimary, fontWeight: '700', marginTop: 4 },
  selectLike: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: theme.borderSubtle, borderRadius: 7 }, checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: theme.borderSubtle, borderRadius: 4, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: theme.primary, borderColor: theme.primary }, checkmark: { color: theme.textInverse, fontWeight: '700' },
  main: { flex: 1, minWidth: 0, backgroundColor: theme.surfaceBase, borderRadius: 8, overflow: 'hidden' }, table: { minWidth: 1320 }, row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: theme.borderSubtle },
  headerRow: { minHeight: 42, backgroundColor: '#eaf3ff' }, summaryRow: { minHeight: 44, backgroundColor: theme.surfaceSunken }, selectedRow: { backgroundColor: theme.interactiveSecondary },
  cell: { width: 135, paddingHorizontal: 10, color: theme.textPrimary }, codeCell: { width: 120 }, nameCell: { width: 220 }, periodCell: { width: 205 }, moneyCell: { width: 160, paddingHorizontal: 10, color: theme.textPrimary, textAlign: 'right' },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: theme.textPrimary, fontSize: 16, fontWeight: '700' },
  pagination: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: 10 }, pageButton: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: theme.borderSubtle, borderRadius: 6 },
  bodyText: { color: theme.textPrimary }, meta: { color: theme.textSecondary, fontSize: 12 }, error: { color: theme.danger, padding: 10 }
});
