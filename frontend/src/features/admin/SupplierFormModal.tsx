import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { SupplierDto } from '../../api/contracts';
import { createSupplierApi, updateSupplierApi, fetchSupplierGroupsApi, saveSupplierGroupApi, SupplierGroupDto } from '../../api/suppliers';
import { AppIcon, Button, Field, InlineAlert } from '../../ui';
import { radii, spacing, typography } from '../../theme';
import { SupplierModalShell } from './SupplierModalShell';
import { SupplierForm, supplierToForm, supplierFormInput, validateSupplierForm } from './supplierViewModel';

export interface SupplierFormModalProps {
  visible: boolean;
  supplier?: SupplierDto | null;
  onClose: () => void;
  onSaved: (supplier: SupplierDto) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(true);
  return <View style={[styles.section, { borderColor: theme.borderSubtle }]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{title}</Text><AppIcon icon={open ? ChevronUp : ChevronDown} color={theme.textSecondary} />
    </Pressable>
    {open && <View style={styles.sectionBody}>{children}</View>}
  </View>;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({ visible, supplier, onClose, onSaved }) => {
  const { token } = useAuth();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [form, setForm] = useState(() => supplierToForm(supplier));
  const [groups, setGroups] = useState<SupplierGroupDto[]>([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof SupplierForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    if (!visible) return;
    setForm(supplierToForm(supplier)); setError(''); setErrors({}); setGroupOpen(false); setNewGroup('');
    let active = true;
    fetchSupplierGroupsApi(token).then(data => { if (active) setGroups(data); }).catch((failure: Error) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [visible, supplier, token]);
  const update = <K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) => setForm(current => ({ ...current, [key]: value }));
  const field = (key: Exclude<keyof SupplierForm, 'groupId' | 'isActive'>, label: string, maxLength: number, placeholder = '') => <Field
    label={label} value={form[key]} maxLength={maxLength} placeholder={placeholder} testID={'supplier-' + key}
    editable={!saving && !(key === 'code' && !!supplier)} error={errors[key]} onChangeText={value => update(key, value)}
    keyboardType={key === 'email' ? 'email-address' : key === 'phone' ? 'phone-pad' : 'default'}
    autoCapitalize={key === 'email' ? 'none' : 'sentences'} multiline={key === 'note'} style={key === 'note' ? { minHeight: 80, textAlignVertical: 'top' } : undefined}
  />;
  const save = async () => {
    if (busyRef.current || groupSaving) return;
    const validation = validateSupplierForm(form);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    busyRef.current = true; setSaving(true); setError('');
    try {
      const input = supplierFormInput(form);
      const editable = { ...input };
      delete editable.code;
      const saved = supplier ? await updateSupplierApi(token, supplier.id, { ...editable, isActive: form.isActive }) : await createSupplierApi(token, input);
      onSaved(saved);
    } catch (failure: any) { setError(failure.message || 'Không thể lưu nhà cung cấp'); }
    finally { busyRef.current = false; setSaving(false); }
  };
  const addGroup = async () => {
    if (groupSaving || !newGroup.trim()) return;
    setGroupSaving(true); setError('');
    try {
      const group = await saveSupplierGroupApi(token, null, newGroup.trim());
      setGroups(current => [...current, group]); update('groupId', group.id); setNewGroup(''); setGroupOpen(false);
    } catch (failure: any) { setError(failure.message); }
    finally { setGroupSaving(false); }
  };
  const columns = width < 720 ? styles.stack : styles.row;
  return <SupplierModalShell visible={visible} title={supplier ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'} onClose={onClose} busy={saving || groupSaving}
    footer={<><Button variant="quiet" label="Bỏ qua" onPress={onClose} disabled={saving || groupSaving} /><Button variant="primary" label="Lưu" testID="supplier-save" onPress={save} loading={saving} disabled={groupSaving} /></>}>
    {!!error && <InlineAlert message={error} />}
    <View style={columns}><View style={styles.column}>{field('name', 'Tên nhà cung cấp *', 120, 'Bắt buộc')}</View><View style={styles.column}>{field('code', 'Mã nhà cung cấp', 32, 'Tự động')}</View></View>
    <View style={columns}><View style={styles.column}>{field('phone', 'Điện thoại', 30, 'Số điện thoại liên hệ')}</View><View style={styles.column}>{field('email', 'Email', 120, 'Email liên hệ')}</View></View>
    <View style={columns}><View style={styles.column}>{field('identityNumber', 'CCCD', 20)}</View><View style={styles.column} /></View>
    <Section title="Địa chỉ">
      {field('address', 'Địa chỉ', 255, 'Nhập địa chỉ')}
      <View style={columns}><View style={styles.column}>{field('province', 'Tỉnh / Thành phố', 100, 'Nhập tỉnh / thành phố')}</View><View style={styles.column}>{field('district', 'Quận / Huyện (nếu có)', 100)}</View><View style={styles.column}>{field('ward', 'Phường / Xã', 100)}</View></View>
    </Section>
    <Section title="Nhóm nhà cung cấp, ghi chú">
      <Text style={{ color: theme.textPrimary }}>Nhóm nhà cung cấp</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Chọn nhóm nhà cung cấp" accessibilityState={{ expanded: groupOpen }} disabled={saving} onPress={() => setGroupOpen(!groupOpen)} style={[styles.select, { borderColor: theme.borderSubtle }]}>
        <Text style={{ color: theme.textPrimary }}>{groups.find(group => group.id === form.groupId)?.name || 'Chưa phân nhóm'}</Text><AppIcon icon={ChevronDown} color={theme.textSecondary} />
      </Pressable>
      {groupOpen && <View style={[styles.options, { borderColor: theme.borderSubtle }]}>
        {[{ id: 0, name: 'Chưa phân nhóm' }, ...groups].map(group => <Pressable key={group.id} accessibilityRole="button" style={[styles.option, form.groupId === group.id && { backgroundColor: theme.interactiveSecondary }]} onPress={() => { update('groupId', group.id || null); setGroupOpen(false); }}><Text style={{ color: theme.textPrimary }}>{group.name}</Text></Pressable>)}
        <Field label="Tạo nhóm mới" value={newGroup} maxLength={100} onChangeText={setNewGroup} editable={!groupSaving} />
        <Button variant="secondary" label="Thêm nhóm" icon={Plus} onPress={addGroup} loading={groupSaving} disabled={newGroup.trim().length < 2} />
      </View>}
      {field('note', 'Ghi chú', 1000, 'Nhập ghi chú')}
    </Section>
    <Section title="Thông tin xuất hóa đơn"><View style={columns}><View style={styles.column}>{field('taxCode', 'Mã số thuế', 32, 'Nhập mã số thuế')}</View><View style={styles.column}>{field('companyName', 'Công ty', 200, 'Nhập tên công ty')}</View></View></Section>
    {!!supplier && <View style={styles.row}>{[true, false].map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{ checked: form.isActive === value }} disabled={saving} onPress={() => update('isActive', value)} style={[styles.select, { borderColor: form.isActive === value ? theme.primary : theme.borderSubtle, flex: 1 }]}><Text style={{ color: theme.textPrimary }}>{value ? 'Đang hoạt động' : 'Ngừng hoạt động'}</Text></Pressable>)}</View>}
  </SupplierModalShell>;
};
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg }, stack: { gap: spacing.md }, column: { flex: 1, minWidth: 0 },
  section: { borderWidth: 1, borderRadius: radii.md, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing.md },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: 15 }, sectionBody: { gap: spacing.md, padding: spacing.md, paddingTop: 0 },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: spacing.sm, borderWidth: 1, borderRadius: radii.md },
  options: { borderWidth: 1, padding: spacing.sm, borderRadius: radii.md, gap: spacing.sm }, option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.sm }
});
