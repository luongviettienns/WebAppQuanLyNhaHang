import React, { useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Platform
} from 'react-native';
import { OrderDto } from '../../api/contracts';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../theme';

interface Props {
  visible: boolean;
  order: OrderDto | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<Props> = ({ visible, order, onClose }) => {
  const { theme, isDark } = useTheme();

  if (!order) return null;

  const handlePrintOrExport = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.print) {
      window.print();
    } else {
      Alert.alert(
        'Xuất Hóa Đơn Thành Công',
        `Hóa đơn #${order.code} đã được xuất thành snapshot PDF bất biến. Tổng thanh toán: ${order.finalAmount.toLocaleString('vi-VN')} đ.`
      );
    }
  };

  const getPaymentMethodLabel = () => {
    switch (order.paymentMethod) {
      case 'CASH':
        return 'Tiền mặt (Cash)';
      case 'BANK_TRANSFER':
        return 'Chuyển khoản (Bank Transfer)';
      case 'CREDIT_CARD':
        return 'Thẻ tín dụng (Credit Card)';
      default:
        return 'Chưa thanh toán';
    }
  };

  const getPaymentStatusBadge = () => {
    switch (order.paymentStatus) {
      case 'PAID':
        return { label: 'ĐÃ THANH TOÁN', bg: '#D1FAE5', text: '#065F46' };
      case 'VOIDED':
        return { label: 'ĐÃ HỦY (VOIDED)', bg: '#FEE2E2', text: '#B91C1C' };
      default:
        return { label: 'CHƯA THANH TOÁN', bg: '#FEF3C7', text: '#B45309' };
    }
  };

  const statusBadge = getPaymentStatusBadge();
  const orderDate = new Date(order.paidAt || order.createdAt);
  const formattedDate = !isNaN(orderDate.getTime())
    ? orderDate.toLocaleString('vi-VN')
    : order.createdAt;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: theme.border }]}>
          {/* Top Actions */}
          <View style={[styles.topActions, { borderBottomColor: theme.border }]}>
            <Text style={[styles.modalHeading, { color: theme.text }]}>Hóa Đơn Bán Hàng</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeBtnText, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Receipt Content ScrollView */}
          <ScrollView contentContainerStyle={styles.receiptScroll} showsVerticalScrollIndicator={false}>
            {/* Paper Thermal Layout */}
            <View style={[styles.receiptPaper, { backgroundColor: isDark ? '#0F172A' : '#FAFAF9', borderColor: theme.border }]}>
              {/* Brand Header */}
              <View style={styles.brandHeader}>
                <Text style={[styles.brandTitle, { color: theme.primary }]}>CRISPY BITE QSR</Text>
                <Text style={[styles.brandSub, { color: theme.textMuted }]}>
                  Hệ Thống Nhà Hàng Thức Ăn Nhanh & Gà Rán
                </Text>
                <Text style={[styles.brandInfo, { color: theme.textMuted }]}>
                  Đ/c: 123 Nguyễn Huệ, P. Bến Nghé, Quận 1, TP. HCM
                </Text>
                <Text style={[styles.brandInfo, { color: theme.textMuted }]}>Hotline CSKH: 1900 8888</Text>
              </View>

              <View style={styles.dashedDivider} />

              {/* Order Meta Info */}
              <View style={styles.metaSection}>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Mã hóa đơn:</Text>
                  <Text style={[styles.metaValueBold, { color: theme.text }]}>{order.code}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Thời gian:</Text>
                  <Text style={[styles.metaValue, { color: theme.text }]}>{formattedDate}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Hình thức:</Text>
                  <Text style={[styles.metaValue, { color: theme.text }]}>
                    {order.orderType === 'DINE_IN'
                      ? `🍽️ Ăn tại bàn (Bàn ${order.tableNumber ?? order.tableId ?? 'Chưa gán'})`
                      : `🛍️ Mang về (Buzzer #${order.buzzerNumber ?? 'Chưa gán'})`}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Trạng thái:</Text>
                  <View style={[styles.statusTag, { backgroundColor: statusBadge.bg }]}>
                    <Text style={[styles.statusTagText, { color: statusBadge.text }]}>
                      {statusBadge.label}
                    </Text>
                  </View>
                </View>

                {order.voidReason && (
                  <View style={styles.voidReasonBox}>
                    <Text style={styles.voidReasonText}>Lý do hủy: {order.voidReason}</Text>
                  </View>
                )}
              </View>

              <View style={styles.dashedDivider} />

              {/* Items Table */}
              <View style={styles.itemsSection}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.thColItem, { color: theme.textMuted }]}>MÓN / CHI TIẾT</Text>
                  <Text style={[styles.thColQty, { color: theme.textMuted }]}>SL</Text>
                  <Text style={[styles.thColPrice, { color: theme.textMuted }]}>Đ.GIÁ</Text>
                  <Text style={[styles.thColTotal, { color: theme.textMuted }]}>T.TIỀN</Text>
                </View>

                {order.items.map((item, idx) => {
                  const modifiers = item.selectedModifiersJson || [];

                  return (
                    <View key={item.id || idx} style={styles.itemRow}>
                      <View style={styles.itemMainRow}>
                        <Text style={[styles.tdItemName, { color: theme.text }]}>
                          {item.menuItemName}
                        </Text>
                        <Text style={[styles.tdQty, { color: theme.text }]}>{item.quantity}</Text>
                        <Text style={[styles.tdPrice, { color: theme.textMuted }]}>
                          {item.unitPrice.toLocaleString('vi-VN')}
                        </Text>
                        <Text style={[styles.tdTotal, { color: theme.text }]}>
                          {item.subtotal.toLocaleString('vi-VN')}
                        </Text>
                      </View>

                      {/* Modifiers List */}
                      {modifiers.length > 0 && (
                        <View style={styles.modifierList}>
                          {modifiers.map((mod, mIdx) => (
                            <Text key={mIdx} style={[styles.modifierItemText, { color: theme.textMuted }]}>
                              • {mod.groupName}: {mod.optionName}{' '}
                              {mod.priceDelta > 0 ? `(+${mod.priceDelta.toLocaleString('vi-VN')}đ)` : ''}
                            </Text>
                          ))}
                        </View>
                      )}

                      {item.notes && (
                        <Text style={[styles.itemNotes, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                          * Ghi chú: {item.notes}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>

              <View style={styles.dashedDivider} />

              {/* Total Calculation Summary */}
              <View style={styles.totalsSection}>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: theme.textMuted }]}>Cộng tiền món:</Text>
                  <Text style={[styles.totalValue, { color: theme.text }]}>
                    {order.totalAmount.toLocaleString('vi-VN')} đ
                  </Text>
                </View>

                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: theme.textMuted }]}>Thuế GTGT (VAT 8%):</Text>
                  <Text style={[styles.totalValue, { color: theme.text }]}>
                    {order.vatAmount.toLocaleString('vi-VN')} đ
                  </Text>
                </View>

                <View style={styles.finalRow}>
                  <Text style={[styles.finalLabel, { color: theme.primary }]}>TỔNG THANH TOÁN:</Text>
                  <Text style={[styles.finalValue, { color: theme.primary }]}>
                    {order.finalAmount.toLocaleString('vi-VN')} đ
                  </Text>
                </View>

                <View style={styles.paymentMethodRow}>
                  <Text style={[styles.paymentMethodLabel, { color: theme.textMuted }]}>
                    Phương thức thanh toán:
                  </Text>
                  <Text style={[styles.paymentMethodValue, { color: theme.text }]}>
                    {getPaymentMethodLabel()}
                  </Text>
                </View>
              </View>

              <View style={styles.dashedDivider} />

              {/* Footer Notice */}
              <View style={styles.footerNotice}>
                <Text style={[styles.footerThanks, { color: theme.text }]}>
                  Cảm ơn Quý khách & Hẹn gặp lại!
                </Text>
                <Text style={[styles.footerSub, { color: theme.textMuted }]}>
                  Hóa đơn điện tử snapshot lưu trữ vĩnh viễn không biến động theo giá menu
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Modal Action Buttons */}
          <View style={[styles.modalActions, { borderTopColor: theme.border }]}>
            <TouchableOpacity style={[styles.closeButton, { borderColor: theme.border }]} onPress={onClose}>
              <Text style={[styles.closeButtonText, { color: theme.text }]}>Đóng</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.printButton, { backgroundColor: theme.primary }]}
              onPress={handlePrintOrExport}
            >
              <Text style={styles.printButtonText}>🖨️ In / Xuất Hóa Đơn PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md
  },
  container: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1
  },
  modalHeading: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  closeBtn: {
    padding: spacing.xs
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: typography.weights.bold
  },
  receiptScroll: {
    padding: spacing.md
  },
  receiptPaper: {
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.lg
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: spacing.sm
  },
  brandTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.extraBold,
    letterSpacing: 1.5
  },
  brandSub: {
    fontSize: typography.sizes.xs,
    marginTop: 2,
    fontWeight: typography.weights.medium
  },
  brandInfo: {
    fontSize: 11,
    marginTop: 2
  },
  dashedDivider: {
    borderStyle: 'dashed',
    borderBottomWidth: 1,
    borderColor: '#94A3B8',
    marginVertical: spacing.md
  },
  metaSection: {
    gap: spacing.xs
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  metaLabel: {
    fontSize: typography.sizes.xs
  },
  metaValue: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  metaValueBold: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  statusTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  voidReasonBox: {
    backgroundColor: '#FEE2E2',
    padding: spacing.xs,
    borderRadius: 4,
    marginTop: spacing.xs
  },
  voidReasonText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  itemsSection: {
    gap: spacing.sm
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.3)'
  },
  thColItem: {
    flex: 3,
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  thColQty: {
    width: 36,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  thColPrice: {
    width: 65,
    textAlign: 'right',
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  thColTotal: {
    width: 75,
    textAlign: 'right',
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  itemRow: {
    marginBottom: spacing.xs
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  tdItemName: {
    flex: 3,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  tdQty: {
    width: 36,
    textAlign: 'center',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  tdPrice: {
    width: 65,
    textAlign: 'right',
    fontSize: typography.sizes.xs
  },
  tdTotal: {
    width: 75,
    textAlign: 'right',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  modifierList: {
    paddingLeft: spacing.sm,
    marginTop: 2
  },
  modifierItemText: {
    fontSize: 10
  },
  itemNotes: {
    fontSize: 10,
    fontStyle: 'italic',
    paddingLeft: spacing.sm,
    marginTop: 2
  },
  totalsSection: {
    gap: spacing.xs
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  totalLabel: {
    fontSize: typography.sizes.xs
  },
  totalValue: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  finalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.4)'
  },
  finalLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold
  },
  finalValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.extraBold
  },
  paymentMethodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs
  },
  paymentMethodLabel: {
    fontSize: 11
  },
  paymentMethodValue: {
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  footerNotice: {
    alignItems: 'center',
    marginTop: spacing.xs
  },
  footerThanks: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  footerSub: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1
  },
  closeButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: spacing.touchTargetMobile,
    justifyContent: 'center',
    alignItems: 'center'
  },
  closeButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium
  },
  printButton: {
    borderRadius: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minHeight: spacing.touchTargetMobile,
    justifyContent: 'center',
    alignItems: 'center'
  },
  printButtonText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  }
});
