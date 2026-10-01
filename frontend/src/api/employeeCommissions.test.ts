import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EmployeeCommissionApiError,
  assignCommissionOrderItemApi,
  createCommissionPlanApi,
  createCommissionRuleApi,
  fetchCommissionAssigneesApi,
  fetchEmployeeCommissionWorkspaceApi,
  reassignCommissionOrderItemApi
} from './employeeCommissions';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));
afterEach(() => vi.unstubAllGlobals());
const ok = (data: unknown): Response => ({ ok: true, status: 200, json: async () => ({ data }) }) as Response;

describe('employee commission API', () => {
  it('encodes workspace filters and the cashier assignee request', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({}));
    vi.stubGlobal('fetch', fetchMock);
    await fetchEmployeeCommissionWorkspaceApi('token', { branchId: 1, mode: 'ITEM', search: 'cà phê & trà', categoryId: 4, planIds: [2, 7], page: 2, pageSize: 25 });
    await fetchCommissionAssigneesApi('token', 1);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/employee-commissions/workspace');
    expect(url.searchParams.get('search')).toBe('cà phê & trà');
    expect(url.searchParams.get('planIds')).toBe('2,7');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/employee-commissions/assignees?branchId=1');
  });

  it('sends exact plan, rule, nullable assignment and audited reassignment bodies', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(ok({}));
    vi.stubGlobal('fetch', fetchMock);
    await createCommissionPlanApi('token', { branchId: 1, code: 'PV', name: 'Phục vụ', effectiveFrom: '2026-10-01', effectiveTo: null });
    await createCommissionRuleApi('token', 3, { menuItemId: 9, type: 'PERCENT_NET_REVENUE', rateBps: 500, effectiveFrom: '2026-10-01' });
    await assignCommissionOrderItemApi('token', 11, null);
    await reassignCommissionOrderItemApi('token', 11, { employeeId: 8, reason: 'Đổi đúng người phục vụ', idempotencyKey: 'reassign-ui-001' });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ code: 'PV', effectiveTo: null });
    expect(fetchMock.mock.calls[1][0]).toContain('/plans/3/rules');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ commissionEmployeeId: null });
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({ employeeId: 8, reason: 'Đổi đúng người phục vụ', idempotencyKey: 'reassign-ui-001' });
  });

  it('preserves backend conflict details', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 409, json: async () => ({ error: { code: 'COMMISSION_ASSIGNMENT_OVERLAP', message: 'Bị chồng kỳ', details: { planId: '4' } } })
    } as Response));

    await expect(assignCommissionOrderItemApi('token', 11, 8)).rejects.toMatchObject({
      constructor: EmployeeCommissionApiError, status: 409, code: 'COMMISSION_ASSIGNMENT_OVERLAP', details: { planId: '4' }
    });
  });
});

