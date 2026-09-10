import React, { useEffect, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Minus, Plus, X } from 'lucide-react-native';
import { MenuItemDto, SelectedModifierDto } from '../../api/contracts';
import { useTheme } from '../../contexts/ThemeContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, Field, InlineAlert, StatusBadge } from '../../ui';

interface Props {
  visible: boolean;
  item: MenuItemDto | null;
  onClose: () => void;
  onAddToCart: (
    item: MenuItemDto,
    quantity: number,
    selectedModifiers: SelectedModifierDto[],
    notes?: string
  ) => void;
}

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

export const ModifierModal: React.FC<Props> = ({ visible, item, onClose, onAddToCart }) => {
  const { theme } = useTheme();
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number[]>>({});
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible && item) {
      setQuantity(1);
      setNotes('');
      const initialSelection: Record<number, number[]> = {};
      item.modifierGroups?.forEach((group) => {
        initialSelection[group.id] = group.isRequired && group.minSelect === 1 && group.maxSelect === 1 && group.options.length > 0
          ? [group.options[0].id]
          : [];
      });
      setSelectedModifiers(initialSelection);
    }
  }, [visible, item]);

  if (!item) return null;

  const handleSelectOption = (groupId: number, optionId: number, maxSelect: number) => {
    setSelectedModifiers((previous) => {
      const current = previous[groupId] || [];
      if (maxSelect === 1) return { ...previous, [groupId]: [optionId] };
      if (current.includes(optionId)) return { ...previous, [groupId]: current.filter((id) => id !== optionId) };
      if (current.length >= maxSelect) return previous;
      return { ...previous, [groupId]: [...current, optionId] };
    });
  };

  const validationErrors = (item.modifierGroups || []).flatMap((group) => {
    const selectedCount = (selectedModifiers[group.id] || []).length;
    return group.isRequired && selectedCount < group.minSelect
      ? [`Chọn ít nhất ${group.minSelect} lựa chọn trong “${group.name}”.`]
      : [];
  });
  const isValid = validationErrors.length === 0;

  let modifierTotal = 0;
  item.modifierGroups?.forEach((group) => {
    const selectedOptionIds = selectedModifiers[group.id] || [];
    group.options.forEach((option) => {
      if (selectedOptionIds.includes(option.id)) modifierTotal += option.priceDelta;
    });
  });
  const unitPrice = item.basePrice + modifierTotal;
  const totalPrice = unitPrice * quantity;

  const handleConfirm = () => {
    if (!isValid) return;
    const resultModifiers: SelectedModifierDto[] = [];
    item.modifierGroups?.forEach((group) => {
      const selectedOptionIds = selectedModifiers[group.id] || [];
      group.options.forEach((option) => {
        if (selectedOptionIds.includes(option.id)) {
          resultModifiers.push({
            modifierGroupId: group.id,
            groupName: group.name,
            optionId: option.id,
            optionName: option.name,
            priceDelta: option.priceDelta
          });
        }
      });
    });
    onAddToCart(item, quantity, resultModifiers, notes.trim() || undefined);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <SafeAreaView style={[styles.container, elevation.modal, { backgroundColor: theme.surfaceBase }]}>
          <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{item.name}</Text>
              <Text style={[styles.basePrice, { color: theme.textSecondary }]}>Giá cơ bản {formatVND(item.basePrice)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng tùy chọn món"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
            >
              <AppIcon icon={X} color={theme.textPrimary} size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {validationErrors.length > 0 && <InlineAlert tone="warning" title="Cần thêm lựa chọn" message={validationErrors.join(' ')} />}

            {item.modifierGroups?.map((group) => {
              const currentSelected = selectedModifiers[group.id] || [];
              const isSingleSelect = group.maxSelect === 1;
              return (
                <View key={group.id} style={[styles.group, { borderBottomColor: theme.borderSubtle }]}>
                  <View style={styles.groupHeader}>
                    <View style={styles.groupTitleCopy}>
                      <Text style={[styles.groupName, { color: theme.textPrimary }]}>{group.name}</Text>
                      <Text style={[styles.groupRule, { color: theme.textSecondary }]}>
                        {isSingleSelect ? 'Chọn một' : `Chọn tối đa ${group.maxSelect}`}
                      </Text>
                    </View>
                    <StatusBadge tone={group.isRequired ? 'warning' : 'neutral'} label={group.isRequired ? 'Bắt buộc' : 'Tùy chọn'} />
                  </View>

                  <View>
                    {group.options.map((option, optionIndex) => {
                      const isSelected = currentSelected.includes(option.id);
                      return (
                        <Pressable
                          testID={`modifier-option-${option.id}`}
                          key={option.id}
                          accessibilityRole={isSingleSelect ? 'radio' : 'checkbox'}
                          accessibilityState={{ checked: isSelected }}
                          onPress={() => handleSelectOption(group.id, option.id, group.maxSelect)}
                          style={({ pressed }) => [
                            styles.option,
                            optionIndex > 0 && { borderTopColor: theme.borderSubtle, borderTopWidth: 1 },
                            pressed && { backgroundColor: theme.surfaceSunken }
                          ]}
                        >
                          <View style={styles.optionCopy}>
                            <View style={[
                              styles.control,
                              isSingleSelect ? styles.radio : styles.checkbox,
                              { borderColor: isSelected ? theme.primary : theme.borderStrong }
                            ]}>
                              {isSelected && (isSingleSelect
                                ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />
                                : <AppIcon icon={Check} color={theme.primary} size={14} />)}
                            </View>
                            <Text style={[styles.optionName, { color: isSelected ? theme.primary : theme.textPrimary }]}>{option.name}</Text>
                          </View>
                          <Text style={[styles.optionPrice, { color: isSelected ? theme.primary : theme.textSecondary }]}>
                            {option.priceDelta > 0 ? `+${formatVND(option.priceDelta)}` : 'Không thêm phí'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            <Field
              label="Ghi chú cho bếp"
              description="Không bắt buộc, tối đa 120 ký tự."
              placeholder="Ví dụ: Ít đá, không tương ớt"
              value={notes}
              onChangeText={setNotes}
              maxLength={120}
              multiline
              style={styles.notesInput}
            />

            <View style={[styles.quantityRow, { borderTopColor: theme.borderSubtle }]}>
              <View>
                <Text style={[styles.quantityLabel, { color: theme.textPrimary }]}>Số lượng</Text>
                <Text style={[styles.quantityUnitPrice, { color: theme.textSecondary }]}>Đơn giá {formatVND(unitPrice)}</Text>
              </View>
              <View style={styles.quantityControls}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Giảm số lượng"
                  onPress={() => setQuantity((current) => Math.max(1, current - 1))}
                  style={({ pressed }) => [styles.quantityButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
                >
                  <AppIcon icon={Minus} color={theme.textPrimary} size={18} />
                </Pressable>
                <Text style={[styles.quantityValue, { color: theme.textPrimary }]}>{quantity}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tăng số lượng"
                  onPress={() => setQuantity((current) => current + 1)}
                  style={({ pressed }) => [styles.quantityButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
                >
                  <AppIcon icon={Plus} color={theme.textPrimary} size={18} />
                </Pressable>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
            <View style={styles.footerTotal}>
              <Text style={[styles.footerLabel, { color: theme.textSecondary }]}>Thành tiền</Text>
              <Text style={[styles.footerValue, { color: theme.primary }]}>{formatVND(totalPrice)}</Text>
            </View>
            <Button
              testID="btn-modal-add-to-cart"
              variant="primary"
              label={isValid ? 'Thêm vào giỏ' : 'Chọn đủ mục bắt buộc'}
              disabled={!isValid}
              onPress={handleConfirm}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  container: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '92%', minHeight: '60%', overflow: 'hidden' },
  header: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg },
  headerCopy: { flex: 1, gap: 2, paddingRight: spacing.md },
  title: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, lineHeight: typography.lineHeights.xl },
  basePrice: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, fontVariant: [...typography.numeric.fontVariant] },
  closeButton: { alignItems: 'center', borderRadius: radii.sm, height: 44, justifyContent: 'center', width: 44 },
  body: { padding: spacing.lg },
  group: { borderBottomWidth: 1, gap: spacing.sm, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  groupHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  groupTitleCopy: { flex: 1, gap: 2 },
  groupName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  groupRule: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  option: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: spacing.touchTargetPOS, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  optionCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, paddingRight: spacing.sm },
  control: { alignItems: 'center', borderWidth: 2, height: 22, justifyContent: 'center', width: 22 },
  radio: { borderRadius: radii.pill },
  checkbox: { borderRadius: radii.xs },
  radioDot: { borderRadius: radii.pill, height: 10, width: 10 },
  optionName: { flex: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  optionPrice: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.xs, fontVariant: [...typography.numeric.fontVariant] },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  quantityRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, paddingTop: spacing.lg },
  quantityLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  quantityUnitPrice: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, fontVariant: [...typography.numeric.fontVariant] },
  quantityControls: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  quantityButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  quantityValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, minWidth: 32, textAlign: 'center' },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: spacing.lg, justifyContent: 'space-between', padding: spacing.lg },
  footerTotal: { gap: 2 },
  footerLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  footerValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, fontVariant: [...typography.numeric.fontVariant] }
});
