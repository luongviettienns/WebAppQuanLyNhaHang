import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchKitchenWasteOptionsApi, recordKitchenWasteApi } from '../../api/inventory';
import type { KitchenWasteCreateDto, KitchenWasteOptionsDto } from '../../api/contracts';
import { Button, InlineAlert, Surface } from '../../ui';
import { radii, spacing, typography } from '../../theme';
import { clearPendingKitchenWaste, PendingKitchenWaste, readPendingKitchenWaste, savePendingKitchenWaste } from './kitchenWasteRequest';

const formatQuantity = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(value);
const searchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
const reasons = ['Cháy khét trong lúc chiên', 'Rơi vỡ khay', 'Hết hạn bảo quản', 'Khách đổi món khác'];

export const KitchenWasteModal: React.FC<{ onClose: () => void; onRecorded: () => void }> = ({ onClose, onRecorded }) => {
  const { token, user } = useAuth();
  const { theme } = useTheme();
  const { showToast } = useToast();
  const [options, setOptions] = useState<KitchenWasteOptionsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [type, setType] = useState<KitchenWasteCreateDto['type']>('MENU_ITEM');
  const [targetId, setTargetId] = useState<number | null>(null);
  const [quantityText, setQuantityText] = useState('1');
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingKitchenWaste | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const submitting = useRef(false);
  const actorId = user?.id;
  const locked = busy || pending !== null;

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadFailed(false);
    const load = async () => {
      if (!actorId) { setError('Không xác định được nhân viên báo hao hụt.'); setLoading(false); setLoadFailed(true); return; }
      const [catalog, stored] = await Promise.allSettled([fetchKitchenWasteOptionsApi(token), readPendingKitchenWaste(actorId)]);
      if (!active) return;
      if (catalog.status === 'fulfilled') setOptions(catalog.value);
      else { setError(catalog.reason?.message || 'Không thể tải nguyên liệu.'); setLoadFailed(true); }
      if (stored.status === 'fulfilled' && stored.value) {
        const restored = stored.value;
        setPending(restored); setType(restored.input.type);
        setTargetId(restored.input.type === 'INGREDIENT' ? restored.input.ingredientId! : restored.input.menuItemId!);
        setQuantityText(String(restored.input.quantity)); setReason(restored.input.reason); setNote(restored.input.note || '');
      } else if (stored.status === 'rejected') { setError(stored.reason?.message || 'Không thể khôi phục phiếu đang chờ.'); setLoadFailed(true); }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [actorId, token, reload]);

  const quantity = /^\d+(?:[.,]\d+)?$/.test(quantityText.trim()) ? Number(quantityText.trim().replace(',', '.')) : NaN;
  const validQuantity = Number.isFinite(quantity) && quantity > 0;
  const ingredient = type === 'INGREDIENT' ? options?.ingredients.find(item => item.id === targetId) : undefined;
  const recipe = type === 'MENU_ITEM' ? options?.recipes.find(item => item.menuItemId === targetId) : undefined;
  const unit = type === 'MENU_ITEM' ? 'phần' : ingredient?.unit || 'đơn vị kho';
  const preview = !validQuantity ? [] : ingredient ? [{ ingredientId: ingredient.id, name: ingredient.name, unit: ingredient.unit, currentStock: ingredient.currentStock, amount: quantity }] :
    (recipe?.ingredients || []).map(item => ({ ...item, amount: item.quantityRequired * quantity }));
  const canSubmit = !loading && !!actorId && (pending !== null ||
    (!loadFailed && !!targetId && validQuantity && reason.trim().length >= 2 && preview.length > 0));
  const query = searchText(search.trim());
  const choices = type === 'INGREDIENT' ? options?.ingredients.filter(item => searchText(`${item.sku} ${item.name}`).includes(query)) :
    options?.recipes.filter(item => searchText(item.menuItemName).includes(query));

  const changeType = (next: KitchenWasteCreateDto['type']) => {
    if (locked) return;
    setType(next); setTargetId(null); setQuantityText('1'); setSearch(''); setError(null);
  };
  const submit = async () => {
    if (submitting.current || !canSubmit || !actorId) return;
    submitting.current = true; setBusy(true); setError(null);
    let attempt = pending;
    try {
      if (!attempt) {
        const input: KitchenWasteCreateDto = { type, quantity, reason: reason.trim(), note: note.trim() || undefined,
          ...(type === 'INGREDIENT' ? { ingredientId: targetId! } : { menuItemId: targetId! }) };
        attempt = await savePendingKitchenWaste(actorId, input);
        setPending(attempt);
      }
      await recordKitchenWasteApi(token, attempt.input, attempt.key);
      await clearPendingKitchenWaste(actorId);
      setPending(null);
      showToast({ type: 'success', title: 'Đã ghi nhận hao hụt', message: `Đã ghi ${formatQuantity(attempt.input.quantity)} ${unit}.` });
      onRecorded(); onClose();
    } catch (failure: unknown) {
      const failed = failure as Error & { status?: number };
      if (failed.status && failed.status >= 400 && failed.status < 500) {
        try { await clearPendingKitchenWaste(actorId); setPending(null); }
        catch { /* Keep the same request when local cleanup is uncertain. */ }
      }
      setError(failed.message || 'Chưa xác định được kết quả. Vui lòng thử lại cùng phiếu.');
    } finally { submitting.current = false; setBusy(false); }
  };
  const inputStyle = [styles.input, { color: theme.textPrimary, backgroundColor: theme.surfaceBase, borderColor: theme.borderStrong }];

  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!locked) onClose(); }}>
    <View style={styles.backdrop}>
      <Surface level="raised" style={[styles.dialog, { backgroundColor: theme.surfaceRaised }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Ghi nhận hao hụt bếp</Text>
        {loading ? <ActivityIndicator accessibilityLabel="Đang tải nguyên liệu" color={theme.primary} /> : null}
        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {pending && <InlineAlert message="Phiếu này đang chờ xác nhận kết quả. Thử lại cùng phiếu để tránh trừ kho hai lần." />}
          <View style={styles.types}>
            {(['MENU_ITEM', 'INGREDIENT'] as const).map(value => <Pressable key={value} testID={`waste-type-${value === 'INGREDIENT' ? 'ingredient' : 'menu'}`}
              accessibilityRole="button" accessibilityState={{ selected: type === value, disabled: locked }} disabled={locked}
              onPress={() => changeType(value)} style={[styles.choice, { borderColor: type === value ? theme.primary : theme.borderSubtle }]}>
              <Text style={{ color: theme.textPrimary }}>{value === 'MENU_ITEM' ? 'Theo món (toàn bộ BOM)' : 'Theo nguyên liệu'}</Text>
            </Pressable>)}
          </View>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Tìm {type === 'INGREDIENT' ? 'nguyên liệu hoặc mã nguyên liệu' : 'món ăn'}</Text>
          <TextInput testID="waste-search" accessibilityLabel="Tìm món hoặc nguyên liệu hao hụt" value={search} onChangeText={setSearch} editable={!locked} style={inputStyle} />
          <ScrollView style={styles.choices} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {choices?.map(item => {
              const id = 'id' in item ? item.id : item.menuItemId;
              const label = 'name' in item ? `${item.name} · ${item.unit} · tồn ${formatQuantity(item.currentStock)}` : item.menuItemName;
              return <Pressable key={id} testID={`waste-${type === 'INGREDIENT' ? 'ingredient' : 'menu'}-${id}`} disabled={locked}
                accessibilityRole="button" accessibilityState={{ selected: targetId === id, disabled: locked }}
                onPress={() => { setTargetId(id); setError(null); }} style={[styles.choice, { borderColor: targetId === id ? theme.primary : theme.borderSubtle }]}>
                <Text style={{ color: theme.textPrimary }}>{label}</Text>
              </Pressable>;
            })}
            {!loading && choices?.length === 0 && <Text style={{ color: theme.textSecondary }}>Không có kết quả phù hợp.</Text>}
          </ScrollView>
          <Text style={[styles.label, { color: theme.textPrimary }]}>Lượng hao hụt ({unit})</Text>
          <View style={styles.quantityRow}>
            <TextInput testID="waste-quantity" accessibilityLabel={`Lượng hao hụt (${unit})`} value={quantityText} onChangeText={setQuantityText}
              editable={!locked} keyboardType="decimal-pad" style={[inputStyle, styles.quantityInput]} />
            <Text style={{ color: theme.textPrimary }}>{unit}</Text>
          </View>
          <Text style={{ color: theme.textSecondary }}>{type === 'MENU_ITEM'
            ? 'Nhập số phần món bị hỏng.'
            : ingredient ? `Đơn vị kho: ${unit}. Nhập lượng mất theo đơn vị này, dùng dấu phẩy hoặc dấu chấm thập phân.`
              : 'Chọn nguyên liệu để xem đơn vị kho. Không tự đổi đơn vị.'}</Text>
          {!validQuantity && <InlineAlert message="Nhập số lượng lớn hơn 0, dùng dấu phẩy hoặc dấu chấm thập phân." />}
          {recipe && recipe.ingredients.length === 0 && <InlineAlert message="Món chưa có định lượng BOM. Nhờ quản lý cấu hình trước khi báo theo món." />}
          {preview.length > 0 && <View style={[styles.preview, { borderColor: theme.borderSubtle }]}>
            <Text style={[styles.label, { color: theme.textPrimary }]}>Lượng kho sẽ trừ (ước tính theo tồn vừa tải)</Text>
            {type === 'MENU_ITEM' && <Text style={{ color: theme.textSecondary }}>Trừ toàn bộ công thức. Nếu chỉ mất một nguyên liệu, chọn “Theo nguyên liệu”.</Text>}
            {preview.map(item => <View key={item.ingredientId} style={styles.previewLine}>
              <Text style={{ color: theme.textPrimary }}>{item.name}: trừ {formatQuantity(item.amount)} {item.unit}</Text>
              <Text style={{ color: theme.textSecondary }}>Tồn {formatQuantity(item.currentStock)} → {formatQuantity(item.currentStock - item.amount)} {item.unit}</Text>
              {item.currentStock - item.amount < 0 && <Text style={{ color: theme.danger }}>Tồn dự kiến âm; kiểm tra lại lượng thực tế.</Text>}
            </View>)}
          </View>}
          <Text style={[styles.label, { color: theme.textPrimary }]}>Lý do hao hụt</Text>
          <View style={styles.types}>{reasons.map(value => <Pressable key={value} disabled={locked} accessibilityRole="button"
            accessibilityState={{ selected: reason === value, disabled: locked }} onPress={() => setReason(value)}
            style={[styles.choice, { borderColor: reason === value ? theme.primary : theme.borderSubtle }]}>
            <Text style={{ color: theme.textPrimary }}>{value}</Text>
          </Pressable>)}</View>
          <TextInput testID="waste-reason" accessibilityLabel="Lý do hao hụt" value={reason} onChangeText={setReason} editable={!locked} maxLength={500} style={inputStyle} />
          <Text style={[styles.label, { color: theme.textPrimary }]}>Ghi chú thêm</Text>
          <TextInput testID="waste-note" accessibilityLabel="Ghi chú hao hụt" value={note} onChangeText={setNote} editable={!locked} maxLength={1000} multiline style={inputStyle} />
          {error && <InlineAlert message={error} />}
          {loadFailed && <Button label="Tải lại dữ liệu" disabled={busy} onPress={() => { setError(null); setReload(value => value + 1); }} />}
        </ScrollView>
        <View style={styles.footer}>
          <Button variant="quiet" label="Hủy bỏ" disabled={locked} onPress={onClose} />
          <Button testID="btn-confirm-submit-waste" variant="danger" label={pending ? 'Thử lại cùng phiếu' : 'Xác nhận hao hụt'}
            loading={busy} disabled={!canSubmit || busy} onPress={() => void submit()} />
        </View>
      </Surface>
    </View>
  </Modal>;
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '90%', padding: spacing.lg, borderRadius: radii.md },
  title: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.lg, marginBottom: spacing.md },
  body: { flexShrink: 1 }, types: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.sm },
  label: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, marginVertical: spacing.sm },
  input: { borderWidth: 1, borderRadius: radii.sm, minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: typography.sizes.md },
  choices: { maxHeight: 160, marginTop: spacing.sm }, choice: { borderWidth: 1, borderRadius: radii.sm, minHeight: 48, justifyContent: 'center', padding: spacing.sm, marginBottom: spacing.xs },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, quantityInput: { flex: 1 },
  preview: { borderWidth: 1, borderRadius: radii.sm, padding: spacing.sm, marginTop: spacing.md }, previewLine: { gap: spacing.xs, marginVertical: spacing.sm },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md }
});
