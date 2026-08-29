import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { MenuCategoryPills } from './MenuCategoryPills';
import { MenuItemCard } from './MenuItemCard';
import { ModifierModal } from './ModifierModal';
import { MenuItemDto, OrderType } from '../../api/contracts';

export const POSScreen: React.FC = () => {
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
    cartItemCount,
    cartTotal,
    addToCart,
    clearCart,
    tables,
    createOrder
  } = useRestaurant();

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderCode, setCreatedOrderCode] = useState<string | null>(null);

  const selectableTables = tables.filter((table) => table.status !== 'NEED_CLEANING');

  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  const handleCardPress = (item: MenuItemDto) => {
    // If item has modifier groups, open modal to configure options
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      openModifierModal(item);
    } else {
      // Add directly to cart
      addToCart(item, 1, []);
    }
  };

  const openCheckout = () => {
    setSelectedTableId((current) => current ?? selectableTables[0]?.id ?? null);
    setSubmitError(null);
    setCreatedOrderCode(null);
    setIsCheckoutOpen(true);
  };

  const handleConfirmOrder = async () => {
    if (isSubmitting) return;
    if (orderType === 'DINE_IN' && !selectedTableId) {
      setSubmitError('Vui lòng chọn bàn trước khi gửi đơn.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createOrder(
        orderType,
        orderType === 'DINE_IN' ? selectedTableId! : undefined
      );
      if (result.success && result.order) {
        setCreatedOrderCode(result.order.code);
      } else {
        setSubmitError(result.error || 'Không thể tạo đơn hàng. Vui lòng thử lại.');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Không thể tạo đơn hàng. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. Category Filter Pills */}
      <MenuCategoryPills
        categories={categories}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={selectCategory}
        totalItemCount={allMenuItems.length}
      />

      {/* 2. Main Menu Grid or Loading / Error States */}
      {isLoadingMenu ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải danh mục món ăn...</Text>
        </View>
      ) : menuError ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>⚠️ {menuError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMenu}>
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : filteredMenuItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>Không tìm thấy món ăn trong danh mục này</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMenuItems}
          keyExtractor={(item) => item.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <MenuItemCard item={item} onPress={handleCardPress} />}
        />
      )}

      {/* 3. Bottom Cart Quick Summary Bar (Touch Target >= 56px) */}
      {cartItemCount > 0 && (
        <View style={styles.cartBar}>
          <View style={styles.cartInfo}>
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
            </View>
            <View>
              <Text style={styles.cartSummaryText}>Đã chọn {cartItemCount} món</Text>
              <Text style={styles.cartTotalText}>{formatVND(cartTotal)} (Đã gồm 8% VAT)</Text>
            </View>
          </View>

          <View style={styles.cartActions}>
            <TouchableOpacity style={styles.clearCartBtn} onPress={clearCart}>
              <Text style={styles.clearCartText}>Xóa</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.checkoutBtn} onPress={openCheckout}>
              <Text style={styles.checkoutText}>XÁC NHẬN ĐƠN ➔</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal
        visible={isCheckoutOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !isSubmitting && setIsCheckoutOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.checkoutModal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Xác nhận đơn POS</Text>
                <Text style={styles.modalSubtitle}>{cartItemCount} món · {formatVND(cartTotal)}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                disabled={isSubmitting}
                onPress={() => setIsCheckoutOpen(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {createdOrderCode ? (
              <View style={styles.successPanel}>
                <Text style={styles.successIcon}>✓</Text>
                <Text style={styles.successText}>Đã tạo đơn {createdOrderCode} thành công.</Text>
                <TouchableOpacity style={styles.doneBtn} onPress={() => setIsCheckoutOpen(false)}>
                  <Text style={styles.doneBtnText}>Đóng</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Loại đơn</Text>
                <View style={styles.orderTypeRow}>
                  {(['DINE_IN', 'TAKE_AWAY'] as OrderType[]).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typeBtn, orderType === type && styles.typeBtnActive]}
                      onPress={() => {
                        setOrderType(type);
                        setSubmitError(null);
                      }}
                    >
                      <Text style={[styles.typeBtnText, orderType === type && styles.typeBtnTextActive]}>
                        {type === 'DINE_IN' ? 'Tại bàn' : 'Mang đi'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {orderType === 'DINE_IN' && (
                  <>
                    <Text style={styles.fieldLabel}>Chọn bàn</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroller}>
                      {selectableTables.map((table) => (
                        <TouchableOpacity
                          key={table.id}
                          style={[styles.tableBtn, selectedTableId === table.id && styles.tableBtnActive]}
                          onPress={() => {
                            setSelectedTableId(table.id);
                            setSubmitError(null);
                          }}
                        >
                          <Text style={[styles.tableBtnText, selectedTableId === table.id && styles.tableBtnTextActive]}>
                            Bàn {table.tableNumber.toString().padStart(2, '0')}
                          </Text>
                          <Text style={styles.tableStateText}>
                            {table.status === 'OCCUPIED' ? 'Đang phục vụ' : 'Bàn trống'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {selectableTables.length === 0 && (
                      <Text style={styles.noTableText}>Hiện không có bàn sẵn sàng nhận đơn.</Text>
                    )}
                  </>
                )}

                {submitError && <Text style={styles.submitError}>{submitError}</Text>}

                <TouchableOpacity
                  style={[styles.submitOrderBtn, isSubmitting && styles.submitOrderBtnDisabled]}
                  disabled={isSubmitting}
                  onPress={handleConfirmOrder}
                >
                  {isSubmitting && <ActivityIndicator size="small" color="#FFFFFF" />}
                  <Text style={styles.submitOrderText}>
                    {isSubmitting ? 'Đang gửi đơn...' : 'Gửi đơn xuống bếp'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 4. Modifier Configuration Modal */}
      <ModifierModal
        visible={isModifierModalOpen}
        item={selectedMenuItemForModal}
        onClose={closeModifierModal}
        onAddToCart={addToCart}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  listContent: {
    padding: spacing.xs,
    paddingBottom: 80
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.textMuted
  },
  errorText: {
    fontSize: typography.sizes.sm,
    color: colors.danger,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.md
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted
  },
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1E293B',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    minHeight: spacing.touchTargetPOS
  },
  cartInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  cartBadge: {
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  cartSummaryText: {
    color: '#94A3B8',
    fontSize: 11
  },
  cartTotalText: {
    color: '#F8FAFC',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  cartActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  clearCartBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: '#334155',
    borderRadius: 6
  },
  clearCartText: {
    color: '#CBD5E1',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  checkoutBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkoutText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs,
    letterSpacing: 0.5
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    justifyContent: 'flex-end'
  },
  checkoutModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xl
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.extraBold
  },
  modalSubtitle: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9'
  },
  modalCloseText: {
    color: colors.textMuted,
    fontWeight: typography.weights.bold
  },
  fieldLabel: {
    color: colors.text,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.xs
  },
  orderTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: 'center'
  },
  typeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#FEF2F2'
  },
  typeBtnText: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold
  },
  typeBtnTextActive: {
    color: colors.primary
  },
  tableScroller: {
    marginBottom: spacing.md
  },
  tableBtn: {
    minWidth: 92,
    padding: spacing.sm,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#F8FAFC'
  },
  tableBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#FEF2F2'
  },
  tableBtnText: {
    color: colors.text,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  tableBtnTextActive: {
    color: colors.primary
  },
  tableStateText: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2
  },
  noTableText: {
    color: colors.danger,
    fontSize: typography.sizes.xs,
    marginBottom: spacing.md
  },
  submitError: {
    color: colors.danger,
    fontSize: typography.sizes.xs,
    marginBottom: spacing.sm
  },
  submitOrderBtn: {
    minHeight: spacing.touchTargetPOS,
    borderRadius: 10,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs
  },
  submitOrderBtnDisabled: {
    opacity: 0.65
  },
  submitOrderText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  successPanel: {
    alignItems: 'center',
    paddingVertical: spacing.lg
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#DCFCE7',
    color: '#15803D',
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.extraBold,
    marginBottom: spacing.sm
  },
  successText: {
    color: '#15803D',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    textAlign: 'center'
  },
  doneBtn: {
    marginTop: spacing.lg,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold
  }
});
