import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, RefreshCw, Search, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { DiningTableDto } from '../../api/contracts';
import {
  authorizeReservationOrderPayLaterApi, cancelReservationByRestaurantApi, checkInReservationApi, confirmOrderPaymentApi,
  confirmReservationDepositApi, fetchOrderPaymentConfirmationsApi, fetchReservationDetailApi,
  fetchReservationsApi, markReservationNoShowApi, refundReservationDepositApi,
  rejectOrderPaymentApi, rejectReservationDepositApi, rescheduleReservationApi,
  type DepositStatus, type PaymentConfirmationDto, type ReservationDto, type ReservationFilter,
  type ReservationStatus
} from '../../api/reservations';
import { CashbookAccountChoice } from '../cashbook/CashbookAccountChoice';
import { radii, spacing, typography } from '../../theme';
import { AppIcon, Button, EmptyState, Field, InlineAlert, ScreenHeader, StatusBadge } from '../../ui';

type QueueTab = 'reservations' | 'deposits' | 'orders';
type SelectedItem = { kind: 'reservation'; value: ReservationDto } | { kind: 'order'; value: PaymentConfirmationDto };
type Action = 'confirm-deposit' | 'reject-deposit' | 'refund' | 'reschedule' | 'no-show' | 'check-in' | 'cancel' | 'confirm-order' | 'reject-order' | 'authorize-pay-later';
const vnd = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const reservationLabels: Record<ReservationStatus, string> = { PENDING_DEPOSIT: 'Chờ cọc', CONFIRMED: 'Đã xác nhận', CHECKED_IN: 'Đã check-in', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến' };
const depositLabels: Record<DepositStatus, string> = { UNPAID: 'Chưa thanh toán', WAITING_CONFIRMATION: 'Chờ xác nhận cọc', PAID: 'Đã nhận cọc', REFUND_PENDING: 'Chờ hoàn', REFUNDED: 'Đã hoàn', FORFEITED: 'Đã khấu trừ', APPLIED_TO_BILL: 'Đã trừ hóa đơn' };

export const ReservationManagementScreen: React.FC = () => {
  const { token } = useAuth(); const { theme } = useTheme();
  const { reservationsRevision, orderPaymentsRevision, tables, tablesRevision, fetchTables } = useRestaurant();
  const [tab, setTab] = useState<QueueTab>('reservations');
  const [filter, setFilter] = useState<ReservationFilter>({ page: 1, pageSize: 50 });
  const [search, setSearch] = useState('');
  const [reservations, setReservations] = useState<ReservationDto[]>([]);
  const [orderPayments, setOrderPayments] = useState<PaymentConfirmationDto[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalRows: 0 });
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [selected, setSelected] = useState<SelectedItem | null>(null); const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [action, setAction] = useState<Action | null>(null); const [reason, setReason] = useState(''); const [receipt, setReceipt] = useState('');
  const [financialAccountId, setFinancialAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState(''); const [scheduledAt, setScheduledAt] = useState(''); const [tableId, setTableId] = useState<number | null>(null);
  const [availableTables, setAvailableTables] = useState<DiningTableDto[]>([]); const [busy, setBusy] = useState(false); const [actionError, setActionError] = useState(''); const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (tab === 'orders') {
        const items = await fetchOrderPaymentConfirmationsApi(token);
        setOrderPayments(items); setPagination({ page: 1, totalPages: 1, totalRows: items.length });
      } else {
        const query: ReservationFilter = { ...filter, search: search.trim() || undefined };
        if (tab === 'deposits') { query.status = 'PENDING_DEPOSIT'; query.depositStatus = 'WAITING_CONFIRMATION'; }
        const result = await fetchReservationsApi(token, query);
        setReservations(result.items); setPagination({ page: result.pagination.page, totalPages: result.pagination.totalPages, totalRows: result.pagination.totalRows });
      }
    } catch (failure: any) { setError(failure.message || 'Không thể tải danh sách đặt bàn'); }
    finally { setLoading(false); }
  }, [filter, search, tab, token]);
  useEffect(() => { void load(); }, [load, reservationsRevision, orderPaymentsRevision, revision]);
  useEffect(() => { void fetchTables(); }, [fetchTables, tablesRevision]);
  useEffect(() => {
    if (action !== 'check-in' || !selected || selected.kind !== 'reservation') return;
    setAvailableTables(tables.filter(table => table.isActive !== false && table.status === 'AVAILABLE' && table.capacity >= selected.value.partySize));
  }, [action, selected, tables]);

  const openReservation = async (reservation: ReservationDto) => {
    setSelected({ kind: 'reservation', value: reservation }); setDetail(null); setAction(null); setActionError('');
    try { setDetail(await fetchReservationDetailApi(token, reservation.id)); }
    catch (failure: any) { setError(failure.message || 'Không thể tải chi tiết đặt bàn'); }
  };
  const startAction = (next: Action, initialAmount?: number) => {
    setAction(next); setReason(''); setReceipt(''); setFinancialAccountId(null); setAmount(initialAmount === undefined ? '' : String(initialAmount)); setScheduledAt(''); setTableId(null); setActionError('');
  };
  const runAction = async () => {
    if (!selected || !action || busy) return;
    setBusy(true); setActionError('');
    try {
      if (selected.kind === 'reservation') {
        const reservation = selected.value;
        if (action === 'confirm-deposit') await confirmReservationDepositApi(token, reservation.id, Number(amount), receipt.trim(), financialAccountId);
        else if (action === 'reject-deposit') await rejectReservationDepositApi(token, reservation.id, reason.trim());
        else if (action === 'refund') await refundReservationDepositApi(token, reservation.id, Number(amount), receipt.trim(), reason.trim(), financialAccountId);
        else if (action === 'reschedule') await rescheduleReservationApi(token, reservation.id, new Date(scheduledAt).toISOString(), reason.trim());
        else if (action === 'no-show') await markReservationNoShowApi(token, reservation.id, reason.trim());
        else if (action === 'check-in') { if (!tableId) throw new Error('Chọn bàn để check-in'); await checkInReservationApi(token, reservation.id, tableId); }
        else if (action === 'cancel') await cancelReservationByRestaurantApi(token, reservation.id, reason.trim());
      } else {
        const order = selected.value;
        if (action === 'confirm-order') await confirmOrderPaymentApi(token, order.id, Number(amount), receipt.trim(), financialAccountId);
        else if (action === 'reject-order') await rejectOrderPaymentApi(token, order.id, reason.trim());
        else if (action === 'authorize-pay-later') await authorizeReservationOrderPayLaterApi(token, order.id, reason.trim());
      }
      setAction(null); setSelected(null); setDetail(null); setRevision(value => value + 1);
    } catch (failure: any) { setActionError(failure.message || 'Không thể hoàn tất thao tác'); }
    finally { setBusy(false); }
  };

  const openOrder = (order: PaymentConfirmationDto) => { setSelected({ kind: 'order', value: order }); setDetail(null); setAction(null); setFinancialAccountId(null); setAmount(String(order.paymentDeclaration?.amount || 0)); setActionError(''); };
  const currentReservation = selected?.kind === 'reservation' ? selected.value : null;
  const tabs: Array<[QueueTab, string]> = [['reservations', 'Đặt bàn'], ['deposits', 'Xác nhận cọc'], ['orders', 'Order chờ thanh toán']];
  const canCheckin = currentReservation?.status === 'CONFIRMED' && ['PAID', 'APPLIED_TO_BILL'].includes(currentReservation.depositStatus);

  const actionTitle: Record<Action, string> = {
    'confirm-deposit': 'Xác nhận đã nhận cọc', 'reject-deposit': 'Từ chối xác nhận cọc', refund: 'Ghi nhận hoàn cọc',
    reschedule: 'Đổi lịch đặt bàn', 'no-show': 'Xác nhận khách không đến', 'check-in': 'Check-in và gán bàn', cancel: 'Hủy từ phía nhà hàng',
    'confirm-order': 'Xác nhận tiền order', 'reject-order': 'Từ chối tiền order', 'authorize-pay-later': 'Cho phép trả sau'
  };
  const needsReason = ['reject-deposit', 'refund', 'reschedule', 'no-show', 'cancel', 'reject-order', 'authorize-pay-later'].includes(action || '');
  const needsReceipt = ['confirm-deposit', 'refund', 'confirm-order'].includes(action || '');
  const actionValid = !busy && (!needsReason || reason.trim().length >= 3) && (!needsReceipt || (Number(amount) > 0 && receipt.trim().length >= 1)) && (action !== 'reschedule' || (!!scheduledAt && Number.isFinite(new Date(scheduledAt).getTime()))) && (action !== 'check-in' || !!tableId);

  const actionModal = <Modal transparent visible={!!action} animationType="fade" onRequestClose={() => !busy && setAction(null)}>
    <View style={styles.overlay}><ScrollView style={[styles.actionModal, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]} contentContainerStyle={styles.modalContent}>
      <View style={styles.modalHeading}><Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{action ? actionTitle[action] : ''}</Text><Pressable accessibilityLabel="Đóng" disabled={busy} onPress={() => setAction(null)}><AppIcon icon={X} color={theme.textSecondary} /></Pressable></View>
      {!!actionError && <InlineAlert message={actionError} />}
      {needsReceipt && <><Field label="Số tiền (đ)" value={amount} keyboardType="numeric" onChangeText={setAmount} editable={!busy} /><Field label="Mã tham chiếu giao dịch" value={receipt} onChangeText={setReceipt} editable={!busy} placeholder="Mã ngân hàng / nội dung đối chiếu" /></>}
      {needsReceipt && <CashbookAccountChoice token={token} paymentMethod="BANK_TRANSFER" value={financialAccountId} onChange={setFinancialAccountId} />}
      {needsReason && <Field label="Lý do / ghi chú *" value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={500} />}
      {action === 'reschedule' && <Field label="Lịch mới (ISO 8601)" value={scheduledAt} onChangeText={setScheduledAt} editable={!busy} placeholder="2026-09-30T18:30:00+07:00" />}
      {action === 'check-in' && <View style={styles.tableChoices}><Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Bàn phù hợp</Text>{availableTables.length ? availableTables.map(table => <Pressable key={table.id} accessibilityRole="radio" accessibilityState={{ checked: tableId === table.id }} onPress={() => setTableId(table.id)} style={[styles.tableChoice, { borderColor: tableId === table.id ? theme.primary : theme.borderSubtle, backgroundColor: tableId === table.id ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={{ color: theme.textPrimary }}>{table.displayName || `Bàn ${table.tableNumber}`} · {table.capacity} chỗ · {table.area?.name || 'Khu chung'}</Text></Pressable>) : <Text style={{ color: theme.textSecondary }}>Không có bàn trống đủ chỗ cho số khách này.</Text>}</View>}
      <View style={styles.modalActions}><Button variant="quiet" label="Quay lại" disabled={busy} onPress={() => setAction(null)} /><Button variant={action?.includes('reject') || action === 'cancel' ? 'danger' : 'primary'} label={action ? actionTitle[action] : 'Xác nhận'} loading={busy} disabled={!actionValid} onPress={() => void runAction()} /></View>
    </ScrollView></View>
  </Modal>;

  const detailModal = <Modal transparent visible={!!selected && !action} animationType="fade" onRequestClose={() => { setSelected(null); setDetail(null); }}>
    <View style={styles.overlay}><ScrollView style={[styles.detailModal, { backgroundColor: theme.surfaceRaised, borderColor: theme.borderSubtle }]} contentContainerStyle={styles.modalContent}>
      <View style={styles.modalHeading}><Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{selected?.kind === 'order' ? selected.value.code : selected?.value.code || 'Chi tiết đặt bàn'}</Text><Pressable accessibilityLabel="Đóng" onPress={() => { setSelected(null); setDetail(null); }}><AppIcon icon={X} color={theme.textSecondary} /></Pressable></View>
      {!selected ? null : selected.kind === 'order' ? <>
        <View style={[styles.factPanel, { backgroundColor: theme.surfaceSunken }]}><Fact label="Khách" value={selected.value.customer?.name || selected.value.reservation?.contactName || 'Khách đặt bàn'} /><Fact label="Điện thoại" value={selected.value.customer?.phone || selected.value.reservation?.contactPhone || '—'} /><Fact label="Bàn" value={selected.value.tableNumber ? `Bàn ${selected.value.tableNumber}` : 'Chưa gán'} /><Fact label="Cần xác nhận" value={vnd(selected.value.paymentDeclaration?.amount || 0)} /><Fact label="Mã order" value={selected.value.code} /></View>
        <View style={styles.modalActions}><Button variant="danger" label="Từ chối" onPress={() => startAction('reject-order')} />{selected.value.paymentStatus === 'WAITING_CONFIRMATION' && selected.value.paymentDeclaration && <Button variant="primary" icon={Check} label="Xác nhận tiền" onPress={() => startAction('confirm-order', selected.value.paymentDeclaration!.amount)} />}<Button variant="secondary" label="Cho phép trả sau" onPress={() => startAction('authorize-pay-later')} /></View>
      </> : <>
        {detail ? <View style={[styles.factPanel, { backgroundColor: theme.surfaceSunken }]}>
          <Fact label="Khách" value={selected.value.contactName} /><Fact label="Điện thoại" value={selected.value.contactPhone} /><Fact label="Số khách" value={`${selected.value.partySize} người`} /><Fact label="Ngày giờ" value={new Date(selected.value.scheduledAt).toLocaleString('vi-VN')} /><Fact label="Trạng thái" value={reservationLabels[selected.value.status]} /><Fact label="Tiền cọc" value={`${vnd(selected.value.depositAmount)} · ${depositLabels[selected.value.depositStatus]}`} /><Fact label="Bàn" value={selected.value.table?.displayName || selected.value.table?.tableNumber ? `Bàn ${selected.value.table?.displayName || selected.value.table?.tableNumber}` : 'Chưa gán'} />
          {Array.isArray(detail.transactions) && <View style={styles.history}><Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>Lịch sử giao dịch cọc</Text>{detail.transactions.map((transaction: any) => <Text key={transaction.id} style={{ color: theme.textSecondary }}>{transaction.type} · {transaction.status} · {vnd(transaction.amount)}{transaction.reason ? ` · ${transaction.reason}` : ''}</Text>)}</View>}
        </View> : <ActivityIndicator color={theme.primary} />}
        {selected.value.depositStatus === 'WAITING_CONFIRMATION' && <View style={styles.modalActions}><Button variant="danger" label="Từ chối cọc" onPress={() => startAction('reject-deposit')} /><Button variant="primary" label="Xác nhận cọc" onPress={() => startAction('confirm-deposit', selected.value.depositAmount)} /></View>}
        {selected.value.depositStatus === 'PAID' && ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'].includes(selected.value.status) && <Button variant="secondary" label="Ghi nhận hoàn cọc" onPress={() => startAction('refund', selected.value.depositAmount)} />}
        {selected.value.status === 'CONFIRMED' && <View style={styles.actionGrid}>{canCheckin && <Button variant="primary" label="Check-in và gán bàn" onPress={() => startAction('check-in')} />}<Button variant="secondary" label="Đổi lịch" onPress={() => startAction('reschedule')} /><Button variant="quiet" label="Không đến" onPress={() => startAction('no-show')} /><Button variant="danger" label="Nhà hàng hủy" onPress={() => startAction('cancel')} /></View>}
        {selected.value.status === 'PENDING_DEPOSIT' && <Button variant="danger" label="Nhà hàng hủy" onPress={() => startAction('cancel')} />}
      </>}
      {!!error && <InlineAlert message={error} />}
    </ScrollView></View>
  </Modal>;

  return <View style={[styles.container, { backgroundColor: theme.surfaceCanvas }]}>
    <ScreenHeader title="Đặt bàn & thanh toán" description="Đối chiếu cọc, check-in khách và xử lý tiền order trước khi gửi bếp." actions={<Button variant="secondary" icon={RefreshCw} label="Tải lại" onPress={() => setRevision(value => value + 1)} />} />
    <View style={[styles.tabs, { borderBottomColor: theme.borderSubtle }]}>{tabs.map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => { setTab(key); setFilter({ page: 1, pageSize: 50 }); }} style={[styles.tab, { borderBottomColor: tab === key ? theme.primary : 'transparent' }]}><Text style={{ color: tab === key ? theme.primary : theme.textSecondary, fontFamily: typography.families.bodySemibold }}>{label}{key === 'orders' && orderPayments.length > 0 ? ` (${orderPayments.length})` : ''}</Text></Pressable>)}</View>
    {tab !== 'orders' && <View style={styles.toolbar}><View style={[styles.searchBox, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}><AppIcon icon={Search} color={theme.textSecondary} size={17} /><TextInput accessibilityLabel="Tìm mã đặt bàn, tên hoặc số điện thoại" value={search} onChangeText={setSearch} placeholder="Mã đặt bàn, tên, số điện thoại" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.textPrimary }]} /></View>{tab === 'reservations' && <ScrollView horizontal contentContainerStyle={styles.statusFilters}>{([undefined, 'PENDING_DEPOSIT', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const).map(value => <Pressable key={value || 'all'} onPress={() => setFilter(current => ({ ...current, status: value, page: 1 }))} style={[styles.filterPill, { borderColor: filter.status === value ? theme.primary : theme.borderSubtle, backgroundColor: filter.status === value ? theme.interactiveSecondary : theme.surfaceBase }]}><Text style={{ color: filter.status === value ? theme.primary : theme.textSecondary }}>{value ? reservationLabels[value] : 'Tất cả'}</Text></Pressable>)}</ScrollView>}</View>}
    {!!error && <InlineAlert title="Không thể tải dữ liệu" message={error} />}
    <ScrollView style={[styles.list, { backgroundColor: theme.surfaceBase, borderColor: theme.borderSubtle }]}>
      {loading ? <ActivityIndicator style={{ padding: 42 }} color={theme.primary} /> : tab === 'orders' ? orderPayments.map(order => <Pressable key={order.id} onPress={() => openOrder(order)} style={[styles.row, { borderBottomColor: theme.borderSubtle }]}><View style={styles.rowMain}><View style={styles.titleRow}><Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{order.code} · {order.reservation?.code || 'Đặt bàn'}</Text><StatusBadge tone={order.paymentStatus === 'WAITING_CONFIRMATION' ? 'warning' : 'info'} label={order.paymentStatus === 'WAITING_CONFIRMATION' ? 'Khách báo đã chuyển' : 'Chưa khai báo tiền'}/></View><Text style={{ color: theme.textSecondary }}>{order.customer?.name || order.reservation?.contactName} · {order.customer?.phone || order.reservation?.contactPhone} · Bàn {order.tableNumber ?? '—'}</Text></View><Text style={[styles.amount, { color: theme.textPrimary }]}>{vnd(order.paymentDeclaration?.amount || order.finalAmount)}</Text></Pressable>) : reservations.map(reservation => <Pressable key={reservation.id} onPress={() => void openReservation(reservation)} style={({ pressed }) => [styles.row, { borderBottomColor: theme.borderSubtle, backgroundColor: pressed ? theme.interactiveQuiet : theme.surfaceBase }]}><View style={styles.rowMain}><View style={styles.titleRow}><Text style={[styles.rowTitle, { color: theme.textPrimary }]}>{reservation.code} · {reservation.contactName}</Text><StatusBadge tone={reservation.status === 'CONFIRMED' ? 'success' : reservation.depositStatus === 'WAITING_CONFIRMATION' ? 'warning' : reservation.status === 'CANCELLED' ? 'danger' : 'neutral'} label={reservationLabels[reservation.status]} /></View><Text style={{ color: theme.textSecondary }}>{reservation.contactPhone} · {reservation.partySize} người · {new Date(reservation.scheduledAt).toLocaleString('vi-VN')}</Text><Text style={{ color: theme.textSecondary }}>{reservation.table?.displayName || 'Chưa gán bàn'} · {depositLabels[reservation.depositStatus]}</Text></View><Text style={[styles.amount, { color: theme.textPrimary }]}>{vnd(reservation.depositAmount)}</Text></Pressable>)}
      {!loading && (tab === 'orders' ? !orderPayments.length : !reservations.length) && <EmptyState title={tab === 'orders' ? 'Không có order chờ xác nhận' : tab === 'deposits' ? 'Không có khoản cọc chờ xử lý' : 'Chưa có đặt bàn phù hợp'} description="Danh sách được cập nhật khi khách khai báo thanh toán hoặc tạo đặt bàn mới." action={<Button variant="quiet" label="Tải lại" onPress={() => setRevision(value => value + 1)} />} />}
    </ScrollView>
    {tab !== 'orders' && <View style={styles.pagination}><Text style={{ color: theme.textSecondary }}>{pagination.totalRows} lượt đặt · Trang {pagination.page}/{pagination.totalPages || 1}</Text><View style={styles.modalActions}><Button variant="quiet" label="Trước" disabled={loading || filter.page === 1} onPress={() => setFilter(current => ({ ...current, page: Math.max(1, (current.page || 1) - 1) }))} /><Button variant="quiet" label="Sau" disabled={loading || (filter.page || 1) >= pagination.totalPages} onPress={() => setFilter(current => ({ ...current, page: (current.page || 1) + 1 }))} /></View></View>}
    {detailModal}{actionModal}
  </View>;
};

