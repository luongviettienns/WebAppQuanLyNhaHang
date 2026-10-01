import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Camera, ChevronDown, ChevronUp, UserRound, X } from 'lucide-react-native';
import type {
  EmployeeCompensationInput, EmployeeDetailDto, EmployeeGender, EmployeePayBasis,
  EmployeeProfileInput, EmployeeReferenceDto, EmployeeStatus, EmployeeUserDto
} from '../../api/employeeManagement';
import { resolveImageUrl } from '../../api/config';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, Field, InlineAlert } from '../../ui';

type ProfileValues = EmployeeProfileInput;
type FormTab = 'information' | 'salary';
type SectionName = 'work' | 'bank' | 'personal';

interface EmployeeFormModalProps {
  visible: boolean;
  employee?: EmployeeDetailDto | null;
  departments: EmployeeReferenceDto[];
  jobTitles: EmployeeReferenceDto[];
  linkableUsers: EmployeeUserDto[];
  onClose: () => void;
  onSave: (profile: EmployeeProfileInput, compensation?: EmployeeCompensationInput) => Promise<void>;
  onCreateDepartment: (name: string) => Promise<EmployeeReferenceDto>;
  onCreateJobTitle: (name: string) => Promise<EmployeeReferenceDto>;
  onStatusChange: (status: EmployeeStatus, endDate?: string) => Promise<void>;
  onSearchUsers: (search: string) => Promise<void>;
  onUploadAvatar: (dataUrl: string, fileName: string) => Promise<{ avatarUrl: string; fileName: string }>;
}

const emptyValues: ProfileValues = { name: '', phone: '', userId: null, departmentId: null, jobTitleId: null, gender: null };
const payBasisLabels: Record<EmployeePayBasis, string> = { MONTHLY: 'Theo tháng', HOURLY: 'Theo giờ', PER_SHIFT: 'Theo ca' };

const toIsoDate = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
  }
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!parts) return null;
  const [, day, month, year] = parts;
  const candidate = `${year}-${month}-${day}`;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
};

function dateText(value?: string | null) {
  if (!value) return '';
  const date = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return '';
}

function ChoiceChip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const { theme } = useTheme();
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[styles.choiceChip, { backgroundColor: selected ? theme.interactivePrimary : theme.surfaceBase, borderColor: selected ? theme.interactivePrimary : theme.borderSubtle }]}>
    <Text style={{ color: selected ? theme.textInverse : theme.textPrimary }}>{label}</Text>
  </Pressable>;
}

interface ReferencePickerProps {
  label: string;
  selectedId: number | null | undefined;
  options: EmployeeReferenceDto[];
  testPrefix: string;
  onSelect: (id: number | null) => void;
  onCreate: (name: string) => Promise<EmployeeReferenceDto>;
}

