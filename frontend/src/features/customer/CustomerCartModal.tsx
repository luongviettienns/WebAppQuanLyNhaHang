import React from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed, X } from 'lucide-react-native';
import { CartItem } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button } from '../../ui';

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const formatTableNumber = (value: number) => value.toString().padStart(2, '0');

interface CustomerCartModalProps {
  visible: boolean;
  tableNumber: number;
  cart: CartItem[];
  cartItemCount: number;
  cartSubtotal: number;
  cartVat: number;
  cartTotal: number;
  orderNotes: string;
  onChangeOrderNotes: (notes: string) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
  onSubmitOrder: () => void;
  isSubmitting: boolean;
  onClose: () => void;
}

export const CustomerCartModal: React.FC<CustomerCartModalProps> = ({
  visible,
  tableNumber,
  cart,
  cartItemCount,
  cartSubtotal,
  cartVat,
  cartTotal,
  orderNotes,
  onChangeOrderNotes,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onSubmitOrder,
  isSubmitting,
  onClose
}) => {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.overlay }]}>
        <SafeAreaView
          testID="customer-cart-modal"
          style={[
            styles.container,
            elevation.modal,
            { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconCircle, { backgroundColor: theme.interactiveSecondary }]}>
                <AppIcon icon={ShoppingBag} color={theme.primary} size={20} />
              </View>
              <View style={styles.headerTitleGroup}>
                <Text accessibilityRole="header" style={[styles.headerTitle, { color: theme.textPrimary }]}>
                  Giỏ hàng Bàn {formatTableNumber(tableNumber)}
                </Text>
                <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                  {cartItemCount > 0 ? `${cartItemCount} món đang chờ gửi bếp` : 'Chưa có món nào trong giỏ'}
                </Text>
              </View>
            </View>

            <View style={styles.headerRight}>
              {cart.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xóa toàn bộ giỏ hàng"
                  onPress={onClearCart}
                  style={({ pressed }) => [
                    styles.clearCartBtn,
                    { backgroundColor: pressed ? theme.surfaceSunken : 'transparent' }
                  ]}
                >
                  <Text style={[styles.clearCartText, { color: theme.danger }]}>Xóa giỏ</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng giỏ hàng"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeBtn,
                  { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }
                ]}
              >
                <AppIcon icon={X} color={theme.textPrimary} size={20} />
              </Pressable>
            </View>
          </View>

          {/* Cart Content */}
          {cart.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.surfaceSunken }]}>
                <AppIcon icon={ShoppingBag} color={theme.textSecondary} size={48} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>
                Giỏ hàng của bạn đang trống
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
                Vui lòng chọn các món ăn, đồ uống yêu thích trong thực đơn để thêm vào giỏ.
              </Text>
              <Button
                variant="primary"
                label="Chọn món ngay"
                onPress={onClose}
              />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Danh sách món ăn trong giỏ */}
              <View style={styles.itemsSection}>
                {cart.map((item, index) => (
                  <View
                    key={`${item.menuItem.id}-${index}`}
                    style={[
                      styles.cartItemCard,
                      {
                        backgroundColor: theme.surfaceRaised,
                        borderColor: theme.borderSubtle
                      }
                    ]}
                  >
                    {/* Hàng 1: Tên món & Thành tiền */}
                    <View style={styles.itemHeaderRow}>
                      <Text style={[styles.itemName, { color: theme.textPrimary }]}>
                        {item.menuItem.name}
                      </Text>
                      <Text style={[styles.itemSubtotal, { color: theme.textPrimary }]}>
                        {formatVND(item.subtotal)}
                      </Text>
                    </View>

                    {/* Danh sách topping / modifier đã chọn */}
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <View style={styles.modifiersList}>
                        {item.selectedModifiers.map((mod, mIdx) => (
                          <Text
                            key={`${mod.modifierGroupId}-${mod.optionId}-${mIdx}`}
                            style={[styles.modifierText, { color: theme.textSecondary }]}>
                            + {mod.groupName}: {mod.optionName}
                            {mod.priceDelta > 0 ? ` (+${formatVND(mod.priceDelta)})` : ''}
                          </Text>
                        ))}
                      </View>
                    )}

                    {/* Ghi chú riêng của món */}
                    {item.notes ? (
                      <View style={[styles.itemNoteBadge, { backgroundColor: theme.surfaceSunken }]}>
                        <Text style={[styles.itemNoteText, { color: theme.textSecondary }]}>
                          📝 {item.notes}
                        </Text>
                      </View>
                    ) : null}

                    {/* Hàng 2: Bộ điều khiển số lượng (+ / -) & Nút xóa món */}
                    <View style={[styles.itemFooterRow, { borderTopColor: theme.borderSubtle }]}>
                      <Text style={[styles.itemUnitPrice, { color: theme.textSecondary }]}>
                        Đơn giá: {formatVND(item.unitPrice)}
                      </Text>

                      <View style={styles.itemActions}>
                        <View style={styles.stepperContainer}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Giảm số lượng ${item.menuItem.name}`}
                            onPress={() => onUpdateQuantity(index, item.quantity - 1)}
                            style={({ pressed }) => [
                              styles.stepperBtn,
                              {
                                backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet,
                                borderColor: theme.borderSubtle
                              }
                            ]}
                          >
                            <AppIcon icon={Minus} color={theme.textPrimary} size={15} />
                          </Pressable>

                          <Text style={[styles.stepperQuantity, { color: theme.textPrimary }]}>
                            {item.quantity}
                          </Text>

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Tăng số lượng ${item.menuItem.name}`}
                            onPress={() => onUpdateQuantity(index, item.quantity + 1)}
                            style={({ pressed }) => [
                              styles.stepperBtn,
                              {
                                backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet,
                                borderColor: theme.borderSubtle
                              }
                            ]}
                          >
                            <AppIcon icon={Plus} color={theme.textPrimary} size={15} />
                          </Pressable>
                        </View>

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Xóa món ${item.menuItem.name}`}
                          onPress={() => onRemoveItem(index)}
                          style={({ pressed }) => [
                            styles.deleteBtn,
                            { backgroundColor: pressed ? theme.surfaceSunken : 'transparent' }
                          ]}
                        >
                          <AppIcon icon={Trash2} color={theme.danger} size={18} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* Ô nhập ghi chú đơn hàng cho Bếp */}
              <View style={[styles.notesSection, { backgroundColor: theme.surfaceSunken, borderColor: theme.borderSubtle }]}>
                <Text style={[styles.notesLabel, { color: theme.textPrimary }]}>
                  💬 Ghi chú cho bếp (tùy chọn):
                </Text>
                <TextInput
                  style={[
                    styles.notesInput,
                    {
                      backgroundColor: theme.surfaceBase,
                      borderColor: theme.borderSubtle,
                      color: theme.textPrimary
                    }
                  ]}
                  placeholder="VD: Không cay, cho nhiều đá, mang ra cùng lúc..."
                  placeholderTextColor={theme.textSecondary}
                  value={orderNotes}
                  onChangeText={onChangeOrderNotes}
                  multiline
                  numberOfLines={2}
                  maxLength={250}
                />
              </View>

              {/* Bảng phân tích chi phí thanh toán */}
              <View style={[styles.summaryCard, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Cộng tiền món:</Text>
                  <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>{formatVND(cartSubtotal)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Thuế VAT (8%):</Text>
                  <Text style={[styles.summaryValue, { color: theme.textPrimary }]}>{formatVND(cartVat)}</Text>
                </View>
                <View style={[styles.summaryDivider, { backgroundColor: theme.borderSubtle }]} />
                <View style={styles.summaryGrandRow}>
                  <View>
                    <Text style={[styles.grandLabel, { color: theme.textPrimary }]}>Tổng thanh toán:</Text>
                    <Text style={[styles.vatHint, { color: theme.textSecondary }]}>Đã bao gồm thuế VAT 8%</Text>
                  </View>
                  <Text style={[styles.grandValue, { color: theme.primary }]}>{formatVND(cartTotal)}</Text>
                </View>
              </View>
            </ScrollView>
          )}

          {/* Footer Actions */}
          {cart.length > 0 && (
            <View style={[styles.footer, { borderTopColor: theme.borderSubtle, backgroundColor: theme.surfaceBase }]}>
              <Button
                variant="secondary"
                label="Chọn thêm món"
                onPress={onClose}
              />
              <Button
                variant="primary"
                label={`Gửi bếp ngay (${formatVND(cartTotal)})`}
                icon={UtensilsCrossed}
                loading={isSubmitting}
                onPress={onSubmitOrder}
              />
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md
  },
  container: {
    borderRadius: radii.lg,
    borderWidth: 1,
    maxHeight: '92%',
    maxWidth: 560,
    overflow: 'hidden',
    width: '100%'
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  headerLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  headerTitleGroup: {
    gap: 2
  },
  headerTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg
  },
  headerSubtitle: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  clearCartBtn: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  clearCartText: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  closeBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  emptyContainer: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl
  },
  emptyIconCircle: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 88,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 88
  },
  emptyTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg,
    textAlign: 'center'
  },
  emptyDesc: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: 20,
    maxWidth: 320,
    textAlign: 'center'
  },
  scrollContent: {
    gap: spacing.md,
    padding: spacing.md
  },
  itemsSection: {
    gap: spacing.sm
  },
  cartItemCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  itemHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  itemName: {
    flex: 1,
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.md,
    marginRight: spacing.sm
  },
  itemSubtotal: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.md
  },
  modifiersList: {
    gap: 2,
    paddingLeft: spacing.xs
  },
  modifierText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  itemNoteBadge: {
    borderRadius: radii.sm,
    marginTop: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  itemNoteText: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs,
    fontStyle: 'italic'
  },
  itemFooterRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.sm
  },
  itemUnitPrice: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  itemActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  stepperContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  stepperBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  stepperQuantity: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.sm,
    minWidth: 22,
    textAlign: 'center'
  },
  deleteBtn: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 30,
    justifyContent: 'center',
    width: 30
  },
  notesSection: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  notesLabel: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.xs
  },
  notesInput: {
    borderRadius: radii.sm,
    borderWidth: 1,
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    minHeight: 56,
    padding: spacing.sm,
    textAlignVertical: 'top'
  },
  summaryCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  summaryLabel: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm
  },
  summaryValue: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.sm
  },
  summaryDivider: {
    height: 1,
    marginVertical: spacing.xs
  },
  summaryGrandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  grandLabel: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.md
  },
  vatHint: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.xs
  },
  grandValue: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant]
  },
  footer: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
    padding: spacing.md
  }
});
