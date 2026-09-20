import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CategoryDto, MenuBulkAction, MenuBulkPayload, MenuItemType, MenuType } from '../../api/contracts';
import { useTheme } from '../../contexts/ThemeContext';
import { Button, Field } from '../../ui';
import { radii, spacing, typography } from '../../theme';
import { buildBulkPayload, getBulkActionLabel } from './menuBulkViewModel';

interface MenuBulkActionsProps {
  selectedIds: number[];
  categories: CategoryDto[];
  loading?: boolean;
  onSubmit: (action: MenuBulkAction, payload: MenuBulkPayload) => Promise<boolean>;
  onClear: () => void;
}

const ACTIONS: MenuBulkAction[] = [
  'setAvailability',
  'setCategory',
  'setMenuType',
  'setItemType',
  'setTrackStock',
  'adjustStock',
  'delete'
];

const MENU_TYPES: Array<{ value: MenuType; label: string }> = [
  { value: 'FOOD', label: 'Đồ ăn' },
  { value: 'DRINK', label: 'Đồ uống' },
  { value: 'SERVICE', label: 'Dịch vụ' },
  { value: 'OTHER', label: 'Khác' }
];

const ITEM_TYPES: Array<{ value: MenuItemType; label: string }> = [
  { value: 'REGULAR', label: 'Món thường' },
  { value: 'TOPPING', label: 'Món thêm' },
  { value: 'COMBO', label: 'Combo' },
  { value: 'SERVICE', label: 'Dịch vụ' }
];

export const MenuBulkActions: React.FC<MenuBulkActionsProps> = ({
  selectedIds,
  categories,
  loading = false,
  onSubmit,
  onClear
}) => {
  const { theme } = useTheme();
  const [selectedAction, setSelectedAction] = useState<MenuBulkAction | null>(null);
  const [value, setValue] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const firstCategoryId = categories[0]?.id;
  const actionTitle = selectedAction ? getBulkActionLabel(selectedAction) : '';
  const busy = loading || isSubmitting;

  const openAction = (action: MenuBulkAction) => {
    setError(null);
    setSelectedAction(action);
    if (action === 'setAvailability') setValue(false);
    else if (action === 'setCategory') setValue(firstCategoryId);
    else if (action === 'setMenuType') setValue('FOOD');
    else if (action === 'setItemType') setValue('REGULAR');
    else if (action === 'setTrackStock') setValue(true);
    else if (action === 'adjustStock') setValue(0);
    else setValue(undefined);
  };

  const closeAction = () => {
    if (busy) return;
    setSelectedAction(null);
    setError(null);
  };

  const submit = async () => {
    if (!selectedAction) return;
    try {
      const payload = buildBulkPayload(selectedAction, value);
      setIsSubmitting(true);
      const success = await onSubmit(selectedAction, payload);
      if (success) {
        setSelectedAction(null);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Giá trị cập nhật không hợp lệ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const options = useMemo(() => {
    if (selectedAction === 'setCategory') return categories.map(category => ({ value: category.id, label: category.name }));
    if (selectedAction === 'setMenuType') return MENU_TYPES;
    if (selectedAction === 'setItemType') return ITEM_TYPES;
    if (selectedAction === 'setAvailability') return [{ value: true, label: 'Cho phép bán' }, { value: false, label: 'Ngừng bán' }];
    if (selectedAction === 'setTrackStock') return [{ value: true, label: 'Bật theo dõi tồn' }, { value: false, label: 'Tắt theo dõi tồn' }];
    return [];
  }, [categories, selectedAction]);

  return (
    <>
      <View style={[styles.toolbar, { backgroundColor: theme.interactiveQuiet, borderColor: theme.borderSubtle }]}>
        <View style={styles.toolbarCopy}>
          <Text style={[styles.toolbarTitle, { color: theme.textPrimary }]}>Đã chọn {selectedIds.length} món</Text>
          <Text style={[styles.toolbarHint, { color: theme.textSecondary }]}>Chọn một thao tác áp dụng cho toàn bộ danh sách.</Text>
        </View>
        <View style={styles.actions}>
          {ACTIONS.map(action => (
            <Button
              key={action}
              variant={action === 'delete' ? 'danger' : 'secondary'}
              label={getBulkActionLabel(action)}
              onPress={() => openAction(action)}
              loading={busy}
            />
          ))}
          <Button variant="quiet" label="Bỏ chọn" onPress={onClear} disabled={busy} />
        </View>
      </View>

      <Modal visible={selectedAction !== null} transparent animationType="fade" onRequestClose={closeAction}>
        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{actionTitle}</Text>
            <Text style={[styles.modalHint, { color: theme.textSecondary }]}>Thao tác sẽ áp dụng cho {selectedIds.length} món đã chọn.</Text>
            {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

            {options.length > 0 && (
              <ScrollView contentContainerStyle={styles.optionList} horizontal={false}>
                {options.map(option => {
                  const active = value === option.value;
                  return (
                    <Pressable
                      key={String(option.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      onPress={() => setValue(option.value)}
                      style={[styles.option, { backgroundColor: active ? theme.interactivePrimary : theme.interactiveQuiet, borderColor: active ? theme.interactivePrimary : theme.borderSubtle }]}
                    >
                      <Text style={[styles.optionText, { color: active ? theme.textInverse : theme.textPrimary }]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {selectedAction === 'adjustStock' && (
              <Field
                label="Số lượng thay đổi"
                placeholder="Ví dụ: 10 hoặc -2"
                keyboardType="numeric"
                value={String(value ?? '')}
                onChangeText={text => setValue(text === '' || text === '-' ? text : Number(text.replace(/[^0-9-]/g, '')))}
              />
            )}

            {selectedAction === 'delete' && (
              <Text style={[styles.warning, { color: theme.danger }]}>Món sẽ được ẩn khỏi trạng thái bán, dữ liệu và lịch sử vẫn được giữ lại.</Text>
            )}

            <View style={styles.modalActions}>
              <Button variant="quiet" label="Hủy" onPress={closeAction} disabled={busy} />
              <Button variant={selectedAction === 'delete' ? 'danger' : 'primary'} label="Áp dụng" onPress={() => void submit()} loading={busy} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  toolbar: { borderRadius: radii.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  toolbarCopy: { gap: spacing.xs },
  toolbarTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  toolbarHint: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  overlay: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modal: { borderRadius: radii.lg, borderWidth: 1, gap: spacing.md, maxWidth: 560, padding: spacing.lg, width: '100%' },
  modalTitle: { fontFamily: typography.families.bodyBold, fontSize: typography.sizes.lg },
  modalHint: { fontFamily: typography.families.body, fontSize: typography.sizes.md },
  error: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  warning: { fontFamily: typography.families.body, fontSize: typography.sizes.md },
  optionList: { gap: spacing.sm },
  option: { borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  optionText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  modalActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }
});
