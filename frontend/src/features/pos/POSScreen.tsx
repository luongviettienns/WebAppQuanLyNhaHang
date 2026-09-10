import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import {
  CheckCircle2,
  FileText,
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Utensils,
  X
} from 'lucide-react-native';
import { MenuItemDto, OrderDto, OrderType } from '../../api/contracts';
import { CartItem, useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, InlineAlert, ScreenHeader, Surface } from '../../ui';
import { MenuCategoryPills } from './MenuCategoryPills';
import { MenuItemCard } from './MenuItemCard';
import { ModifierModal } from './ModifierModal';
import { ReceiptModal } from './ReceiptModal';

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

interface CartPanelProps {
  cart: CartItem[];
  cartItemCount: number;
  cartSubtotal: number;
  cartVat: number;
  cartTotal: number;
  onClear: () => void;
  onCheckout: () => void;
  onRemove: (index: number) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
}

const CartPanel: React.FC<CartPanelProps> = ({
  cart,
  cartItemCount,
  cartSubtotal,
  cartVat,
  cartTotal,
  onClear,
  onCheckout,
  onRemove,
  onUpdateQuantity
}) => {
  const { theme } = useTheme();

  return (
    <Surface level="base" style={[styles.cartPanel, { borderLeftColor: theme.borderSubtle }]}>
      <View testID="pos-cart-summary" style={[styles.cartHeader, { borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.cartHeadingCopy}>
          <View style={styles.cartHeadingRow}>
            <AppIcon icon={ShoppingCart} color={theme.primary} size={20} />
            <Text accessibilityRole="header" style={[styles.cartTitle, { color: theme.textPrimary }]}>Giỏ hàng</Text>
          </View>
          <Text style={[styles.cartCount, { color: theme.textSecondary }]}>{cartItemCount} món đã chọn</Text>
        </View>
        {cart.length > 0 && <Button variant="quiet" label="Xóa giỏ" onPress={onClear} />}
      </View>

      {cart.length === 0 ? (
        <EmptyState title="Giỏ hàng trống" description="Chọn một món trong thực đơn để bắt đầu tạo đơn." />
      ) : (
        <ScrollView style={styles.cartItems} contentContainerStyle={styles.cartItemsContent}>
          {cart.map((item, index) => (
            <View key={`${item.menuItem.id}-${index}`} style={[styles.cartItem, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.cartItemTop}>
                <View style={styles.cartItemCopy}>
                  <Text style={[styles.cartItemName, { color: theme.textPrimary }]}>{item.menuItem.name}</Text>
                  {item.selectedModifiers.map((modifier) => (
                    <Text key={`${modifier.modifierGroupId}-${modifier.optionId}`} style={[styles.cartItemMeta, { color: theme.textSecondary }]}>
                      {modifier.groupName}: {modifier.optionName}
                    </Text>
                  ))}
                  {item.notes && <Text style={[styles.cartItemMeta, { color: theme.textSecondary }]}>Ghi chú: {item.notes}</Text>}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa ${item.menuItem.name}`}
                  onPress={() => onRemove(index)}
                  style={({ pressed }) => [styles.iconAction, { backgroundColor: pressed ? theme.surfaceSunken : 'transparent' }]}
                >
                  <AppIcon icon={Trash2} color={theme.danger} size={18} />
                </Pressable>
              </View>
              <View style={styles.cartItemBottom}>
                <View style={styles.quantityControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Giảm số lượng ${item.menuItem.name}`}
                    onPress={() => onUpdateQuantity(index, item.quantity - 1)}
                    style={({ pressed }) => [styles.quantityButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
                  >
                    <AppIcon icon={Minus} color={theme.textPrimary} size={16} />
                  </Pressable>
                  <Text style={[styles.quantityValue, { color: theme.textPrimary }]}>{item.quantity}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Tăng số lượng ${item.menuItem.name}`}
                    onPress={() => onUpdateQuantity(index, item.quantity + 1)}
                    style={({ pressed }) => [styles.quantityButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet, borderColor: theme.borderSubtle }]}
                  >
                    <AppIcon icon={Plus} color={theme.textPrimary} size={16} />
                  </Pressable>
                </View>
                <Text style={[styles.cartItemPrice, { color: theme.textPrimary }]}>{formatVND(item.subtotal)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={[styles.cartTotals, { borderTopColor: theme.borderSubtle }]}>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Cộng tiền món</Text>
          <Text style={[styles.totalValue, { color: theme.textPrimary }]}>{formatVND(cartSubtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>VAT 8%</Text>
          <Text style={[styles.totalValue, { color: theme.textPrimary }]}>{formatVND(cartVat)}</Text>
        </View>
        <View style={styles.grandTotalRow}>
          <Text style={[styles.grandTotalLabel, { color: theme.textPrimary }]}>Tổng thanh toán</Text>
          <Text testID="pos-cart-total" style={[styles.grandTotalValue, { color: theme.primary }]}>{formatVND(cartTotal)}</Text>
        </View>
        <Button testID="btn-open-checkout" variant="primary" label="Xác nhận đơn" disabled={cart.length === 0} onPress={onCheckout} />
      </View>
    </Surface>
  );
};

export const POSScreen: React.FC = () => {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isSplitLayout = width >= 900;
  const menuColumns = width >= 1400 ? 3 : width >= 600 ? 2 : 1;
  const {
    categories,
    allMenuItems,
    filteredMenuItems,
    selectedCategoryId,
    selectCategory,
    isLoadingMenu,
    menuError,
    fetchMenu,
    selectedMenuItemForModal,
    isModifierModalOpen,
    openModifierModal,
    closeModifierModal,
    cart,
    cartSubtotal,
    cartVat,
    cartItemCount,
    cartTotal,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    tables,
    createOrder
  } = useRestaurant();

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successOrderCode, setSuccessOrderCode] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<OrderDto | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const handleCardPress = (item: MenuItemDto) => {
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      openModifierModal(item);
    } else {
      addToCart(item, 1, []);
    }
  };

  const selectableTables = tables.filter((table) => table.status !== 'NEED_CLEANING');

  const handleOpenConfirmModal = () => {
    setSubmitError(null);
    setSuccessOrderCode(null);
    const firstAvailable = selectableTables.find((table) => table.status === 'AVAILABLE');
    setSelectedTableId(firstAvailable ? firstAvailable.id : selectableTables[0]?.id ?? null);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (orderType === 'DINE_IN' && !selectedTableId) {
      setSubmitError('Vui lòng chọn bàn ăn cho đơn phục vụ tại chỗ.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    const result = await createOrder({
      orderType,
      tableId: orderType === 'DINE_IN' ? selectedTableId : undefined
    });
    setIsSubmitting(false);

    if (result.success && result.order) {
      setSuccessOrderCode(result.order.code);
      setCreatedOrder(result.order);
    } else {
      setSubmitError(result.error || 'Gửi đơn thất bại. Vui lòng thử lại.');
    }
  };

  const handleCloseConfirmModal = () => {
    if (isSubmitting) return;
    setIsConfirmModalOpen(false);
    setSuccessOrderCode(null);
    setSubmitError(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={styles.workspace}>
        <View style={styles.catalogPane}>
          <View style={styles.catalogHeader}>
            <ScreenHeader
              title="Thực đơn"
              description={`${allMenuItems.length} món sẵn sàng phục vụ`}
              actions={!isSplitLayout ? (
                <View style={[styles.mobileCartStatus, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
                  <Text style={[styles.mobileCartStatusTitle, { color: theme.textPrimary }]}>Giỏ hàng</Text>
                  <Text style={[styles.mobileCartStatusCount, { color: theme.textSecondary }]}>{cartItemCount}</Text>
                </View>
              ) : undefined}
            />
          </View>

          <MenuCategoryPills categories={categories} selectedCategoryId={selectedCategoryId} onSelectCategory={selectCategory} totalItemCount={allMenuItems.length} />

          {isLoadingMenu ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải thực đơn...</Text>
            </View>
          ) : menuError ? (
            <View style={styles.centerContainer}>
              <InlineAlert title="Không thể tải thực đơn" message={menuError} />
              <Button variant="secondary" label="Thử lại" onPress={() => void fetchMenu()} />
            </View>
          ) : filteredMenuItems.length === 0 ? (
            <EmptyState title="Không có món phù hợp" description="Chọn danh mục khác để xem các món đang phục vụ." />
          ) : (
            <FlatList
              key={menuColumns}
              data={filteredMenuItems}
              keyExtractor={(item) => item.id.toString()}
              numColumns={menuColumns}
              contentContainerStyle={[styles.listContent, !isSplitLayout && cartItemCount > 0 && styles.listContentWithCart]}
              columnWrapperStyle={menuColumns > 1 ? styles.menuRow : undefined}
              renderItem={({ item }) => <MenuItemCard item={item} onPress={handleCardPress} />}
            />
          )}
        </View>

        {isSplitLayout && (
          <CartPanel
            cart={cart}
            cartItemCount={cartItemCount}
            cartSubtotal={cartSubtotal}
            cartVat={cartVat}
            cartTotal={cartTotal}
            onClear={clearCart}
            onCheckout={handleOpenConfirmModal}
            onRemove={removeFromCart}
            onUpdateQuantity={updateCartQuantity}
          />
        )}
      </View>

      {!isSplitLayout && cartItemCount > 0 && (
        <Surface level="raised" style={[styles.mobileCartSummary, elevation.floatingAction]}>
          <View testID="pos-cart-summary" style={styles.mobileCartSummaryCopy}>
            <Text style={[styles.mobileCartLabel, { color: theme.textPrimary }]}>Giỏ hàng · {cartItemCount} món</Text>
            <Text testID="pos-cart-total" style={[styles.mobileCartTotal, { color: theme.primary }]}>{formatVND(cartTotal)}</Text>
          </View>
          <Button testID="btn-open-checkout" variant="primary" label="Xác nhận" onPress={handleOpenConfirmModal} />
        </Surface>
      )}

      <Modal visible={isConfirmModalOpen} transparent animationType="slide" onRequestClose={handleCloseConfirmModal}>
        <View style={[styles.modalBackdrop, isSplitLayout && styles.modalBackdropCentered, { backgroundColor: theme.overlay }]}>
          <Surface level="raised" style={[styles.checkoutModal, isSplitLayout && styles.checkoutModalWide]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.modalHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: theme.textPrimary }]}>Xác nhận đơn</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{cartItemCount} món · {formatVND(cartTotal)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng xác nhận đơn"
                onPress={handleCloseConfirmModal}
                style={({ pressed }) => [styles.modalClose, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
              >
                <AppIcon icon={X} color={theme.textPrimary} size={20} />
              </Pressable>
            </View>

            {successOrderCode ? (
              <View style={styles.successPanel}>
                <AppIcon icon={CheckCircle2} color={theme.success} size={40} />
                <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Đơn {successOrderCode} đã gửi xuống bếp</Text>
                <Text style={[styles.successDescription, { color: theme.textSecondary }]}>Bạn có thể xem hóa đơn hoặc hoàn tất để tạo đơn mới.</Text>
                <View style={styles.successActionsRow}>
                  <Button testID="btn-view-receipt" variant="primary" label="Xem hóa đơn" icon={FileText} onPress={() => setIsReceiptModalOpen(true)} />
                  <Button testID="btn-done-order" variant="secondary" label="Hoàn tất" onPress={handleCloseConfirmModal} />
                </View>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.checkoutBody}>
                <View style={styles.checkoutSection}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Hình thức phục vụ</Text>
                  <View style={styles.orderTypeRow}>
                    <Pressable
                      testID="btn-dinein"
                      accessibilityRole="radio"
                      accessibilityState={{ selected: orderType === 'DINE_IN' }}
                      onPress={() => { setOrderType('DINE_IN'); setSubmitError(null); }}
                      style={({ pressed }) => [
                        styles.typeButton,
                        { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
                        orderType === 'DINE_IN' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                      ]}
                    >
                      <AppIcon icon={Utensils} color={orderType === 'DINE_IN' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.typeButtonText, { color: orderType === 'DINE_IN' ? theme.primary : theme.textPrimary }]}>Tại bàn</Text>
                    </Pressable>
                    <Pressable
                      testID="btn-takeaway"
                      accessibilityRole="radio"
                      accessibilityState={{ selected: orderType === 'TAKE_AWAY' }}
                      onPress={() => { setOrderType('TAKE_AWAY'); setSubmitError(null); }}
                      style={({ pressed }) => [
                        styles.typeButton,
                        { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
                        orderType === 'TAKE_AWAY' && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                      ]}
                    >
                      <AppIcon icon={ShoppingBag} color={orderType === 'TAKE_AWAY' ? theme.primary : theme.textSecondary} />
                      <Text style={[styles.typeButtonText, { color: orderType === 'TAKE_AWAY' ? theme.primary : theme.textPrimary }]}>Mang đi</Text>
                    </Pressable>
                  </View>
                </View>

                {orderType === 'DINE_IN' && (
                  <View style={styles.checkoutSection}>
                    <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Chọn bàn</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableList}>
                      {selectableTables.map((table) => {
                        const isSelected = selectedTableId === table.id;
                        return (
                          <Pressable
                            testID={`pos-table-option-${table.tableNumber}`}
                            key={table.id}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                            onPress={() => { setSelectedTableId(table.id); setSubmitError(null); }}
                            style={({ pressed }) => [
                              styles.tableButton,
                              { backgroundColor: pressed ? theme.surfaceSunken : theme.surfaceBase, borderColor: theme.borderSubtle },
                              isSelected && { backgroundColor: theme.interactiveSecondary, borderColor: theme.primary }
                            ]}
                          >
                            <Text style={[styles.tableNumber, { color: isSelected ? theme.primary : theme.textPrimary }]}>Bàn {table.tableNumber.toString().padStart(2, '0')}</Text>
                            <Text style={[styles.tableStatus, { color: theme.textSecondary }]}>{table.status === 'OCCUPIED' ? 'Đang phục vụ' : 'Sẵn sàng'}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    {selectableTables.length === 0 && <InlineAlert message="Hiện không có bàn sẵn sàng nhận đơn." tone="warning" />}
                  </View>
                )}

                {submitError && <InlineAlert title="Chưa thể gửi đơn" message={submitError} />}
                <Button testID="btn-confirm-order" variant="primary" label="Gửi đơn xuống bếp" loading={isSubmitting} onPress={() => void handleConfirmOrder()} />
              </ScrollView>
            )}
          </Surface>
        </View>
      </Modal>

      <ModifierModal visible={isModifierModalOpen} item={selectedMenuItemForModal} onClose={closeModifierModal} onAddToCart={addToCart} />
      <ReceiptModal visible={isReceiptModalOpen} order={createdOrder} onClose={() => setIsReceiptModalOpen(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  workspace: { flex: 1, flexDirection: 'row' },
  catalogPane: { flex: 1, minWidth: 0 },
  catalogHeader: { paddingBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  mobileCartStatus: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md },
  mobileCartStatusTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  mobileCartStatusCount: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  centerContainer: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  loadingText: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl },
  listContentWithCart: { paddingBottom: 112 },
  menuRow: { gap: spacing.md },
  cartPanel: { borderLeftWidth: 1, borderRadius: 0, width: 360 },
  cartHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 76, padding: spacing.lg },
  cartHeadingCopy: { gap: 2 },
  cartHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  cartTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  cartCount: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  cartItems: { flex: 1 },
  cartItemsContent: { paddingHorizontal: spacing.lg },
  cartItem: { borderBottomWidth: 1, gap: spacing.sm, paddingVertical: spacing.lg },
  cartItemTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  cartItemCopy: { flex: 1, gap: 2 },
  cartItemName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  cartItemMeta: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs },
  iconAction: { alignItems: 'center', borderRadius: radii.sm, height: 44, justifyContent: 'center', width: 44 },
  cartItemBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  quantityControls: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  quantityButton: { alignItems: 'center', borderRadius: radii.sm, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  quantityValue: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md, minWidth: 24, textAlign: 'center' },
  cartItemPrice: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm, fontVariant: [...typography.numeric.fontVariant] },
  cartTotals: { borderTopWidth: 1, gap: spacing.sm, padding: spacing.lg },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  totalValue: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm, fontVariant: [...typography.numeric.fontVariant] },
  grandTotalRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  grandTotalLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  grandTotalValue: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, fontVariant: [...typography.numeric.fontVariant] },
  mobileCartSummary: { alignItems: 'center', bottom: spacing.md, flexDirection: 'row', gap: spacing.md, left: spacing.md, padding: spacing.sm, position: 'absolute', right: spacing.md },
  mobileCartSummaryCopy: { flex: 1, paddingLeft: spacing.xs },
  mobileCartLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  mobileCartTotal: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg, fontVariant: [...typography.numeric.fontVariant] },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalBackdropCentered: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  checkoutModal: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '92%', overflow: 'hidden', width: '100%' },
  checkoutModalWide: { borderBottomLeftRadius: radii.md, borderBottomRightRadius: radii.md, maxWidth: 620 },
  modalHeader: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg },
  modalHeadingCopy: { flex: 1, gap: 2 },
  modalTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl },
  modalSubtitle: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  modalClose: { alignItems: 'center', borderRadius: radii.sm, height: 44, justifyContent: 'center', width: 44 },
  checkoutBody: { gap: spacing.lg, padding: spacing.lg },
  checkoutSection: { gap: spacing.sm },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  orderTypeRow: { flexDirection: 'row', gap: spacing.sm },
  typeButton: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flex: 1, flexDirection: 'row', gap: spacing.sm, minHeight: spacing.touchTargetPOS, paddingHorizontal: spacing.md },
  typeButtonText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  tableList: { gap: spacing.sm, paddingBottom: spacing.xs },
  tableButton: { borderRadius: radii.md, borderWidth: 1, minHeight: spacing.touchTargetPOS, minWidth: 104, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tableNumber: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.lg },
  tableStatus: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  successPanel: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  successTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl, textAlign: 'center' },
  successDescription: { fontFamily: typography.families.body, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, maxWidth: 420, textAlign: 'center' },
  successActionsRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.md, width: '100%' }
});
