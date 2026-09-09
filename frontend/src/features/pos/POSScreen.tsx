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
import { typography, spacing } from '../../theme';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { MenuCategoryPills } from './MenuCategoryPills';
import { MenuItemCard } from './MenuItemCard';
import { ModifierModal } from './ModifierModal';
import { ReceiptModal } from './ReceiptModal';
import { MenuItemDto, OrderType, OrderDto } from '../../api/contracts';

export const POSScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
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

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successOrderCode, setSuccessOrderCode] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<OrderDto | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  const handleCardPress = (item: MenuItemDto) => {
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      openModifierModal(item);
    } else {
      addToCart(item, 1, []);
    }
  };

  const selectableTables = tables.filter((t) => t.status !== 'NEED_CLEANING');

  const handleOpenConfirmModal = () => {
    setSubmitError(null);
    setSuccessOrderCode(null);
    const firstAvailable = selectableTables.find((t) => t.status === 'AVAILABLE');
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
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
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Đang tải danh mục món ăn...</Text>
        </View>
      ) : menuError ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: theme.danger }]}>⚠️ {menuError}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: theme.primary }]} onPress={fetchMenu}>
            <Text style={styles.retryButtonText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : filteredMenuItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>Không tìm thấy món ăn trong danh mục này</Text>
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
        <View style={[styles.cartBar, { backgroundColor: isDark ? '#1E293B' : '#0F172A', borderTopColor: theme.border }]}>
          <View style={styles.cartInfo}>
            <View style={[styles.cartBadge, { backgroundColor: theme.primary }]}>
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

            <TouchableOpacity
              testID="btn-open-checkout"
              style={[styles.checkoutBtn, { backgroundColor: theme.primary }]}
              onPress={handleOpenConfirmModal}
            >
              <Text style={styles.checkoutText}>XÁC NHẬN ĐƠN ➔</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 4. POS Order Confirmation Modal */}
      <Modal
        visible={isConfirmModalOpen}
        transparent
        animationType="slide"
        onRequestClose={handleCloseConfirmModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.checkoutModal, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Xác Nhận Đơn POS</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>
                  {cartItemCount} món · Tổng thanh toán {formatVND(cartTotal)}
                </Text>
              </View>
              <TouchableOpacity style={[styles.modalCloseBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]} onPress={handleCloseConfirmModal}>
                <Text style={[styles.modalCloseText, { color: theme.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {successOrderCode ? (
              <View style={styles.successPanel}>
                <Text style={styles.successIcon}>✓</Text>
                <Text style={styles.successText}>Đã gửi đơn {successOrderCode} xuống bếp thành công!</Text>
                <View style={styles.successActionsRow}>
                  <TouchableOpacity
                    testID="btn-view-receipt"
                    style={[styles.receiptBtn, { backgroundColor: theme.primary }]}
                    onPress={() => setIsReceiptModalOpen(true)}
                  >
                    <Text style={styles.receiptBtnText}>🧾 Xem Hóa Đơn</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="btn-done-order"
                    style={[styles.doneBtn, { backgroundColor: isDark ? '#334155' : '#1E293B' }]}
                    onPress={handleCloseConfirmModal}
                  >
                    <Text style={styles.doneBtnText}>Hoàn tất</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>Hình thức phục vụ:</Text>
                <View style={styles.orderTypeRow}>
                  <TouchableOpacity
                    testID="btn-dinein"
                    style={[
                      styles.typeBtn,
                      { borderColor: theme.border, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' },
                      orderType === 'DINE_IN' && [styles.typeBtnActive, { borderColor: theme.primary, backgroundColor: isDark ? '#451A03' : '#FEF2F2' }]
                    ]}
                    onPress={() => {
                      setOrderType('DINE_IN');
                      setSubmitError(null);
                    }}
                  >
                    <Text style={[styles.typeBtnText, { color: theme.textMuted }, orderType === 'DINE_IN' && { color: theme.primary, fontWeight: typography.weights.bold }]}>
                      🍽️ Tại bàn (Dine-in)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="btn-takeaway"
                    style={[
                      styles.typeBtn,
                      { borderColor: theme.border, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' },
                      orderType === 'TAKE_AWAY' && [styles.typeBtnActive, { borderColor: theme.primary, backgroundColor: isDark ? '#451A03' : '#FEF2F2' }]
                    ]}
                    onPress={() => {
                      setOrderType('TAKE_AWAY');
                      setSubmitError(null);
                    }}
                  >
                    <Text style={[styles.typeBtnText, { color: theme.textMuted }, orderType === 'TAKE_AWAY' && { color: theme.primary, fontWeight: typography.weights.bold }]}>
                      🥡 Mang đi (Take-away)
                    </Text>
                  </TouchableOpacity>
                </View>

                {orderType === 'DINE_IN' && (
                  <>
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>Chọn bàn ăn:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroller}>
                      {selectableTables.map((table) => (
                        <TouchableOpacity
                          testID={`pos-table-option-${table.tableNumber}`}
                          key={table.id}
                          style={[
                            styles.tableBtn,
                            { borderColor: theme.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' },
                            selectedTableId === table.id && [styles.tableBtnActive, { borderColor: theme.primary, backgroundColor: isDark ? '#451A03' : '#FEF2F2' }]
                          ]}
                          onPress={() => {
                            setSelectedTableId(table.id);
                            setSubmitError(null);
                          }}
                        >
                          <Text style={[styles.tableBtnText, { color: theme.text }, selectedTableId === table.id && { color: theme.primary }]}>
                            Bàn {table.tableNumber.toString().padStart(2, '0')}
                          </Text>
                          <Text style={[styles.tableStateText, { color: theme.textMuted }]}>
                            {table.status === 'OCCUPIED' ? 'Đang phục vụ' : 'Bàn trống'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    {selectableTables.length === 0 && (
                      <Text style={[styles.noTableText, { color: theme.danger }]}>Hiện không có bàn sẵn sàng nhận đơn.</Text>
                    )}
                  </>
                )}

                {submitError && <Text style={[styles.submitError, { color: theme.danger }]}>{submitError}</Text>}

                <TouchableOpacity
                  testID="btn-confirm-order"
                  style={[styles.submitOrderBtn, { backgroundColor: theme.primary }, isSubmitting && styles.submitOrderBtnDisabled]}
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

      {/* 5. Modifier Configuration Modal */}
      <ModifierModal
        visible={isModifierModalOpen}
        item={selectedMenuItemForModal}
        onClose={closeModifierModal}
        onAddToCart={addToCart}
      />

      {/* 6. Immutable Receipt Modal */}
      <ReceiptModal
        visible={isReceiptModalOpen}
        order={createdOrder}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
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
    fontSize: typography.sizes.sm
  },
  errorText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing.md
  },
  retryButton: {
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
    fontSize: typography.sizes.sm
  },
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
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
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.extraBold
  },
  modalSubtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCloseText: {
    fontWeight: typography.weights.bold
  },
  fieldLabel: {
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
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: 'center'
  },
  typeBtnActive: {},
  typeBtnText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold
  },
  tableScroller: {
    marginBottom: spacing.md
  },
  tableBtn: {
    minWidth: 92,
    padding: spacing.sm,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderRadius: 10
  },
  tableBtnActive: {},
  tableBtnText: {
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  tableStateText: {
    fontSize: 10,
    marginTop: 2
  },
  noTableText: {
    fontSize: typography.sizes.xs,
    marginBottom: spacing.md
  },
  submitError: {
    fontSize: typography.sizes.xs,
    marginBottom: spacing.sm
  },
  submitOrderBtn: {
    minHeight: spacing.touchTargetPOS,
    borderRadius: 10,
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
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: spacing.touchTargetMobile,
    justifyContent: 'center',
    alignItems: 'center'
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  successActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
    marginTop: spacing.lg
  },
  receiptBtn: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: spacing.touchTargetMobile,
    justifyContent: 'center',
    alignItems: 'center'
  },
  receiptBtnText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  }
});
