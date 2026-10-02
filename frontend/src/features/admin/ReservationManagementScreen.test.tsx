import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native, reservation, api } = vi.hoisted(() => {
  const component = (name: string) => { const C = (props: any) => React.createElement(name, props, props.children); C.displayName = name; return C; };
  return {
    native: component,
    reservation: {
      id: 7, code: 'RSV-7', contactName: 'Khách thử', contactPhone: '0900000000', partySize: 2,
      scheduledAt: '2026-10-05T11:00:00.000Z', status: 'PENDING_DEPOSIT', depositStatus: 'WAITING_CONFIRMATION',
      depositAmount: 300_000, table: null
    },
    api: {
      authorizeReservationOrderPayLaterApi: vi.fn(), cancelReservationByRestaurantApi: vi.fn(), checkInReservationApi: vi.fn(),
      confirmOrderPaymentApi: vi.fn(), confirmReservationDepositApi: vi.fn(), fetchOrderPaymentConfirmationsApi: vi.fn(),
      fetchReservationDetailApi: vi.fn(), fetchReservationsApi: vi.fn(), markReservationNoShowApi: vi.fn(),
      refundReservationDepositApi: vi.fn(), rejectOrderPaymentApi: vi.fn(), rejectReservationDepositApi: vi.fn(), rescheduleReservationApi: vi.fn()
    }
  };
});

vi.mock('react-native', () => ({ ActivityIndicator: native('ActivityIndicator'), Modal: native('Modal'), Pressable: native('Pressable'), ScrollView: native('ScrollView'), StyleSheet: { create: (value: any) => value }, Text: native('Text'), TextInput: native('TextInput'), View: native('View') }));
vi.mock('lucide-react-native', () => ({ Check: native('Icon'), RefreshCw: native('Icon'), Search: native('Icon'), X: native('Icon') }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'staff-token' }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceBase: '#fff', surfaceCanvas: '#f5f7fa', surfaceRaised: '#fff', surfaceSunken: '#f4f6f8', textPrimary: '#172033', textSecondary: '#667085', textInverse: '#fff', borderSubtle: '#dfe7f1', primary: '#0b74e5', interactiveSecondary: '#eaf3ff', interactiveQuiet: '#f3f6fa', warning: '#a86100', danger: '#b42318', success: '#15803d' } }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({ reservationsRevision: 0, orderPaymentsRevision: 0, tables: [], tablesRevision: 0, fetchTables: vi.fn() }) }));
vi.mock('../../api/reservations', () => api);
vi.mock('../../api/cashbook', () => ({ getDefaultCashbookAccountId: vi.fn(async () => 12) }));
vi.mock('../cashbook/CashbookAccountChoice', () => ({ CashbookAccountChoice: (props: any) => React.createElement('Pressable', { testID: 'reservation-cashbook-account', onPress: () => props.onChange(24) }) }));
vi.mock('../../ui', () => ({
  AppIcon: native('AppIcon'),
  Button: ({ label, ...props }: any) => React.createElement('Pressable', { ...props, testID: `button-${label}` }, React.createElement('Text', null, label)),
  EmptyState: native('EmptyState'),
  Field: ({ label, ...props }: any) => React.createElement('TextInput', { ...props, accessibilityLabel: label }),
  InlineAlert: native('InlineAlert'), ScreenHeader: native('ScreenHeader'), StatusBadge: native('StatusBadge')
}));

import { ReservationManagementScreen } from './ReservationManagementScreen';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ReservationManagementScreen cashbook account selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchReservationsApi.mockResolvedValue({ items: [reservation], pagination: { page: 1, totalPages: 1, totalRows: 1 } });
    api.fetchReservationDetailApi.mockResolvedValue({ transactions: [] });
    api.fetchOrderPaymentConfirmationsApi.mockResolvedValue([]);
    api.confirmReservationDepositApi.mockResolvedValue({});
  });

  it('posts the account chosen in the deposit confirmation form', async () => {
    let screen: any;
    await act(async () => { screen = create(<ReservationManagementScreen />); await Promise.resolve(); });
    const row = screen.root.findAllByType('Pressable').find((item: any) => item.findAllByType('Text').some((text: any) => String(text.props.children).includes('RSV-7')));
    await act(async () => { await row.props.onPress(); });
    await act(async () => screen.root.findByProps({ testID: 'button-Xác nhận cọc' }).props.onPress());
    await act(async () => screen.root.findByProps({ accessibilityLabel: 'Mã tham chiếu giao dịch' }).props.onChangeText('BANK-7'));
    await act(async () => screen.root.findByProps({ testID: 'reservation-cashbook-account' }).props.onPress());
    await act(async () => { await screen.root.findByProps({ testID: 'button-Xác nhận đã nhận cọc' }).props.onPress(); });

    expect(api.confirmReservationDepositApi).toHaveBeenCalledWith('staff-token', 7, 300_000, 'BANK-7', 24);
  });
});
