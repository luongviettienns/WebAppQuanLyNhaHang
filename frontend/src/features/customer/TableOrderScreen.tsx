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
import { colors, typography, spacing } from '../../theme';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { MenuCategoryPills } from '../pos/MenuCategoryPills';
import { MenuItemCard } from '../pos/MenuItemCard';
import { ModifierModal } from '../pos/ModifierModal';
import { MenuItemDto, OrderDto } from '../../api/contracts';

interface Props {
  tableNumber?: number;
}

export const TableOrderScreen: React.FC<Props> = ({ tableNumber = 4 }) => {
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
    <SafeAreaView style={styles.container}>
      {/* Brand & Table Welcome Header */}
      <View style={styles.welcomeHeader}>
        <View style={styles.welcomeLeft}>
          <Text style={styles.brandEmoji}>🍔</Text>
          <View>
            <Text style={styles.welcomeTitle}>CRISPY BITE</Text>
            <Text style={styles.tableBadge}>🍽️ BÀN SỐ {tableNumber < 10 ? `0${tableNumber}` : tableNumber}</Text>
          </View>
        </View>

        {liveOrder && (
          <TouchableOpacity
            style={styles.payHeaderBtn}
            onPress={() => setIsVietQRModalOpen(true)}
          >
            <Text style={styles.payHeaderBtnText}>💳 Thanh toán ({formatVND(liveOrder.finalAmount)})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* If there is an active order and cart is empty -> Show Live Order Tracker */}
      {liveOrder && cart.length === 0 ? (
        <ScrollView style={styles.trackerContainer}>
          <View style={styles.trackerCard}>
            <Text style={styles.trackerTitle}>TIẾN ĐỘ MÓN ĂN - BÀN {tableNumber}</Text>
            <Text style={styles.trackerOrderCode}>Mã đơn: {liveOrder.code}</Text>

            {/* Stepper Timeline */}
            <View style={styles.timeline}>
              {/* Step 1 */}
              <View style={styles.timelineStep}>
                <View style={[styles.stepCircle, currentStep >= 1 && styles.stepCircleActive]}>
                  <Text style={styles.stepNumber}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepTitle, currentStep >= 1 && styles.stepTitleActive]}>
                    ⏳ Bếp Đã Tiếp Nhận Đơn
                  </Text>
                  <Text style={styles.stepDesc}>Đơn hàng đã được chuyển tới màn hình đầu bếp</Text>
                </View>
              </View>

              <View style={[styles.stepLine, currentStep >= 2 && styles.stepLineActive]} />

              {/* Step 2 */}
              <View style={styles.timelineStep}>
                <View style={[styles.stepCircle, currentStep >= 2 && styles.stepCircleActive]}>
                  <Text style={styles.stepNumber}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepTitle, currentStep >= 2 && styles.stepTitleActive]}>
                    🍳 Đầu Bếp Đang Chế Biến
                  </Text>
                  <Text style={styles.stepDesc}>Món ăn đang được nấu nóng giòn tươi ngon</Text>
                </View>
              </View>

              <View style={[styles.stepLine, currentStep >= 3 && styles.stepLineActive]} />

              {/* Step 3 */}
              <View style={styles.timelineStep}>
                <View style={[styles.stepCircle, currentStep >= 3 && styles.stepCircleReady]}>
                  <Text style={styles.stepNumber}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={[styles.stepTitle, currentStep >= 3 && styles.stepTitleReady]}>
                    🎉 Món Đã Xong - Đang Bưng Ra Bàn!
                  </Text>
                  <Text style={styles.stepDesc}>Nhân viên tiếp thực đang mang đồ ăn đến Bàn {tableNumber}</Text>
                </View>
              </View>
            </View>

            {/* Order Items Summary */}
            <View style={styles.orderedItemsBox}>
              <Text style={styles.orderedItemsTitle}>Chi tiết các món đã gọi:</Text>
              {liveOrder.items?.map((it: any, idx: number) => (
                <View key={idx} style={styles.orderedItemRow}>
                  <Text style={styles.orderedItemName}>{it.quantity}x Món #{it.menuItemId}</Text>
                  <Text style={styles.orderedItemPrice}>{formatVND(it.subtotal)}</Text>
                </View>
              ))}
              <View style={styles.orderedTotalRow}>
                <Text style={styles.orderedTotalLabel}>Tổng hóa đơn (đã gồm 8% VAT):</Text>
                <Text style={styles.orderedTotalValue}>{formatVND(liveOrder.finalAmount)}</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.trackerActions}>
              <TouchableOpacity
                style={styles.addMoreBtn}
                onPress={() => setCurrentOrder(null)}
              >
                <Text style={styles.addMoreText}>+ GỌI THÊM MÓN ĂN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkoutNowBtn}
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
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Đang tải thực đơn...</Text>
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
            <View style={styles.customerCartBar}>
              <View>
                <Text style={styles.cartCountText}>Đã chọn {cartItemCount} món</Text>
                <Text style={styles.cartPriceText}>{formatVND(cartTotal)}</Text>
              </View>

              <TouchableOpacity
                style={[styles.sendKitchenBtn, isSubmitting && styles.btnDisabled]}
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

          {orderError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>⚠️ {orderError}</Text>
            </View>
          )}
        </View>
      )}

      {/* Modifier Modal */}
      <ModifierModal
        visible={isModifierModalOpen}
        item={selectedMenuItemForModal}
        onClose={closeModifierModal}
        onAddToCart={addToCart}
      />

      {/* Dynamic VietQR Payment Modal */}
      <Modal visible={isVietQRModalOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.qrModalContainer}>
            <View style={styles.qrHeader}>
              <Text style={styles.qrTitle}>Quét Mã VietQR Thanh Toán</Text>
              <TouchableOpacity onPress={() => setIsVietQRModalOpen(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.qrBody}>
              <View style={styles.qrBox}>
                <Text style={styles.qrEmoji}>📱</Text>
                <Text style={styles.qrBankName}>NGÂN HÀNG QUÂN ĐỘI (MB BANK)</Text>
                <Text style={styles.qrAccount}>STK: 0988888888 (CRISPY BITE)</Text>
                <Text style={styles.qrAmount}>{formatVND(liveOrder?.finalAmount || 0)}</Text>
                <Text style={styles.qrContentText}>Nội dung: {liveOrder?.code}</Text>
              </View>

              <Text style={styles.qrNotice}>
                💡 Quý khách có thể quét mã QR bằng bất kỳ ứng dụng ngân hàng hoặc ví điện tử nào. Sau khi thanh toán, hệ thống sẽ tự động xác nhận và đóng hóa đơn.
              </Text>

              <TouchableOpacity
                style={styles.closeQrBtn}
                onPress={() => setIsVietQRModalOpen(false)}
              >
                <Text style={styles.closeQrText}>Đóng Cửa Sổ</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  welcomeHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border
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
    color: colors.primary,
    letterSpacing: 1
  },
  tableBadge: {
    fontSize: 11,
    fontWeight: typography.weights.bold,
    color: colors.secondary
  },
  payHeaderBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: colors.primary,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 6
  },
  payHeaderBtnText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: typography.weights.bold
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.sizes.xs
  },
  listContent: {
    padding: spacing.xs,
    paddingBottom: 80
  },
  customerCartBar: {
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
    minHeight: spacing.touchTargetPOS
  },
  cartCountText: {
    color: '#94A3B8',
    fontSize: 11
  },
  cartPriceText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  sendKitchenBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendKitchenText: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  btnDisabled: {
    opacity: 0.6
  },
  errorBanner: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm
  },
  errorBannerText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: typography.weights.bold,
    textAlign: 'center'
  },
  trackerContainer: {
    flex: 1,
    padding: spacing.md
  },
  trackerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4
  },
  trackerTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.extraBold,
    color: colors.primary,
    textAlign: 'center'
  },
  trackerOrderCode: {
    fontSize: 12,
    color: colors.textMuted,
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
    backgroundColor: colors.secondary
  },
  stepCircleReady: {
    backgroundColor: '#16A34A'
  },
  stepNumber: {
    color: '#FFFFFF',
    fontWeight: typography.weights.bold,
    fontSize: 14
  },
  stepContent: {
    flex: 1
  },
  stepTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: '#64748B'
  },
  stepTitleActive: {
    color: colors.secondary
  },
  stepTitleReady: {
    color: '#16A34A'
  },
  stepDesc: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2
  },
  stepLine: {
    width: 2,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginLeft: 15,
    marginVertical: 4
  },
  stepLineActive: {
    backgroundColor: colors.secondary
  },
  orderedItemsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg
  },
  orderedItemsTitle: {
    fontSize: 11,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs
  },
  orderedItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3
  },
  orderedItemName: {
    fontSize: 11,
    color: colors.text
  },
  orderedItemPrice: {
    fontSize: 11,
    fontWeight: typography.weights.semibold,
    color: colors.text
  },
  orderedTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  orderedTotalLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  orderedTotalValue: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold,
    color: colors.primary
  },
  trackerActions: {
    gap: spacing.sm
  },
  addMoreBtn: {
    paddingVertical: spacing.md,
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: 8,
    alignItems: 'center'
  },
  addMoreText: {
    color: colors.secondary,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.xs
  },
  checkoutNowBtn: {
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: spacing.lg
  },
  qrModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    maxHeight: '80%'
  },
  qrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  qrTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: typography.weights.bold,
    color: colors.textMuted
  },
  qrBody: {
    padding: spacing.lg,
    alignItems: 'center'
  },
  qrBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: colors.primary,
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
    fontWeight: typography.weights.bold,
    color: colors.textMuted
  },
  qrAccount: {
    fontSize: 12,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: 2
  },
  qrAmount: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.extraBold,
    color: colors.primary,
    marginVertical: spacing.xs
  },
  qrContentText: {
    fontSize: 11,
    color: colors.textMuted,
    fontStyle: 'italic'
  },
  qrNotice: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: spacing.lg
  },
  closeQrBtn: {
    backgroundColor: '#1E293B',
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
