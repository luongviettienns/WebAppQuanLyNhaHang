import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { native, response } = vi.hoisted(() => ({
  native: (name: string) => { const Component = (props: any) => React.createElement(name, props, props.children); Component.displayName = name; return Component; },
  response: { current: null as any }
}));
vi.mock('react-native', () => ({ ActivityIndicator: native('ActivityIndicator'), Modal: native('Modal'), Pressable: native('Pressable'), ScrollView: native('ScrollView'), StyleSheet: { create: (value: any) => value, hairlineWidth: 1 }, Text: native('Text'), TextInput: native('TextInput'), View: native('View'), useWindowDimensions: () => ({ width: 1280, height: 900 }) }));
vi.mock('lucide-react-native', () => { const Icon = native('Icon'); return { Download: Icon, Plus: Icon, RefreshCw: Icon, Settings2: Icon, X: Icon }; });
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'token', user: { role: 'ADMIN' } }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({ cashbookRevision: 0 }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: { surfaceCanvas: '#f4f3f0', surfaceBase: '#fff', surfaceRaised: '#fff', surfaceSunken: '#eee', borderSubtle: '#ddd', textPrimary: '#222', textSecondary: '#555', primary: '#b42318', secondary: '#c66a15', success: '#15803d', danger: '#b42318', interactiveQuiet: '#f4f3f0', interactiveSecondary: '#eee' } }) }));
vi.mock('../../ui', () => ({ Button: ({ label, onPress, disabled, testID }: any) => React.createElement('Button', { label, onPress, disabled, testID }, label), EmptyState: ({ title, description }: any) => React.createElement('EmptyState', null, `${title} ${description}`), Field: ({ label, value }: any) => React.createElement('Field', { label, value }), InlineAlert: ({ message }: any) => React.createElement('InlineAlert', null, message), ScreenHeader: ({ title, actions }: any) => React.createElement('ScreenHeader', null, title, actions), Surface: ({ children }: any) => React.createElement('Surface', null, children) }));
vi.mock('../../api/cashbook', () => ({
  activateCashbookApi: vi.fn(), cancelCashVoucherApi: vi.fn(), createCashbookAccountApi: vi.fn(), createCashFlowCategoryApi: vi.fn(), createCashVoucherApi: vi.fn(), downloadCashbookExportApi: vi.fn(),
  fetchCashbookApi: vi.fn(async () => response.current), fetchCashbookSettingsApi: vi.fn(async () => ({ activatedAt: '2026-10-01T00:00:00.000Z', activatedByUserId: 1, accounts: [], categories: [] }))
}));
import { CashbookScreen } from './CashbookScreen';
import { fetchCashbookApi } from '../../api/cashbook';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
describe('CashbookScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    response.current = {
      page: 1, pageSize: 25,
      balanceSummary: { openingBalance: 800000, closingBalance: 650000, accountCount: 1, from: null, to: null },
      filteredSummary: { rowCount: 2, totalReceipts: 100000, totalPayments: 250000, netMovement: -150000 },
      items: [{ id: 2, code: 'PT-002', direction: 'RECEIPT', status: 'POSTED', occurredAt: '2026-10-02T07:00:00.000Z', updatedAt: '2026-10-02T07:00:00.000Z', amount: 100000, accountId: 1, categoryId: 1, paymentMethod: 'CASH', note: null, counterpartyName: 'Khách', account: { id: 1, code: 'CASH', name: 'Tiền mặt', type: 'CASH' }, category: { id: 1, code: 'DEPOSIT', name: 'Cọc', direction: 'RECEIPT', affectsBusinessResultDefault: false, isSystem: true, isActive: true }, reversalOf: { id: 1, code: 'PT-001', direction: 'PAYMENT', amount: 100000 }, reversal: null }]
    };
  });

  it('shows real balance separately from filtered totals and displays reversal linkage', async () => {
    let screen: any;
    await act(async () => { screen = create(<CashbookScreen />); await Promise.resolve(); });
    const serialized = JSON.stringify(screen.toJSON());
    expect(serialized).toContain('Số dư thực của quỹ');
    expect(serialized).toContain('Tổng thu theo bộ lọc');
    expect(serialized).toContain('Bút toán đảo của PT-001');
    expect(serialized).toContain('Đã ghi sổ');
    await act(async () => screen.unmount());
  });

  it('reloads the ledger after an explicit refresh', async () => {
    let screen: any;
    await act(async () => { screen = create(<CashbookScreen />); await Promise.resolve(); });
    const button = screen.root.findAllByProps({ label: 'Tải lại' })[0];
    await act(async () => { button.props.onPress(); await Promise.resolve(); });
    expect(fetchCashbookApi).toHaveBeenCalledTimes(2);
    await act(async () => screen.unmount());
  });
});