function ReferencePicker({ label, selectedId, options, testPrefix, onSelect, onCreate }: ReferencePickerProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const selected = options.find(option => option.id === selectedId);
  const create = async () => {
    if (creating || newName.trim().length < 2) return;
    setCreating(true); setError('');
    try {
      const created = await onCreate(newName.trim());
      onSelect(created.id); setNewName(''); setOpen(false);
    } catch (failure: any) { setError(failure.message || `Không thể tạo ${label.toLowerCase()}`); }
    finally { setCreating(false); }
  };
  return <View style={styles.picker}>
    <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>{label}</Text>
    <Pressable testID={`${testPrefix}-filter`} onPress={() => setOpen(value => !value)} style={[styles.select, { borderColor: open ? theme.primary : theme.borderSubtle, backgroundColor: theme.surfaceBase }]}>
      <Text style={{ color: selected ? theme.textPrimary : theme.textSecondary }}>{selected?.name || `Chọn ${label.toLowerCase()}`}</Text>
      <AppIcon icon={open ? ChevronUp : ChevronDown} color={theme.textSecondary} size={16} />
    </Pressable>
    {open && <View style={[styles.optionList, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
      <Pressable testID={`${testPrefix}-none`} onPress={() => { onSelect(null); setOpen(false); }} style={styles.option}><Text style={{ color: theme.textSecondary }}>Chưa phân {label.toLowerCase()}</Text></Pressable>
      {options.filter(option => option.isActive).map(option => <Pressable key={option.id} testID={`${testPrefix}-option-${option.id}`} onPress={() => { onSelect(option.id); setOpen(false); }} style={styles.option}>
        <Text style={{ color: theme.textPrimary }}>{option.name}</Text>
      </Pressable>)}
      <View style={[styles.quickCreate, { borderTopColor: theme.borderSubtle }]}>
        <Field label={`Tạo ${label.toLowerCase()}`} testID={`${testPrefix}-new-name`} value={newName} onChangeText={setNewName} />
        {error ? <InlineAlert message={error} /> : null}
        <Button variant="quiet" testID={`${testPrefix}-create`} label={`+ Tạo ${label.toLowerCase()}`} loading={creating} disabled={newName.trim().length < 2} onPress={() => void create()} />
      </View>
    </View>}
  </View>;
}

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  visible, employee = null, departments, jobTitles, linkableUsers, onClose, onSave,
  onCreateDepartment, onCreateJobTitle, onStatusChange, onSearchUsers, onUploadAvatar
}) => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [tab, setTab] = useState<FormTab>('information');
  const [values, setValues] = useState<ProfileValues>(emptyValues);
  const [expanded, setExpanded] = useState<Record<SectionName, boolean>>({ work: false, bank: false, personal: false });
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [salaryBasis, setSalaryBasis] = useState<EmployeePayBasis>('MONTHLY');
  const [salaryRate, setSalaryRate] = useState('');
  const [salaryDate, setSalaryDate] = useState('');
  const [salaryNote, setSalaryNote] = useState('');
  const [salaryDirty, setSalaryDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EmployeeStatus | null>(null);
  const [pendingEndDate, setPendingEndDate] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; salaryDate?: string }>({});

  useEffect(() => {
    if (!visible) return;
    const compensation = employee?.compensations?.[employee.compensations.length - 1];
    setTab('information'); setError(''); setFieldErrors({}); setAccountOpen(false); setAccountSearch(''); setPendingStatus(null); setPendingEndDate('');
    setExpanded({ work: false, bank: false, personal: false });
    setValues(employee ? {
      name: employee.name, phone: employee.phone, userId: employee.userId, avatarUrl: employee.avatarUrl,
      departmentId: employee.departmentId, jobTitleId: employee.jobTitleId, startDate: dateText(employee.startDate),
      note: employee.note, nationalId: employee.nationalId, birthDate: dateText(employee.birthDate), gender: employee.gender,
      address: employee.address, province: employee.province, ward: employee.ward, email: employee.email,
      facebook: employee.facebook, bankName: employee.bankName, bankAccountNumber: employee.bankAccountNumber,
      bankAccountName: employee.bankAccountName
    } : emptyValues);
    setSalaryBasis(compensation?.payBasis || 'MONTHLY');
    setSalaryRate(compensation ? String(compensation.baseRate) : '');
    setSalaryDate(compensation ? dateText(compensation.effectiveFrom) : '');
    setSalaryNote(compensation?.note || '');
    setSalaryDirty(false);
  }, [employee, visible]);

  useEffect(() => {
    if (!visible || !accountOpen) return;
    const timer = setTimeout(() => {
      void onSearchUsers(accountSearch.trim()).catch((failure: any) => setError(failure.message || 'Không thể tìm tài khoản'));
    }, 250);
    return () => clearTimeout(timer);
  }, [accountOpen, accountSearch, onSearchUsers, visible]);

  const update = (patch: Partial<ProfileValues>) => setValues(current => ({ ...current, ...patch }));
  const validPhone = (value: string) => /^[+\d\s().-]+$/.test(value.trim()) && value.replace(/\D/g, '').length >= 7;
  const rateNumber = Number(salaryRate.replace(/[^0-9]/g, ''));
  const salaryHasDigits = /\d/.test(salaryRate);
  const salaryDateIso = useMemo(() => toIsoDate(salaryDate), [salaryDate]);
  const salaryEntryRequested = Boolean(salaryRate.trim() || salaryDate.trim() || salaryNote.trim());
  const salaryDateError = salaryDirty && salaryEntryRequested
    ? !salaryDateIso ? 'Nhập ngày hiệu lực hợp lệ theo dd/MM/yyyy hoặc yyyy-MM-dd.'
      : employee?.compensations.some(compensation => compensation.effectiveFrom.slice(0, 10) === salaryDateIso) ? 'Ngày này đã có thiết lập lương; hãy chọn một ngày khác.'
        : undefined
    : undefined;
  const isValid = values.name.trim().length >= 2 && validPhone(values.phone) && (!salaryDirty || !salaryEntryRequested || (salaryHasDigits && rateNumber <= 2_000_000_000 && !salaryDateError));

  const pickAvatar = async () => {
    setError('');
    try {
      const picker = await import('expo-document-picker');
      const result = await picker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], multiple: false, copyToCacheDirectory: true, base64: true });
      if (result.canceled || !result.assets.length) return;
      const asset = result.assets[0];
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!asset.mimeType || !allowed.includes(asset.mimeType)) throw new Error('Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
      if (asset.size !== undefined && asset.size > 2 * 1024 * 1024) throw new Error('Mỗi ảnh không vượt quá 2 MiB.');
      let base64 = asset.base64;
      if (!base64) {
        const { File } = await import('expo-file-system');
        base64 = await new File(asset.uri).base64();
      }
      if (!base64 || base64.length > 2_800_000) throw new Error('Ảnh không hợp lệ hoặc vượt quá dung lượng tối đa 2 MiB.');
      setUploading(true);
      const saved = await onUploadAvatar(`data:${asset.mimeType};base64,${base64}`, asset.name);
      update({ avatarUrl: saved.avatarUrl });
    } catch (failure: any) { setError(failure.message || 'Không thể tải ảnh nhân viên.'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (saving || !isValid) return;
    const nextErrors: typeof fieldErrors = {};
    if (values.name.trim().length < 2) nextErrors.name = 'Tên nhân viên phải có ít nhất 2 ký tự.';
    if (!validPhone(values.phone)) nextErrors.phone = 'Nhập số điện thoại hợp lệ.';
    if (salaryEntryRequested && !salaryRate.trim()) nextErrors.salaryDate = 'Nhập mức lương trước khi thêm thiết lập lương.';
    if (salaryDateError) nextErrors.salaryDate = salaryDateError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true); setError('');
    try {
      const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' && value.trim() === '' ? null : value])) as ProfileValues;
      payload.name = values.name.trim(); payload.phone = values.phone.trim();
      if (payload.startDate) payload.startDate = toIsoDate(payload.startDate) || payload.startDate;
      if (payload.birthDate) payload.birthDate = toIsoDate(payload.birthDate) || payload.birthDate;
      const compensation = salaryDirty && salaryEntryRequested && salaryRate.trim() ? {
        payBasis: salaryBasis, baseRate: rateNumber, effectiveFrom: salaryDateIso as string, note: salaryNote.trim() || null
      } satisfies EmployeeCompensationInput : undefined;
      await onSave(payload, compensation);
    } catch (failure: any) { setError(failure.message || 'Không thể lưu hồ sơ nhân viên.'); }
    finally { setSaving(false); }
  };

  const currentUser = linkableUsers.find(user => user.id === values.userId) || employee?.user || null;
  const confirmStatusChange = async () => {
    if (!pendingStatus || statusSaving) return;
    const parsedEndDate = pendingStatus === 'RESIGNED' && pendingEndDate.trim() ? toIsoDate(pendingEndDate) : undefined;
    if (pendingStatus === 'RESIGNED' && pendingEndDate.trim() && !parsedEndDate) {
      setError('Ngày nghỉ việc không hợp lệ. Nhập dd/MM/yyyy hoặc yyyy-MM-dd.');
      return;
    }
    const endDate = parsedEndDate || undefined;
    setStatusSaving(true); setError('');
    try { await onStatusChange(pendingStatus, endDate); setPendingStatus(null); }
    catch (failure: any) { setError(failure.message || 'Không thể cập nhật tình trạng nhân viên.'); }
    finally { setStatusSaving(false); }
  };
  const section = (name: SectionName, title: string, content: React.ReactNode) => <View key={name} style={[styles.section, { backgroundColor: theme.surfaceBase }]}>
    <Pressable testID={`employee-section-${name}`} accessibilityRole="button" accessibilityState={{ expanded: expanded[name] }} onPress={() => setExpanded(current => ({ ...current, [name]: !current[name] }))} style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{title}</Text>
      <AppIcon icon={expanded[name] ? ChevronUp : ChevronDown} color={theme.textSecondary} />
    </Pressable>
    {expanded[name] && <View style={styles.sectionContent}>{content}</View>}
  </View>;

  const avatar = values.avatarUrl ? resolveImageUrl(values.avatarUrl) : undefined;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={[styles.modal, { backgroundColor: theme.surfaceCanvas, borderColor: theme.borderSubtle }]}>
        <View style={[styles.modalHeading, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{employee ? 'Cập nhật hồ sơ nhân viên' : 'Thêm mới nhân viên'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onClose}><AppIcon icon={X} color={theme.textSecondary} /></Pressable>
        </View>
        <View style={[styles.tabs, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
          <Pressable testID="employee-form-tab-information" accessibilityRole="tab" accessibilityState={{ selected: tab === 'information' }} onPress={() => setTab('information')} style={[styles.tab, tab === 'information' && { borderBottomColor: theme.primary }]}>
            <Text style={{ color: tab === 'information' ? theme.primary : theme.textSecondary }}>Thông tin</Text>
          </Pressable>
          <Pressable testID="employee-form-tab-salary" accessibilityRole="tab" accessibilityState={{ selected: tab === 'salary' }} onPress={() => setTab('salary')} style={[styles.tab, tab === 'salary' && { borderBottomColor: theme.primary }]}>
            <Text style={{ color: tab === 'salary' ? theme.primary : theme.textSecondary }}>Thiết lập lương</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error ? <InlineAlert message={error} /> : null}
          {tab === 'information' ? <>
            <View testID="employee-identity-section" style={[styles.section, compact ? styles.identityStack : styles.identitySection, { backgroundColor: theme.surfaceBase }]}>
              <View style={styles.identityFields}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Thông tin khởi tạo</Text>
                <Field label="Tên nhân viên *" testID="employee-name" value={values.name} onChangeText={name => update({ name })} placeholder="Bắt buộc" error={fieldErrors.name} />
                <Field label="Mã nhân viên" value={employee?.code || 'Tự động'} editable={false} />
                <Field label="Mã chấm công" value={employee?.attendanceCode || 'Tự động'} editable={false} />
                <Field label="Số điện thoại *" testID="employee-phone" value={values.phone} onChangeText={phoneValue => update({ phone: phoneValue })} placeholder="Bắt buộc" keyboardType="phone-pad" error={fieldErrors.phone} />
              </View>
              <View style={[styles.avatarColumn, compact && styles.avatarColumnStack]}>
                {avatar ? <Image source={{ uri: avatar }} style={[styles.avatar, { borderColor: theme.borderSubtle }]} /> : <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}><AppIcon icon={UserRound} color={theme.textSecondary} size={42} /></View>}
                <Button variant="secondary" testID="employee-avatar" label={uploading ? 'Đang tải ảnh' : 'Thêm ảnh'} icon={Camera} loading={uploading} onPress={() => void pickAvatar()} />
                <Text style={{ color: theme.textSecondary, fontSize: typography.sizes.xs, textAlign: 'center' }}>JPEG, PNG, WebP · tối đa 2 MiB</Text>
              </View>
            </View>
            {section('work', 'Thông tin công việc', <>
              <View style={styles.twoColumns}>
                <ReferencePicker label="Phòng ban" selectedId={values.departmentId} options={departments} testPrefix="employee-form-department" onSelect={departmentId => update({ departmentId })} onCreate={onCreateDepartment} />
                <ReferencePicker label="Chức danh" selectedId={values.jobTitleId} options={jobTitles} testPrefix="employee-form-job-title" onSelect={jobTitleId => update({ jobTitleId })} onCreate={onCreateJobTitle} />
                <Field label="Ngày bắt đầu làm việc" testID="employee-start-date" placeholder="dd/MM/yyyy" value={values.startDate || ''} onChangeText={startDate => update({ startDate })} />
                <View style={styles.fieldBlock}>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Tài khoản đăng nhập (không bắt buộc)</Text>
                  <Pressable testID="employee-account-picker" accessibilityState={{ expanded: accountOpen }} onPress={() => { setAccountOpen(value => !value); setAccountSearch(''); }} style={[styles.select, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
                    <Text style={{ color: currentUser ? theme.textPrimary : theme.textSecondary }}>{currentUser ? `${currentUser.name} · ${currentUser.username}` : 'Chưa liên kết tài khoản'}</Text>
                    <AppIcon icon={accountOpen ? ChevronUp : ChevronDown} color={theme.textSecondary} size={16} />
                  </Pressable>
                  {accountOpen && <View style={[styles.optionList, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
                    <TextInput accessibilityLabel="Tìm tài khoản đăng nhập" testID="employee-account-search" value={accountSearch} onChangeText={setAccountSearch} placeholder="Tìm tên hoặc tên đăng nhập" placeholderTextColor={theme.textSecondary} style={[styles.accountSearch, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} />
                    <Pressable testID="employee-user-none" onPress={() => { update({ userId: null }); setAccountOpen(false); }} style={styles.option}><Text style={{ color: theme.textSecondary }}>Không liên kết</Text></Pressable>
                    {linkableUsers.map(user => <Pressable key={user.id} testID={`employee-user-${user.id}`} onPress={() => { update({ userId: user.id }); setAccountOpen(false); }} style={styles.option}><Text style={{ color: theme.textPrimary }}>{user.name} · {user.username} ({user.role})</Text></Pressable>)}
                  </View>}
                </View>
              </View>
              {employee && <View style={[styles.statusCard, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                <View>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Tình trạng: {employee.status === 'WORKING' ? 'Đang làm việc' : 'Đã nghỉ'}</Text>
                  {pendingStatus && <Text style={{ color: theme.textSecondary }}>{pendingStatus === 'RESIGNED' ? 'Để trống ngày nghỉ việc để dùng ngày hôm nay theo múi giờ nhà hàng.' : 'Ngày nghỉ việc hiện tại sẽ được xóa khi kích hoạt lại.'}</Text>}
                </View>
                {pendingStatus === 'RESIGNED' && <Field label="Ngày nghỉ việc (không bắt buộc)" testID="employee-status-end-date" placeholder="dd/MM/yyyy hoặc yyyy-MM-dd" value={pendingEndDate} onChangeText={setPendingEndDate} error={pendingEndDate.trim() && !toIsoDate(pendingEndDate) ? 'Ngày không hợp lệ.' : undefined} />}
                {!pendingStatus ? <Button variant="secondary" testID="employee-status-toggle" label={employee.status === 'WORKING' ? 'Đánh dấu nghỉ việc' : 'Kích hoạt lại'} onPress={() => setPendingStatus(employee.status === 'WORKING' ? 'RESIGNED' : 'WORKING')} /> :
                  <View style={styles.statusActions}><Button variant="quiet" testID="employee-status-cancel" label="Hủy" onPress={() => { setPendingStatus(null); setPendingEndDate(''); }} disabled={statusSaving} /><Button variant="primary" testID="employee-status-confirm" label={pendingStatus === 'RESIGNED' ? 'Xác nhận nghỉ việc' : 'Xác nhận kích hoạt'} onPress={() => void confirmStatusChange()} loading={statusSaving} disabled={pendingStatus === 'RESIGNED' && Boolean(pendingEndDate.trim()) && !toIsoDate(pendingEndDate)} /></View>}
              </View>}
              <Field label="Ghi chú" testID="employee-note" value={values.note || ''} onChangeText={note => update({ note })} />
            </>)}
            {section('bank', 'Thông tin ngân hàng', <View style={styles.twoColumns}>
              <Field label="Ngân hàng" value={values.bankName || ''} onChangeText={bankName => update({ bankName })} />
              <Field label="Số tài khoản" value={values.bankAccountNumber || ''} onChangeText={bankAccountNumber => update({ bankAccountNumber })} />
              <Field label="Chủ tài khoản" value={values.bankAccountName || ''} onChangeText={bankAccountName => update({ bankAccountName })} />
            </View>)}
            {section('personal', 'Thông tin cá nhân', <>
              <View style={styles.threeColumns}>
                <Field label="Số CMND/CCCD" value={values.nationalId || ''} onChangeText={nationalId => update({ nationalId })} />
                <Field label="Ngày sinh" placeholder="dd/MM/yyyy" value={values.birthDate || ''} onChangeText={birthDate => update({ birthDate })} />
                <View style={styles.fieldBlock}><Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Giới tính</Text><View style={styles.chips}>
                  {([['MALE', 'Nam'], ['FEMALE', 'Nữ'], ['OTHER', 'Khác']] as Array<[EmployeeGender, string]>).map(([gender, label]) => <ChoiceChip key={gender} label={label} selected={values.gender === gender} onPress={() => update({ gender })} />)}
                </View></View>
              </View>
              <Field label="Địa chỉ" value={values.address || ''} onChangeText={address => update({ address })} />
              <View style={styles.twoColumns}>
                <Field label="Tỉnh/Thành phố" value={values.province || ''} onChangeText={province => update({ province })} />
                <Field label="Xã/Phường/Đặc khu" value={values.ward || ''} onChangeText={ward => update({ ward })} />
                <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={values.email || ''} onChangeText={email => update({ email })} />
                <Field label="Facebook" value={values.facebook || ''} onChangeText={facebook => update({ facebook })} />
              </View>
            </>)}
          </> : <View style={[styles.section, { backgroundColor: theme.surfaceBase }]}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Thiết lập lương</Text>
            <Text style={{ color: theme.textSecondary }}>Lưu mức lương theo ngày hiệu lực; chưa thực hiện tính bảng lương.</Text>
            <View style={styles.fieldBlock}><Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Hình thức tính lương</Text><View style={styles.chips}>
              {(['MONTHLY', 'HOURLY', 'PER_SHIFT'] as EmployeePayBasis[]).map(basis => <ChoiceChip key={basis} label={payBasisLabels[basis]} selected={salaryBasis === basis} onPress={() => { setSalaryDirty(true); setSalaryBasis(basis); }} />)}
            </View></View>
            <View style={styles.twoColumns}>
              <Field label="Mức lương (đ)" testID="employee-base-rate" keyboardType="numeric" value={salaryRate} onChangeText={value => { setSalaryDirty(true); setSalaryRate(value); }} placeholder="Ví dụ: 12000000" />
              <Field label="Ngày hiệu lực" testID="employee-effective-from" placeholder="dd/MM/yyyy" value={salaryDate} onChangeText={value => { setSalaryDirty(true); setSalaryDate(value); }} error={fieldErrors.salaryDate || salaryDateError} />
            </View>
            <Field label="Ghi chú thiết lập lương" testID="employee-compensation-note" value={salaryNote} onChangeText={value => { setSalaryDirty(true); setSalaryNote(value); }} />
          </View>}
        </ScrollView>
        <View style={[styles.footer, { backgroundColor: theme.surfaceBase, borderTopColor: theme.borderSubtle }]}>
          <Button variant="quiet" label="Bỏ qua" onPress={onClose} />
          <Button variant="primary" testID="employee-save" label="Lưu" loading={saving} disabled={!isValid} onPress={() => void save()} />
        </View>
      </View>
    </View>
  </Modal>;
};

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: 'rgba(12, 24, 40, .45)', flex: 1, justifyContent: 'center', padding: spacing.md },
  modal: { borderRadius: radii.lg, borderWidth: 1, flex: 1, maxHeight: '96%', maxWidth: 1160, overflow: 'hidden', width: '100%' },
  modalHeading: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: spacing.lg },
  modalTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.lg },
  tabs: { borderBottomWidth: 1, flexDirection: 'row', gap: spacing.xl, paddingHorizontal: spacing.lg },
  tab: { borderBottomWidth: 2, borderColor: 'transparent', paddingVertical: spacing.md },
  scroll: { flex: 1 }, content: { gap: spacing.md, padding: spacing.md },
  section: { borderRadius: radii.md, gap: spacing.md, padding: spacing.lg },
  identitySection: { alignItems: 'center', flexDirection: 'row' }, identityStack: { alignItems: 'stretch', flexDirection: 'column' }, identityFields: { flex: 1, gap: spacing.md, minWidth: 0 },
  avatarColumn: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', paddingHorizontal: spacing.lg, width: 230 },
  avatarColumnStack: { paddingHorizontal: 0, width: '100%' },
  avatar: { borderRadius: radii.pill, borderWidth: 1, height: 128, resizeMode: 'cover', width: 128 },
  avatarEmpty: { alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, justifyContent: 'center' },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 28 },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  sectionContent: { gap: spacing.md }, twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  threeColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, fieldBlock: { flex: 1, gap: spacing.xs, minWidth: 190 },
  fieldLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  chips: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceChip: { alignItems: 'center', borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: spacing.md },
  picker: { flex: 1, gap: spacing.xs, minWidth: 220 }, select: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: spacing.md },
  optionList: { borderRadius: radii.md, borderWidth: 1, maxHeight: 280, overflow: 'hidden' }, option: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md }, accountSearch: { borderBottomWidth: 1, minHeight: 42, paddingHorizontal: spacing.md },
  statusCard: { alignItems: 'flex-start', borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md }, statusActions: { alignSelf: 'stretch', flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  quickCreate: { borderTopWidth: 1, gap: spacing.sm, padding: spacing.md }, footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md }
});
