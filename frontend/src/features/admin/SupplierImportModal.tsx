import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button, InlineAlert } from '../../ui';
import { commitSupplierImportApi, downloadSuppliersApi, previewSupplierImportApi, SupplierImportPreview } from '../../api/suppliers';
import { SupplierModalShell } from './SupplierModalShell';
import { pickSupplierFile, requireSupplierFileSupport, saveSupplierFile } from './supplierFiles';

export function SupplierImportModal({ onClose, onImported }: { onClose: () => void; onImported: (count: number) => void }) {
  const { token } = useAuth(); const { theme } = useTheme();
  const [preview, setPreview] = useState<SupplierImportPreview | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const busyRef = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); } catch (failure: any) { setError(failure.message || 'Không thể xử lý file'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const choose = () => run(async () => {
    const file = await pickSupplierFile();
    if (file) { setPreview(null); setPreview(await previewSupplierImportApi(token, file.fileName, file.fileBase64)); }
  });
  const template = () => run(async () => { requireSupplierFileSupport(); saveSupplierFile(await downloadSuppliersApi(token, {}, 'xlsx', true), 'Mau_nha_cung_cap.xlsx'); });
  const commit = () => run(async () => {
    if (!preview || preview.errorRows.length || !preview.validRows.length) return;
    const result = await commitSupplierImportApi(token, preview.validRows.map(row => row.data));
    onImported(result.createdCount);
  });
  return <SupplierModalShell visible title="Nhập nhà cung cấp từ file" onClose={onClose} busy={busy}
    footer={<><Button variant="quiet" label="Đóng" onPress={onClose} disabled={busy} /><Button variant="primary" label={'Nhập ' + (preview?.validRows.length || 0) + ' nhà cung cấp'} onPress={commit} loading={busy} disabled={!preview?.validRows.length || !!preview.errorRows.length} /></>}>
    <Text style={{ color: theme.textSecondary }}>Nhập mới tối đa 500 nhà cung cấp từ XLSX hoặc CSV (5 MB). Mã trùng không được ghi đè. Nếu có dòng lỗi, sửa file rồi chọn lại.</Text>
    <View style={styles.actions}><Button variant="secondary" label="Tải file mẫu" onPress={template} disabled={busy} /><Button variant="primary" label="Chọn file" onPress={choose} disabled={busy} /></View>
    {!!error && <InlineAlert message={error} />}
    {preview && <>
      <Text style={{ color: theme.textPrimary }}>{preview.fileName} — {preview.validRows.length} hợp lệ, {preview.errorRows.length} lỗi</Text>
      {preview.errorRows.map(row => <InlineAlert key={row.rowNumber} message={'Dòng ' + row.rowNumber + ' · ' + row.name + ': ' + row.error} />)}
      {preview.validRows.map(row => <View key={row.rowNumber} style={[styles.row, { borderBottomColor: theme.borderSubtle }]}><Text style={{ color: theme.textSecondary, width: 45 }}>{row.rowNumber}</Text><Text style={{ color: theme.primary, width: 140 }}>{row.data.code || 'Mã tự động'}</Text><Text style={{ color: theme.textPrimary, flex: 1 }}>{row.data.name}</Text></View>)}
    </>}
  </SupplierModalShell>;
}
const styles = StyleSheet.create({ actions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' }, row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1 } });
