import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { BriefcaseBusiness, Filter, Plus, RefreshCw, Search } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  appendEmployeeCompensationApi, createEmployeeApi, fetchEmployeeApi, fetchEmployeeDepartmentsApi,
  fetchEmployeeJobTitlesApi, fetchEmployeesApi, fetchLinkableUsersApi, saveEmployeeDepartmentApi,
  saveEmployeeJobTitleApi, updateEmployeeApi, uploadEmployeeAvatarApi,
  type EmployeeCompensationInput, type EmployeeDetailDto, type EmployeeFilter, type EmployeeProfileInput,
  type EmployeeListData, type EmployeeReferenceDto, type EmployeeUserDto
} from '../../api/employeeManagement';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, Field, InlineAlert, ScreenHeader } from '../../ui';
import { EmployeeFormModal } from './EmployeeFormModal';
import { formatEmployeeStatus, maskEmployeeNationalId } from './employeeManagementViewModel';

function FilterChoice({ label, selected, testID, onPress }: { label: string; selected: boolean; testID: string; onPress: () => void }) {
  const { theme } = useTheme();
  return <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={styles.filterChoice}>
    <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.borderStrong }]}>{selected && <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />}</View>
    <Text style={{ color: theme.textPrimary }}>{label}</Text>
  </Pressable>;
}

interface FilterSelectProps {
  label: string;
  testPrefix: string;
  value?: number;
  options: EmployeeReferenceDto[];
  onChange: (id: number | undefined) => void;
}

