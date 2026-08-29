import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator
} from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { DiningTableDto, PaymentMethod } from '../../api/contracts';

export const TableScreen: React.FC = () => {
  const { tables, isLoadingTables, fetchTables, payOrder } = useRestaurant();
  const [selectedTable, setSelectedTable] = useState<DiningTableDto | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [isProcessingPay, setIsProcessingPay] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState<string | null>(null);

  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  const handleTablePress = (table: DiningTableDto) => {
    setSelectedTable(table);
    setIsDetailModalOpen(true);
    setPaySuccessMsg(null);
  };

  const handlePay = async () => {
    if (!selectedTable?.orders || selectedTable.orders.length === 0) return;
    const activeOrder = selectedTable.orders[0];

    setIsProcessingPay(true);
    const result = await payOrder(activeOrder.id, paymentMethod);
    setIsProcessingPay(false);

    if (result.success) {
      setPaySuccessMsg(`✅ Đã thanh toán thành công đơn ${activeOrder.code}! Bàn số ${selectedTable.tableNumber} đã được giải phóng.`);
      setTimeout(() => {
        setIsDetailModalOpen(false);
        setSelectedTable(null);
      }, 1500);
    } else {
      alert(result.error || 'Thanh toán thất bại');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return { bg: '#DCFCE7', border: '#22C55E', text: '#15803D', label: '🟢 Trống' };
      case 'OCCUPIED':
        return { bg: '#FEE2E2', border: '#EF4444', text: '#B91C1C', label: '🔴 Đang có khách' };
      case 'NEED_CLEANING':
      default:
        return { bg: '#FEF3C7', border: '#F59E0B', text: '#B45309', label: '🟡 Chờ dọn bàn' };
    }
  };

  const activeOrder = selectedTable?.orders?.[0];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Sơ Đồ 12 Bàn Ăn (Floor Map)</Text>
          <Text style={styles.subtitle}>Chạm vào bàn để xem chi tiết hóa đơn và thanh toán ra về</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchTables}>
          <Text style={styles.refreshText}>🔄 Làm mới</Text>
        </TouchableOpacity>
      </View>

      {/* Legend Bar */}
      <View style={styles.legendBar}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={styles.legendText}>Bàn trống ({tables.filter((t) => t.status === 'AVAILABLE').length})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Đang ăn ({tables.filter((t) => t.status === 'OCCUPIED').length})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>Chờ dọn ({tables.filter((t) => t.status === 'NEED_CLEANING').length})</Text>
        </View>
      </View>

      {/* Tables Grid */}
      {isLoadingTables ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải sơ đồ bàn...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.gridContainer}>
          {tables.map((table) => {
            const statusConfig = getStatusColor(table.status);
            const order = table.orders?.[0];
            return (
              <TouchableOpacity
                key={table.id}
                style={[
                  styles.tableCard,
                  { backgroundColor: statusConfig.bg, borderColor: statusConfig.border }
                ]}
                onPress={() => handleTablePress(table)}
                activeOpacity={0.8}
              >
                <View style={styles.tableTop}>
                  <Text style={styles.tableNumberText}>BÀN {table.tableNumber < 10 ? `0${table.tableNumber}` : table.tableNumber}</Text>
                  <Text style={[styles.tableStatusText, { color: statusConfig.text }]}>
                    {statusConfig.label}
                  </Text>
                </View>

                <View style={styles.tableBody}>
                  <Text style={styles.tableCapacity}>👥 Sức chứa: {table.capacity} khách</Text>
                  {order ? (
                    <View style={styles.tableOrderBadge}>
                      <Text style={styles.orderCodeText}>{order.code}</Text>
                      <Text style={styles.orderTotalText}>{formatVND(order.finalAmount)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.noOrderText}>Sẵn sàng đón khách</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Table Detail & Checkout Modal */}
      <Modal visible={isDetailModalOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                🍽️ Chi Tiết Bàn {selectedTable?.tableNumber} - {selectedTable ? getStatusColor(selectedTable.status).label : ''}
              </Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsDetailModalOpen(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {paySuccessMsg && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>{paySuccessMsg}</Text>
                </View>
              )}

              {activeOrder ? (
                <View>
                  <View style={styles.billHeader}>
                    <Text style={styles.billCode}>Mã đơn: {activeOrder.code}</Text>
                    <Text style={styles.billStatus}>Trạng thái: {activeOrder.status}</Text>
                  </View>

                  <Text style={styles.sectionTitle}>Danh sách món ăn:</Text>
                  <View style={styles.itemsList}>
                    {activeOrder.items?.map((it: any, idx: number) => (
                      <View key={idx} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>
                            {it.quantity}x Món #{it.menuItemId}
                          </Text>
                          {it.notes && <Text style={styles.itemNotes}>Ghi chú: {it.notes}</Text>}
                        </View>
                        <Text style={styles.itemSubtotal}>{formatVND(it.subtotal)}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Summary */}
                  <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Tạm tính:</Text>
                      <Text style={styles.summaryValue}>{formatVND(activeOrder.totalAmount)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Thuế VAT (8%):</Text>
                      <Text style={styles.summaryValue}>{formatVND(activeOrder.vatAmount)}</Text>
                    </View>
                    <View style={[styles.summaryRow, styles.summaryTotalRow]}>
                      <Text style={styles.summaryTotalLabel}>TỔNG THANH TOÁN:</Text>
                      <Text style={styles.summaryTotalValue}>{formatVND(activeOrder.finalAmount)}</Text>
                    </View>
                  </View>

                  {/* Payment Method Selector */}
                  <Text style={styles.sectionTitle}>Chọn phương thức thanh toán:</Text>
                  <View style={styles.paymentMethods}>
                    <TouchableOpacity
                      style={[styles.payMethodBtn, paymentMethod === 'CASH' && styles.payMethodBtnActive]}
                      onPress={() => setPaymentMethod('CASH')}
                    >
                      <Text style={[styles.payMethodText, paymentMethod === 'CASH' && styles.payMethodTextActive]}>
                        💵 Tiền Mặt
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.payMethodBtn, paymentMethod === 'BANK_TRANSFER' && styles.payMethodBtnActive]}
                      onPress={() => setPaymentMethod('BANK_TRANSFER')}
                    >
                      <Text style={[styles.payMethodText, paymentMethod === 'BANK_TRANSFER' && styles.payMethodTextActive]}>
                        📱 Chuyển Khoản (VietQR)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.payMethodBtn, paymentMethod === 'CREDIT_CARD' && styles.payMethodBtnActive]}
                      onPress={() => setPaymentMethod('CREDIT_CARD')}
                    >
                      <Text style={[styles.payMethodText, paymentMethod === 'CREDIT_CARD' && styles.payMethodTextActive]}>
                        💳 Thẻ
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Submit Pay */}
                  <TouchableOpacity
                    style={[styles.payConfirmBtn, isProcessingPay && styles.btnDisabled]}
                    onPress={handlePay}
                    disabled={isProcessingPay}
                  >
                    {isProcessingPay ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.payConfirmText}>
                        XÁC NHẬN THANH TOÁN ({formatVND(activeOrder.finalAmount)}) ➔
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyTableBox}>
                  <Text style={styles.emptyTableEmoji}>✨</Text>
                  <Text style={styles.emptyTableTitle}>Bàn đang trống</Text>
                  <Text style={styles.emptyTableDesc}>
                    Khách có thể quét mã QR dán trên bàn để tự gọi món hoặc Thu ngân gọi món tại POS.
                  </Text>
                </View>
              )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  subtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2
  },
  refreshBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#F1F5F9',
    borderRadius: 6
  },
  refreshText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.text
  },
  legendBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  legendText: {
    fontSize: 11,
    color: colors.textMuted
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.sizes.xs
  },
  gridContainer: {
    padding: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  tableCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 2,
    padding: spacing.md,
    marginBottom: spacing.md,
    minHeight: 120,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  tableTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  tableNumberText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.extraBold,
    color: colors.text
  },
  tableStatusText: {
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  tableBody: {
    marginTop: spacing.xs
  },
  tableCapacity: {
    fontSize: 11,
    color: colors.textMuted
  },
  tableOrderBadge: {
    marginTop: spacing.xs,
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  orderCodeText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: typography.weights.bold
  },
  orderTotalText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.extraBold,
    color: colors.text
  },
  noOrderText: {
    fontSize: 11,
    color: '#16A34A',
    marginTop: spacing.xs,
    fontWeight: typography.weights.medium
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end'
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    flex: 1
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  modalTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: typography.weights.bold,
    color: colors.textMuted
  },
  modalBody: {
    padding: spacing.md
  },
  successBox: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.md
  },
  successText: {
    color: '#15803D',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    textAlign: 'center'
  },
  billHeader: {
    backgroundColor: '#F8FAFC',
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md
  },
  billCode: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  billStatus: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
    marginTop: 2
  },
  sectionTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs
  },
  itemsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  itemName: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.text
  },
  itemNotes: {
    fontSize: 10,
    color: colors.textMuted,
    fontStyle: 'italic'
  },
  itemSubtotal: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    padding: spacing.md,
    borderRadius: 8,
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  summaryLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted
  },
  summaryValue: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.text
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs
  },
  summaryTotalLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  summaryTotalValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.extraBold,
    color: colors.primary
  },
  paymentMethods: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg
  },
  payMethodBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: '#F8FAFC'
  },
  payMethodBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#FEF2F2'
  },
  payMethodText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: typography.weights.medium
  },
  payMethodTextActive: {
    color: colors.primary,
    fontWeight: typography.weights.bold
  },
  payConfirmBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing.touchTargetPOS,
    marginBottom: spacing.xl
  },
  btnDisabled: {
    opacity: 0.6
  },
  payConfirmText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5
  },
  emptyTableBox: {
    alignItems: 'center',
    padding: spacing.xl
  },
  emptyTableEmoji: {
    fontSize: 48,
    marginBottom: spacing.xs
  },
  emptyTableTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text
  },
  emptyTableDesc: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs
  }
});
