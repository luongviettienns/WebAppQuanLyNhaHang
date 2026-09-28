import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Filter, Plus, Search, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { createCustomerApi, createCustomerGroupApi, CustomerFilter, CustomerGroupDto, CustomerInput, CustomerListData, fetchCustomerGroupsApi, fetchCustomersApi } from '../../api/customers';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, Field, InlineAlert, ScreenHeader } from '../../ui';

const money = new Intl.NumberFormat('vi-VN');
const formatMoney = (value: number) => `${money.format(value)} đ`;

function FilterChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={styles.choice}>
    <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.borderStrong }]}>{selected && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}</View>
    <Text style={{ color: theme.textPrimary, flex: 1 }}>{label}</Text>
  </Pressable>;
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, { backgroundColor: selected ? theme.interactivePrimary : theme.surfaceBase, borderColor: selected ? theme.interactivePrimary : theme.borderSubtle }]}>
    <Text style={{ color: selected ? theme.textInverse : theme.textPrimary, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm }}>{label}</Text>
  </Pressable>;
}

export const CustomerManagementScreen: React.FC = () => {
  const { token } = useAuth();
  const { theme } = useTheme();
  const { customersRevision } = useRestaurant();
  const { width } = useWindowDimensions();
  const narrow = width < 940;
  const [filter, setFilter] = useState<CustomerFilter>({ isActive: 'true', page: 1, pageSize: 30 });
  const [search, setSearch] = useState('');
  const [province, setProvince] = useState('');
  const [createdFrom, setCreatedFrom] = useState(''); const [createdTo, setCreatedTo] = useState('');
  const [birthdayFrom, setBirthdayFrom] = useState(''); const [birthdayTo, setBirthdayTo] = useState('');
  const [salesFrom, setSalesFrom] = useState(''); const [salesTo, setSalesTo] = useState('');
  const [debtFrom, setDebtFrom] = useState(''); const [debtTo, setDebtTo] = useState('');
  const [groups, setGroups] = useState<CustomerGroupDto[]>([]);
  const [data, setData] = useState<CustomerListData | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [revision, setRevision] = useState(0); const [filterOpen, setFilterOpen] = useState(false);
  const [customerFormOpen, setCustomerFormOpen] = useState(false); const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState('');
  const [customerForm, setCustomerForm] = useState<CustomerInput>({ name: '', phone: '', email: '', type: 'INDIVIDUAL', gender: null, birthDate: null, province: '', address: '', groupId: null });
  const [groupCode, setGroupCode] = useState(''); const [groupName, setGroupName] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await fetchCustomersApi(token, filter);
      setData(result);
      if (filter.page && filter.page > result.pagination.totalPages && result.pagination.totalPages > 0) {
        setFilter(current => ({ ...current, page: result.pagination.totalPages }));
      }
    } catch (failure: any) { setError(failure.message || 'Không thể tải danh sách khách hàng'); }
    finally { setLoading(false); }
  }, [filter, token]);

  useEffect(() => { void load(); }, [load, customersRevision, revision]);
  useEffect(() => { let active = true; fetchCustomerGroupsApi(token).then(value => { if (active) setGroups(value); }).catch(() => undefined); return () => { active = false; }; }, [token, revision, customersRevision]);
  useEffect(() => {
    const timer = setTimeout(() => setFilter(current => ({ ...current, search: search.trim() || undefined, page: 1 })), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const changeFilter = (value: Partial<CustomerFilter>) => setFilter(current => ({ ...current, ...value, page: 1 }));
  const amount = (value: string) => value.trim() ? Number(value.replace(/[^0-9]/g, '')) : undefined;
  const applyAdvanced = () => {
    const next: Partial<CustomerFilter> = {
      province: province.trim() || undefined, createdFrom: createdFrom || undefined, createdTo: createdTo || undefined,
      birthDateFrom: birthdayFrom || undefined, birthDateTo: birthdayTo || undefined,
      minSales: amount(salesFrom), maxSales: amount(salesTo), minDebt: amount(debtFrom), maxDebt: amount(debtTo)
    };
    changeFilter(next);
    if (narrow) setFilterOpen(false);
  };

  const saveCustomer = async () => {
    if (saving) return;
    setSaving(true); setFormError('');
    try {
      await createCustomerApi(token, { ...customerForm, name: customerForm.name.trim(), phone: customerForm.phone?.trim() || null, email: customerForm.email?.trim() || null, province: customerForm.province?.trim() || null, address: customerForm.address?.trim() || null, birthDate: customerForm.birthDate || null });
      setCustomerFormOpen(false); setCustomerForm({ name: '', phone: '', email: '', type: 'INDIVIDUAL', gender: null, birthDate: null, province: '', address: '', groupId: null });
      setRevision(value => value + 1);
    } catch (failure: any) { setFormError(failure.message || 'Không thể lưu khách hàng'); }
    finally { setSaving(false); }
  };

  const saveGroup = async () => {
    if (saving) return;
    setSaving(true); setFormError('');
    try {
      await createCustomerGroupApi(token, { code: groupCode.trim().toUpperCase(), name: groupName.trim() });
      setGroupFormOpen(false); setGroupCode(''); setGroupName(''); setRevision(value => value + 1);
    } catch (failure: any) { setFormError(failure.message || 'Không thể lưu nhóm khách hàng'); }
    finally { setSaving(false); }
  };

  const filterPanel = <ScrollView style={[styles.filters, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]} contentContainerStyle={styles.filterContent}>
    <View style={styles.labelRow}><Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Nhóm khách hàng</Text><Pressable accessibilityRole="button" onPress={() => { setFormError(''); setGroupFormOpen(true); }}><Text style={{ color: theme.primary }}>Tạo mới</Text></Pressable></View>
    <FilterChoice label="Tất cả các nhóm" selected={filter.groupId === undefined} onPress={() => changeFilter({ groupId: undefined })} />
    <FilterChoice label="Chưa phân nhóm" selected={filter.groupId === 0} onPress={() => changeFilter({ groupId: 0 })} />
    {groups.map(group => <FilterChoice key={group.id} label={group.name} selected={filter.groupId === group.id} onPress={() => changeFilter({ groupId: group.id })} />)}
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Ngày tạo</Text>
    <Field label="Từ ngày (YYYY-MM-DD)" value={createdFrom} onChangeText={setCreatedFrom} placeholder="Toàn thời gian" />
    <Field label="Đến ngày (YYYY-MM-DD)" value={createdTo} onChangeText={setCreatedTo} placeholder="Toàn thời gian" />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Sinh nhật</Text>
    <Field label="Từ ngày (YYYY-MM-DD)" value={birthdayFrom} onChangeText={setBirthdayFrom} placeholder="Không giới hạn" />
    <Field label="Đến ngày (YYYY-MM-DD)" value={birthdayTo} onChangeText={setBirthdayTo} placeholder="Không giới hạn" />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Tổng bán</Text>
    <Field label="Từ (đ)" value={salesFrom} onChangeText={setSalesFrom} keyboardType="numeric" placeholder="Giá trị" />
    <Field label="Tới (đ)" value={salesTo} onChangeText={setSalesTo} keyboardType="numeric" placeholder="Giá trị" />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Nợ hiện tại</Text>
    <Field label="Từ (đ)" value={debtFrom} onChangeText={setDebtFrom} keyboardType="numeric" placeholder="Giá trị" />
    <Field label="Tới (đ)" value={debtTo} onChangeText={setDebtTo} keyboardType="numeric" placeholder="Giá trị" />
    <Button variant="secondary" label="Áp dụng khoảng lọc" onPress={applyAdvanced} />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Loại khách</Text>
    <View style={styles.chips}><FilterChip label="Tất cả" selected={!filter.type} onPress={() => changeFilter({ type: undefined })} /><FilterChip label="Cá nhân" selected={filter.type === 'INDIVIDUAL'} onPress={() => changeFilter({ type: 'INDIVIDUAL' })} /><FilterChip label="Công ty" selected={filter.type === 'COMPANY'} onPress={() => changeFilter({ type: 'COMPANY' })} /></View>
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Giới tính</Text>
    <View style={styles.chips}><FilterChip label="Tất cả" selected={!filter.gender} onPress={() => changeFilter({ gender: undefined })} /><FilterChip label="Nam" selected={filter.gender === 'MALE'} onPress={() => changeFilter({ gender: 'MALE' })} /><FilterChip label="Nữ" selected={filter.gender === 'FEMALE'} onPress={() => changeFilter({ gender: 'FEMALE' })} /></View>
    <Field label="Khu vực" value={province} onChangeText={setProvince} placeholder="Tỉnh / Thành phố" />
    <Button variant="quiet" label="Áp dụng khu vực" onPress={() => changeFilter({ province: province.trim() || undefined })} />
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Trạng thái</Text>
    {([['all', 'Tất cả'], ['true', 'Đang hoạt động'], ['false', 'Ngừng hoạt động']] as const).map(([value, label]) => <FilterChoice key={value} label={label} selected={filter.isActive === value} onPress={() => changeFilter({ isActive: value })} />)}
    <Button variant="quiet" label="Xóa bộ lọc" onPress={() => { setSearch(''); setProvince(''); setCreatedFrom(''); setCreatedTo(''); setBirthdayFrom(''); setBirthdayTo(''); setSalesFrom(''); setSalesTo(''); setDebtFrom(''); setDebtTo(''); setFilter({ isActive: 'true', page: 1, pageSize: 30 }); }} />
  </ScrollView>;

  const customerModal = <Modal visible={customerFormOpen} transparent animationType="fade" onRequestClose={() => setCustomerFormOpen(false)}>
    <View style={styles.overlay}><ScrollView style={[styles.modal, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]} contentContainerStyle={styles.modalContent}>
      <View style={styles.modalHeading}><Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Thêm khách hàng</Text><Pressable accessibilityLabel="Đóng" onPress={() => setCustomerFormOpen(false)}><AppIcon icon={X} color={theme.textSecondary} /></Pressable></View>
      {formError ? <InlineAlert message={formError} /> : null}
      <Field label="Tên khách hàng *" value={customerForm.name} onChangeText={name => setCustomerForm(value => ({ ...value, name }))} />
      <Field label="Số điện thoại" value={customerForm.phone || ''} onChangeText={phone => setCustomerForm(value => ({ ...value, phone }))} keyboardType="phone-pad" />
      <Field label="Email" value={customerForm.email || ''} onChangeText={email => setCustomerForm(value => ({ ...value, email }))} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Sinh nhật (YYYY-MM-DD)" value={customerForm.birthDate || ''} onChangeText={birthDate => setCustomerForm(value => ({ ...value, birthDate }))} placeholder="1990-04-20" />
      <Field label="Tỉnh / Thành phố" value={customerForm.province || ''} onChangeText={province => setCustomerForm(value => ({ ...value, province }))} />
      <Field label="Địa chỉ" value={customerForm.address || ''} onChangeText={address => setCustomerForm(value => ({ ...value, address }))} />
      <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Loại khách</Text>
      <View style={styles.chips}><FilterChip label="Cá nhân" selected={customerForm.type !== 'COMPANY'} onPress={() => setCustomerForm(value => ({ ...value, type: 'INDIVIDUAL' }))} /><FilterChip label="Công ty" selected={customerForm.type === 'COMPANY'} onPress={() => setCustomerForm(value => ({ ...value, type: 'COMPANY' }))} /></View>
      <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Giới tính</Text>
      <View style={styles.chips}><FilterChip label="Chưa chọn" selected={!customerForm.gender} onPress={() => setCustomerForm(value => ({ ...value, gender: null }))} /><FilterChip label="Nam" selected={customerForm.gender === 'MALE'} onPress={() => setCustomerForm(value => ({ ...value, gender: 'MALE' }))} /><FilterChip label="Nữ" selected={customerForm.gender === 'FEMALE'} onPress={() => setCustomerForm(value => ({ ...value, gender: 'FEMALE' }))} /></View>
      <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Nhóm khách hàng</Text>
      <View style={styles.chips}><FilterChip label="Chưa phân nhóm" selected={!customerForm.groupId} onPress={() => setCustomerForm(value => ({ ...value, groupId: null }))} />{groups.map(group => <FilterChip key={group.id} label={group.name} selected={customerForm.groupId === group.id} onPress={() => setCustomerForm(value => ({ ...value, groupId: group.id }))} />)}</View>
      <View style={styles.modalActions}><Button variant="quiet" label="Đóng" onPress={() => setCustomerFormOpen(false)} /><Button variant="primary" label="Lưu khách hàng" loading={saving} disabled={customerForm.name.trim().length < 2} onPress={() => void saveCustomer()} /></View>
    </ScrollView></View>
  </Modal>;

  const groupModal = <Modal visible={groupFormOpen} transparent animationType="fade" onRequestClose={() => setGroupFormOpen(false)}>
    <View style={styles.overlay}><View style={[styles.groupModal, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
      <View style={styles.modalHeading}><Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Tạo nhóm khách hàng</Text><Pressable accessibilityLabel="Đóng" onPress={() => setGroupFormOpen(false)}><AppIcon icon={X} color={theme.textSecondary} /></Pressable></View>
      {formError ? <InlineAlert message={formError} /> : null}<Field label="Mã nhóm *" value={groupCode} onChangeText={setGroupCode} autoCapitalize="characters" /><Field label="Tên nhóm *" value={groupName} onChangeText={setGroupName} />
      <View style={styles.modalActions}><Button variant="quiet" label="Đóng" onPress={() => setGroupFormOpen(false)} /><Button variant="primary" label="Lưu nhóm" loading={saving} disabled={groupCode.trim().length < 2 || groupName.trim().length < 2} onPress={() => void saveGroup()} /></View>
    </View></View>
  </Modal>;

  return <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
    <View style={styles.header}>
      <ScreenHeader title="Khách hàng" description="Thông tin, nhóm khách và lịch sử giá trị mua hàng." actions={<Button variant="primary" label="Khách hàng mới" icon={Plus} onPress={() => { setFormError(''); setCustomerFormOpen(true); }} />} />
      <View style={[styles.searchBox, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}><AppIcon icon={Search} color={theme.textSecondary} size={18} /><TextInput accessibilityLabel="Tìm theo mã, tên, số điện thoại" value={search} onChangeText={setSearch} placeholder="Theo mã, tên, số điện thoại" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} /><Pressable accessibilityRole="button" accessibilityLabel="Mở bộ lọc" onPress={() => setFilterOpen(value => !value)}><AppIcon icon={Filter} color={theme.primary} size={18} /></Pressable></View>
    </View>
    <View style={styles.workspace}>
      {(!narrow || filterOpen) && filterPanel}
      <View style={styles.main}>
        {error ? <InlineAlert title="Chưa tải được danh sách" message={error} /> : null}
        <ScrollView horizontal style={[styles.table, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ minWidth: 1040, flexGrow: 1 }}>
            <View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.borderSubtle }]}>
              <Text style={[styles.code, styles.heading, { color: theme.textPrimary }]}>Mã khách hàng</Text><Text style={[styles.name, styles.heading, { color: theme.textPrimary }]}>Tên khách hàng</Text><Text style={[styles.phone, styles.heading, { color: theme.textPrimary }]}>Điện thoại</Text><Text style={[styles.amount, styles.heading, { color: theme.textPrimary }]}>Nợ hiện tại</Text><Text style={[styles.amount, styles.heading, { color: theme.textPrimary }]}>Tổng bán</Text><Text style={[styles.netSales, styles.heading, { color: theme.textPrimary }]}>Tổng bán trừ trả hàng</Text><Text style={[styles.lastSale, styles.heading, { color: theme.textPrimary }]}>Giao dịch cuối</Text>
            </View>
            <View style={[styles.tableRow, styles.summaryRow, { borderBottomColor: theme.borderSubtle }]}><Text style={[styles.code, { color: theme.textSecondary }]}>Tổng {data?.pagination.totalRows || 0} khách hàng</Text><Text style={styles.name} /><Text style={styles.phone} /><Text style={[styles.amount, styles.total, { color: theme.textPrimary }]}>{formatMoney(data?.summary.outstandingDebt ?? 0)}</Text><Text style={[styles.amount, styles.total, { color: theme.textPrimary }]}>{formatMoney(data?.summary.totalSales ?? 0)}</Text><Text style={[styles.netSales, styles.total, { color: theme.textPrimary }]}>{formatMoney(data?.summary.netSales ?? 0)}</Text><Text style={styles.lastSale} /></View>
            {loading ? <ActivityIndicator style={{ padding: 48 }} color={theme.primary} /> : !data?.items.length ? <EmptyState title="Chưa có khách hàng phù hợp" description="Thay đổi bộ lọc hoặc thêm khách hàng để bắt đầu lưu lịch sử mua hàng." action={<Button variant="primary" label="Thêm khách hàng" icon={Plus} onPress={() => setCustomerFormOpen(true)} />} /> : <ScrollView>
              {data.items.map(customer => <View key={customer.id} style={[styles.tableRow, { borderBottomColor: theme.borderSubtle }]}>
                <Text style={[styles.code, { color: theme.primary }]}>{customer.code}</Text><View style={styles.name}><Text style={{ color: theme.textPrimary }}>{customer.name}</Text><Text style={{ color: theme.textSecondary, fontSize: 12 }}>{customer.group?.name || (customer.type === 'COMPANY' ? 'Công ty' : 'Cá nhân')}{!customer.isActive ? ' · Ngừng hoạt động' : ''}</Text></View><Text style={[styles.phone, { color: theme.textPrimary }]}>{customer.phone || '—'}</Text><Text style={[styles.amount, { color: theme.textPrimary }]}>{formatMoney(customer.outstandingDebt)}</Text><Text style={[styles.amount, { color: theme.textPrimary }]}>{formatMoney(customer.totalSales)}</Text><Text style={[styles.netSales, { color: theme.textPrimary }]}>{formatMoney(customer.netSales)}</Text><Text style={[styles.lastSale, { color: theme.textSecondary }]}>{customer.lastTransactionAt ? new Date(customer.lastTransactionAt).toLocaleDateString('vi-VN') : '—'}</Text>
              </View>)}
            </ScrollView>}
          </View>
        </ScrollView>
        <View style={styles.pagination}><Text style={{ color: theme.textSecondary }}>Trang {filter.page || 1}/{data?.pagination.totalPages || 1}</Text><View style={styles.pager}><Button variant="quiet" label="Trước" disabled={loading || (filter.page || 1) <= 1} onPress={() => setFilter(value => ({ ...value, page: Math.max(1, (value.page || 1) - 1) }))} /><Button variant="quiet" label="Sau" disabled={loading || (filter.page || 1) >= (data?.pagination.totalPages || 1)} onPress={() => setFilter(value => ({ ...value, page: (value.page || 1) + 1 }))} /></View></View>
      </View>
    </View>
    {customerModal}{groupModal}
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md, padding: spacing.md }, header: { gap: spacing.sm }, workspace: { flex: 1, flexDirection: 'row', gap: spacing.md, minHeight: 0 },
  filters: { borderRadius: radii.md, borderWidth: 1, maxWidth: 280, width: 260 }, filterContent: { gap: spacing.sm, padding: spacing.md }, filterHeading: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, marginTop: spacing.sm },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, choice: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 32 }, radio: { alignItems: 'center', borderRadius: 12, borderWidth: 1, height: 16, justifyContent: 'center', width: 16 }, radioDot: { borderRadius: 6, height: 8, width: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, chip: { borderRadius: 18, borderWidth: 1, minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.md },
  main: { flex: 1, minWidth: 0 }, searchBox: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md, width: 430, maxWidth: '100%' }, searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, outlineStyle: 'none' as any }, table: { borderRadius: radii.md, borderWidth: 1, flex: 1, maxHeight: '100%' }, tableHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 46, paddingHorizontal: spacing.sm }, tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: spacing.sm }, summaryRow: { minHeight: 40 }, code: { flex: 1.0, minWidth: 125 }, name: { flex: 2, minWidth: 190 }, phone: { flex: 1.1, minWidth: 140 }, amount: { flex: 1, minWidth: 120, textAlign: 'right' }, netSales: { flex: 1.35, minWidth: 170, textAlign: 'right' }, lastSale: { flex: 1, minWidth: 120, textAlign: 'center' }, heading: { fontFamily: typography.families.bodySemibold }, total: { fontFamily: typography.families.bodyBold }, pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm }, pager: { flexDirection: 'row', gap: spacing.xs },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(20,20,20,.55)', flex: 1, justifyContent: 'center', padding: spacing.lg }, modal: { borderRadius: radii.lg, borderWidth: 1, maxHeight: '90%', maxWidth: 620, width: '100%' }, modalContent: { gap: spacing.md, padding: spacing.lg }, groupModal: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, maxWidth: 460, padding: spacing.lg, width: '100%' }, modalHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, modalTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl }, fieldLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }
});
