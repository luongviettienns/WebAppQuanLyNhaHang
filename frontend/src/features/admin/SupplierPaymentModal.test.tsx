import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native, recordPayment } = vi.hoisted(() => ({
  native: (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; },
  recordPayment: vi.fn()
}));

vi.mock('react-native', () => ({ Pressable: native('Pressable'), ScrollView: native('ScrollView'), StyleSheet: { create: (value: any) => value }, Text: native('Text'), TextInput: native('TextInput'), View: native('View') }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceBase: '#fff', surfaceRaised: '#fff', textPrimary: '#172033', textSecondary: '#667085', borderSubtle: '#dfe7f1', primary: '#0b74e5', interactiveSecondary: '#eaf3ff', danger: '#b42318' } }) }));
vi.mock('../../api/suppliers', () => ({ recordSupplierPaymentApi: recordPayment }));
vi.mock('../cashbook/CashbookChoice', () => ({ Choice: (props: any) => React.createElement('Pressable', { testID: 'supplier-method-cash', onPress: () => props.onSelect('Tiền mặt') }, React.createElement('Text', null, props.value)) }));
vi.mock('../cashbook/CashbookAccountChoice', () => ({ CashbookAccountChoice: (props: any) => React.createElement('Pressable', { testID: 'supplier-account-choice', onPress: () => props.onChange(34) }, React.createElement('Text', null, String(props.value ?? ''))) }));
vi.mock('./SupplierModalShell', () => ({ SupplierModalShell: (props: any) => React.createElement('View', { testID: 'supplier-payment-shell', visible: props.visible }, React.createElement('Text', null, props.title), props.children, props.footer) }));
vi.mock('../../ui', () => ({
  Button: ({ label, ...props }: any) => React.createElement('Pressable', { ...props, testID: `button-${label}` }, React.createElement('Text', null, label)),
  Field: ({ label, ...props }: any) => React.createElement('TextInput', { ...props, accessibilityLabel: label }),
  InlineAlert: (props: any) => React.createElement('Text', null, props.message)
}));

import { SupplierPaymentModal } from './SupplierPaymentModal';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supplier = { id: 3, code: 'NCC003', name: 'Nhà cung cấp thử', isActive: true, outstandingAmount: 650_000 } as any;

describe('SupplierPaymentModal', () => {
  beforeEach(() => { vi.clearAllMocks(); recordPayment.mockResolvedValue({ id: 17 }); });

  it('records a partial payment with the selected method and account, keeping the retry key stable', async () => {
    recordPayment.mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValueOnce({ id: 17 });
    const onSaved = vi.fn();
    let screen: any;
    await act(async () => { screen = create(<SupplierPaymentModal supplier={supplier} onClose={() => {}} onSaved={onSaved} />); });
    await act(async () => screen.root.findByProps({ accessibilityLabel: 'Số tiền thanh toán (đ)' }).props.onChangeText('400000'));
    await act(async () => screen.root.findByProps({ testID: 'supplier-method-cash' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'supplier-account-choice' }).props.onPress());
    await act(async () => { await screen.root.findByProps({ testID: 'button-Lưu thanh toán' }).props.onPress(); });
    await act(async () => { await screen.root.findByProps({ testID: 'button-Lưu thanh toán' }).props.onPress(); });

    expect(recordPayment).toHaveBeenNthCalledWith(1, 'admin-token', 3, {
      amount: 400_000, paymentMethod: 'CASH', financialAccountId: 34
    }, expect.any(String));
    expect(recordPayment.mock.calls[1][3]).toBe(recordPayment.mock.calls[0][3]);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('blocks a payment above the supplier outstanding balance', async () => {
    let screen: any;
    await act(async () => { screen = create(<SupplierPaymentModal supplier={supplier} onClose={() => {}} onSaved={() => {}} />); });
    await act(async () => screen.root.findByProps({ accessibilityLabel: 'Số tiền thanh toán (đ)' }).props.onChangeText('650001'));

    expect(screen.root.findByProps({ testID: 'button-Lưu thanh toán' }).props.disabled).toBe(true);
    expect(recordPayment).not.toHaveBeenCalled();
  });
});
