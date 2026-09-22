import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Check, ChevronDown, Download, Filter, Plus, RefreshCw, Search, SlidersHorizontal, Upload } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { AppIcon, Button, EmptyState, Field, InlineAlert } from '../../ui';
import { radii, spacing, typography } from '../../theme';
import type { SupplierDto, SupplierListDataDto } from '../../api/contracts';
import { downloadSuppliersApi, fetchSupplierGroupsApi, fetchSuppliersApi, saveSupplierGroupApi, SupplierGroupDto, SupplierListFilter } from '../../api/suppliers';
import { SupplierFormModal } from './SupplierFormModal';
import { SupplierDetailModal } from './SupplierDetailModal';
import { SupplierImportModal } from './SupplierImportModal';
import { SupplierModalShell } from './SupplierModalShell';
import { SupplierFilterFields, supplierFilterInput, supplierMoney } from './supplierViewModel';
import { requireSupplierFileSupport, saveSupplierFile } from './supplierFiles';

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={styles.choice}>
    <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.borderStrong }]}>{selected && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}</View>
    <Text style={{ color: theme.textPrimary, flex: 1 }}>{label}</Text>
  </Pressable>;
}

export function SupplierListScreen({ onOpenReceipt }: { onOpenReceipt: (id: number) => void }) {
  const { theme } = useTheme(); const { token } = useAuth(); const { inventoryRevision } = useRestaurant();
  const { width } = useWindowDimensions(); const narrow = width < 900;
  const [tableAvailableWidth, setTableAvailableWidth] = useState(0);
  const [filter, setFilter] = useState<SupplierListFilter>({ isActive: 'true', page: 1, pageSize: 50 });
  const [search, setSearch] = useState(''); const [fields, setFields] = useState<SupplierFilterFields>({});
  const [data, setData] = useState<SupplierListDataDto | null>(null); const [groups, setGroups] = useState<SupplierGroupDto[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [revision, setRevision] = useState(0);
  const [showFilters, setShowFilters] = useState(false); const [showGroups, setShowGroups] = useState(false);
  const [form, setForm] = useState<{ supplier?: SupplierDto } | null>(null); const [detailId, setDetailId] = useState<number | null>(null); const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]); const [exporting, setExporting] = useState(false); const [exportOpen, setExportOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false); const [showEmail, setShowEmail] = useState(true); const [showPhone, setShowPhone] = useState(true);
  const [groupEditor, setGroupEditor] = useState<{ id: number | null; name: string } | null>(null); const [groupSaving, setGroupSaving] = useState(false); const [groupError, setGroupError] = useState('');
  const refresh = () => setRevision(value => value + 1);
  const patch = (value: Partial<SupplierListFilter>) => setFilter(current => ({ ...current, ...value, page: 1 }));
  useEffect(() => {
    const timeout = setTimeout(() => setFilter(current => ({ ...current, search: search.trim() || undefined, page: 1 })), 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setSelected([]);
    Promise.all([fetchSuppliersApi(token, filter), fetchSupplierGroupsApi(token)]).then(([result, groupData]) => {
      if (!active) return;
      if ((filter.page || 1) > result.pagination.totalPages) { setFilter(current => ({ ...current, page: result.pagination.totalPages })); return; }
      setData(result); setGroups(groupData);
    }).catch((failure: Error) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filter, inventoryRevision, revision, token]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const changeSelected = (id: number) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const allSelected = !!data?.items.length && data.items.every(item => selectedSet.has(item.id));
  const applyFilters = () => {
    try {
      const validated = supplierFilterInput(fields);
      setError(''); setFilter(current => ({ search: current.search, isActive: current.isActive, groupId: current.groupId, pageSize: current.pageSize, ...validated, page: 1 }));
      if (narrow) setShowFilters(false);
    } catch (failure: any) { setError(failure.message); }
  };
  const exportFile = async (format: 'csv' | 'xlsx') => {
    if (exporting) return;
    setExporting(true); setExportOpen(false); setError('');
    try { requireSupplierFileSupport(); saveSupplierFile(await downloadSuppliersApi(token, { ...filter, ...(selected.length ? { ids: selected } : {}) }, format), 'Nha_cung_cap.' + format); }
    catch (failure: any) { setError(failure.message); }
    finally { setExporting(false); }
  };
  const saveGroup = async () => {
    if (!groupEditor || groupSaving) return;
    setGroupSaving(true); setGroupError('');
    try { await saveSupplierGroupApi(token, groupEditor.id, groupEditor.name); setGroupEditor(null); refresh(); }
    catch (failure: any) { setGroupError(failure.message); }
    finally { setGroupSaving(false); }
  };
  const filterField = (key: keyof SupplierFilterFields, label: string, date = false) => <Field label={label} value={fields[key] || ''} onChangeText={value => setFields(current => ({ ...current, [key]: value }))} placeholder={date ? 'YYYY-MM-DD' : 'Nhập giá trị'} keyboardType={date ? 'default' : 'number-pad'} maxLength={date ? 10 : 15} />;
  const checkbox = (checked: boolean, onPress: () => void, label: string) => <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onPress} style={styles.checkHit}><View style={[styles.check, { borderColor: checked ? theme.primary : theme.borderStrong, backgroundColor: checked ? theme.primary : theme.surfaceBase }]}>{checked && <AppIcon icon={Check} size={14} color="#fff" />}</View></Pressable>;
  const tableWidth = Math.max(tableAvailableWidth, 604 + (showPhone ? 125 : 0) + (showEmail ? 165 : 0));
  return <View style={[styles.root, { backgroundColor: theme.surfaceCanvas }]}>
    <View style={styles.toolbar}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Nhà cung cấp</Text>
      <View style={[styles.search, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}><AppIcon icon={Search} color={theme.textSecondary} size={18} /><TextInput accessibilityLabel="Tìm nhà cung cấp" value={search} onChangeText={setSearch} placeholder="Theo mã, tên, số điện thoại" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} /></View>
      <View style={styles.actions}>
        {narrow && <Button variant="secondary" label="Bộ lọc" icon={Filter} onPress={() => setShowFilters(!showFilters)} />}
        <Button variant="primary" label="Nhà cung cấp" icon={Plus} onPress={() => setForm({})} />
        <Button variant="secondary" label="Import" icon={Upload} onPress={() => setImporting(true)} />
        <Button variant="secondary" label={selected.length ? 'Xuất ' + selected.length + ' NCC' : 'Xuất file'} icon={Download} onPress={() => setExportOpen(!exportOpen)} loading={exporting} disabled={loading || !!error} />
        <Pressable accessibilityRole="button" accessibilityLabel="Chọn cột hiển thị" onPress={() => setColumnsOpen(!columnsOpen)} style={styles.iconButton}><AppIcon icon={SlidersHorizontal} color={theme.textSecondary} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Tải lại danh sách" onPress={refresh} style={styles.iconButton}><AppIcon icon={RefreshCw} color={theme.textSecondary} /></Pressable>
      </View>
    </View>
    {exportOpen && <View style={styles.subActions}><Button variant="secondary" label="Excel (.xlsx)" onPress={() => { void exportFile('xlsx'); }} /><Button variant="secondary" label="CSV" onPress={() => { void exportFile('csv'); }} /></View>}
    {columnsOpen && <View style={styles.subActions}>{checkbox(showPhone, () => setShowPhone(!showPhone), 'Hiện điện thoại')}<Text style={{ color: theme.textPrimary, alignSelf: 'center' }}>Điện thoại</Text>{checkbox(showEmail, () => setShowEmail(!showEmail), 'Hiện email')}<Text style={{ color: theme.textPrimary, alignSelf: 'center' }}>Email</Text></View>}
    {!!error && <InlineAlert message={error} />}{!!success && <InlineAlert tone="success" message={success} />}
    <View style={[styles.content, narrow && { flexDirection: 'column' }]}>
      {(!narrow || showFilters) && <ScrollView testID="supplier-filters" style={[styles.sidebar, { backgroundColor: theme.surfaceBase }, narrow && { width: '100%', maxHeight: 430 }]} contentContainerStyle={styles.filterBody}>
        <View style={styles.labelRow}><Text style={[styles.label, { color: theme.textPrimary }]}>Nhóm NCC</Text><Pressable accessibilityRole="button" onPress={() => { setGroupError(''); setGroupEditor({ id: null, name: '' }); }} style={styles.linkHit}><Text style={{ color: theme.primary }}>Tạo mới</Text></Pressable></View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showGroups }} onPress={() => setShowGroups(!showGroups)} style={[styles.select, { borderColor: theme.borderSubtle }]}><Text style={{ color: theme.textPrimary, flex: 1 }}>{filter.groupId === undefined ? 'Tất cả các nhóm' : filter.groupId === 0 ? 'Chưa phân nhóm' : groups.find(group => group.id === filter.groupId)?.name || 'Nhóm đã chọn'}</Text><AppIcon icon={ChevronDown} color={theme.textSecondary} /></Pressable>
        {showGroups && <View>
          <Choice label="Tất cả các nhóm" selected={filter.groupId === undefined} onPress={() => patch({ groupId: undefined })} />
          <Choice label="Chưa phân nhóm" selected={filter.groupId === 0} onPress={() => patch({ groupId: 0 })} />
          {groups.map(group => <View key={group.id} style={styles.labelRow}><View style={{ flex: 1 }}><Choice label={group.name} selected={filter.groupId === group.id} onPress={() => patch({ groupId: group.id })} /></View><Pressable accessibilityRole="button" accessibilityLabel={'Sửa nhóm ' + group.name} onPress={() => { setGroupError(''); setGroupEditor(group); }} style={styles.linkHit}><Text style={{ color: theme.primary }}>Sửa</Text></Pressable></View>)}
        </View>}
        <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Tổng mua</Text>
        {filterField('minPurchase', 'Từ (đ)')}{filterField('maxPurchase', 'Tới (đ)')}
        <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Thời gian mua</Text>
        <Choice label="Toàn thời gian" selected={!fields.from && !fields.to} onPress={() => setFields(current => ({ ...current, from: '', to: '' }))} />
        {filterField('from', 'Từ ngày', true)}{filterField('to', 'Đến ngày', true)}
        <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Còn phải trả theo phiếu nhập</Text>
        {filterField('minDebt', 'Từ (đ)')}{filterField('maxDebt', 'Tới (đ)')}
        <Button variant="secondary" label="Áp dụng bộ lọc" onPress={applyFilters} />
        <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Trạng thái</Text>
        {([['all', 'Tất cả'], ['true', 'Đang hoạt động'], ['false', 'Ngừng hoạt động']] as const).map(([value, label]) => <Choice key={value} label={label} selected={filter.isActive === value} onPress={() => patch({ isActive: value })} />)}
        <Button variant="quiet" label="Xóa bộ lọc" onPress={() => { setSearch(''); setFields({}); setFilter({ isActive: 'true', page: 1, pageSize: 50 }); }} />
      </ScrollView>}
      <View style={styles.main} onLayout={event => setTableAvailableWidth(event.nativeEvent.layout.width)}>
        <ScrollView testID="supplier-table" horizontal style={[styles.table, { backgroundColor: theme.surfaceBase }]} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ width: tableWidth, flexGrow: 1 }}>
            <View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.primary }]}>
              {checkbox(allSelected, () => setSelected(allSelected ? [] : data?.items.map(item => item.id) || []), 'Chọn tất cả trên trang')}
              <Text style={[styles.code, styles.heading, { color: theme.textPrimary }]}>Mã nhà cung cấp</Text><Text style={[styles.name, styles.heading, { color: theme.textPrimary }]}>Tên nhà cung cấp</Text>
              {showPhone && <Text style={[styles.phone, styles.heading, { color: theme.textPrimary }]}>Điện thoại</Text>}{showEmail && <Text style={[styles.email, styles.heading, { color: theme.textPrimary }]}>Email</Text>}
              <Text style={[styles.amount, styles.heading, { color: theme.textPrimary }]}>Còn phải trả</Text><Text style={[styles.amount, styles.heading, { color: theme.textPrimary }]}>Tổng mua</Text>
            </View>
            {loading ? <ActivityIndicator style={{ padding: 48 }} color={theme.primary} /> : error ? <EmptyState title="Chưa tải được danh sách" description="Kiểm tra bộ lọc hoặc thử tải lại." action={<Button variant="secondary" label="Tải lại" onPress={refresh} />} /> : <>
              <View style={[styles.tableRow, { borderBottomColor: theme.borderSubtle }]}><Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Tổng {data?.pagination.totalRows || 0} nhà cung cấp</Text><Text style={[styles.amount, styles.total, { color: theme.textPrimary }]}>{supplierMoney(data?.summary?.outstandingAmount)}</Text><Text style={[styles.amount, styles.total, { color: theme.textPrimary }]}>{supplierMoney(data?.summary?.totalPurchase)}</Text></View>
              <ScrollView>
                {!data?.items.length && <EmptyState title="Chưa có nhà cung cấp phù hợp" description="Thêm nhà cung cấp mới hoặc thay đổi bộ lọc để xem dữ liệu." action={<Button variant="primary" label="Thêm nhà cung cấp" icon={Plus} onPress={() => setForm({})} />} />}
                {data?.items.map(item => <View key={item.id} style={[styles.tableRow, { borderBottomColor: theme.borderSubtle, backgroundColor: selectedSet.has(item.id) ? theme.interactiveSecondary : theme.surfaceBase }]}>
                  {checkbox(selectedSet.has(item.id), () => changeSelected(item.id), 'Chọn ' + item.name)}
                  <Pressable accessibilityRole="button" onPress={() => setDetailId(item.id)} style={styles.code}><Text style={{ color: theme.primary }}>{item.code}</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setDetailId(item.id)} style={styles.name}><Text style={{ color: theme.textPrimary }}>{item.name}</Text>{!item.isActive && <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Ngừng hoạt động</Text>}</Pressable>
                  {showPhone && <Text style={[styles.phone, { color: theme.textPrimary }]}>{item.phone || '—'}</Text>}{showEmail && <Text numberOfLines={1} style={[styles.email, { color: theme.textPrimary }]}>{item.email || '—'}</Text>}
                  <Text style={[styles.amount, { color: theme.textPrimary }]}>{supplierMoney(item.outstandingAmount)}</Text><Text style={[styles.amount, { color: theme.textPrimary }]}>{supplierMoney(item.totalPurchase)}</Text>
                </View>)}
              </ScrollView>
            </>}
          </View>
        </ScrollView>
        <Text style={[styles.explanation, { color: theme.textSecondary }]}>Còn phải trả: theo phiếu nhập đã hoàn thành, toàn thời gian; chưa gồm thanh toán hoặc trả hàng ngoài phiếu. Đơn vị: VND.</Text>
        <View style={styles.pagination}><Text style={{ color: theme.textSecondary }}>Trang {filter.page || 1}/{data?.pagination.totalPages || 1}</Text><Button variant="quiet" label="Trước" disabled={loading || (filter.page || 1) <= 1} onPress={() => setFilter(current => ({ ...current, page: (current.page || 1) - 1 }))} /><Button variant="quiet" label="Sau" disabled={loading || (filter.page || 1) >= (data?.pagination.totalPages || 1)} onPress={() => setFilter(current => ({ ...current, page: (current.page || 1) + 1 }))} /></View>
      </View>
    </View>
    {form && <SupplierFormModal visible supplier={form.supplier} onClose={() => setForm(null)} onSaved={supplier => { setForm(null); setSuccess('Đã lưu ' + supplier.name); refresh(); }} />}
    {detailId !== null && <SupplierDetailModal id={detailId} onClose={() => setDetailId(null)} onEdit={supplier => { setDetailId(null); setForm({ supplier }); }} onOpenReceipt={onOpenReceipt} />}
    {importing && <SupplierImportModal onClose={() => setImporting(false)} onImported={count => { setImporting(false); setSuccess('Đã nhập ' + count + ' nhà cung cấp'); refresh(); }} />}
    {groupEditor && <SupplierModalShell visible title={groupEditor.id ? 'Sửa nhóm nhà cung cấp' : 'Thêm nhóm nhà cung cấp'} busy={groupSaving} onClose={() => setGroupEditor(null)} footer={<><Button variant="quiet" label="Bỏ qua" disabled={groupSaving} onPress={() => setGroupEditor(null)} /><Button variant="primary" label="Lưu" loading={groupSaving} disabled={groupEditor.name.trim().length < 2} onPress={saveGroup} /></>}>
      {!!groupError && <InlineAlert message={groupError} />}<Field label="Tên nhóm *" value={groupEditor.name} maxLength={100} editable={!groupSaving} onChangeText={name => setGroupEditor(current => current ? { ...current, name } : null)} />
    </SupplierModalShell>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, gap: spacing.sm, padding: spacing.md }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: typography.families.bodySemibold, fontSize: 21, minWidth: 235 }, search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12, minHeight: 44, flex: 1, minWidth: 230, maxWidth: 500 }, searchInput: { flex: 1, minHeight: 42, fontFamily: typography.families.body, fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%', gap: 8, marginLeft: 'auto' }, iconButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, subActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  content: { flex: 1, flexDirection: 'row', gap: spacing.md, minHeight: 0 }, sidebar: { width: 250, flexGrow: 0, flexShrink: 0, borderRadius: radii.lg }, filterBody: { padding: spacing.md, gap: spacing.sm }, labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, label: { fontFamily: typography.families.bodySemibold, fontSize: 15 }, filterHeading: { fontFamily: typography.families.bodySemibold, marginTop: spacing.md, fontSize: 14 }, linkHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  select: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderRadius: radii.md }, choice: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, radio: { width: 17, height: 17, borderWidth: 1.5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, dot: { width: 9, height: 9, borderRadius: 5 },
  main: { flex: 1, minWidth: 0 }, table: { flex: 1, borderRadius: radii.lg }, tableHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, minHeight: 52 }, tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, minHeight: 52 }, heading: { fontFamily: typography.families.bodySemibold, fontSize: 12 }, checkHit: { width: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, check: { width: 17, height: 17, borderWidth: 1, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  code: { width: 130, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center', textAlignVertical: 'center' }, name: { flex: 1, minWidth: 170, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center', textAlignVertical: 'center' }, phone: { width: 125, paddingHorizontal: 8 }, email: { width: 165, paddingHorizontal: 8 }, amount: { width: 130, paddingHorizontal: 12, textAlign: 'right' }, totalLabel: { flex: 1, paddingHorizontal: 16 }, total: { fontFamily: typography.families.bodySemibold },
  explanation: { fontSize: 12, lineHeight: 18, paddingTop: 12 }, pagination: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingVertical: 4 }
});
