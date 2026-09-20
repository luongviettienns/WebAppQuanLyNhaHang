import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { FileSpreadsheet, Upload, X } from 'lucide-react-native';
import { commitMenuImportApi, previewMenuImportApi } from '../../api/menuImport';
import { MenuImportCommitDto, MenuImportPreviewDto } from '../../api/contracts';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, Field, InlineAlert, Surface } from '../../ui';
import {
  canCommitMenuImport,
  getMenuImportErrorLabel,
  getMenuImportRowLabel,
  getMenuImportSummary,
  isSupportedMenuImportFile
} from './menuImportViewModel';

interface MenuImportModalProps {
  visible: boolean;
  onClose: () => void;
  onCommitted: (result: MenuImportCommitDto) => void;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const MenuImportModal: React.FC<MenuImportModalProps> = ({ visible, onClose, onCommitted }) => {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { showToast } = useToast();
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState('');
  const [createMissingCategories, setCreateMissingCategories] = useState(false);
  const [preview, setPreview] = useState<MenuImportPreviewDto | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setFileName('');
      setFileBase64('');
      setPreview(null);
      setError(null);
      setCreateMissingCategories(false);
      setIsPreviewing(false);
      setIsCommitting(false);
    }
  }, [visible]);

  const requestPreview = async (name: string, base64: string, createCategories: boolean) => {
    setIsPreviewing(true);
    setError(null);
    try {
      const result = await previewMenuImportApi(token, name, base64, createCategories);
      setPreview(result);
    } catch (previewError) {
      setPreview(null);
      setError(previewError instanceof Error ? previewError.message : 'Không thể đọc file menu');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePickFile = () => {
    if (Platform.OS !== 'web') {
      setError('Hãy mở trang quản trị trên trình duyệt web để chọn và import file CSV/XLSX.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!isSupportedMenuImportFile(file.name)) {
        setError('Chỉ hỗ trợ file CSV hoặc XLSX.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError('File import vượt quá giới hạn 5 MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const separatorIndex = dataUrl.indexOf(',');
        const base64 = separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl;
        if (!base64) {
          setError('Không đọc được dữ liệu file.');
          return;
        }
        setFileName(file.name);
        setFileBase64(base64);
        void requestPreview(file.name, base64, createMissingCategories);
      };
      reader.onerror = () => setError('Không đọc được file đã chọn.');
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleToggleCreateCategory = (nextValue: boolean) => {
    setCreateMissingCategories(nextValue);
    if (fileName && fileBase64) void requestPreview(fileName, fileBase64, nextValue);
  };

  const handleCommit = async () => {
    if (!preview || !canCommitMenuImport(preview)) return;
    setIsCommitting(true);
    setError(null);
    try {
      const result = await commitMenuImportApi(token, fileName, preview.validRows, createMissingCategories);
      onCommitted(result);
      showToast({
        type: 'success',
        title: 'Import menu thành công',
        message: `Đã tạo ${result.createdCount}, cập nhật ${result.updatedCount} món.`
      });
      onClose();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : 'Không thể ghi menu từ file');
    } finally {
      setIsCommitting(false);
    }
  };

  const canCommit = preview ? canCommitMenuImport(preview) : false;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Surface level="raised" style={[styles.card, elevation.modal, { backgroundColor: theme.surfaceBase }]}>
          <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Import menu</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Preview và kiểm tra trước khi ghi dữ liệu.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng import menu" onPress={onClose} style={styles.closeButton}>
              <AppIcon icon={X} color={theme.textSecondary} size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {Platform.OS !== 'web' && (
              <InlineAlert tone="info" title="Import trên web" message="Hãy mở trang quản trị bằng trình duyệt web để chọn file CSV/XLSX." />
            )}
            {error && <InlineAlert title="Chưa thể import menu" message={error} />}

            <View style={styles.fileActions}>
              <Button variant="secondary" label="Chọn file CSV/XLSX" icon={Upload} onPress={handlePickFile} disabled={Platform.OS !== 'web' || isPreviewing || isCommitting} />
              {isPreviewing && <ActivityIndicator color={theme.primary} />}
            </View>
            <Field label="File đã chọn" value={fileName} placeholder="Chưa chọn file" editable={false} />

            {preview && (
              <Surface level="sunken" style={styles.previewPanel}>
                <Text style={[styles.summary, { color: theme.textPrimary }]}>{getMenuImportSummary(preview)}</Text>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: createMissingCategories }}
                  onPress={() => handleToggleCreateCategory(!createMissingCategories)}
                  style={styles.checkboxRow}
                >
                  <View style={[styles.checkbox, { borderColor: theme.borderStrong, backgroundColor: createMissingCategories ? theme.interactivePrimary : theme.surfaceBase }]}>
                    {createMissingCategories && <Text style={{ color: theme.textInverse }}>✓</Text>}
                  </View>
                  <Text style={[styles.checkboxLabel, { color: theme.textPrimary }]}>Tạo category còn thiếu</Text>
                </Pressable>

                {preview.errorRows.length > 0 && (
                  <View style={styles.errorList}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Lỗi theo dòng</Text>
                    {preview.errorRows.map((row) => (
                      <Text key={`${row.rowNumber}-${row.error}`} style={[styles.errorText, { color: theme.danger }]}>{getMenuImportErrorLabel(row)}</Text>
                    ))}
                  </View>
                )}
                {preview.validRows.length > 0 && (
                  <View style={styles.validList}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Dòng hợp lệ</Text>
                    {preview.validRows.slice(0, 20).map((row) => (
                      <View key={`${row.rowNumber}-${row.name}`} style={styles.validRow}>
                        <AppIcon icon={FileSpreadsheet} color={theme.success} size={16} />
                        <Text style={[styles.validText, { color: theme.textSecondary }]}>{getMenuImportRowLabel(row)}</Text>
                      </View>
                    ))}
                    {preview.validRows.length > 20 && <Text style={[styles.moreText, { color: theme.textSecondary }]}>Và {preview.validRows.length - 20} dòng hợp lệ khác.</Text>}
                  </View>
                )}
              </Surface>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
            <Button variant="quiet" label="Hủy" onPress={onClose} disabled={isCommitting} />
            <Button variant="primary" label="Commit import" onPress={() => void handleCommit()} loading={isCommitting} disabled={!canCommit || isPreviewing} />
          </View>
        </Surface>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.58)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: { maxHeight: '92%', maxWidth: 760, overflow: 'hidden', width: '100%' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  headerCopy: { flex: 1, gap: spacing.xs },
  title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  subtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  closeButton: { alignItems: 'center', borderRadius: radii.md, justifyContent: 'center', minHeight: 40, minWidth: 40 },
  body: { gap: spacing.md, padding: spacing.lg },
  fileActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  previewPanel: { gap: spacing.md, padding: spacing.md },
  summary: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  checkboxRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  checkbox: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  checkboxLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  errorList: { gap: spacing.xs },
  errorText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  validList: { gap: spacing.xs },
  validRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  validText: { flex: 1, fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  moreText: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  footer: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.lg }
});
