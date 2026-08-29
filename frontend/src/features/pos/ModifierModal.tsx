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
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../theme';

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
  const { theme, isDark } = useTheme();
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number[]>>({});
  const [notes, setNotes] = useState<string>('');

  // Reset state when opening modal for a new item
  useEffect(() => {
    if (visible && item) {
      setQuantity(1);
      setNotes('');
      const initialSelection: Record<number, number[]> = {};

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
        return { ...prev, [groupId]: [optionId] };
      } else {
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
        } else {
          if (current.length >= maxSelect) {
            return prev;
          }
          return { ...prev, [groupId]: [...current, optionId] };
        }
      }
    });
  };

  // Validation
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
      <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.card }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{item.name}</Text>
              <Text style={[styles.basePriceText, { color: theme.textMuted }]}>
                Giá cơ bản: {formatVND(item.basePrice)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
              onPress={onClose}
            >
              <Text style={[styles.closeButtonText, { color: theme.text }]}>✕</Text>
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
                <View
                  key={group.id}
                  style={[
                    styles.groupCard,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#FAFAFA',
                      borderColor: theme.border
                    }
                  ]}
                >
                  <View style={styles.groupHeader}>
                    <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
                    <View
                      style={[
                        styles.badge,
                        group.isRequired
                          ? (isDark ? styles.badgeRequiredDark : styles.badgeRequiredLight)
                          : (isDark ? styles.badgeOptionalDark : styles.badgeOptionalLight)
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          group.isRequired
                            ? { color: isDark ? '#FCA5A5' : '#DC2626' }
                            : { color: isDark ? '#94A3B8' : '#64748B' }
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
                          style={[
                            styles.optionItem,
                            {
                              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                              borderColor: isSelected ? theme.primary : theme.border
                            },
                            isSelected && (isDark ? styles.optionItemSelectedDark : styles.optionItemSelectedLight)
                          ]}
                          onPress={() => handleSelectOption(group.id, opt.id, group.maxSelect)}
                        >
                          <View style={styles.optionLeft}>
                            <View style={[styles.radio, { borderColor: isSelected ? theme.primary : theme.textMuted }]}>
                              {isSelected && <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />}
                            </View>
                            <Text
                              style={[
                                styles.optionName,
                                { color: isSelected ? theme.primary : theme.text },
                                isSelected && styles.optionNameSelected
                              ]}
                            >
                              {opt.name}
                            </Text>
                          </View>

                          <Text
                            style={[
                              styles.optionPrice,
                              { color: isSelected ? theme.primary : theme.textMuted },
                              isSelected && styles.optionPriceSelected
                            ]}
                          >
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
              <Text style={[styles.notesLabel, { color: theme.text }]}>Ghi chú cho bếp (không bắt buộc):</Text>
              <TextInput
                style={[
                  styles.notesInput,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    borderColor: theme.border,
                    color: theme.text
                  }
                ]}
                placeholder="Ví dụ: Ít đá, không tương ớt, lấy thêm khăn giấy..."
                placeholderTextColor={theme.textMuted}
                value={notes}
                onChangeText={setNotes}
                maxLength={120}
              />
            </View>

            {/* Quantity Selector */}
            <View style={[styles.quantityRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.quantityLabel, { color: theme.text }]}>Số lượng:</Text>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  style={[styles.qtyBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9', borderColor: theme.border }]}
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Text style={[styles.qtyBtnText, { color: theme.text }]}>-</Text>
                </TouchableOpacity>
                <Text style={[styles.qtyNumber, { color: theme.text }]}>{quantity}</Text>
                <TouchableOpacity
                  style={[styles.qtyBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9', borderColor: theme.border }]}
                  onPress={() => setQuantity((q) => q + 1)}
                >
                  <Text style={[styles.qtyBtnText, { color: theme.text }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.modalFooter, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
            <View style={styles.footerPrice}>
              <Text style={[styles.footerPriceLabel, { color: theme.textMuted }]}>
                Đơn giá: {formatVND(unitPrice)}
              </Text>
              <Text style={[styles.footerPriceValue, { color: theme.primary }]}>
                Tổng: {formatVND(totalPrice)}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.confirmButton,
                { backgroundColor: theme.primary },
                !isValid && styles.confirmButtonDisabled
              ]}
              onPress={handleConfirm}
              disabled={!isValid}
            >
              <Text style={styles.confirmButtonText}>
                {isValid ? `THÊM VÀO GIỎ • ${formatVND(totalPrice)}` : 'CHỌN ĐỦ MỤC BẮT BUỘC'}
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
    justifyContent: 'flex-end'
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%'
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  basePriceText: {
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: typography.weights.bold
  },
  modalBody: {
    padding: spacing.lg
  },
  warningBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  warningText: {
    color: '#DC2626',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    lineHeight: 18
  },
  groupCard: {
    borderRadius: 12,
    borderWidth: 1,
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
    fontWeight: typography.weights.bold
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4
  },
  badgeRequiredLight: {
    backgroundColor: '#FEE2E2'
  },
  badgeRequiredDark: {
    backgroundColor: '#7F1D1D'
  },
  badgeOptionalLight: {
    backgroundColor: '#F1F5F9'
  },
  badgeOptionalDark: {
    backgroundColor: '#334155'
  },
  badgeText: {
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  optionsList: {
    gap: spacing.xs
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: spacing.touchTargetMobile
  },
  optionItemSelectedLight: {
    backgroundColor: '#FEF2F2'
  },
  optionItemSelectedDark: {
    backgroundColor: '#3B1818'
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  optionName: {
    fontSize: typography.sizes.sm
  },
  optionNameSelected: {
    fontWeight: typography.weights.bold
  },
  optionPrice: {
    fontSize: typography.sizes.xs
  },
  optionPriceSelected: {
    fontWeight: typography.weights.bold
  },
  notesGroup: {
    marginBottom: spacing.lg
  },
  notesLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.xs
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: typography.sizes.xs
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: 1
  },
  quantityLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  qtyBtnText: {
    fontSize: 18,
    fontWeight: typography.weights.bold
  },
  qtyNumber: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    minWidth: 24,
    textAlign: 'center'
  },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1
  },
  footerPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm
  },
  footerPriceLabel: {
    fontSize: typography.sizes.xs
  },
  footerPriceValue: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.extraBold
  },
  confirmButton: {
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
