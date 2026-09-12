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
  View
} from 'react-native';
import { Check, ChefHat, CreditCard, QrCode, ShoppingBag, UtensilsCrossed, X } from 'lucide-react-native';
import { MenuItemDto, OrderDto, OrderStatus } from '../../api/contracts';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { elevation, radii, spacing, typography } from '../../theme';
import { AppIcon, Button, InlineAlert, StatusBadge, Surface } from '../../ui';
import type { StatusTone } from '../../ui';
import { MenuCategoryPills } from '../pos/MenuCategoryPills';
import { MenuItemCard } from '../pos/MenuItemCard';
import { ModifierModal } from '../pos/ModifierModal';

interface Props {
  tableNumber?: number;
}

const formatVND = (amount: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const formatTableNumber = (value: number) => value.toString().padStart(2, '0');

const orderStatusConfig = (status: OrderStatus): { label: string; tone: StatusTone } => {
  if (status === 'PREPARING') return { label: 'Đang chuẩn bị', tone: 'info' };
  if (status === 'READY') return { label: 'Sẵn sàng phục vụ', tone: 'success' };
  if (status === 'COMPLETED') return { label: 'Đã phục vụ', tone: 'neutral' };
  if (status === 'CANCELLED') return { label: 'Đã hủy', tone: 'danger' };
  return { label: 'Đã nhận đơn', tone: 'warning' };
};

const orderSteps = [
  { title: 'Đã nhận đơn', description: 'Nhà hàng đã nhận được yêu cầu của bạn.', icon: Check },
  { title: 'Đang chuẩn bị', description: 'Bếp đang chuẩn bị các món trong đơn.', icon: ChefHat },
  { title: 'Sẵn sàng phục vụ', description: 'Nhân viên sẽ mang món đến bàn ngay.', icon: UtensilsCrossed }
] as const;

export const TableOrderScreen: React.FC<Props> = ({ tableNumber = 4 }) => {
  const { theme } = useTheme();
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

  const table = tables.find((t) => t.tableNumber === tableNumber) || tables[0];
  const tableId = table?.id || 1;
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

  const getStepProgress = (status?: OrderStatus) => {
    switch (status) {
      case 'PENDING':
        return 1;
      case 'PREPARING':
        return 2;
      case 'READY':
      case 'COMPLETED':
        return 3;
      default:
        return 0;
    }
  };

  const currentStep = getStepProgress(liveOrder?.status);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
      <View style={[styles.customerHeader, { backgroundColor: theme.surfaceBase, borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.tableIdentity}>
          <View style={[styles.brandMark, { backgroundColor: theme.interactivePrimary }]}>
            <Text style={[styles.brandMarkText, { color: theme.textInverse }]}>CB</Text>
          </View>
          <View style={styles.tableIdentityCopy}>
            <Text style={[styles.headerHint, { color: theme.textSecondary }]}>Đặt món tại bàn</Text>
            <Text style={[styles.tableIdentityNumber, { color: theme.textPrimary }]}>Bàn {formatTableNumber(tableNumber)}</Text>
          </View>
        </View>

        {liveOrder && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Thanh toán ' + formatVND(liveOrder.finalAmount)}
            onPress={() => setIsVietQRModalOpen(true)}
            style={({ pressed }) => [
              styles.headerPayment,
              { backgroundColor: pressed ? theme.interactiveSecondaryPressed : theme.interactiveSecondary }
            ]}
          >
            <AppIcon icon={CreditCard} color={theme.primary} size={18} />
            <Text style={[styles.headerPaymentText, { color: theme.primary }]}>Thanh toán</Text>
          </Pressable>
        )}
      </View>

      {liveOrder && cart.length === 0 ? (
        <ScrollView contentContainerStyle={styles.progressContent} showsVerticalScrollIndicator={false}>
          <View style={styles.progressHeading}>
            <View style={styles.progressHeadingCopy}>
              <Text accessibilityRole="header" style={[styles.screenTitle, { color: theme.textPrimary }]}>Đơn của bạn</Text>
              <Text style={[styles.orderCode, { color: theme.textSecondary }]}>Mã đơn {liveOrder.code}</Text>
            </View>
            <StatusBadge {...orderStatusConfig(liveOrder.status)} />
          </View>

          <View style={styles.timeline}>
            {orderSteps.map((step, index) => {
              const stepNumber = index + 1;
              const completed = currentStep >= stepNumber;
              const current = currentStep === stepNumber;
              return (
                <View key={step.title} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View
                      style={[
                        styles.timelineMarker,
                        {
                          backgroundColor: completed ? theme.interactivePrimary : theme.surfaceBase,
                          borderColor: completed ? theme.interactivePrimary : theme.borderStrong
                        }
                      ]}
                    >
                      <AppIcon icon={step.icon} color={completed ? theme.textInverse : theme.textSecondary} size={17} />
                    </View>
                    {index < orderSteps.length - 1 && (
                      <View style={[styles.timelineLine, { backgroundColor: currentStep > stepNumber ? theme.interactivePrimary : theme.borderSubtle }]} />
                    )}
                  </View>
                  <View style={[styles.timelineCopy, { borderBottomColor: theme.borderSubtle }]}>
                    <Text style={[styles.timelineTitle, { color: completed ? theme.textPrimary : theme.textSecondary }]}>
                      {step.title}{current ? ' · Hiện tại' : ''}
                    </Text>
                    <Text style={[styles.timelineDescription, { color: theme.textSecondary }]}>{step.description}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.orderSection}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Món đã gọi</Text>
            <View style={[styles.orderItems, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
              {liveOrder.items?.map((item, index) => (
                <View
                  key={item.id || String(item.menuItemId) + '-' + index}
                  style={[styles.orderItem, index > 0 && { borderTopColor: theme.borderSubtle, borderTopWidth: 1 }]}
                >
                  <Text style={[styles.orderItemName, { color: theme.textPrimary }]}>
                    {item.quantity} × {item.menuItemName || `Món #${item.menuItemId}`}
                  </Text>
                  <Text style={[styles.orderItemPrice, { color: theme.textPrimary }]}>{formatVND(item.subtotal)}</Text>
                </View>
              ))}
              <View style={[styles.orderTotal, { borderTopColor: theme.borderSubtle }]}>
                <View>
                  <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>Tổng thanh toán</Text>
                  <Text style={[styles.vatNote, { color: theme.textSecondary }]}>Đã gồm VAT 8%</Text>
                </View>
                <Text style={[styles.totalValue, { color: theme.primary }]}>{formatVND(liveOrder.finalAmount)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.progressActions}>
            <Button variant="secondary" label="Gọi thêm món" onPress={() => setCurrentOrder(null)} />
            <Button variant="primary" label="Thanh toán" icon={CreditCard} onPress={() => setIsVietQRModalOpen(true)} />
          </View>
        </ScrollView>
      ) : (
        <View style={styles.menuArea}>
          <View style={styles.menuHeading}>
            <View>
              <Text accessibilityRole="header" style={[styles.screenTitle, { color: theme.textPrimary }]}>Thực đơn</Text>
              <Text style={[styles.menuDescription, { color: theme.textSecondary }]}>Chọn món bạn muốn gọi tại bàn.</Text>
            </View>
          </View>

          <MenuCategoryPills
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={selectCategory}
            totalItemCount={allMenuItems.length}
          />

          {isLoadingMenu ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Đang tải thực đơn...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredMenuItems}
              keyExtractor={(item) => item.id.toString()}
              numColumns={2}
              contentContainerStyle={styles.listContent}
              columnWrapperStyle={styles.menuRow}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.menuColumn}>
                  <MenuItemCard item={item} onPress={handleCardPress} />
                </View>
              )}
            />
          )}

          {cartItemCount > 0 && (
            <View
              testID="customer-cart-summary"
              style={[styles.customerCartBar, elevation.floatingAction, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]}
            >
              <View style={styles.cartSummaryCopy}>
                <View style={styles.cartHeadingRow}>
                  <AppIcon icon={ShoppingBag} color={theme.primary} size={18} />
                  <Text style={[styles.cartTitle, { color: theme.textPrimary }]}>Giỏ hàng</Text>
                </View>
                <Text style={[styles.cartMeta, { color: theme.textSecondary }]}>{cartItemCount} món</Text>
                <Text style={[styles.cartPrice, { color: theme.textPrimary }]}>{formatVND(cartTotal)}</Text>
              </View>
              <View style={styles.cartAction}>
                <Button
                  variant="primary"
                  label="Gửi món"
                  loading={isSubmitting}
                  onPress={() => void handleSendToKitchen()}
                />
              </View>
            </View>
          )}

          {orderError && (
            <View style={[styles.orderError, { bottom: cartItemCount > 0 ? 132 : spacing.lg }]}>
              <InlineAlert title="Chưa gửi được món" message={orderError} />
            </View>
          )}
        </View>
      )}

      <ModifierModal
        visible={isModifierModalOpen}
        item={selectedMenuItemForModal}
        onClose={closeModifierModal}
        onAddToCart={addToCart}
      />

      <Modal
        visible={isVietQRModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsVietQRModalOpen(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <SafeAreaView style={[styles.qrModal, elevation.modal, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
            <View style={[styles.qrHeader, { borderBottomColor: theme.borderSubtle }]}>
              <View style={styles.qrHeaderCopy}>
                <Text accessibilityRole="header" style={[styles.qrTitle, { color: theme.textPrimary }]}>Thanh toán chuyển khoản</Text>
                <Text style={[styles.qrSubtitle, { color: theme.textSecondary }]}>Bàn {formatTableNumber(tableNumber)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng thanh toán"
                onPress={() => setIsVietQRModalOpen(false)}
                style={({ pressed }) => [styles.closeButton, { backgroundColor: pressed ? theme.surfaceSunken : theme.interactiveQuiet }]}
              >
                <AppIcon icon={X} color={theme.textPrimary} size={20} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.qrBody}>
              <Surface level="sunken" style={styles.qrCodePanel}>
                <View style={[styles.qrPlaceholder, { backgroundColor: theme.surfaceBase, borderColor: theme.borderStrong }]}>
                  <AppIcon icon={QrCode} color={theme.textPrimary} size={88} />
                </View>
                <Text style={[styles.qrIllustrationHint, { color: theme.textSecondary }]}>Mã minh họa, không dùng để thanh toán.</Text>
                <Text style={[styles.qrBankName, { color: theme.textPrimary }]}>MB Bank</Text>
                <Text style={[styles.qrAccount, { color: theme.textSecondary }]}>0369888999 · Crispy Bite</Text>
              </Surface>

              <View style={styles.paymentDetails}>
                <View>
                  <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Số tiền</Text>
                  <Text style={[styles.qrAmount, { color: theme.primary }]}>{liveOrder ? formatVND(liveOrder.finalAmount) : '0 ₫'}</Text>
                </View>
                <View>
                  <Text style={[styles.paymentLabel, { color: theme.textSecondary }]}>Nội dung chuyển khoản</Text>
                  <Text style={[styles.transferContent, { color: theme.textPrimary }]}>BAN{tableNumber} {liveOrder?.code || ''}</Text>
                </View>
              </View>

              <InlineAlert
                tone="info"
                title="Cách thanh toán"
                message="Vui lòng liên hệ nhân viên để xác nhận thông tin chuyển khoản và thanh toán."
              />

              <Button variant="quiet" label="Đóng" onPress={() => setIsVietQRModalOpen(false)} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  customerHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  tableIdentity: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  brandMark: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  brandMarkText: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.md },
  tableIdentityCopy: { gap: 1 },
  headerHint: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  tableIdentityNumber: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant],
    lineHeight: typography.lineHeights.xl
  },
  headerPayment: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: spacing.touchTargetMobile,
    paddingHorizontal: spacing.md
  },
  headerPaymentText: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  menuArea: { flex: 1 },
  menuHeading: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  screenTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    lineHeight: typography.lineHeights.xl
  },
  menuDescription: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginTop: spacing.xs
  },
  listContent: { paddingBottom: 148, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  menuRow: { gap: spacing.md },
  menuColumn: { flex: 1, minWidth: 0 },
  centerContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl },
  loadingText: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    marginTop: spacing.md
  },
  customerCartBar: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    left: spacing.md,
    minHeight: 104,
    padding: spacing.md,
    position: 'absolute',
    right: spacing.md
  },
  cartSummaryCopy: { flex: 1, gap: 2 },
  cartHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  cartTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  cartMeta: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  cartPrice: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.lg,
    fontVariant: [...typography.numeric.fontVariant]
  },
  cartAction: { minWidth: 128 },
  orderError: { left: spacing.md, position: 'absolute', right: spacing.md },
  progressContent: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  progressHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  progressHeadingCopy: { flex: 1, gap: spacing.xs },
  orderCode: {
    fontFamily: typography.families.bodyMedium,
    fontSize: typography.sizes.sm,
    fontVariant: [...typography.numeric.fontVariant]
  },
  timeline: { paddingTop: spacing.xs },
  timelineRow: { alignItems: 'stretch', flexDirection: 'row', gap: spacing.md },
  timelineRail: { alignItems: 'center', width: 36 },
  timelineMarker: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  timelineLine: { flex: 1, minHeight: 40, width: 2 },
  timelineCopy: { borderBottomWidth: 1, flex: 1, gap: spacing.xs, minHeight: 76, paddingBottom: spacing.lg },
  timelineTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  timelineDescription: {
    fontFamily: typography.families.body,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm
  },
  orderSection: { gap: spacing.sm },
  sectionTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  orderItems: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden', paddingHorizontal: spacing.md },
  orderItem: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: spacing.md },
  orderItemName: { flex: 1, fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  orderItemPrice: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.sm,
    fontVariant: [...typography.numeric.fontVariant]
  },
  orderTotal: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md
  },
  totalLabel: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.sm },
  vatNote: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, marginTop: 2 },
  totalValue: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant]
  },
  progressActions: { gap: spacing.sm },
  modalBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.md },
  qrModal: {
    borderRadius: radii.md,
    borderWidth: 1,
    maxHeight: '94%',
    maxWidth: 480,
    overflow: 'hidden',
    width: '100%'
  },
  qrHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg
  },
  qrHeaderCopy: { flex: 1, gap: 2 },
  qrTitle: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    lineHeight: typography.lineHeights.xl
  },
  qrSubtitle: { fontFamily: typography.families.bodyMedium, fontSize: typography.sizes.sm },
  closeButton: { alignItems: 'center', borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 },
  qrBody: { gap: spacing.lg, padding: spacing.lg },
  qrCodePanel: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg },
  qrPlaceholder: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, height: 132, justifyContent: 'center', width: 132 },
  qrIllustrationHint: { fontFamily: typography.families.body, fontSize: typography.sizes.xs, textAlign: 'center' },
  qrBankName: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md },
  qrAccount: { fontFamily: typography.families.body, fontSize: typography.sizes.sm },
  paymentDetails: { gap: spacing.md },
  paymentLabel: { fontFamily: typography.families.body, fontSize: typography.sizes.xs },
  qrAmount: {
    fontFamily: typography.families.operationalBold,
    fontSize: typography.sizes.xl,
    fontVariant: [...typography.numeric.fontVariant],
    marginTop: spacing.xs
  },
  transferContent: {
    fontFamily: typography.families.bodySemibold,
    fontSize: typography.sizes.md,
    fontVariant: [...typography.numeric.fontVariant],
    marginTop: spacing.xs
  }
});
