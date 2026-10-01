import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FileSpreadsheet, Upload, X } from 'lucide-react-native';
import { commitEmployeeScheduleImportApi, previewEmployeeScheduleImportApi, type ScheduleImportPreviewDto } from '../../api/employeeScheduleManagement';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, InlineAlert, Surface } from '../../ui';

interface EmployeeScheduleImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onDownloadTemplate: () => void;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const importIntentKey = () => `schedule-import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const EmployeeScheduleImportModal: React.FC<EmployeeScheduleImportModalProps> = ({ visible, onClose, onSaved, onDownloadTemplate }) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ScheduleImportPreviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(importIntentKey);
  const [calendarWarningAcknowledged, setCalendarWarningAcknowledged] = useState(false);

  useEffect(() => {
    if (visible) return;
    setFileName(''); setPreview(null); setError(''); setLoading(false); setSaving(false); setCalendarWarningAcknowledged(false); setIdempotencyKey(importIntentKey());
  }, [visible]);

  const chooseFile = () => {
    if (Platform.OS !== 'web') { setError('Hãy mở trang quản trị trên trình duyệt web để chọn file CSV/XLSX.'); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!/\.(csv|xlsx)$/i.test(file.name)) { setError('Chỉ hỗ trợ file CSV hoặc XLSX.'); setPreview(null); return; }
      if (file.size > MAX_FILE_BYTES) { setError('File import tối đa 5 MB.'); setPreview(null); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const separator = dataUrl.indexOf(',');
        const base64 = separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
        if (!base64) { setError('Không đọc được dữ liệu file.'); return; }
        setFileName(file.name); setLoading(true); setError('');
        setCalendarWarningAcknowledged(false); setIdempotencyKey(importIntentKey());
        void previewEmployeeScheduleImportApi(token, file.name, base64).then(setPreview).catch(failure => {
          setPreview(null); setError(failure instanceof Error ? failure.message : 'Không thể kiểm tra file lịch');
        }).finally(() => setLoading(false));
      };
      reader.onerror = () => setError('Không đọc được file đã chọn.');
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const commit = async () => {
    if (!preview?.canCommit || preview.validRows.length === 0) return;
    setSaving(true); setError('');
    try {
      const result = await commitEmployeeScheduleImportApi(token, preview.validRows, calendarWarningAcknowledged, idempotencyKey);
      await onSaved();
      showToast({ type: 'success', title: 'Đã nhập lịch', message: `Đã tạo ${result.createdCount} lịch làm việc.` });
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thể lưu lịch từ file'); }
    finally { setSaving(false); }
  };

  return <Modal testID="employee-schedule-import-modal" visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Surface level="raised" style={[styles.dialog, elevation.modal, { backgroundColor: theme.surfaceBase }]}>
        <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Import lịch làm việc</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Xem lỗi theo dòng trước khi ghi vào lịch.</Text>
          </View>
          <Pressable testID="schedule-import-close" accessibilityRole="button" accessibilityLabel="Đóng import lịch" onPress={onClose} style={styles.closeButton}><AppIcon icon={X} color={theme.textSecondary} size={20} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {error ? <InlineAlert title="Chưa thể import lịch" message={error} testID="schedule-import-error" /> : null}
          {Platform.OS !== 'web' && <InlineAlert tone="info" title="Import trên web" message="Hãy mở trang quản trị bằng trình duyệt web để chọn file CSV/XLSX." />}
          <View style={styles.actions}>
            <Button testID="schedule-import-pick-file" variant="secondary" label="Chọn file CSV/XLSX" icon={Upload} onPress={chooseFile} disabled={loading || saving || Platform.OS !== 'web'} />
            <Button testID="schedule-import-template" variant="quiet" label="Tải file mẫu" icon={FileSpreadsheet} onPress={onDownloadTemplate} disabled={saving} />
            {loading && <ActivityIndicator color={theme.primary} />}
          </View>
          {!!fileName && <Text style={[styles.fileName, { color: theme.textSecondary }]}>{fileName}</Text>}
          {preview && <Surface level="sunken" style={styles.previewPanel}>
            <View style={styles.summaryRow}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>{preview.validRows.length}/{preview.totalRows} dòng hợp lệ</Text>
              <Text style={[styles.summaryStatus, { color: preview.canCommit ? theme.success : theme.danger }]}>{preview.canCommit ? 'Có thể lưu' : 'Cần sửa file'}</Text>
            </View>
            {preview.errorRows.length > 0 && <View style={styles.errorList}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Lỗi theo dòng</Text>
              {preview.errorRows.slice(0, 100).map(row => <Text key={`${row.rowNumber}-${row.error}`} style={[styles.errorText, { color: theme.danger }]}>Dòng {row.rowNumber}: {row.error}</Text>)}
              {preview.errorRows.length > 100 && <Text style={[styles.helper, { color: theme.textSecondary }]}>Còn {preview.errorRows.length - 100} dòng lỗi khác.</Text>}
            </View>}
            {(preview.warningRows?.length ?? 0) > 0 && <View testID="schedule-import-calendar-warnings" style={styles.errorList}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Ngày nghỉ/lễ cần xác nhận</Text>
              {(preview.warningRows ?? []).slice(0, 20).map(row => <Text key={`warning-${row.rowNumber}`} style={[styles.helper, { color: theme.textSecondary }]}>Dòng {row.rowNumber}: {row.calendarWarnings?.map(warning => warning.firstAffectedDate).join(', ')}</Text>)}
              <Pressable testID="schedule-import-warning-confirm" accessibilityRole="checkbox" accessibilityState={{ checked: calendarWarningAcknowledged }} onPress={() => setCalendarWarningAcknowledged(value => !value)} style={styles.warningConfirm}>
                <View style={[styles.warningCheckbox, { borderColor: theme.primary, backgroundColor: calendarWarningAcknowledged ? theme.primary : theme.surfaceBase }]} />
                <Text style={[styles.helper, { color: theme.textPrimary }]}>Tôi đã kiểm tra và vẫn muốn lưu các dòng này</Text>
              </Pressable>
            </View>}
            {preview.validRows.length > 0 && <Text style={[styles.helper, { color: theme.textSecondary }]}>Ví dụ: {preview.validRows.slice(0, 5).map(row => `${row.employeeCode} · ${row.workDate} · ${row.shiftCode}`).join(' / ')}</Text>}
          </Surface>}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
          <Button testID="schedule-import-cancel" variant="quiet" label="Bỏ qua" onPress={onClose} disabled={saving} />
          <Button testID="schedule-import-commit" variant="primary" label="Lưu lịch" onPress={() => void commit()} loading={saving} disabled={!preview?.canCommit || loading || ((preview?.warningRows?.length ?? 0) > 0 && !calendarWarningAcknowledged)} />
        </View>
      </Surface>
    </View>
  </Modal>;
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(36, 33, 31, 0.60)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  dialog: { maxHeight: '92%', maxWidth: 760, overflow: 'hidden', width: '100%' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  subtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  closeButton: { alignItems: 'center', borderRadius: radii.md, justifyContent: 'center', minHeight: 44, minWidth: 44 },
  body: { gap: spacing.lg, padding: spacing.lg },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fileName: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  previewPanel: { borderRadius: radii.md, gap: spacing.md, padding: spacing.md },
  summaryRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  summaryStatus: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  errorList: { gap: spacing.xs },
  errorText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  helper: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.sm },
  warningConfirm: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 44 },
  warningCheckbox: { borderRadius: radii.xs, borderWidth: 1, height: 20, width: 20 },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.md }
});
