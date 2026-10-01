import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  archiveEmployeeHolidayApi, createEmployeeHolidayApi, updateEmployeeHolidayApi,
  type EmployeeHolidayDto, type EmployeeSettingsWorkspaceDto
} from '../../api/employeeSettings';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { InlineAlert } from '../../ui';

export const EmployeeHolidayModal: React.FC<{
  visible: boolean; token: string | null; workspace: EmployeeSettingsWorkspaceDto; holiday?: EmployeeHolidayDto | null;
  onClose: () => void; onSaved: () => void;
}> = ({ visible, token, workspace, holiday, onClose, onSaved }) => {
  const { theme } = useTheme();
  const [name, setName] = useState(''); const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState('');
  const started = Boolean(holiday && holiday.startDate <= workspace.businessDate);
  useEffect(() => {
    if (!visible) return;
    setName(holiday?.name ?? ''); setStartDate(holiday?.startDate ?? ''); setEndDate(holiday?.endDate ?? '');
    setNote(holiday?.note ?? ''); setReason(''); setError('');
  }, [holiday, visible]);

  async function save() {
    if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
      setError('Kiểm tra tên và khoảng ngày nghỉ/lễ.'); return;
    }
    if (started && reason.trim().length < 3) { setError('Hiệu chỉnh kỳ nghỉ đã bắt đầu phải có lý do.'); return; }
    try {
      if (holiday) await updateEmployeeHolidayApi(token, holiday.id, {
        branchId: workspace.branch.id, expectedHolidayRevision: workspace.revisions.holiday,
        expectedRowRevision: holiday.revision, name: name.trim(), note: note.trim() || null,
        ...(started ? { reason: reason.trim() } : { startDate, endDate })
      });
      else await createEmployeeHolidayApi(token, {
        branchId: workspace.branch.id, expectedHolidayRevision: workspace.revisions.holiday,
        name: name.trim(), startDate, endDate, note: note.trim() || null
      });
      onSaved(); onClose();
    } catch (failure) { setError((failure as Error).message || 'Không thể lưu kỳ nghỉ/lễ.'); }
  }

  async function archive() {
    if (!holiday || reason.trim().length < 3) { setError('Nhập lý do lưu trữ tối thiểu 3 ký tự.'); return; }
    try {
      await archiveEmployeeHolidayApi(token, holiday.id, {
        branchId: workspace.branch.id, expectedHolidayRevision: workspace.revisions.holiday,
        expectedRowRevision: holiday.revision, reason: reason.trim()
      });
      onSaved(); onClose();
    } catch (failure) { setError((failure as Error).message || 'Không thể lưu trữ kỳ nghỉ/lễ.'); }
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: theme.surfaceBase }]}>
    <Text style={[styles.title, { color: theme.textPrimary }]}>{holiday ? 'Cập nhật kỳ nghỉ/lễ' : 'Thêm kỳ nghỉ/lễ'}</Text>
    {started ? <InlineAlert tone="warning" message="Kỳ nghỉ đã bắt đầu: chỉ được hiệu chỉnh tên/ghi chú và phải nêu lý do." /> : null}
    {error ? <InlineAlert message={error} /> : null}
    <Text style={[styles.label, { color: theme.textPrimary }]}>Tên kỳ nghỉ/lễ</Text><TextInput testID="holiday-name" value={name} onChangeText={setName} style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
    <View style={styles.columns}><View style={styles.column}><Text style={[styles.label, { color: theme.textPrimary }]}>Từ ngày</Text><TextInput testID="holiday-start" editable={!started} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} /></View><View style={styles.column}><Text style={[styles.label, { color: theme.textPrimary }]}>Đến ngày</Text><TextInput testID="holiday-end" editable={!started} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} /></View></View>
    <Text style={[styles.label, { color: theme.textPrimary }]}>Ghi chú</Text><TextInput value={note} onChangeText={setNote} style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
    {(holiday || started) && <><Text style={[styles.label, { color: theme.textPrimary }]}>Lý do thay đổi</Text><TextInput testID="holiday-reason" value={reason} onChangeText={setReason} style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} /></>}
    <View style={styles.footer}>{holiday && !started && !holiday.archivedAt ? <Pressable testID="holiday-archive" onPress={archive} style={[styles.button, { borderColor: theme.danger }]}><Text style={{ color: theme.danger }}>Lưu trữ</Text></Pressable> : <View />}
      <View style={styles.actions}><Pressable onPress={onClose} style={[styles.button, { borderColor: theme.borderSubtle }]}><Text style={{ color: theme.textPrimary }}>Bỏ qua</Text></Pressable><Pressable testID="holiday-save" onPress={save} style={[styles.button, { backgroundColor: theme.primary, borderColor: theme.primary }]}><Text style={{ color: theme.textInverse }}>Lưu</Text></Pressable></View></View>
  </View></View></Modal>;
};
const styles = StyleSheet.create({ backdrop: { alignItems: 'center', backgroundColor: 'rgba(18, 26, 40, 0.42)', flex: 1, justifyContent: 'center', padding: spacing.lg }, modal: { borderRadius: radii.lg, gap: spacing.sm, maxWidth: 680, padding: spacing.xl, width: '100%' }, title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl }, label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }, input: { borderRadius: radii.md, borderWidth: 1, minHeight: 44, paddingHorizontal: spacing.md }, columns: { flexDirection: 'row', gap: spacing.md }, column: { flex: 1, gap: spacing.xs }, footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md }, actions: { flexDirection: 'row', gap: spacing.sm }, button: { borderRadius: radii.md, borderWidth: 1, minWidth: 88, paddingHorizontal: spacing.lg, paddingVertical: spacing.md } });