const Fact = ({ label, value }: { label: string; value: string }) => { const { theme } = useTheme(); return <View style={styles.fact}><Text style={{ color: theme.textSecondary }}>{label}</Text><Text style={[styles.factValue, { color: theme.textPrimary }]}>{value}</Text></View>; };
const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md, padding: spacing.md }, tabs: { borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md }, tab: { borderBottomWidth: 3, minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm }, toolbar: { flexDirection: 'row', gap: spacing.md, minHeight: 44 }, searchBox: { alignItems: 'center', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 42, paddingHorizontal: spacing.md, width: 320 }, searchInput: { flex: 1, outlineStyle: 'none' as any }, statusFilters: { alignItems: 'center', gap: spacing.xs }, filterPill: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, list: { borderRadius: radii.md, borderWidth: 1, flex: 1 }, row: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 76, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, rowMain: { flex: 1, gap: 4, minWidth: 0 }, titleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, rowTitle: { fontFamily: typography.families.bodySemibold, fontSize: typography.sizes.md }, amount: { fontFamily: typography.families.bodyBold, minWidth: 120, textAlign: 'right' }, pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, modalActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' }, actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, overlay: { alignItems: 'center', backgroundColor: 'rgba(20,20,20,.55)', flex: 1, justifyContent: 'center', padding: spacing.lg }, detailModal: { borderRadius: radii.lg, borderWidth: 1, maxHeight: '90%', maxWidth: 720, width: '100%' }, actionModal: { borderRadius: radii.lg, borderWidth: 1, maxHeight: '90%', maxWidth: 540, width: '100%' }, modalContent: { gap: spacing.md, padding: spacing.lg }, modalHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, modalTitle: { fontFamily: typography.families.operationalBold, fontSize: typography.sizes.xl }, factPanel: { borderRadius: radii.md, gap: spacing.sm, padding: spacing.md }, fact: { borderBottomColor: 'rgba(128,128,128,.2)', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: spacing.xs }, factValue: { flexShrink: 1, fontFamily: typography.families.bodySemibold, textAlign: 'right' }, history: { gap: spacing.xs, marginTop: spacing.sm }, tableChoices: { gap: spacing.xs }, fieldLabel: { fontFamily: typography.families.bodySemibold }, tableChoice: { borderRadius: radii.sm, borderWidth: 1, padding: spacing.sm }
});
