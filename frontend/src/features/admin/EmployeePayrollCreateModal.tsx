import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { EmployeeListItemDto } from '../../api/employeeManagement';
import type { CreateEmployeePayrollInput } from '../../api/employeePayroll';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { previousCompletePayrollMonth } from './employeePayrollViewModel';

interface Props {
  visible: boolean;
  employees: EmployeeListItemDto[];
  now?: Date;
  onClose: () => void;
  onSubmit: (input: CreateEmployeePayrollInput) => Promise<void>;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export const EmployeePayrollCreateModal: React.FC<Props> = ({ visible, employees, now = new Date(), onClose, onSubmit, onLoadMore, hasMore }) => {
  const { theme } = useTheme();
  const compact = useWindowDimensions().width < 680;
  const defaultMonth = previousCompletePayrollMonth(now).month;
  const [month, setMonth] = useState(defaultMonth);
  const [scope, setScope] = useState<'ALL' | 'CUSTOM'>('ALL');
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setMonth(defaultMonth); setScope('ALL'); setSelected([]); setSaving(false); setError(''); pendingRef.current = false;
  }, [defaultMonth, visible]);

  const currentMonth = previousCompletePayrollMonth(now).periodEnd.slice(0, 7) < defaultMonth ? defaultMonth : (() => {
    const next = new Date(`${defaultMonth}-01T00:00:00.000Z`); next.setUTCMonth(next.getUTCMonth() + 1); return next.toISOString().slice(0, 7);
  })();
  const validMonth = /^\d{4}-\d{2}$/.test(month) && month < currentMonth;
  const valid = validMonth && (scope === 'ALL' || selected.length > 0);
  const toggle = (id: number) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id].sort((a, b) => a - b));
  const save = async () => {
    if (!valid || pendingRef.current) return;
    pendingRef.current = true; setSaving(true); setError('');
    try {
      await onSubmit({ branchId: 1, month, scope, employeeIds: scope === 'CUSTOM' ? selected : [] });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể tạo bảng lương.');
    } finally { pendingRef.current = false; setSaving(false); }
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={[styles.panel, compact && styles.panelCompact, { backgroundColor: theme.surfaceBase }]}>
        <View style={styles.header}><View><Text style={[styles.title, { color: theme.textPrimary }]}>Thêm bảng tính lương</Text><Text style={[styles.subtitle, { color: theme.textSecondary }]}>Tạo snapshot lương từ chấm công thực tế</Text></View></View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Kỳ hạn trả lương</Text>
          <View style={[styles.readonly, { borderColor: theme.borderSubtle }]}><Text style={{ color: theme.textPrimary }}>Hàng tháng</Text></View>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Kỳ làm việc</Text>
          <TextInput testID="payroll-create-month" value={month} onChangeText={setMonth} placeholder="YYYY-MM"
            style={[styles.input, { borderColor: validMonth ? theme.borderSubtle : theme.danger, color: theme.textPrimary }]} />
          {!validMonth && <Text style={[styles.help, { color: theme.danger }]}>Chọn một tháng đã kết thúc.</Text>}
          <Text style={[styles.label, { color: theme.textPrimary }]}>Phạm vi áp dụng</Text>
          <View style={styles.scopeRow}>
            <Pressable testID="payroll-scope-all" onPress={() => setScope('ALL')} accessibilityState={{ selected: scope === 'ALL' }} style={[styles.choice, { borderColor: scope === 'ALL' ? theme.primary : theme.borderSubtle, backgroundColor: scope === 'ALL' ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={{ color: theme.textPrimary }}>Tất cả nhân viên</Text></Pressable>
            <Pressable testID="payroll-scope-custom" onPress={() => setScope('CUSTOM')} accessibilityState={{ selected: scope === 'CUSTOM' }} style={[styles.choice, { borderColor: scope === 'CUSTOM' ? theme.primary : theme.borderSubtle, backgroundColor: scope === 'CUSTOM' ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={{ color: theme.textPrimary }}>Tùy chọn</Text></Pressable>
          </View>
          {scope === 'CUSTOM' && <View style={[styles.employeeList, { borderColor: theme.borderSubtle }]}>
            {employees.map(employee => <Pressable key={employee.id} testID={`payroll-employee-${employee.id}`} onPress={() => toggle(employee.id)} accessibilityState={{ selected: selected.includes(employee.id) }} style={[styles.employeeRow, { borderBottomColor: theme.borderSubtle, backgroundColor: selected.includes(employee.id) ? theme.interactiveSecondary : theme.surfaceBase }]}>
              <Text style={[styles.employeeName, { color: theme.textPrimary }]}>{employee.name}</Text><Text style={{ color: theme.textSecondary }}>{employee.code}</Text>
            </Pressable>)}
            {hasMore && <Pressable testID="payroll-employees-more" onPress={onLoadMore} style={styles.more}><Text style={{ color: theme.primary }}>Tải thêm nhân viên</Text></Pressable>}
          </View>}
          {error ? <Text testID="payroll-create-error" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
          <Pressable onPress={onClose} style={[styles.button, { borderColor: theme.borderSubtle }]}><Text style={{ color: theme.textPrimary }}>Bỏ qua</Text></Pressable>
          <Pressable testID="payroll-create-save" accessibilityState={{ disabled: !valid || saving }} disabled={!valid || saving} onPress={() => void save()} style={[styles.button, { backgroundColor: valid && !saving ? theme.primary : theme.borderSubtle, borderColor: 'transparent' }]}><Text style={{ color: theme.textInverse }}>{saving ? 'Đang lưu…' : 'Lưu'}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  panel: { borderRadius: radii.lg, maxHeight: '90%', maxWidth: 640, overflow: 'hidden', width: '100%' }, panelCompact: { maxHeight: '96%' },
  header: { padding: spacing.lg }, title: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.lg }, subtitle: { fontSize: typography.sizes.sm, marginTop: spacing.xs },
  body: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }, label: { fontFamily: typography.families.bodySemibold, marginTop: spacing.sm },
  input: { borderRadius: radii.sm, borderWidth: 1, minHeight: 44, paddingHorizontal: spacing.md }, readonly: { borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md }, help: { fontSize: typography.sizes.xs },
  scopeRow: { flexDirection: 'row', gap: spacing.sm }, choice: { borderRadius: 999, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  employeeList: { borderRadius: radii.md, borderWidth: 1, maxHeight: 250, overflow: 'hidden' }, employeeRow: { borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }, employeeName: { fontFamily: typography.families.bodySemibold }, more: { alignItems: 'center', padding: spacing.md },
  error: { fontSize: typography.sizes.sm }, footer: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md },
  button: { borderRadius: radii.sm, borderWidth: 1, minWidth: 92, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' }
});
