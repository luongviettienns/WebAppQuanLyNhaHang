import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type {
  AttendanceWeekRowDto,
  AttendanceSessionUpdateInput,
  AttendanceReasonInput,
  ManualAttendanceSessionInput,
  MarkAttendanceAbsentInput
} from '../../api/employeeAttendance';
import { useTheme } from '../../contexts/ThemeContext';
import { radii, spacing, typography } from '../../theme';

type CorrectionKind = 'manual' | 'update' | 'absent' | 'resolve-conflict';
type CorrectionPayload = ManualAttendanceSessionInput | AttendanceSessionUpdateInput | MarkAttendanceAbsentInput | AttendanceReasonInput;

interface EmployeeAttendanceCorrectionModalProps {
  visible: boolean;
  kind: CorrectionKind;
  row: AttendanceWeekRowDto | null;
  availableRows?: AttendanceWeekRowDto[];
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (input: CorrectionPayload) => void;
}

function localTimestamp(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const values = new Map(parts.map(part => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}T${values.get('hour')}:${values.get('minute')}:${values.get('second')}+07:00`;
}

export const EmployeeAttendanceCorrectionModal: React.FC<EmployeeAttendanceCorrectionModalProps> = ({
  visible, kind, row, availableRows = [], saving, error, onCancel, onSubmit
}) => {
  const { theme } = useTheme();
  const session = row?.sessions[0];
  const [checkInAt, setCheckInAt] = useState('');
  const [checkOutAt, setCheckOutAt] = useState('');
  const [scheduleRuleId, setScheduleRuleId] = useState<number | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setCheckInAt(kind === 'update' ? localTimestamp(session?.checkInAt) : '');
    setCheckOutAt(kind === 'update' ? localTimestamp(session?.checkOutAt ?? undefined) : '');
    setScheduleRuleId(row?.scheduleRuleId ?? null);
    setScheduleDate(row?.scheduleDate ?? null);
    setReason('');
  }, [kind, row?.id, session?.checkInAt, session?.checkOutAt, row?.scheduleRuleId, row?.scheduleDate]);

  if (!row) return null;
  const title = kind === 'absent' ? 'Xác nhận vắng mặt'
    : kind === 'resolve-conflict' ? 'Giải quyết xung đột chấm công'
      : kind === 'manual' ? 'Bổ sung chấm công' : 'Điều chỉnh chấm công';
  const reasonValid = reason.trim().length >= 3;
  const validTimestamp = (value: string) => value.trim().length > 0 && !Number.isNaN(Date.parse(value));
  const needsTimestamps = kind === 'manual' || kind === 'update';
  const checkInValid = !needsTimestamps || validTimestamp(checkInAt);
  const checkOutValid = !checkOutAt || validTimestamp(checkOutAt);
  const timeOrderValid = !needsTimestamps || !checkOutAt || !checkInAt || Date.parse(checkOutAt) >= Date.parse(checkInAt);
  const canSave = !saving && reasonValid && checkInValid && checkOutValid && timeOrderValid;
  const candidates = availableRows.filter(candidate => candidate.employee.id === row.employee.id
    && candidate.scheduleRuleId !== null && candidate.scheduleDate !== null);

  const submit = () => {
    if (!canSave) return;
    if (kind === 'absent') {
      onSubmit({ branchId: 1, reason: reason.trim() });
      return;
    }
    if (kind === 'resolve-conflict') {
      onSubmit({ reason: reason.trim() });
      return;
    }
    if (kind === 'manual') {
      onSubmit({
        employeeId: row.employee.id, branchId: 1, checkInAt: checkInAt.trim(),
        ...(checkOutAt.trim() ? { checkOutAt: checkOutAt.trim() } : {}),
        ...(scheduleRuleId !== null && scheduleDate ? { scheduleRuleId, scheduleDate } : {}),
        reason: reason.trim()
      });
      return;
    }
    onSubmit({
      checkInAt: checkInAt.trim(), ...(checkOutAt.trim() ? { checkOutAt: checkOutAt.trim() } : {}),
      scheduleRuleId, scheduleDate, reason: reason.trim()
    });
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{row.employee.name} · {row.employee.code} · {row.workDate}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={onCancel} testID="attendance-correction-close">
            <Text style={[styles.close, { color: theme.textSecondary }]}>×</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
          {kind === 'resolve-conflict' && <View testID="attendance-conflict-resolution-summary" style={[styles.conflictSummary, { backgroundColor: theme.interactiveSecondary }]}>
            <Text style={[styles.body, { color: theme.textPrimary }]}>Giữ nguyên phiên chấm công thực tế; chỉ gỡ quyết định vắng mặt đang xung đột.</Text>
            {row.disposition && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Lý do vắng hiện tại: {row.disposition.reason}</Text>}
            {session && <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Thực tế: vào {localTimestamp(session.checkInAt)} · ra {session.checkOutAt ? localTimestamp(session.checkOutAt) : 'chưa có'}</Text>}
          </View>}
          {needsTimestamps && <>
            <Text style={[styles.label, { color: theme.textPrimary }]}>Giờ vào thực tế · múi giờ Việt Nam</Text>
            <TextInput testID="attendance-check-in-input" accessibilityLabel="Giờ vào thực tế" value={checkInAt}
              onChangeText={setCheckInAt} placeholder="2026-09-29T08:07:00+07:00" autoCapitalize="none"
              style={[styles.input, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} />
            <Text style={[styles.label, { color: theme.textPrimary }]}>Giờ ra thực tế (để trống nếu chưa tan ca)</Text>
            <TextInput testID="attendance-check-out-input" accessibilityLabel="Giờ ra thực tế" value={checkOutAt}
              onChangeText={setCheckOutAt} placeholder="2026-09-29T12:03:00+07:00" autoCapitalize="none"
              style={[styles.input, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} />
            <Text style={[styles.label, { color: theme.textPrimary }]}>Liên kết lịch ca</Text>
            <Pressable testID="attendance-link-outside" accessibilityRole="radio" accessibilityState={{ selected: scheduleRuleId === null }}
              onPress={() => { setScheduleRuleId(null); setScheduleDate(null); }}
              style={[styles.choice, { borderColor: theme.borderSubtle, backgroundColor: scheduleRuleId === null ? theme.interactiveSecondary : theme.surfaceBase }]}>
              <Text style={[styles.body, { color: theme.textPrimary }]}>Chấm công ngoài lịch</Text>
            </Pressable>
            {candidates.map(candidate => <Pressable key={`${candidate.scheduleRuleId}:${candidate.scheduleDate}`}
              testID={`attendance-link-${candidate.scheduleRuleId}-${candidate.scheduleDate}`} accessibilityRole="radio"
              accessibilityState={{ selected: scheduleRuleId === candidate.scheduleRuleId && scheduleDate === candidate.scheduleDate }}
              onPress={() => { setScheduleRuleId(candidate.scheduleRuleId); setScheduleDate(candidate.scheduleDate); }}
              style={[styles.choice, { borderColor: theme.borderSubtle, backgroundColor: scheduleRuleId === candidate.scheduleRuleId && scheduleDate === candidate.scheduleDate ? theme.interactiveSecondary : theme.surfaceBase }]}>
              <Text style={[styles.body, { color: theme.textPrimary }]}>{candidate.shift?.name ?? 'Ca làm việc'} · {candidate.workDate}</Text>
            </Pressable>)}
          </>}
          <Text style={[styles.label, { color: theme.textPrimary }]}>Lý do bắt buộc</Text>
          <TextInput testID="attendance-correction-reason" accessibilityLabel="Lý do" value={reason}
            onChangeText={setReason} multiline maxLength={500} placeholder="Nhập lý do để lưu lịch sử kiểm tra"
            style={[styles.input, styles.reasonInput, { color: theme.textPrimary, borderColor: theme.borderSubtle }]} />
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger ?? '#B42318' }]}>{error}</Text> : null}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.button, { borderColor: theme.borderSubtle }]}>
            <Text style={[styles.buttonText, { color: theme.textPrimary }]}>Bỏ qua</Text>
          </Pressable>
          <Pressable testID="attendance-correction-save" accessibilityRole="button" accessibilityState={{ disabled: !canSave }}
            disabled={!canSave} onPress={submit} style={[styles.button, styles.primaryButton, { backgroundColor: canSave ? theme.primary : theme.borderSubtle }]}>
            <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>{saving ? 'Đang lưu…' : 'Lưu'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>;
};

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: 'rgba(22, 24, 29, 0.45)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: { borderRadius: radii.md, borderWidth: 1, maxHeight: '90%', maxWidth: 640, overflow: 'hidden', width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.lg },
  subtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  close: { fontSize: 28, lineHeight: 28, paddingHorizontal: spacing.xs },
  form: { maxHeight: 560 },
  formContent: { gap: spacing.sm, padding: spacing.lg },
  conflictSummary: { borderRadius: radii.sm, gap: spacing.xs, padding: spacing.md },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, marginTop: spacing.xs },
  input: { borderRadius: radii.sm, borderWidth: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm, minHeight: 42, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  reasonInput: { minHeight: 84, textAlignVertical: 'top' },
  choice: { borderRadius: radii.sm, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  body: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  error: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  footer: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md },
  button: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', minHeight: 42, minWidth: 88, paddingHorizontal: spacing.md },
  primaryButton: { borderColor: 'transparent' },
  buttonText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm }
});
