import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal
} from 'react-native';
import { typography, spacing } from '../../theme';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { MenuCategoryPills } from '../pos/MenuCategoryPills';
import { MenuItemCard } from '../pos/MenuItemCard';
import { ModifierModal } from '../pos/ModifierModal';
import { MenuItemDto, OrderDto } from '../../api/contracts';

interface Props {
  tableNumber?: number;
}

export const TableOrderScreen: React.FC<Props> = ({ tableNumber = 4 }) => {
  const { theme, isDark } = useTheme();
  const {
    categories,
    allMenuItems,
    filteredMenuItems,
    selectedCategoryId,
    selectCategory,
    isLoadingMenu,
    selectedMenuItemForModal,
    isModifierModalOpen,
    openModifierModal,
    closeModifierModal,
    cart,
    cartItemCount,
    cartTotal,
    addToCart,
    createDineInOrder,
    tables,
    activeTableOrder
  } = useRestaurant();

  const [currentOrder, setCurrentOrder] = useState<OrderDto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isVietQRModalOpen, setIsVietQRModalOpen] = useState(false);

  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  // Tim tableId tu danh sach tables theo tableNumber
  const table = tables.find((t) => t.tableNumber === tableNumber) || tables[0];
  const tableId = table?.id || 1;

  // Lay order dang active cua ban neu co tu context
  const liveOrder = currentOrder || activeTableOrder || table?.orders?.[0] || null;

  const handleCardPress = (item: MenuItemDto) => {
    if (item.modifierGroups && item.modifierGroups.length > 0) {
      openModifierModal(item);
    } else {
      addToCart(item, 1, []);
    }
  };

  const handleSendToKitchen = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    setOrderError(null);

    const result = await createDineInOrder(tableId);
    setIsSubmitting(false);

    if (result.success && result.order) {
      setCurrentOrder(result.order);
    } else {
      setOrderError(result.error || 'Không thể gửi đơn xuống bếp');
    }
  };

  const getStepProgress = (status?: string) => {
    switch (status) {
      case 'PENDING':
        return 1;
      case 'PREPARING':
        return 2;
      case 'READY':
      case 'COMPLETED':
        return 3;
      default:
        return 1;
    }
  };

  const currentStep = getStepProgress(liveOrder?.status);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Brand & Table Welcome Header */}
      <View style={[styles.welcomeHeader, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <View style={styles.welcomeLeft}>
          <Text style={styles.brandEmoji}>🍔</Text>
          <View>
            <Text style={[styles.welcomeTitle, { color: theme.primary }]}>CRISPY BITE</Text>
            <Text style={[styles.tableBadge, { backgroundColor: isDark ? '#7C2D12' : '#FFEDD5', color: isDark ? '#FDBA74' : theme.secondary }]}>
              🍽️ BÀN SỐ {tableNumber < 10 ? `0${tableNumber}` : tableNumber}
            </Text>
          </View>
        </View>

        {liveOrder && (
          <TouchableOpacity
            style={[styles.payHeaderBtn, { backgroundColor: theme.primary }]}
            onPress={() => setIsVietQRModalOpen(true)}
          >
            <Text style={styles.payHeaderBtnText}>💳 Thanh toán ({formatVND(liveOrder.finalAmount)})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* If there is an active order and cart is empty -> Show Live Order Tracker */}
      {liveOrder && cart.length === 0 ? (
        <ScrollView style={styles.trackerContainer}>
          <View style={[styles.trackerCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.trackerTitle, { color: theme.text }]}>TIẾN ĐỘ MÓN ĂN - BÀN {tableNumber}</Text>
            <Text style={[styles.trackerOrderCode, { color: theme.textMuted }]}>Mã đơn: {liveOrder.code}</Text>

            {/* Stepper Timeline */}
            <View style={styles.timeline}>
              {/* Step 1 */}
              <View style={styles.timelineStep}>
                <View style={[styles.stepCircle, currentStep >= 1 && styles.stepCircleActive]}>
                  <Text style={styles.stepNumber}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepTitle, { color: theme.text }, currentStep >= 1 && styles.stepTitleActive]}>
                    ⏳ Bếp Đã Tiếp Nhận Đơn
                  </Text>
                  <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                    Đơn hàng đã được chuyển tới màn hình đầu bếp
                  </Text>
                </View>
              </View>

              <View style={[styles.stepLine, currentStep >= 2 && styles.stepLineActive]} />

              {/* Step 2 */}
              <View style={styles.timelineStep}>
                <View style={[styles.stepCircle, currentStep >= 2 && styles.stepCircleActive]}>
                  <Text style={styles.stepNumber}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepTitle, { color: theme.text }, currentStep >= 2 && styles.stepTitleActive]}>
                    🍳 Đầu Bếp Đang Chế Biến
                  </Text>
                  <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                    Món ăn đang được nấu nóng giòn tươi ngon
                  </Text>
                </View>
              </View>

              <View style={[styles.stepLine, currentStep >= 3 && styles.stepLineActive]} />

              {/* Step 3 */}
              <View style={styles.timelineStep}>
                <View style={[styles.stepCircle, currentStep >= 3 && styles.stepCircleReady]}>
                  <Text style={styles.stepNumber}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepTitle, { color: theme.text }, currentStep >= 3 && styles.stepTitleReady]}>
                    🎉 Món Đã Xong - Đang Bưng Ra Bàn!
                  </Text>
                  <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                    Nhân viên tiếp thực đang mang đồ ăn đến Bàn {tableNumber}
                  </Text>
                </View>
              </View>
            </View>

            {/* Order Items Summary */}
            <View style={[styles.orderedItemsBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: theme.border }]}>
              <Text style={[styles.orderedItemsTitle, { color: theme.text }]}>Chi tiết các món đã gọi:</Text>
              {liveOrder.items?.map((it: any, idx: number) => (
                <View key={idx} style={[styles.orderedItemRow, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.orderedItemName, { color: theme.text }]}>{it.quantity}x Món #{it.menuItemId}</Text>
                  <Text style={[styles.orderedItemPrice, { color: theme.primary }]}>{formatVND(it.subtotal)}</Text>
                </View>
              ))}
              <View style={[styles.orderedTotalRow, { borderTopColor: theme.border }]}>
                <Text style={[styles.orderedTotalLabel, { color: theme.text }]}>Tổng hóa đơn (đã gồm 8% VAT):</Text>
                <Text style={[styles.orderedTotalValue, { color: theme.primary }]}>{formatVND(liveOrder.finalAmount)}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.trackerActions}>
              <TouchableOpacity
                style={[styles.addMoreBtn, { backgroundColor: isDark ? '#7C2D12' : '#FFEDD5', borderColor: theme.secondary }]}
                onPress={() => setCurrentOrder(null)}
              >
                <Text style={[styles.addMoreText, { color: isDark ? '#FDBA74' : theme.secondary }]}>+ GỌI THÊM MÓN ĂN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.checkoutNowBtn, { backgroundColor: theme.primary }]}
                onPress={() => setIsVietQRModalOpen(true)}
              >
                <Text style={styles.checkoutNowText}>THANH TOÁN RA VỀ ➔</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        /* Regular Menu Order Flow */
        <View style={{ flex: 1 }}>
          <MenuCategoryPills
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={selectCategory}
            totalItemCount={allMenuItems.length}
          />

          {isLoadingMenu ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>Đang tải thực đơn...</Text>
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

          {/* Customer Bottom Cart Bar */}
          {cartItemCount > 0 && (
            <View style={[styles.customerCartBar, { backgroundColor: isDark ? '#1E293B' : '#0F172A', borderTopColor: theme.border }]}>
              <View>
                <Text style={styles.cartCountText}>Đã chọn {cartItemCount} món</Text>
                <Text style={styles.cartPriceText}>{formatVND(cartTotal)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.sendKitchenBtn, { backgroundColor: theme.primary }, isSubmitting && styles.btnDisabled]}
                onPress={handleSendToKitchen}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.sendKitchenText}>GỬI ĐƠN XUỐNG BẾP ➔</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Error message */}
          {orderError && (
            <View style={styles.orderErrorBox}>
              <Text style={styles.orderErrorText}>⚠️ {orderError}</Text>
            </View>
          )}
        </View>
      )}

      {/* Modifier Config Modal */}
      <ModifierModal
        visible={isModifierModalOpen}
        item={selectedMenuItemForModal}
        onClose={closeModifierModal}
        onAddToCart={addToCart}
      />

      {/* VietQR Dynamic Payment Modal */}
      <Modal visible={isVietQRModalOpen} transparent animationType="fade">
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <View style={[styles.qrModalContainer, { backgroundColor: theme.card }]}>
            <View style={[styles.qrHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.qrTitle, { color: theme.text }]}>📱 Thanh Toán VietQR Tự Động</Text>
              <TouchableOpacity onPress={() => setIsVietQRModalOpen(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.qrBody}>
              <View style={[styles.qrBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: theme.primary }]}>
                <Text style={styles.qrEmoji}>🔳</Text>
                <Text style={[styles.qrBankName, { color: theme.textMuted }]}>NGÂN HÀNG QUÂN ĐỘI (MB BANK)</Text>
                <Text style={[styles.qrAccount, { color: theme.text }]}>STK: 0369888999 • CRISPY BITE QSR</Text>
                <Text style={[styles.qrAmount, { color: theme.primary }]}>{liveOrder ? formatVND(liveOrder.finalAmount) : '0đ'}</Text>
                <Text style={[styles.qrContentText, { color: theme.textMuted }]}>Nội dung: BAN{tableNumber} {liveOrder?.code || ''}</Text>
              </View>

              <Text style={[styles.qrNotice, { color: theme.textMuted }]}>
                Quét mã QR qua bất kỳ App Ngân Hàng hoặc Ví điện tử (MoMo, ZaloPay). Sau khi chuyển khoản thành công, bàn sẽ được tự động giải phóng.
              </Text>

              <TouchableOpacity
                style={[styles.closeQrBtn, { backgroundColor: isDark ? '#334155' : '#1E293B' }]}
                onPress={() => setIsVietQRModalOpen(false)}
              >
                <Text style={styles.closeQrText}>Đóng Cửa Sổ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  welcomeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1
  },
  welcomeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  brandEmoji: {
    fontSize: 28
  },
  welcomeTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold,
    letterSpacing: 1
  },
  tableBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: typography.weights.bold,
    marginTop: 2
  },
  payHeaderBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8
  },
  payHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
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
  customerCartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    minHeight: spacing.touchTargetPOS
  },
  cartCountText: {
    color: '#94A3B8',
    fontSize: 11
  },
  cartPriceText: {
    color: '#F8FAFC',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.extraBold
  },
  sendKitchenBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center'
  },
  btnDisabled: {
    opacity: 0.6
  },
  sendKitchenText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5
  },
  orderErrorBox: {
    position: 'absolute',
    bottom: 70,
    left: 16,
    right: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: spacing.sm,
    borderRadius: 8
  },
  orderErrorText: {
    color: '#DC2626',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textAlign: 'center'
  },
  trackerContainer: {
    padding: spacing.lg
  },
  trackerCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3
  },
  trackerTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    textAlign: 'center'
  },
  trackerOrderCode: {
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: spacing.lg
  },
  timeline: {
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepCircleActive: {
    backgroundColor: '#EA580C'
  },
  stepCircleReady: {
    backgroundColor: '#16A34A'
  },
  stepNumber: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  stepContent: {
    flex: 1
  },
  stepTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  stepTitleActive: {
    color: '#EA580C',
    fontWeight: typography.weights.bold
  },
  stepTitleReady: {
    color: '#16A34A',
    fontWeight: typography.weights.bold
  },
  stepDesc: {
    fontSize: 10,
    marginTop: 1
  },
  stepLine: {
    width: 2,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginLeft: 15,
    marginVertical: 4
  },
  stepLineActive: {
    backgroundColor: '#EA580C'
  },
  orderedItemsBox: {
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    marginBottom: spacing.lg
  },
  orderedItemsTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.xs
  },
  orderedItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1
  },
  orderedItemName: {
    fontSize: typography.sizes.xs
  },
  orderedItemPrice: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  orderedTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1
  },
  orderedTotalLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  orderedTotalValue: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold
  },
  trackerActions: {
    gap: spacing.sm
  },
  addMoreBtn: {
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center'
  },
  addMoreText: {
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  checkoutNowBtn: {
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center'
  },
  checkoutNowText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs,
    letterSpacing: 0.5
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg
  },
  qrModalContainer: {
    borderRadius: 16,
    maxHeight: '80%'
  },
  qrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1
  },
  qrTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: typography.weights.bold
  },
  qrBody: {
    padding: spacing.lg,
    alignItems: 'center'
  },
  qrBox: {
    borderWidth: 2,
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.md
  },
  qrEmoji: {
    fontSize: 64,
    marginBottom: spacing.xs
  },
  qrBankName: {
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  qrAccount: {
    fontSize: 12,
    fontWeight: typography.weights.bold,
    marginTop: 2
  },
  qrAmount: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.extraBold,
    marginVertical: spacing.xs
  },
  qrContentText: {
    fontSize: 11,
    fontStyle: 'italic'
  },
  qrNotice: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.lg
  },
  closeQrBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: 8
  },
  closeQrText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  }
});
