import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView
} from 'react-native';
import { MenuItemDto, SelectedModifierDto } from '../../api/contracts';
import { colors, typography, spacing } from '../../theme';

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

export const ModifierModal: React.FC<Props> = ({ visible, item, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number[]>>({}); // groupId -> array of optionIds
  const [notes, setNotes] = useState<string>('');

  // Reset state when opening modal for a new item
  useEffect(() => {
    if (visible && item) {
      setQuantity(1);
      setNotes('');
      const initialSelection: Record<number, number[]> = {};

      // Auto pre-select default option for single-choice required groups if option price is 0
      item.modifierGroups?.forEach((group) => {
        if (group.isRequired && group.minSelect === 1 && group.maxSelect === 1 && group.options.length > 0) {
          initialSelection[group.id] = [group.options[0].id];
        } else {
          initialSelection[group.id] = [];
        }
      });

      setSelectedModifiers(initialSelection);
    }
  }, [visible, item]);

  if (!item) return null;

  const handleSelectOption = (groupId: number, optionId: number, maxSelect: number) => {
    setSelectedModifiers((prev) => {
      const current = prev[groupId] || [];
      if (maxSelect === 1) {
        // Single choice radio
        return { ...prev, [groupId]: [optionId] };
      } else {
        // Multi choice
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
        } else {
          if (current.length >= maxSelect) {
            return prev; // Exceeded max
          }
          return { ...prev, [groupId]: [...current, optionId] };
        }
      }
    });
  };

  // Validation: check if all required modifier groups satisfy minSelect
  const validationErrors: string[] = [];
  item.modifierGroups?.forEach((group) => {
    const selectedCount = (selectedModifiers[group.id] || []).length;
    if (group.isRequired && selectedCount < group.minSelect) {
      validationErrors.push(`Vui lòng chọn mục "${group.name}" (Tối thiểu ${group.minSelect} lựa chọn)`);
    }
  });

  const isValid = validationErrors.length === 0;

  // Calculate live total price
  const calculateTotal = () => {
    let extra = 0;
    item.modifierGroups?.forEach((group) => {
      const selectedOptionIds = selectedModifiers[group.id] || [];
      group.options.forEach((opt) => {
        if (selectedOptionIds.includes(opt.id)) {
          extra += opt.priceDelta;
        }
      });
    });

    const unitPrice = item.basePrice + extra;
    return {
      unitPrice,
      totalPrice: unitPrice * quantity
    };
  };

  const { unitPrice, totalPrice } = calculateTotal();

  const handleConfirm = () => {
    if (!isValid) return;

    // Convert selected map to array of SelectedModifierDto
    const resultModifiers: SelectedModifierDto[] = [];
    item.modifierGroups?.forEach((group) => {
      const selectedOptionIds = selectedModifiers[group.id] || [];
      group.options.forEach((opt) => {
        if (selectedOptionIds.includes(opt.id)) {
          resultModifiers.push({
            modifierGroupId: group.id,
            groupName: group.name,
            optionId: opt.id,
            optionName: opt.name,
            priceDelta: opt.priceDelta
          });
        }
      });
    });

    onAddToCart(item, quantity, resultModifiers, notes.trim() || undefined);
  };

  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <SafeAreaView style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>{item.name}</Text>
              <Text style={styles.basePriceText}>Giá cơ bản: {formatVND(item.basePrice)}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Validation Errors Notice */}
            {validationErrors.length > 0 && (
              <View style={styles.warningBox}>
                {validationErrors.map((err, idx) => (
                  <Text key={idx} style={styles.warningText}>
                    ⚠️ {err}
                  </Text>
                ))}
              </View>
            )}

            {/* Modifier Groups */}
            {item.modifierGroups?.map((group) => {
              const currentSelected = selectedModifiers[group.id] || [];
              return (
                <View key={group.id} style={styles.groupCard}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <View
                      style={[
                        styles.badge,
                        group.isRequired ? styles.badgeRequired : styles.badgeOptional
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          group.isRequired ? styles.badgeRequiredText : styles.badgeOptionalText
                        ]}
                      >
                        {group.isRequired ? 'BẮT BUỘC' : 'Tùy chọn'}
                      </Text>
                    </View>
                  </View>

                  {/* Options List */}
                  <View style={styles.optionsList}>
                    {group.options.map((opt) => {
                      const isSelected = currentSelected.includes(opt.id);
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                          onPress={() => handleSelectOption(group.id, opt.id, group.maxSelect)}
                        >
                          <View style={styles.optionLeft}>
                            <View style={[styles.radio, isSelected && styles.radioSelected]}>
                              {isSelected && <View style={styles.radioInner} />}
                            </View>
                            <Text style={[styles.optionName, isSelected && styles.optionNameSelected]}>
                              {opt.name}
                            </Text>
                          </View>

                          <Text style={[styles.optionPrice, isSelected && styles.optionPriceSelected]}>
                            {opt.priceDelta > 0 ? `+${formatVND(opt.priceDelta)}` : 'Miễn phí'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {/* Ghi chú */}
            <View style={styles.notesGroup}>
              <Text style={styles.notesLabel}>Ghi chú cho bếp (không bắt buộc):</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="Ví dụ: Ít đá, không tương ớt, lấy thêm khăn giấy..."
                value={notes}
                onChangeText={setNotes}
                maxLength={120}
              />
            </View>

            {/* Quantity Selector */}
            <View style={styles.quantityRow}>
              <Text style={styles.quantityLabel}>Số lượng:</Text>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Text style={styles.qtyBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.qtyNumber}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQuantity((q) => q + 1)}
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Footer Submit */}
          <View style={styles.modalFooter}>
            <View style={styles.footerPrice}>
              <Text style={styles.footerPriceLabel}>Tổng cộng ({quantity} phần):</Text>
              <Text style={styles.footerPriceValue}>{formatVND(totalPrice)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmButton, !isValid && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={!isValid}
            >
              <Text style={styles.confirmButtonText}>
                {isValid ? 'THÊM VÀO ĐƠN HÀNG ➔' : 'VUI LÒNG CHỌN TÙY CHỌN'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end'
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    flex: 1
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  basePriceText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.bold,
    marginTop: 2
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: typography.weights.bold,
    color: colors.textMuted
  },
  modalBody: {
    padding: spacing.lg,
    flex: 1
  },
  warningBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.md
  },
  warningText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: typography.weights.semibold,
    marginVertical: 2
  },
  groupCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  groupName: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeRequired: {
    backgroundColor: '#FEE2E2'
  },
  badgeOptional: {
    backgroundColor: '#E2E8F0'
  },
  badgeText: {
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  badgeRequiredText: {
    color: '#DC2626'
  },
  badgeOptionalText: {
    color: '#475569'
  },
  optionsList: {
    gap: spacing.xs
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: spacing.touchTargetMobile
  },
  optionItemSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FEF2F2'
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioSelected: {
    borderColor: colors.primary
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary
  },
  optionName: {
    fontSize: typography.sizes.sm,
    color: colors.text
  },
  optionNameSelected: {
    fontWeight: typography.weights.bold,
    color: colors.primary
  },
  optionPrice: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted
  },
  optionPriceSelected: {
    fontWeight: typography.weights.bold,
    color: colors.primary
  },
  notesGroup: {
    marginBottom: spacing.lg
  },
  notesLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.xs
  },
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: typography.sizes.xs,
    color: colors.text
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  quantityLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  qtyNumber: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    minWidth: 24,
    textAlign: 'center'
  },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF'
  },
  footerPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  footerPriceLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted
  },
  footerPriceValue: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.extraBold,
    color: colors.primary
  },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing.touchTargetPOS
  },
  confirmButtonDisabled: {
    backgroundColor: '#CBD5E1'
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    letterSpacing: 1
  }
});
