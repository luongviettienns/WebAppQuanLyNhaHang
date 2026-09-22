import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useRestaurant } from '../../contexts/RestaurantContext';
import { Button, InlineAlert } from '../../ui';
import type { SupplierDto } from '../../api/contracts';
import { fetchSupplierDetailApi, fetchSupplierReceiptsApi, SupplierReceiptHistory } from '../../api/suppliers';
import { SupplierModalShell } from './SupplierModalShell';
import { supplierMoney } from './supplierViewModel';

export function SupplierDetailModal({ id, onClose, onEdit, onOpenReceipt }: { id: number; onClose: () => void; onEdit: (supplier: SupplierDto) => void; onOpenReceipt: (id: number) => void }) {
  const { token } = useAuth(); const { theme } = useTheme(); const { inventoryRevision } = useRestaurant();
  const [data, setData] = useState<SupplierDto | null>(null); const [history, setHistory] = useState<SupplierReceiptHistory | null>(null);
  const [page, setPage] = useState(1); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    Promise.all([fetchSupplierDetailApi(token, id), fetchSupplierReceiptsApi(token, id, page)]).then(([supplier, receipts]) => {
      if (active) { setData(supplier); setHistory(receipts); }
    }).catch((failure: Error) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token, page, inventoryRevision, retry]);
  return <SupplierModalShell visible title={data ? data.code + ' · ' + data.name : 'Chi tiết nhà cung cấp'} onClose={onClose}
    footer={<><Button variant="quiet" label="Đóng" onPress={onClose} /><Button variant="primary" label="Sửa thông tin" disabled={!data || loading} onPress={() => { if (data) onEdit(data); }} /></>}>
    {loading && <ActivityIndicator color={theme.primary} />}
    {!!error && <><InlineAlert message={error} /><Button variant="secondary" label="Thử lại" onPress={() => setRetry(value => value + 1)} /></>}
    {data && <>
      <Text style={{ color: theme.textSecondary }}>{data.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'} · {data.group?.name || 'Chưa phân nhóm'}</Text>
      <Text style={{ color: theme.textPrimary }}>Điện thoại: {data.phone || '—'}   Email: {data.email || '—'}</Text>
      <Text style={{ color: theme.textPrimary }}>Địa chỉ: {[data.address, data.ward, data.district, data.province].filter(Boolean).join(', ') || '—'}</Text>
      <Text style={{ color: theme.textPrimary }}>Công ty: {data.companyName || '—'}   Mã số thuế: {data.taxCode || '—'}</Text>
      <Text style={{ color: theme.textSecondary }}>{data.note || 'Chưa có ghi chú'}</Text>
      <Text style={{ color: theme.primary, fontWeight: '600' }}>Tổng mua: {supplierMoney(data.totalPurchase)} đ   ·   Còn phải trả: {supplierMoney(data.outstandingAmount)} đ</Text>
      <Text style={{ color: theme.textSecondary }}>Còn phải trả được tổng hợp từ phiếu nhập đã hoàn thành, chưa bao gồm thanh toán hoặc trả hàng ngoài phiếu.</Text>
      <Text style={{ color: theme.textPrimary, fontWeight: '600', fontSize: 16 }}>Lịch sử nhập hàng</Text>
      {!history?.items.length && !loading && <Text style={{ color: theme.textSecondary }}>Chưa có phiếu nhập hàng.</Text>}
      {history?.items.map(receipt => <Pressable key={receipt.id} accessibilityRole="button" onPress={() => onOpenReceipt(receipt.id)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.borderSubtle }}>
        <Text style={{ color: theme.primary, minWidth: 120 }}>{receipt.receiptCode}</Text>
        <Text style={{ color: theme.textSecondary, flex: 1 }}>{new Date(receipt.receivedAt).toLocaleDateString('vi-VN')} · {receipt.status === 'POSTED' ? 'Hoàn thành' : receipt.status === 'DRAFT' ? 'Phiếu tạm' : 'Đã hủy'}</Text>
        <Text style={{ color: theme.textPrimary }}>{supplierMoney(receipt.payableAmount)} đ</Text>
      </Pressable>)}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}><Button variant="quiet" label="Trước" disabled={page <= 1 || loading} onPress={() => setPage(value => value - 1)} /><Text style={{ color: theme.textSecondary, alignSelf: 'center' }}>{page}/{history?.pagination.totalPages || 1}</Text><Button variant="quiet" label="Sau" disabled={loading || !history || page >= history.pagination.totalPages} onPress={() => setPage(value => value + 1)} /></View>
    </>}
  </SupplierModalShell>;
}
