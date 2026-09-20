import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FileSpreadsheet, Upload, X } from 'lucide-react-native';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { PriceListImportPreviewDto } from '../../api/contracts';
import { Button, Field, InlineAlert, Surface, AppIcon } from '../../ui';
import { radii, spacing, typography } from '../../theme';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const PriceListImportModal: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { previewPriceListImport, commitPriceListImport } = useRestaurant();
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState('');
  const [preview, setPreview] = useState<PriceListImportPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) { setFileName(''); setFileBase64(''); setPreview(null); setError(null); setBusy(false); }
  }, [visible]);

  const pickFile = () => {
    if (Platform.OS !== 'web') { setError('Hãy mở trang quản trị bằng trình duyệt web để chọn CSV/XLSX.'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) { setError('File vượt quá giới hạn 5 MB.'); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || '');
        const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
        setFileName(file.name); setFileBase64(base64); setBusy(true); setError(null);
        const result = await previewPriceListImport(file.name, base64);
        setBusy(false);
        if (!result.success) setError(result.error || 'Không thể đối soát file'); else setPreview(result.preview || null);
      };
      reader.onerror = () => setError('Không đọc được file.');
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const commit = async () => {
    if (!preview?.canCommit) return;
    setBusy(true); setError(null);
    const result = await commitPriceListImport(fileName, fileBase64);
    setBusy(false);
    if (!result.success) { setError(result.error || 'Không thể áp dụng file'); return; }
    showToast({ type: 'success', title: 'Import bảng giá thành công', message: `Đã cập nhật ${result.result?.updatedCount || 0} món.` });
    onClose();
  };

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><Surface style={styles.card}>
    <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}><View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.textPrimary }]}>Import bảng giá</Text><Text style={[styles.subtitle, { color: theme.textSecondary }]}>Đối soát trước, ghi dữ liệu sau.</Text></View><Pressable onPress={onClose}><AppIcon icon={X} color={theme.textSecondary} size={20} /></Pressable></View>
    <ScrollView contentContainerStyle={styles.body}>
      {Platform.OS !== 'web' && <InlineAlert tone="info" message="Chọn file import trên phiên bản web của trang quản trị." />}
      {error && <InlineAlert tone="danger" message={error} />}
      <View style={styles.fileRow}><Button variant="secondary" label="Chọn file CSV/XLSX" icon={Upload} onPress={pickFile} disabled={busy || Platform.OS !== 'web'} />{busy && <ActivityIndicator color={theme.primary} />}</View>
      <Field label="File đã chọn" value={fileName} placeholder="Chưa chọn file" editable={false} />
      {preview && <Surface style={[styles.preview, { backgroundColor: theme.surfaceSunken }]}><Text style={[styles.summary, { color: theme.textPrimary }]}>Tổng {preview.totalRows} dòng · Hợp lệ {preview.validRows.length} · Lỗi {preview.errorRows.length}</Text>{preview.errorRows.map(row => <Text key={`${row.rowNumber}-${row.sku}`} style={[styles.error, { color: theme.danger }]}>Dòng {row.rowNumber} · {row.sku}: {row.message}</Text>)}{preview.validRows.slice(0, 15).map(row => <View key={`${row.rowNumber}-${row.sku}`} style={styles.valid}><AppIcon icon={FileSpreadsheet} color={theme.success} size={15} /><Text style={[styles.validText, { color: theme.textSecondary }]}>Dòng {row.rowNumber} · {row.sku} · {row.salePrice.toLocaleString('vi-VN')} đ</Text></View>)}</Surface>}
    </ScrollView>
    <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}><Button variant="quiet" label="Hủy" onPress={onClose} /><Button label="Commit import" onPress={() => void commit()} loading={busy} disabled={!preview?.canCommit} /></View>
  </Surface></View></Modal>;
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.58)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  card: { maxHeight: '92%', maxWidth: 700, overflow: 'hidden', width: '100%' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', padding: spacing.lg },
  title: { fontFamily: typography.families.displayBold, fontSize: typography.sizes.xl },
  subtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, marginTop: 3 },
  body: { gap: spacing.md, padding: spacing.lg },
  fileRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  preview: { borderRadius: radii.md, gap: spacing.xs, padding: spacing.md },
  summary: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, marginBottom: spacing.xs },
  error: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  valid: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  validText: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  footer: { borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', padding: spacing.lg }
});
