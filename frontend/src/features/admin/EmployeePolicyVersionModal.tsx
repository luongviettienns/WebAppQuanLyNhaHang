import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import {
  createAttendancePolicyApi, createPayrollPolicyApi, createWorkweekPolicyApi,
  type EmployeeSettingsWorkspaceDto
} from '../../api/employeeSettings';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';
import { InlineAlert } from '../../ui';

type Kind = 'attendance' | 'payroll' | 'workweek';
const weekdayFields = [
  ['monday', 'Thứ hai'], ['tuesday', 'Thứ ba'], ['wednesday', 'Thứ tư'], ['thursday', 'Thứ năm'],
  ['friday', 'Thứ sáu'], ['saturday', 'Thứ bảy'], ['sunday', 'Chủ nhật']
] as const;

export const EmployeePolicyVersionModal: React.FC<{
  visible: boolean; kind: Kind; token: string | null; workspace: EmployeeSettingsWorkspaceDto;
  onClose: () => void; onSaved: () => void;
}> = ({ visible, kind, token, workspace, onClose, onSaved }) => {
  const { theme } = useTheme();
  const attendance = workspace.effectivePolicies.attendance;
  const workweek = workspace.effectivePolicies.workweek;
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [standardDayMinutes, setStandardDayMinutes] = useState(String(attendance?.standardDayMinutes ?? 480));
  const [lateThresholdMinutes, setLateThresholdMinutes] = useState(String(attendance?.lateThresholdMinutes ?? 0));
  const [earlyLeaveThresholdMinutes, setEarlyLeaveThresholdMinutes] = useState(String(attendance?.earlyLeaveThresholdMinutes ?? 0));
  const [allowUnscheduledAttendance, setAllowUnscheduledAttendance] = useState(attendance?.allowUnscheduledAttendance ?? true);
  const [weekdays, setWeekdays] = useState(() => Object.fromEntries(weekdayFields.map(([key]) => [key, workweek?.[key] ?? true])) as Record<(typeof weekdayFields)[number][0], boolean>);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) { setError('Nhập ngày hiệu lực theo định dạng YYYY-MM-DD.'); return; }
    if (kind === 'workweek' && !Object.values(weekdays).some(Boolean)) { setError('Phải chọn ít nhất một ngày làm việc.'); return; }
    setSaving(true); setError('');
    try {
      if (kind === 'attendance') await createAttendancePolicyApi(token, {
        branchId: workspace.branch.id, effectiveFrom, expectedAreaRevision: workspace.revisions.attendance,
        attendanceMode: 'SHIFT', standardDayMinutes: Number(standardDayMinutes), lateThresholdMinutes: Number(lateThresholdMinutes),
        earlyLeaveThresholdMinutes: Number(earlyLeaveThresholdMinutes), allowUnscheduledAttendance
      });
      else if (kind === 'payroll') await createPayrollPolicyApi(token, {
        branchId: workspace.branch.id, effectiveFrom, expectedAreaRevision: workspace.revisions.payroll,
        frequency: 'MONTHLY', periodStartDay: 1, hourlyCalculationSource: 'ACTUAL_ATTENDANCE'
      });
      else await createWorkweekPolicyApi(token, {
        branchId: workspace.branch.id, effectiveFrom, expectedAreaRevision: workspace.revisions.workweek, ...weekdays
      });
      onSaved(); onClose();
    } catch (failure) {
      const code = (failure as { code?: string }).code;
      setError(code === 'EMPLOYEE_SETTINGS_REVISION_CONFLICT'
        ? 'Thiết lập đã được người khác cập nhật. Bản nháp được giữ lại; hãy tải lại trước khi lưu.'
        : (failure as Error).message || 'Không thể lưu thiết lập.');
    } finally { setSaving(false); }
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: theme.surfaceBase }]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Tạo phiên bản thiết lập</Text>
        <Text style={[styles.help, { color: theme.textSecondary }]}>Phiên bản mới chỉ áp dụng từ ngày hiệu lực và không sửa lịch sử.</Text>
        {error ? <InlineAlert message={error} /> : null}
        <Text style={[styles.label, { color: theme.textPrimary }]}>Ngày hiệu lực</Text>
        <TextInput testID="policy-effective-date" value={effectiveFrom} onChangeText={setEffectiveFrom} placeholder="YYYY-MM-DD" style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
        {kind === 'attendance' && <>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Số phút một ngày công chuẩn</Text>
          <TextInput value={standardDayMinutes} onChangeText={setStandardDayMinutes} keyboardType="number-pad" style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Tính đi muộn sau (phút)</Text>
          <TextInput testID="attendance-late-threshold" value={lateThresholdMinutes} onChangeText={setLateThresholdMinutes} keyboardType="number-pad" style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Tính về sớm trước (phút)</Text>
          <TextInput value={earlyLeaveThresholdMinutes} onChangeText={setEarlyLeaveThresholdMinutes} keyboardType="number-pad" style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary }]} />
          <View style={styles.switchRow}><Text style={[styles.label, { color: theme.textPrimary }]}>Cho phép chấm công ngoài lịch</Text><Switch value={allowUnscheduledAttendance} onValueChange={setAllowUnscheduledAttendance} /></View>
        </>}
        {kind === 'payroll' && <InlineAlert tone="info" title="Phạm vi MVP" message="Kỳ lương theo tháng, bắt đầu ngày 1; lương giờ dùng thời gian chấm công thực tế." />}
        {kind === 'workweek' && weekdayFields.map(([key, label]) => <View key={key} style={styles.switchRow}>
          <Text style={[styles.label, { color: theme.textPrimary }]}>{label}</Text>
          <Switch testID={`workweek-${key}`} value={weekdays[key]} onValueChange={value => setWeekdays(current => ({ ...current, [key]: value }))} />
        </View>)}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
        <Pressable onPress={onClose} style={[styles.button, { borderColor: theme.borderSubtle }]}><Text style={{ color: theme.textPrimary }}>Bỏ qua</Text></Pressable>
        <Pressable testID="policy-save" accessibilityRole="button" disabled={saving} onPress={save} style={[styles.button, { backgroundColor: theme.primary }]}><Text style={{ color: theme.textInverse }}>{saving ? 'Đang lưu…' : 'Lưu'}</Text></Pressable>
      </View>
    </View></View>
  </Modal>;
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(18, 26, 40, 0.42)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modal: { borderRadius: radii.lg, maxHeight: '92%', maxWidth: 680, overflow: 'hidden', width: '100%' },
  body: { gap: spacing.sm, padding: spacing.xl }, title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  help: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, marginBottom: spacing.sm },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  input: { borderRadius: radii.md, borderWidth: 1, minHeight: 44, paddingHorizontal: spacing.md },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 48 },
  footer: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.lg },
  button: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, minWidth: 88, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }
});
