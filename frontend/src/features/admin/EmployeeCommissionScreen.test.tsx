import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { screenState, native } = vi.hoisted(() => ({
  screenState: { width: 1280 },
  native: (name: string) => { const Component = (props: any) => React.createElement(name, props, props.children); Component.displayName = name; return Component; }
}));
vi.mock('react-native', () => ({
  ActivityIndicator: native('ActivityIndicator'), Modal: native('Modal'), Pressable: native('Pressable'),
  ScrollView: native('ScrollView'), StyleSheet: { create: (styles: any) => styles }, Text: native('Text'),
  TextInput: native('TextInput'), View: native('View'), useWindowDimensions: () => ({ width: screenState.width, height: 800 })
}));
vi.mock('lucide-react-native', () => ({ AlertTriangle: native('Icon'), BookOpen: native('Icon'), ChevronRight: native('Icon'), Menu: native('Icon'), Plus: native('Icon'), Search: native('Icon'), Users: native('Icon'), UtensilsCrossed: native('Icon'), X: native('Icon') }));
vi.mock('../../ui', () => ({ AppIcon: () => React.createElement('Icon') }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'token' }) }));
vi.mock('../../contexts/RestaurantContext', () => ({ useRestaurant: () => ({ employeeCommissionRevision: 0 }) }));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: {
  primary: '#b42318', success: '#15803d', warning: '#8a480b', danger: '#b42318', focusRing: '#0f6cbd',
  surfaceCanvas: '#f4f3f0', surfaceBase: '#fff', surfaceRaised: '#fff', surfaceSunken: '#eceae6',
  textPrimary: '#24211f', textSecondary: '#6b6560', textInverse: '#fff', borderSubtle: '#d8d4ce', borderStrong: '#bdb7af',
  interactivePrimary: '#b42318', interactivePrimaryPressed: '#8f1c13', interactiveSecondary: '#fff1dd', interactiveQuiet: '#f4f3f0', overlay: 'rgba(0,0,0,.5)'
} }) }));

const api = vi.hoisted(() => ({
  workspace: vi.fn(), issues: vi.fn(), ledger: vi.fn(), createPlan: vi.fn(), updatePlan: vi.fn(), activatePlan: vi.fn(), archivePlan: vi.fn(), createRule: vi.fn(), createAssignment: vi.fn(), assignOrderItem: vi.fn(), assignees: vi.fn(), retryIssue: vi.fn(), resolveIssue: vi.fn(), reassign: vi.fn()
}));
vi.mock('../../api/employeeCommissions', () => ({
  fetchEmployeeCommissionWorkspaceApi: api.workspace, fetchCommissionIssuesApi: api.issues,
  fetchCommissionLedgerApi: api.ledger, createCommissionPlanApi: api.createPlan, updateCommissionPlanApi: api.updatePlan,
  activateCommissionPlanApi: api.activatePlan, archiveCommissionPlanApi: api.archivePlan, createCommissionRuleApi: api.createRule,
  createCommissionEmployeeAssignmentApi: api.createAssignment, assignCommissionOrderItemApi: api.assignOrderItem, fetchCommissionAssigneesApi: api.assignees,
  retryCommissionIssueApi: api.retryIssue, resolveCommissionSaleBasisApi: api.resolveIssue, reassignCommissionOrderItemApi: api.reassign
}));

import { EmployeeCommissionScreen } from './EmployeeCommissionScreen';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const plan = { id: 7, code: 'BAN_HANG', name: 'Bán hàng', status: 'ACTIVE', effectiveFrom: '2026-10-01', effectiveTo: null, revision: 1 };
const itemWorkspace = {
  mode: 'ITEM', plans: [plan], rows: [{ id: 4, sku: 'CF01', name: 'Cà phê sữa', basePrice: 35000, categoryId: 2, categoryName: 'Đồ uống', rules: { '7': { id: 9, planId: 7, revision: 1, type: 'FIXED_PER_UNIT', fixedAmount: 3000, rateBps: null, effectiveFrom: '2026-10-01', effectiveTo: null } } }],
  pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 }, issues: { openCount: 2 }, ledger: { total: 12 }
};
const employeeWorkspace = {
  ...itemWorkspace, mode: 'EMPLOYEE', rows: [{ id: 3, code: 'NV003', name: 'An', status: 'WORKING', departmentName: 'Phục vụ', assignments: [{ id: 5, planId: 7, effectiveFrom: '2026-10-01', effectiveTo: null, autoAssignOwnPos: true }] }]
};

async function renderScreen() {
  let screen: any;
  await act(async () => { screen = create(<EmployeeCommissionScreen />); await Promise.resolve(); });
  return screen;
}

