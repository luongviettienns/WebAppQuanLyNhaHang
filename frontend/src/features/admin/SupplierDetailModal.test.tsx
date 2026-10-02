import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native, fetchSupplierDetail, fetchSupplierReceipts } = vi.hoisted(() => ({
  native: (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; },
  fetchSupplierDetail: vi.fn(), fetchSupplierReceipts: vi.fn()
}));

vi.mock('react-native', () => ({ ActivityIndicator: native('ActivityIndicator'), Pressable: native('Pressable'), Text: native('Text'), View: native('View') }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'admin-token' }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { textPrimary: '#172033', textSecondary: '#667085', primary: '#0b74e5', borderSubtle: '#dfe7f1' } }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({ inventoryRevision: 0 }) }));
vi.mock('../../api/suppliers', () => ({ fetchSupplierDetailApi: fetchSupplierDetail, fetchSupplierReceiptsApi: fetchSupplierReceipts }));
vi.mock('./SupplierModalShell', () => ({ SupplierModalShell: (props: any) => React.createElement('View', { testID: 'supplier-detail-shell', visible: props.visible }, props.footer, props.children) }));
vi.mock('./SupplierPaymentModal', () => ({ SupplierPaymentModal: (props: any) => React.createElement('View', { testID: 'supplier-payment-modal', supplier: props.supplier, onClose: props.onClose, onSaved: props.onSaved }) }));
vi.mock('../../ui', () => ({
  Button: ({ label, ...props }: any) => React.createElement('Pressable', { ...props, testID: `button-${label}` }, React.createElement('Text', null, label)),
  InlineAlert: native('InlineAlert')
}));

import { SupplierDetailModal } from './SupplierDetailModal';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supplier = { id: 3, code: 'NCC003', name: 'Nhà cung cấp thử', isActive: true, outstandingAmount: 500_000 } as any;

describe('SupplierDetailModal payment entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSupplierDetail.mockResolvedValue(supplier);
    fetchSupplierReceipts.mockResolvedValue({ items: [], pagination: { totalPages: 1 } });
  });

  it('opens a dedicated payment composer for an active supplier with outstanding debt', async () => {
    let screen: any;
    await act(async () => { screen = create(<SupplierDetailModal id={3} onClose={() => {}} onEdit={() => {}} onOpenReceipt={() => {}} />); await Promise.resolve(); });
    await act(async () => screen.root.findByProps({ testID: 'button-Thanh toán công nợ' }).props.onPress());

    const composer = screen.root.findByProps({ testID: 'supplier-payment-modal' });
    expect(composer.props.supplier).toEqual(supplier);
    expect(screen.root.findByProps({ testID: 'supplier-detail-shell' }).props.visible).toBe(false);
  });
});