function FilterSelect({ label, testPrefix, value, options, onChange }: FilterSelectProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.id === value);
  return <View style={styles.filterSelect}>
    <Pressable testID={`${testPrefix}-filter`} onPress={() => setOpen(current => !current)} style={[styles.select, { borderColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}>
      <Text style={{ color: selected ? theme.textPrimary : theme.textSecondary }}>{selected?.name || `Chọn ${label.toLowerCase()}`}</Text>
      <Text style={{ color: theme.textSecondary }}>⌄</Text>
    </Pressable>
    {open && <View style={[styles.filterOptions, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
      <Pressable testID={`${testPrefix}-all`} onPress={() => { onChange(undefined); setOpen(false); }} style={styles.filterOption}><Text style={{ color: theme.textSecondary }}>Tất cả</Text></Pressable>
      {options.filter(option => option.isActive).map(option => <Pressable key={option.id} testID={`${testPrefix}-${option.id}`} onPress={() => { onChange(option.id); setOpen(false); }} style={styles.filterOption}>
        <Text style={{ color: theme.textPrimary }}>{option.name}</Text>
      </Pressable>)}
    </View>}
  </View>;
}

type QuickType = 'department' | 'job-title';

export const EmployeeManagementScreen: React.FC = () => {
  const { token } = useAuth();
  const { theme } = useTheme();
  const { employeesRevision } = useRestaurant();
  const { width } = useWindowDimensions();
  const narrow = width < 940;
  const [filter, setFilter] = useState<EmployeeFilter>({ status: 'WORKING', page: 1, pageSize: 30 });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<EmployeeListData | null>(null);
  const [departments, setDepartments] = useState<EmployeeReferenceDto[]>([]);
  const [jobTitles, setJobTitles] = useState<EmployeeReferenceDto[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<EmployeeUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeDetailDto | null>(null);
  const [quickType, setQuickType] = useState<QuickType | null>(null);
  const [quickName, setQuickName] = useState('');
  const [quickError, setQuickError] = useState('');
  const [savingQuick, setSavingQuick] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setError('');
    try {
      const result = await fetchEmployeesApi(token, { ...filter, search: search.trim() || undefined });
      if (currentRequest !== requestId.current) return;
      setData(result);
      if (filter.page && filter.page > result.pagination.totalPages && result.pagination.totalPages > 0) {
        setFilter(current => ({ ...current, page: result.pagination.totalPages }));
      }
    } catch (failure: any) {
      if (currentRequest === requestId.current) setError(failure.message || 'Không thể tải danh sách nhân viên');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [filter, search, token]);

  const loadReferences = useCallback(async () => {
    try {
      const [departmentRows, titleRows] = await Promise.all([fetchEmployeeDepartmentsApi(token), fetchEmployeeJobTitlesApi(token)]);
      setDepartments(departmentRows); setJobTitles(titleRows);
    } catch (failure: any) { setError(failure.message || 'Không thể tải phòng ban và chức danh'); }
  }, [token]);

  useEffect(() => { void load(); }, [load, employeesRevision, revision]);
  useEffect(() => { void loadReferences(); }, [loadReferences, employeesRevision, revision]);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const changeFilter = (patch: Partial<EmployeeFilter>) => setFilter(current => ({ ...current, ...patch, page: 1 }));
  const openCreate = async () => {
    setEditing(null); setFormOpen(true); setError('');
    try { setLinkableUsers(await fetchLinkableUsersApi(token)); } catch { setLinkableUsers([]); }
  };
  const openEdit = async (id: number) => {
    setError('');
    try {
      const [employee, users] = await Promise.all([fetchEmployeeApi(token, id), fetchLinkableUsersApi(token)]);
      setEditing(employee); setLinkableUsers(employee.user && !users.some(user => user.id === employee.user?.id) ? [...users, employee.user] : users); setFormOpen(true);
    } catch (failure: any) { setError(failure.message || 'Không thể tải hồ sơ nhân viên'); }
  };

  const saveEmployee = async (profile: EmployeeProfileInput, compensation?: EmployeeCompensationInput) => {
    if (editing) {
      await updateEmployeeApi(token, editing.id, profile);
      if (compensation) await appendEmployeeCompensationApi(token, editing.id, compensation);
    } else {
      await createEmployeeApi(token, { ...profile, ...(compensation ? { initialCompensation: compensation } : {}) });
    }
    setFormOpen(false); setEditing(null); setRevision(value => value + 1);
  };

  const createDepartment = async (name: string) => {
    const department = await saveEmployeeDepartmentApi(token, null, { name });
    setDepartments(current => [...current, department]);
    return department;
  };
  const createJobTitle = async (name: string) => {
    const jobTitle = await saveEmployeeJobTitleApi(token, null, { name });
    setJobTitles(current => [...current, jobTitle]);
    return jobTitle;
  };

  const saveQuickMaster = async () => {
    if (!quickType || quickName.trim().length < 2 || savingQuick) return;
    setSavingQuick(true); setQuickError('');
    try {
      if (quickType === 'department') {
        const saved = await createDepartment(quickName.trim());
        changeFilter({ departmentId: saved.id });
      } else {
        const saved = await createJobTitle(quickName.trim());
        changeFilter({ jobTitleId: saved.id });
      }
      setQuickType(null); setQuickName('');
    } catch (failure: any) { setQuickError(failure.message || 'Không thể lưu danh mục'); }
    finally { setSavingQuick(false); }
  };

  const filterPanel = <ScrollView style={[styles.filters, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]} contentContainerStyle={styles.filterContent}>
    <Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Trạng thái</Text>
    <FilterChoice testID="employee-filter-working" label="Đang làm việc" selected={filter.status === 'WORKING'} onPress={() => changeFilter({ status: 'WORKING' })} />
    <FilterChoice testID="employee-filter-resigned" label="Đã nghỉ" selected={filter.status === 'RESIGNED'} onPress={() => changeFilter({ status: 'RESIGNED' })} />
    <View style={styles.filterLabelRow}><Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Phòng ban</Text><Pressable accessibilityRole="button" onPress={() => { setQuickType('department'); setQuickName(''); setQuickError(''); }}><Text style={{ color: theme.primary }}>Tạo mới</Text></Pressable></View>
    <FilterSelect label="phòng ban" testPrefix="employee-department" value={filter.departmentId} options={departments} onChange={departmentId => changeFilter({ departmentId })} />
    <View style={styles.filterLabelRow}><Text style={[styles.filterHeading, { color: theme.textPrimary }]}>Chức danh</Text><Pressable accessibilityRole="button" onPress={() => { setQuickType('job-title'); setQuickName(''); setQuickError(''); }}><Text style={{ color: theme.primary }}>Tạo mới</Text></Pressable></View>
    <FilterSelect label="chức danh" testPrefix="employee-job-title" value={filter.jobTitleId} options={jobTitles} onChange={jobTitleId => changeFilter({ jobTitleId })} />
  </ScrollView>;

  const quickCreateModal = <View pointerEvents={quickType ? 'auto' : 'none'} style={[styles.quickOverlay, { display: quickType ? 'flex' : 'none' }]}>
    <View style={[styles.quickDialog, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
      <View style={styles.quickHeading}><Text style={[styles.quickTitle, { color: theme.textPrimary }]}>{quickType === 'department' ? 'Tạo phòng ban' : 'Tạo chức danh'}</Text><Pressable accessibilityLabel="Đóng" onPress={() => setQuickType(null)}><AppIcon icon={BriefcaseBusiness} color={theme.textSecondary} /></Pressable></View>
      <Field label="Tên" value={quickName} onChangeText={setQuickName} />
      {quickError ? <InlineAlert message={quickError} /> : null}
      <View style={styles.quickActions}><Button variant="quiet" label="Bỏ qua" onPress={() => setQuickType(null)} /><Button variant="primary" label="Lưu" loading={savingQuick} disabled={quickName.trim().length < 2} onPress={() => void saveQuickMaster()} /></View>
    </View>
  </View>;

  const columns = [
    { label: 'Mã nhân viên', style: styles.code }, { label: 'Mã chấm công', style: styles.attendance },
    { label: 'Tên nhân viên', style: styles.name }, { label: 'Số điện thoại', style: styles.phone },
    { label: 'Số CMND/CCCD', style: styles.nationalId }, { label: 'Nợ và tạm ứng', style: styles.amount }, { label: 'Ghi chú', style: styles.note }
  ];

  return <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
    <View style={styles.header}>
      <ScreenHeader title="Danh sách nhân viên" description={`${data?.summary.totalCount ?? 0} hồ sơ · Hồ sơ nhân viên không tự tạo tài khoản đăng nhập.`}
        actions={<View style={styles.headerActions}><Button variant="secondary" label="Làm mới" icon={RefreshCw} testID="employee-refresh" onPress={() => setRevision(value => value + 1)} /><Button variant="primary" label="Nhân viên" icon={Plus} testID="employee-add" onPress={() => void openCreate()} /></View>} />
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
          <AppIcon icon={Search} color={theme.textSecondary} size={18} />
          <TextInput accessibilityLabel="Tìm theo mã, tên nhân viên" testID="employee-search" value={searchInput} onChangeText={setSearchInput} placeholder="Tìm theo mã, tên nhân viên" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} />
          {narrow && <Pressable accessibilityLabel="Mở bộ lọc" onPress={() => setFilterOpen(value => !value)}><AppIcon icon={Filter} color={theme.primary} size={18} /></Pressable>}
        </View>
      </View>
    </View>
    <View style={styles.workspace}>
      {(!narrow || filterOpen) && filterPanel}
      <View style={styles.main}>
        {error ? <InlineAlert title="Chưa tải được danh sách" message={error} /> : null}
        <View style={[styles.table, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ minWidth: 1140, flexGrow: 1 }}>
              <View style={[styles.tableHeader, { backgroundColor: theme.interactiveSecondary, borderBottomColor: theme.borderSubtle }]}>
                {columns.map(column => <Text key={column.label} style={[column.style, styles.columnHeading, { color: theme.textPrimary }]}>{column.label}</Text>)}
              </View>
              {loading && !data ? <ActivityIndicator color={theme.primary} style={{ padding: spacing.xxl }} /> : !data?.items.length ? <EmptyState title="Chưa có nhân viên" description="Thêm hồ sơ nhân viên để quản lý thông tin công việc và lương." action={<Button variant="primary" label="Thêm nhân viên" icon={Plus} onPress={() => void openCreate()} />} /> : <ScrollView>
                {data.items.map(employee => <Pressable key={employee.id} testID={`employee-row-${employee.id}`} accessibilityRole="button" accessibilityLabel={`Sửa ${employee.name}`} onPress={() => void openEdit(employee.id)} style={({ pressed }) => [styles.tableRow, { borderBottomColor: theme.borderSubtle, backgroundColor: pressed ? theme.interactiveQuiet : theme.surfaceBase }]}>
                  <Text style={[styles.code, { color: theme.primary }]}>{employee.code}</Text>
                  <Text style={[styles.attendance, { color: theme.textPrimary }]}>{employee.attendanceCode}</Text>
                  <View style={styles.name}><Text style={{ color: theme.textPrimary }}>{employee.name}</Text><Text style={[styles.subline, { color: theme.textSecondary }]}>{employee.department?.name || 'Chưa phân phòng ban'} · {employee.jobTitle?.name || 'Chưa có chức danh'} · {formatEmployeeStatus(employee.status)}</Text></View>
                  <Text style={[styles.phone, { color: theme.textPrimary }]}>{employee.phone || '—'}</Text>
                  <Text style={[styles.nationalId, { color: theme.textPrimary }]}>{maskEmployeeNationalId(employee.nationalId)}</Text>
                  <Text style={[styles.amount, { color: theme.textSecondary }]}>{employee.debtAdvance ?? '—'}</Text>
                  <Text numberOfLines={2} style={[styles.note, { color: theme.textSecondary }]}>{employee.note || '—'}</Text>
                </Pressable>)}
              </ScrollView>}
            </View>
          </ScrollView>
        </View>
        <View style={styles.pagination}>
          <Text style={{ color: theme.textSecondary }}>Trang {filter.page || 1} / {Math.max(data?.pagination.totalPages || 0, 1)} · {data?.pagination.totalRows ?? 0} nhân viên</Text>
          <View style={styles.pager}>
            <Button variant="quiet" label="Trước" disabled={loading || (filter.page || 1) <= 1} onPress={() => setFilter(value => ({ ...value, page: Math.max(1, (value.page || 1) - 1) }))} />
            <Button variant="quiet" label="Sau" disabled={loading || (filter.page || 1) >= (data?.pagination.totalPages || 1)} onPress={() => setFilter(value => ({ ...value, page: (value.page || 1) + 1 }))} />
          </View>
        </View>
      </View>
    </View>
    <EmployeeFormModal visible={formOpen} employee={editing} departments={departments} jobTitles={jobTitles} linkableUsers={linkableUsers}
      onClose={() => { setFormOpen(false); setEditing(null); }} onSave={saveEmployee} onCreateDepartment={createDepartment} onCreateJobTitle={createJobTitle}
      onUploadAvatar={(dataUrl, fileName) => uploadEmployeeAvatarApi(token, dataUrl, fileName)} />
    {quickCreateModal}
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md, padding: spacing.md }, header: { gap: spacing.sm }, headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, searchRow: { flexDirection: 'row' },
  searchBox: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, maxWidth: 480, paddingHorizontal: spacing.md, width: '100%' },
  searchInput: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.md, outlineStyle: 'none' as any },
  workspace: { flex: 1, flexDirection: 'row', gap: spacing.md, minHeight: 0 }, filters: { borderRadius: radii.md, borderWidth: 1, maxWidth: 280, width: 260 },
  filterContent: { gap: spacing.sm, padding: spacing.md }, filterHeading: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, marginTop: spacing.sm },
  filterChoice: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 34 }, radio: { alignItems: 'center', borderRadius: 12, borderWidth: 1, height: 16, justifyContent: 'center', width: 16 }, radioDot: { borderRadius: 6, height: 8, width: 8 },
  filterLabelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  filterSelect: { position: 'relative' }, select: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 40, paddingHorizontal: spacing.md },
  filterOptions: { borderRadius: radii.md, borderWidth: 1, left: 0, maxHeight: 220, position: 'absolute', right: 0, top: 42, zIndex: 20 }, filterOption: { justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing.md },
  main: { flex: 1, minWidth: 0 }, table: { borderRadius: radii.md, borderWidth: 1, flex: 1, minHeight: 160, overflow: 'hidden' },
  tableHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 46, paddingHorizontal: spacing.sm },
  tableRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.sm },
  code: { minWidth: 130, width: 130 }, attendance: { minWidth: 130, width: 130 }, name: { flex: 1, minWidth: 210 }, phone: { minWidth: 145, width: 145 },
  nationalId: { minWidth: 150, width: 150 }, amount: { minWidth: 145, textAlign: 'right', width: 145 }, note: { minWidth: 180, width: 180 },
  columnHeading: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, subline: { fontSize: typography.sizes.xs, marginTop: 3 },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm }, pager: { flexDirection: 'row', gap: spacing.xs },
  quickOverlay: { alignItems: 'center', backgroundColor: 'rgba(12, 24, 40, .38)', bottom: 0, justifyContent: 'center', left: 0, padding: spacing.lg, position: 'absolute', right: 0, top: 0 },
  quickDialog: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, maxWidth: 460, padding: spacing.lg, width: '100%' },
  quickHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, quickTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.lg }, quickActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }
});