describe('EmployeeCommissionScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks(); screenState.width = 1280;
    api.workspace.mockImplementation((_token: string, query: any) => Promise.resolve(query.mode === 'EMPLOYEE' ? employeeWorkspace : itemWorkspace));
    api.issues.mockResolvedValue({ rows: [{ id: 21, type: 'COST_MISSING', orderItemId: 44, saleBasisId: 81, status: 'OPEN' }], pagination: { page: 1, total: 1, totalPages: 1 } });
    api.ledger.mockResolvedValue({ rows: [{ id: 31, orderItemId: 44, employeeId: 3, employeeSnapshot: { id: 3, code: 'NV003', name: 'An' }, itemSnapshot: { id: 4, sku: 'CF01', name: 'Cà phê sữa' }, type: 'EARNING', commissionAmountDelta: 3000, accountingDate: '2026-10-01', allocations: [{ id: 91, type: 'FINALIZED', payrollBatch: { id: 12, code: 'BL000012' } }] }], pagination: { page: 1, total: 1, totalPages: 1 } });
    api.assignees.mockResolvedValue({ assignees: [{ id: 3, code: 'NV003', name: 'An' }, { id: 6, code: 'NV006', name: 'Bình' }], safeDefaultEmployeeId: null });
    api.createPlan.mockResolvedValue({ plan }); api.createAssignment.mockResolvedValue({});
    api.createRule.mockResolvedValue({ rule: itemWorkspace.rows[0].rules['7'] });
    api.assignOrderItem.mockResolvedValue({}); api.retryIssue.mockResolvedValue({}); api.resolveIssue.mockResolvedValue({}); api.reassign.mockResolvedValue({});
  });

  it('renders the item matrix, plan rail and switches to the employee matrix', async () => {
    const screen = await renderScreen();
    expect(screen.root.findByProps({ testID: 'commission-plan-7' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'commission-item-row-4' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'commission-rule-4-7' }).findByType('Text').props.children).toContain('3.000đ/sp');
    expect(screen.root.findAllByProps({ testID: 'commission-issues-count' }).some((node: any) => node.props.children === 2)).toBe(true);
    await act(async () => { screen.root.findByProps({ testID: 'commission-plan-7' }).props.onPress(); await Promise.resolve(); });
    expect(api.workspace).toHaveBeenLastCalledWith('token', expect.objectContaining({ planIds: [7] }));
    await act(async () => { screen.root.findByProps({ testID: 'commission-mode-employee' }).props.onPress(); await Promise.resolve(); });
    expect(api.workspace).toHaveBeenLastCalledWith('token', expect.objectContaining({ branchId: 1, mode: 'EMPLOYEE' }));
    expect(screen.root.findByProps({ testID: 'commission-employee-row-3' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'commission-assignment-3-7' }).findByType('Text').props.children).toContain('Tự gán POS');
  });

  it('creates a rule from a matrix cell and reloads without losing the selected plan', async () => {
    const screen = await renderScreen();
    await act(async () => screen.root.findByProps({ testID: 'commission-rule-4-7' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-rule-type-net' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-rule-rate' }).props.onChangeText('5'));
    await act(async () => screen.root.findByProps({ testID: 'commission-rule-effective-from' }).props.onChangeText('2026-11-15'));
    await act(async () => { await screen.root.findByProps({ testID: 'commission-rule-save' }).props.onPress(); });
    expect(api.createRule).toHaveBeenCalledWith('token', 7, expect.objectContaining({ menuItemId: 4, type: 'PERCENT_NET_REVENUE', rateBps: 500, effectiveFrom: '2026-11-15' }));
    expect(screen.root.findByProps({ testID: 'commission-plan-7' }).props.accessibilityState.selected).toBe(true);
  });

  it('submits explicit plan and employee assignment effective ranges with an opt-in POS default', async () => {
    const screen = await renderScreen();
    await act(async () => screen.root.findByProps({ testID: 'commission-plan-create' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-plan-code' }).props.onChangeText('TET_2027'));
    await act(async () => screen.root.findByProps({ testID: 'commission-plan-name' }).props.onChangeText('Tết 2027'));
    await act(async () => screen.root.findByProps({ testID: 'commission-plan-effective-from' }).props.onChangeText('2027-01-01'));
    await act(async () => screen.root.findByProps({ testID: 'commission-plan-effective-to' }).props.onChangeText('2027-02-28'));
    await act(async () => { await screen.root.findByProps({ testID: 'commission-plan-save' }).props.onPress(); });
    expect(api.createPlan).toHaveBeenCalledWith('token', expect.objectContaining({ effectiveFrom: '2027-01-01', effectiveTo: '2027-02-28' }));

    await act(async () => { screen.root.findByProps({ testID: 'commission-mode-employee' }).props.onPress(); await Promise.resolve(); });
    await act(async () => screen.root.findByProps({ testID: 'commission-assignment-3-7' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-assignment-effective-from' }).props.onChangeText('2027-01-05'));
    await act(async () => screen.root.findByProps({ testID: 'commission-assignment-effective-to' }).props.onChangeText('2027-01-31'));
    await act(async () => screen.root.findByProps({ testID: 'commission-assignment-auto-pos' }).props.onPress());
    await act(async () => { await screen.root.findByProps({ testID: 'commission-assignment-save' }).props.onPress(); });
    expect(api.createAssignment).toHaveBeenCalledWith('token', 7, {
      employeeId: 3, effectiveFrom: '2027-01-05', effectiveTo: '2027-01-31', autoAssignOwnPos: false
    });
  });

  it('opens issues and ledger operations, retries and reassigns with an audit reason', async () => {
    const screen = await renderScreen();
    await act(async () => { await screen.root.findByProps({ testID: 'commission-open-issues' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'commission-issue-21' })).toBeDefined();
    await act(async () => { await screen.root.findByProps({ testID: 'commission-issue-retry-21' }).props.onPress(); });
    expect(api.retryIssue).toHaveBeenCalledWith('token', 21, expect.stringMatching(/^commission-issue-/));
    await act(async () => { await screen.root.findByProps({ testID: 'commission-open-ledger' }).props.onPress(); });
    expect(screen.root.findByProps({ testID: 'commission-ledger-31' })).toBeDefined();
    expect(screen.root.findByProps({ testID: 'commission-ledger-amount-31' }).props.children).toContain('3.000');
    expect(screen.root.findByProps({ testID: 'commission-ledger-allocation-31' }).props.children).toContain('BL000012');
    await act(async () => screen.root.findByProps({ testID: 'commission-ledger-reassign-31' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-reassign-employee-6' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-reassign-reason' }).props.onChangeText('Chuyển đúng người phục vụ'));
    await act(async () => { await screen.root.findByProps({ testID: 'commission-reassign-save' }).props.onPress(); });
    expect(api.reassign).toHaveBeenCalledWith('token', 44, expect.objectContaining({ employeeId: 6, reason: 'Chuyển đúng người phục vụ' }));
  });

  it('resolves a historical cost issue with an audited override instead of current BOM data', async () => {
    const screen = await renderScreen();
    await act(async () => { await screen.root.findByProps({ testID: 'commission-open-issues' }).props.onPress(); });
    await act(async () => screen.root.findByProps({ testID: 'commission-issue-resolve-21' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-resolution-value' }).props.onChangeText('10000'));
    await act(async () => screen.root.findByProps({ testID: 'commission-resolution-reason' }).props.onChangeText('Theo phiếu nhập tại ngày bán'));
    await act(async () => { await screen.root.findByProps({ testID: 'commission-resolution-save' }).props.onPress(); });
    expect(api.resolveIssue).toHaveBeenCalledWith('token', 81, expect.objectContaining({ type: 'COST_OVERRIDE', resolution: { unitCost: 10000 }, reason: 'Theo phiếu nhập tại ngày bán' }));
  });

  it('bulk assigns selected unassigned lines only to an eligible assignee', async () => {
    api.issues.mockResolvedValue({ rows: [
      { id: 41, type: 'UNASSIGNED_EMPLOYEE', orderItemId: 141, saleBasisId: 241, status: 'OPEN' },
      { id: 42, type: 'UNASSIGNED_EMPLOYEE', orderItemId: 142, saleBasisId: 242, status: 'OPEN' }
    ], pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 } });
    const screen = await renderScreen();
    await act(async () => { await screen.root.findByProps({ testID: 'commission-open-issues' }).props.onPress(); });
    await act(async () => screen.root.findByProps({ testID: 'commission-issue-select-41' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-issue-select-42' }).props.onPress());
    await act(async () => screen.root.findByProps({ testID: 'commission-bulk-employee-3' }).props.onPress());
    await act(async () => { await screen.root.findByProps({ testID: 'commission-bulk-assign' }).props.onPress(); });
    expect(api.assignOrderItem.mock.calls).toEqual(expect.arrayContaining([
      ['token', 141, 3], ['token', 142, 3]
    ]));
  });

  it('shows a compact filter drawer and truthful error/empty states', async () => {
    screenState.width = 600; api.workspace.mockRejectedValueOnce(new Error('Mất kết nối'));
    const errorScreen = await renderScreen();
    expect(errorScreen.root.findByProps({ testID: 'commission-error' }).props.children).toContain('Mất kết nối');
    await act(async () => errorScreen.unmount());
    api.workspace.mockResolvedValue({ ...itemWorkspace, rows: [], pagination: { ...itemWorkspace.pagination, total: 0 } });
    const emptyScreen = await renderScreen();
    expect(emptyScreen.root.findByProps({ testID: 'commission-filters-toggle' })).toBeDefined();
    expect(emptyScreen.root.findByProps({ testID: 'commission-empty' }).props.children).toContain('Chưa có hàng hóa');
    await act(async () => emptyScreen.root.findByProps({ testID: 'commission-filters-toggle' }).props.onPress());
    expect(emptyScreen.root.findByProps({ testID: 'commission-filter-drawer' })).toBeDefined();
  });
});
