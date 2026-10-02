import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { SupplierDto } from '../../api/contracts';
import { recordSupplierPaymentApi, type SupplierPaymentInput, type SupplierPaymentMethod } from '../../api/suppliers';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { Button, Field, InlineAlert } from '../../ui';
import { CashbookAccountChoice } from '../cashbook/CashbookAccountChoice';
import { Choice as CashbookChoice } from '../cashbook/CashbookChoice';
import { SupplierModalShell } from './SupplierModalShell';
import { supplierMoney } from './supplierViewModel';

const methods: Array<{ value: SupplierPaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  { value: 'CREDIT_CARD', label: 'Thẻ' },
  { value: 'E_WALLET', label: 'Ví điện tử' }
];

function newPaymentKey() {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `supplier-payment-${id}`;
}

export function SupplierPaymentModal({ supplier, onClose, onSaved, visible = true }: {
  supplier: SupplierDto; onClose: () => void; onSaved: () => void; visible?: boolean;
}) {
  const { token } = useAuth(); const { theme } = useTheme();
  const outstanding = Math.max(0, Number(supplier.outstandingAmount ?? 0));
  const [amount, setAmount] = useState(''); const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentMethod>('BANK_TRANSFER');
  const [financialAccountId, setFinancialAccountId] = useState<number | null>(null);
  const [externalReference, setExternalReference] = useState(''); const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const pending = useRef(false); const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const parsedAmount = Number(amount);
  const canSave = Number.isSafeInteger(parsedAmount) && parsedAmount > 0 && parsedAmount <= outstanding && !saving;

  const submit = async () => {
    if (!canSave || pending.current) return;
    const input: SupplierPaymentInput = {
      amount: parsedAmount, paymentMethod, financialAccountId,
      ...(externalReference.trim() ? { externalReference: externalReference.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {})
    };
    const signature = JSON.stringify({ supplierId: supplier.id, ...input });
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: newPaymentKey() };
    pending.current = true; setSaving(true); setError('');
    try {
      await recordSupplierPaymentApi(token, supplier.id, input, keyRef.current.key);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể ghi nhận thanh toán nhà cung cấp.');
    } finally { pending.current = false; setSaving(false); }
  };

  const methodLabel = methods.find(item => item.value === paymentMethod)!.label;
  return <SupplierModalShell visible={visible} title="Thanh toán công nợ nhà cung cấp" busy={saving} onClose={onClose}
    footer={<><Button variant="quiet" label="Đóng" disabled={saving} onPress={onClose} /><Button variant="primary" label="Lưu thanh toán" loading={saving} disabled={!canSave} onPress={() => { void submit(); }} /></>}>
    <View style={{ gap: spacing.md }}>
      <Text style={{ color: theme.textPrimary, fontFamily: typography.families.bodySemibold }}>{supplier.code} · {supplier.name}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
        <Text style={{ color: theme.textSecondary }}>Công nợ còn lại</Text>
        <Text style={{ color: theme.textPrimary, fontFamily: typography.families.bodyBold }}>{supplierMoney(outstanding)} đ</Text>
      </View>
      <Field label="Số tiền thanh toán (đ)" value={amount} onChangeText={setAmount} keyboardType="number-pad" editable={!saving} placeholder={`Tối đa ${supplierMoney(outstanding)}`} />
      <CashbookChoice label="Phương thức thanh toán" value={methodLabel} options={methods.map(item => item.label)} onSelect={label => {
        const nextMethod = methods.find(item => item.label === label)?.value;
        if (nextMethod) { setPaymentMethod(nextMethod); setFinancialAccountId(null); }
      }} />
      <CashbookAccountChoice token={token} paymentMethod={paymentMethod} value={financialAccountId} onChange={setFinancialAccountId} />
      <Field label="Mã tham chiếu giao dịch" value={externalReference} onChangeText={setExternalReference} editable={!saving} maxLength={120} placeholder="Mã giao dịch ngân hàng (không bắt buộc)" />
      <Field label="Ghi chú" value={note} onChangeText={setNote} editable={!saving} maxLength={500} multiline numberOfLines={3} />
      {parsedAmount > outstanding && <InlineAlert message="Số tiền thanh toán không được vượt công nợ còn lại." />}
      {outstanding <= 0 && <InlineAlert message="Nhà cung cấp hiện không còn công nợ cần thanh toán." />}
      {!!error && <InlineAlert message={error} />}
    </View>
  </SupplierModalShell>;
}
