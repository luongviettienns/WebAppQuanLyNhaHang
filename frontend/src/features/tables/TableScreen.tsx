import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { typography, spacing } from '../../theme';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { DiningTableDto, PaymentMethod } from '../../api/contracts';

export const TableScreen: React.FC = () => {
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const {
    tables,
    isLoadingTables,
    fetchTables,
    payOrder,
    updateTableStatus,
    voidOrder
  } = useRestaurant();

  const [selectedTable, setSelectedTable] = useState<DiningTableDto | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [isProcessingPay, setIsProcessingPay] = useState(false);
  const [paySuccessMsg, setPaySuccessMsg] = useState<string | null>(null);

  // Audited Void & Cleaning States
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isProcessingVoid, setIsProcessingVoid] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [isProcessingClean, setIsProcessingClean] = useState(false);

  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  const handleTablePress = (table: DiningTableDto) => {
    setSelectedTable(table);
    setSelectedOrderId(table.orders?.[0]?.id ?? null);
    setIsDetailModalOpen(true);
    setPaySuccessMsg(null);
  };

  const handlePay = async () => {
    if (!selectedTable?.orders || selectedTable.orders.length === 0) return;
    const activeOrder =
      selectedTable.orders.find((order) => order.id === selectedOrderId) || selectedTable.orders[0];

    setIsProcessingPay(true);
    const result = await payOrder(activeOrder.id, paymentMethod);
    setIsProcessingPay(false);

    if (result.success) {
      const remainingOrders = selectedTable.orders.filter((order) => order.id !== activeOrder.id);
      const nextOrder = remainingOrders[0];
      setSelectedTable({
        ...selectedTable,
        orders: remainingOrders,
        status: nextOrder ? 'OCCUPIED' : 'AVAILABLE',
        currentOrderId: nextOrder?.id ?? null
      });
      setSelectedOrderId(nextOrder?.id ?? null);
      setPaySuccessMsg(
        nextOrder
          ? `✅ Đã thanh toán đơn ${activeOrder.code}. Bàn số ${selectedTable.tableNumber} còn ${remainingOrders.length} đơn chưa thanh toán.`
          : `✅ Đã thanh toán đơn ${activeOrder.code}. Bàn số ${selectedTable.tableNumber} đã được giải phóng.`
      );
      if (!nextOrder) {
        setTimeout(() => {
          setIsDetailModalOpen(false);
          setSelectedTable(null);
        }, 1500);
      }
    } else {
      alert(result.error || 'Thanh toán thất bại');
    }
  };

  const handleCleanTable = async (tableId: number) => {
    setIsProcessingClean(true);
    const result = await updateTableStatus(tableId, 'AVAILABLE');
    setIsProcessingClean(false);
    if (result.success) {
      if (selectedTable?.id === tableId) {
        setSelectedTable((prev) => (prev ? { ...prev, status: 'AVAILABLE' } : null));
        setPaySuccessMsg('✅ Bàn đã được dọn sạch và sẵn sàng đón khách mới.');
      }
    } else {
      alert(result.error || 'Không thể cập nhật trạng thái bàn');
    }
  };

  const handleMarkTableDirty = async (tableId: number) => {
    setIsProcessingClean(true);
    const result = await updateTableStatus(tableId, 'DIRTY');
    setIsProcessingClean(false);
    if (result.success) {
      if (selectedTable?.id === tableId) {
        setSelectedTable((prev) => (prev ? { ...prev, status: 'DIRTY' } : null));
        setPaySuccessMsg('🟡 Bàn đã được đánh dấu chờ dọn dẹp.');
      }
    } else {
      alert(result.error || 'Không thể cập nhật trạng thái bàn');
    }
  };

  const handleOpenVoidModal = () => {
    setVoidReason('');
    setVoidError(null);
    setIsVoidModalOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!activeOrder) return;
    if (voidReason.trim().length < 3) {
      setVoidError('Lý do hủy đơn phải có ít nhất 3 ký tự');
      return;
    }

    setIsProcessingVoid(true);
    setVoidError(null);
    const result = await voidOrder(activeOrder.id, voidReason.trim());
    setIsProcessingVoid(false);

    if (result.success) {
      setIsVoidModalOpen(false);
      const remainingOrders = selectedTable?.orders?.filter((order) => order.id !== activeOrder.id) || [];
      const nextOrder = remainingOrders[0];
      setSelectedTable((prev) =>
        prev
          ? {
              ...prev,
              orders: remainingOrders,
              status: nextOrder ? 'OCCUPIED' : 'AVAILABLE',
              currentOrderId: nextOrder?.id ?? null
            }
          : null
      );
      setSelectedOrderId(nextOrder?.id ?? null);
      setPaySuccessMsg(
        nextOrder
          ? `⚠️ Đã hủy đơn ${activeOrder.code}. Bàn số ${selectedTable?.tableNumber} còn ${remainingOrders.length} đơn chưa thanh toán.`
          : `⚠️ Đã hủy đơn ${activeOrder.code}. Bàn số ${selectedTable?.tableNumber} đã được giải phóng.`
      );
      if (!nextOrder) {
        setTimeout(() => {
          setIsDetailModalOpen(false);
          setSelectedTable(null);
        }, 1800);
      }
    } else {
      setVoidError(result.error || 'Hủy đơn hàng thất bại');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return {
          bg: isDark ? '#064E3B' : '#DCFCE7',
          border: '#22C55E',
          text: isDark ? '#86EFAC' : '#15803D',
          label: '🟢 Trống'
        };
      case 'OCCUPIED':
        return {
          bg: isDark ? '#7F1D1D' : '#FEE2E2',
          border: '#EF4444',
          text: isDark ? '#FCA5A5' : '#B91C1C',
          label: '🔴 Đang có khách'
        };
      case 'DIRTY':
      case 'NEED_CLEANING':
      default:
        return {
          bg: isDark ? '#78350F' : '#FEF3C7',
          border: '#F59E0B',
          text: isDark ? '#FDE68A' : '#B45309',
          label: '🟡 Chờ dọn bàn'
        };
    }
  };

  const activeOrder =
    selectedTable?.orders?.find((order) => order.id === selectedOrderId) ||
    selectedTable?.orders?.[0];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Sơ Đồ 12 Bàn Ăn (Floor Map)</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>
            Chạm vào bàn để xem chi tiết hóa đơn, dọn dẹp hoặc thanh toán
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: theme.primary }]}
          onPress={fetchTables}
        >
          <Text style={styles.refreshText}>🔄 Làm mới</Text>
        </TouchableOpacity>
      </View>

      {/* Legend Bar */}
      <View style={[styles.legendBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={[styles.legendText, { color: theme.text }]}>
            Bàn trống ({tables.filter((t) => t.status === 'AVAILABLE').length})
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={[styles.legendText, { color: theme.text }]}>
            Đang ăn ({tables.filter((t) => t.status === 'OCCUPIED').length})
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={[styles.legendText, { color: theme.text }]}>
            Chờ dọn ({tables.filter((t) => t.status === 'DIRTY' || t.status === 'NEED_CLEANING').length})
          </Text>
        </View>
      </View>

      {/* Tables Grid */}
      {isLoadingTables ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Đang tải sơ đồ bàn...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.gridContainer}>
          {tables.map((table) => {
            const statusConfig = getStatusColor(table.status);
            const unpaidOrders = table.orders || [];
            const unpaidTotal = unpaidOrders.reduce((sum, order) => sum + order.finalAmount, 0);
            const isTableDirty = table.status === 'DIRTY' || table.status === 'NEED_CLEANING';

            return (
              <TouchableOpacity
                testID={`table-card-${table.tableNumber}`}
                key={table.id}
                style={[
                  styles.tableCard,
                  { backgroundColor: statusConfig.bg, borderColor: statusConfig.border }
                ]}
                onPress={() => handleTablePress(table)}
                activeOpacity={0.8}
              >
                <View style={styles.tableTop}>
                  <Text style={[styles.tableNumberText, { color: theme.textLight }]}>
                    BÀN {table.tableNumber < 10 ? `0${table.tableNumber}` : table.tableNumber}
                  </Text>
                  <Text style={[styles.tableStatusText, { color: statusConfig.text }]}>
                    {statusConfig.label}
                  </Text>
                </View>

                <View style={styles.tableBody}>
                  <Text style={[styles.tableCapacity, { color: isDark ? '#E2E8F0' : '#475569' }]}>
                    👥 Sức chứa: {table.capacity} khách
                  </Text>

                  {unpaidOrders.length > 0 ? (
                    <View
                      style={[
                        styles.tableOrderBadge,
                        { backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.7)' }
                      ]}
                    >
                      <Text style={[styles.orderCodeText, { color: theme.primary }]}>
                        {unpaidOrders.length} đơn chưa thanh toán
                      </Text>
                      <Text style={[styles.orderTotalText, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>
                        {formatVND(unpaidTotal)}
                      </Text>
                    </View>
                  ) : isTableDirty ? (
                    <View style={styles.dirtyCardBody}>
                      <Text style={[styles.dirtyNoticeText, { color: isDark ? '#FDE68A' : '#B45309' }]}>
                        🧹 Chờ nhân viên dọn bàn
                      </Text>
                      <TouchableOpacity
                        style={[styles.quickCleanBtn, { backgroundColor: isDark ? '#D97706' : '#F59E0B' }]}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleCleanTable(table.id);
                        }}
                      >
                        <Text style={styles.quickCleanText}>Dọn xong</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={[styles.noOrderText, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                      Sẵn sàng đón khách
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Table Detail & Checkout Modal */}
      <Modal visible={isDetailModalOpen} transparent animationType="slide">
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <SafeAreaView testID="table-detail-modal" style={[styles.modalContainer, { backgroundColor: theme.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text testID="table-detail-title" style={[styles.modalTitle, { color: theme.text }]}>
                🍽️ Chi Tiết Bàn {selectedTable?.tableNumber} -{' '}
                {selectedTable ? getStatusColor(selectedTable.status).label : ''}
              </Text>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
                onPress={() => setIsDetailModalOpen(false)}
              >
                <Text style={[styles.closeBtnText, { color: theme.text }]}>✕</Text>
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
                  {(selectedTable?.orders?.length || 0) > 1 && (
                    <View style={styles.orderSelector}>
                      <Text style={[styles.sectionTitle, { color: theme.text }]}>
                        Chọn đơn cần thanh toán:
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {selectedTable?.orders?.map((order) => (
                          <TouchableOpacity
                            key={order.id}
                            style={[
                              styles.orderSelectorBtn,
                              { borderColor: theme.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' },
                              activeOrder.id === order.id && [
                                styles.orderSelectorBtnActive,
                                { borderColor: theme.primary, backgroundColor: isDark ? '#451A03' : '#FEF2F2' }
                              ]
                            ]}
                            onPress={() => {
                              setSelectedOrderId(order.id);
                              setPaySuccessMsg(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.orderSelectorText,
                                { color: theme.textMuted },
                                activeOrder.id === order.id && {
                                  color: theme.primary,
                                  fontWeight: typography.weights.bold
                                }
                              ]}
                            >
                              {order.code} · {formatVND(order.finalAmount)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  <View
                    style={[
                      styles.billHeader,
                      { backgroundColor: isDark ? '#0F172A' : '#FEF3C7', borderColor: theme.border }
                    ]}
                  >
                    <Text style={[styles.billCode, { color: theme.text }]}>Mã đơn: {activeOrder.code}</Text>
                    <Text style={[styles.billStatus, { color: theme.primary }]}>
                      Trạng thái: {activeOrder.status}
                    </Text>
                  </View>

                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Danh sách món ăn:</Text>
                  <View style={styles.itemsList}>
                    {activeOrder.items?.map((it: any, idx: number) => (
                      <View key={idx} style={[styles.itemRow, { borderBottomColor: theme.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.itemName, { color: theme.text }]}>
                            {it.quantity}x Món #{it.menuItemId}
                          </Text>
                          {it.notes && (
                            <Text style={[styles.itemNotes, { color: theme.textMuted }]}>
                              Ghi chú: {it.notes}
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.itemSubtotal, { color: theme.primary }]}>
                          {formatVND(it.subtotal)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Summary */}
                  <View
                    style={[
                      styles.summaryCard,
                      { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: theme.border }
                    ]}
                  >
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Tạm tính:</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>
                        {formatVND(activeOrder.totalAmount)}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Thuế VAT (8%):</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>
                        {formatVND(activeOrder.vatAmount)}
                      </Text>
                    </View>
                    <View style={[styles.summaryRow, styles.summaryTotalRow, { borderTopColor: theme.border }]}>
                      <Text style={[styles.summaryTotalLabel, { color: theme.text }]}>TỔNG THANH TOÁN:</Text>
                      <Text style={[styles.summaryTotalValue, { color: theme.primary }]}>
                        {formatVND(activeOrder.finalAmount)}
                      </Text>
                    </View>
                  </View>

                  {/* Payment Method Selector */}
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Phương thức thanh toán:</Text>
                  <View style={styles.paymentMethods}>
                    <TouchableOpacity
                      style={[
                        styles.payMethodBtn,
                        { backgroundColor: isDark ? '#334155' : '#F8FAFC', borderColor: theme.border },
                        paymentMethod === 'CASH' && {
                          borderColor: theme.primary,
                          backgroundColor: isDark ? '#7F1D1D' : '#FEF2F2'
                        }
                      ]}
                      onPress={() => setPaymentMethod('CASH')}
                    >
                      <Text
                        style={[
                          styles.payMethodText,
                          { color: paymentMethod === 'CASH' ? theme.primary : theme.textMuted },
                          paymentMethod === 'CASH' && styles.payMethodTextActive
                        ]}
                      >
                        💵 Tiền Mặt
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.payMethodBtn,
                        { backgroundColor: isDark ? '#334155' : '#F8FAFC', borderColor: theme.border },
                        paymentMethod === 'BANK_TRANSFER' && {
                          borderColor: theme.primary,
                          backgroundColor: isDark ? '#7F1D1D' : '#FEF2F2'
                        }
                      ]}
                      onPress={() => setPaymentMethod('BANK_TRANSFER')}
                    >
                      <Text
                        style={[
                          styles.payMethodText,
                          { color: paymentMethod === 'BANK_TRANSFER' ? theme.primary : theme.textMuted },
                          paymentMethod === 'BANK_TRANSFER' && styles.payMethodTextActive
                        ]}
                      >
                        📱 VietQR Động
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.payMethodBtn,
                        { backgroundColor: isDark ? '#334155' : '#F8FAFC', borderColor: theme.border },
                        paymentMethod === 'CREDIT_CARD' && {
                          borderColor: theme.primary,
                          backgroundColor: isDark ? '#7F1D1D' : '#FEF2F2'
                        }
                      ]}
                      onPress={() => setPaymentMethod('CREDIT_CARD')}
                    >
                      <Text
                        style={[
                          styles.payMethodText,
                          { color: paymentMethod === 'CREDIT_CARD' ? theme.primary : theme.textMuted },
                          paymentMethod === 'CREDIT_CARD' && styles.payMethodTextActive
                        ]}
                      >
                        💳 Thẻ POS
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Pay Action Button */}
                  <TouchableOpacity
                    testID="btn-confirm-pay"
                    style={[
                      styles.payConfirmBtn,
                      { backgroundColor: theme.primary },
                      isProcessingPay && styles.btnDisabled
                    ]}
                    onPress={handlePay}
                    disabled={isProcessingPay || isProcessingVoid}
                  >
                    {isProcessingPay ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.payConfirmText}>
                        XÁC NHẬN THU TIỀN & TRẢ BÀN ({formatVND(activeOrder.finalAmount)})
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* Admin Audited Void Action */}
                  {user?.role === 'ADMIN' && (
                    <TouchableOpacity
                      testID="btn-open-void-modal"
                      style={[styles.adminVoidBtn, { borderColor: '#EF4444' }]}
                      onPress={handleOpenVoidModal}
                      disabled={isProcessingPay || isProcessingVoid}
                    >
                      <Text style={styles.adminVoidText}>🗑️ HỦY ĐƠN KIỂM TOÁN (ADMIN VOID)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : selectedTable?.status === 'DIRTY' || selectedTable?.status === 'NEED_CLEANING' ? (
                <View style={styles.emptyTableBox}>
                  <Text style={styles.emptyTableEmoji}>🧹</Text>
                  <Text style={[styles.emptyTableTitle, { color: theme.text }]}>Bàn đang chờ dọn dẹp</Text>
                  <Text style={[styles.emptyTableDesc, { color: theme.textMuted }]}>
                    Bàn ăn vừa dùng xong và chưa được lau dọn. Sau khi dọn sạch bàn ghế, vui lòng xác nhận bên dưới.
                  </Text>
                  <TouchableOpacity
                    testID="btn-confirm-clean-table"
                    style={[styles.cleanConfirmBtn, { backgroundColor: '#F59E0B' }]}
                    onPress={() => handleCleanTable(selectedTable.id)}
                    disabled={isProcessingClean}
                  >
                    {isProcessingClean ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.cleanConfirmText}>✨ ĐÃ DỌN BÀN XONG (CHUYỂN SANG TRỐNG)</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyTableBox}>
                  <Text style={styles.emptyTableEmoji}>🍽️</Text>
                  <Text style={[styles.emptyTableTitle, { color: theme.text }]}>Bàn hiện đang trống</Text>
                  <Text style={[styles.emptyTableDesc, { color: theme.textMuted }]}>
                    Khách có thể quét mã QR tại bàn để tự gọi món hoặc thu ngân tạo đơn mới từ tab POS.
                  </Text>
                  {selectedTable && (
                    <TouchableOpacity
                      style={[
                        styles.markDirtyBtn,
                        { borderColor: theme.border, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }
                      ]}
                      onPress={() => handleMarkTableDirty(selectedTable.id)}
                      disabled={isProcessingClean}
                    >
                      <Text style={[styles.markDirtyText, { color: theme.textMuted }]}>
                        🟡 Đánh dấu cần dọn bàn
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Admin Audited Void Confirmation Modal */}
      <Modal visible={isVoidModalOpen} transparent animationType="fade">
        <View style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}>
          <View
            style={[
              styles.voidModalContainer,
              { backgroundColor: theme.card, borderColor: theme.border }
            ]}
          >
            <View style={styles.voidModalHeader}>
              <Text style={styles.voidModalTitle}>⚠️ Xác Nhận Hủy Đơn Kiểm Toán</Text>
              <Text style={[styles.voidModalSubtitle, { color: theme.textMuted }]}>
                Chức năng dành riêng cho Quản trị viên (Admin). Thao tác này sẽ ghi nhận vào nhật ký kiểm toán và giải phóng bàn ăn nếu không còn đơn khác.
              </Text>
            </View>

            <View
              style={[
                styles.voidOrderSummary,
                { backgroundColor: isDark ? '#0F172A' : '#FEF2F2', borderColor: '#FCA5A5' }
              ]}
            >
              <Text style={[styles.voidOrderCode, { color: theme.text }]}>
                Mã đơn: <Text style={{ fontWeight: typography.weights.bold }}>{activeOrder?.code}</Text>
              </Text>
              <Text style={styles.voidOrderAmount}>
                {activeOrder ? formatVND(activeOrder.finalAmount) : ''}
              </Text>
            </View>

            <Text style={[styles.voidLabel, { color: theme.text }]}>
              Lý do hủy đơn (Bắt buộc, tối thiểu 3 ký tự):
            </Text>
            <TextInput
              testID="input-void-reason"
              style={[
                styles.voidInput,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                  borderColor: voidError ? '#EF4444' : theme.border,
                  color: theme.text
                }
              ]}
              placeholder="Nhập lý do hủy (ví dụ: Khách đổi ý ra về, nhập sai món...)"
              placeholderTextColor={theme.textMuted}
              value={voidReason}
              onChangeText={(text) => {
                setVoidReason(text);
                if (voidError) setVoidError(null);
              }}
              multiline
              numberOfLines={3}
            />

            {voidError && <Text style={styles.voidErrorText}>❌ {voidError}</Text>}

            <View style={styles.voidActionsRow}>
              <TouchableOpacity
                style={[styles.voidCancelBtn, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}
                onPress={() => setIsVoidModalOpen(false)}
                disabled={isProcessingVoid}
              >
                <Text style={[styles.voidCancelText, { color: theme.text }]}>Đóng</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="btn-confirm-void"
                style={[
                  styles.voidConfirmBtn,
                  { backgroundColor: '#EF4444' },
                  (isProcessingVoid || voidReason.trim().length < 3) && styles.btnDisabled
                ]}
                onPress={handleConfirmVoid}
                disabled={isProcessingVoid || voidReason.trim().length < 3}
              >
                {isProcessingVoid ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.voidConfirmText}>Xác Nhận Hủy Đơn</Text>
                )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1
  },
  title: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 2
  },
  refreshBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8
  },
  refreshText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  legendBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1
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
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
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
  gridContainer: {
    padding: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  tableCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: spacing.md,
    minHeight: 140,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2
  },
  tableTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs
  },
  tableNumberText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold
  },
  tableStatusText: {
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  tableBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 4
  },
  tableCapacity: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium
  },
  tableOrderBadge: {
    padding: spacing.xs,
    borderRadius: 6,
    marginTop: 4
  },
  orderCodeText: {
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  orderTotalText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.extraBold,
    marginTop: 2
  },
  dirtyCardBody: {
    marginTop: 4,
    gap: 6
  },
  dirtyNoticeText: {
    fontSize: 11,
    fontWeight: typography.weights.bold
  },
  quickCleanBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6
  },
  quickCleanText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: typography.weights.bold
  },
  noOrderText: {
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
    marginTop: 4
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md
  },
  modalContainer: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    borderRadius: 16,
    overflow: 'hidden'
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1
  },
  modalTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: typography.weights.bold
  },
  modalBody: {
    padding: spacing.md
  },
  successBox: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.md
  },
  successText: {
    color: '#15803D',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  orderSelector: {
    marginBottom: spacing.md
  },
  orderSelectorBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: spacing.sm
  },
  orderSelectorBtnActive: {
    borderWidth: 1.5
  },
  orderSelectorText: {
    fontSize: typography.sizes.xs
  },
  billHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: spacing.md
  },
  billCode: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  billStatus: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  sectionTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.xs
  },
  itemsList: {
    marginBottom: spacing.md
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1
  },
  itemName: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  itemNotes: {
    fontSize: 10,
    fontStyle: 'italic'
  },
  itemSubtotal: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  },
  summaryCard: {
    padding: spacing.md,
    borderRadius: 8,
    marginVertical: spacing.md,
    borderWidth: 1
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  summaryLabel: {
    fontSize: typography.sizes.xs
  },
  summaryValue: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    paddingTop: spacing.xs,
    marginTop: spacing.xs
  },
  summaryTotalLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold
  },
  summaryTotalValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.extraBold
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
    alignItems: 'center'
  },
  payMethodText: {
    fontSize: 11,
    fontWeight: typography.weights.medium
  },
  payMethodTextActive: {
    fontWeight: typography.weights.bold
  },
  payConfirmBtn: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing.touchTargetPOS,
    marginBottom: spacing.md
  },
  adminVoidBtn: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing.touchTargetPOS,
    borderWidth: 1.5,
    marginBottom: spacing.xl
  },
  adminVoidText: {
    color: '#EF4444',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5
  },
  cleanConfirmBtn: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: spacing.touchTargetPOS,
    width: '100%',
    marginTop: spacing.md
  },
  cleanConfirmText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.5
  },
  markDirtyBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: spacing.md
  },
  markDirtyText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
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
    fontWeight: typography.weights.bold
  },
  emptyTableDesc: {
    fontSize: typography.sizes.xs,
    textAlign: 'center',
    marginTop: spacing.xs
  },
  // Void Modal Styles
  voidModalContainer: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5
  },
  voidModalHeader: {
    marginBottom: spacing.md
  },
  voidModalTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.extraBold,
    color: '#EF4444'
  },
  voidModalSubtitle: {
    fontSize: typography.sizes.xs,
    marginTop: 4,
    lineHeight: 18
  },
  voidOrderSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: spacing.md
  },
  voidOrderCode: {
    fontSize: typography.sizes.xs
  },
  voidOrderAmount: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.extraBold,
    color: '#EF4444'
  },
  voidLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    marginBottom: 6
  },
  voidInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    fontSize: typography.sizes.xs,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: spacing.xs
  },
  voidErrorText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: typography.weights.semibold,
    marginBottom: spacing.sm
  },
  voidActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  voidCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44
  },
  voidCancelText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold
  },
  voidConfirmBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44
  },
  voidConfirmText: {
    color: '#FFFFFF',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold
  }
});
