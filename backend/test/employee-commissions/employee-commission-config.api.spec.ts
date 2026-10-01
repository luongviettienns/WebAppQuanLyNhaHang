import type { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { getSocketIO, setSocketIO } from '../../src/lib/socket';
import { AuditService } from '../../src/modules/audit/audit.service';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee commission configuration API', () => {
  const originalSocket = getSocketIO();
  let adminToken = '';
  let cashierToken = '';
  let adminId = 0;
  let cashierId = 0;
  let branchId = 0;
  let categoryId = 0;
  let menuItemId = 0;
  let employeeId = 0;
  let cashierEmployeeId = 0;
  let emitted: Array<{ event: string; payload: any }> = [];

  const sign = (user: { id: number; username: string; name: string; role: string }) => jwt.sign(
    { sub: String(user.id), username: user.username, name: user.name, role: user.role },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
  );
  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const createPlan = async (overrides: Record<string, unknown> = {}) => request(app)
    .post('/api/employee-commissions/plans')
    .set(auth())
    .send({ branchId, code: `HH-${Date.now()}`, name: 'Hoa hồng phục vụ', effectiveFrom: '2026-10-01', ...overrides });

  beforeEach(async () => {
    await truncateAllTables();
    emitted = [];
    setSocketIO({ emit: (event: string, payload: unknown) => emitted.push({ event, payload }) } as unknown as SocketIOServer);
    const nonce = Date.now();
    const admin = await prismaTest.user.create({
      data: { username: `commission-admin-${nonce}`, passwordHash: 'hash', name: 'Commission Admin', role: 'ADMIN' }
    });
    const cashier = await prismaTest.user.create({
      data: { username: `commission-cashier-${nonce}`, passwordHash: 'hash', name: 'Commission Cashier', role: 'CASHIER' }
    });
    adminId = admin.id;
    cashierId = cashier.id;
    adminToken = sign(admin);
    cashierToken = sign(cashier);
    branchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    const category = await prismaTest.category.create({ data: { name: `Đồ uống ${nonce}` } });
    categoryId = category.id;
    menuItemId = (await prismaTest.menuItem.create({
      data: { categoryId, sku: `CF-${nonce}`, name: 'Cà phê sữa', basePrice: 30_000 }
    })).id;
    employeeId = (await prismaTest.employee.create({
      data: { code: `NV-${nonce}`, attendanceCode: `CC-${nonce}`, name: 'Nhân viên A', phone: '0900000001' }
    })).id;
    cashierEmployeeId = (await prismaTest.employee.create({
      data: { code: `TN-${nonce}`, attendanceCode: `TNCC-${nonce}`, name: 'Thu ngân liên kết', phone: '0900000002', userId: cashierId }
    })).id;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setSocketIO(originalSocket);
  });

  it('protects the Admin workspace while exposing minimal assignees to Cashier', async () => {
    const denied = await request(app).get(`/api/employee-commissions/workspace?branchId=${branchId}`).set(auth(cashierToken));
    const plan = (await createPlan()).body.data.plan;
    await prismaTest.commissionPlan.update({ where: { id: plan.id }, data: { status: 'ACTIVE' } });
    await prismaTest.commissionPlanEmployee.createMany({ data: [
      { planId: plan.id, employeeId, effectiveFrom: new Date('2026-10-01T00:00:00.000Z') },
      { planId: plan.id, employeeId: cashierEmployeeId, effectiveFrom: new Date('2026-10-01T00:00:00.000Z'), autoAssignOwnPos: true }
    ] });

    const assignees = await request(app).get(`/api/employee-commissions/assignees?branchId=${branchId}`).set(auth(cashierToken));

    expect(denied.status).toBe(403);
    expect(assignees.status).toBe(200);
    expect(assignees.body.data.assignees).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: employeeId, code: expect.any(String), name: 'Nhân viên A' })
    ]));
    expect(assignees.body.data.assignees[0]).not.toHaveProperty('phone');
    expect(assignees.body.data.safeDefaultEmployeeId).toBe(cashierEmployeeId);
  });

  it('creates an audited draft plan and emits only after commit', async () => {
    const response = await createPlan({ code: 'PLAN-PRIMARY' });

    expect(response.status).toBe(201);
    expect(response.body.data.plan).toMatchObject({ branchId, code: 'PLAN-PRIMARY', status: 'DRAFT', revision: 1 });
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_COMMISSION_PLAN_CREATED', actorId: adminId } })).toBe(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ event: 'employee-commission:changed', payload: { branchId, affectedPlanIds: [response.body.data.plan.id], reason: 'PLAN_CHANGED' } });
  });

  it('rolls back plan creation and suppresses realtime when audit storage fails', async () => {
    vi.spyOn(AuditService, 'logInTransaction').mockRejectedValueOnce(new Error('Injected commission audit failure'));

    const response = await createPlan({ code: 'PLAN-ROLLBACK' });

    expect(response.status).toBe(500);
    expect(await prismaTest.commissionPlan.count({ where: { code: 'PLAN-ROLLBACK' } })).toBe(0);
    expect(emitted).toEqual([]);
  });

  it('validates all three rule types and closes the prior inclusive version', async () => {
    const plan = (await createPlan({ code: 'PLAN-RULES' })).body.data.plan;
    const invalid = await request(app).post(`/api/employee-commissions/plans/${plan.id}/rules`).set(auth()).send({
      menuItemId, type: 'FIXED_PER_UNIT', rateBps: 500, effectiveFrom: '2026-10-01'
    });
    expect(invalid.status).toBe(400);

    const fixed = await request(app).post(`/api/employee-commissions/plans/${plan.id}/rules`).set(auth()).send({
      menuItemId, type: 'FIXED_PER_UNIT', fixedAmount: 15_000, effectiveFrom: '2026-10-01'
    });
    const revenue = await request(app).post(`/api/employee-commissions/plans/${plan.id}/rules`).set(auth()).send({
      menuItemId, type: 'PERCENT_NET_REVENUE', rateBps: 500, effectiveFrom: '2026-11-01'
    });
    const profit = await request(app).post(`/api/employee-commissions/plans/${plan.id}/rules`).set(auth()).send({
      menuItemId, type: 'PERCENT_GROSS_PROFIT', rateBps: 1_000, effectiveFrom: '2026-12-01'
    });

    expect([fixed.status, revenue.status, profit.status]).toEqual([201, 201, 201]);
    const rules = await prismaTest.commissionRule.findMany({ where: { planId: plan.id }, orderBy: { revision: 'asc' } });
    expect(rules.map(rule => [rule.revision, rule.effectiveTo?.toISOString().slice(0, 10) ?? null])).toEqual([
      [1, '2026-10-31'], [2, '2026-11-30'], [3, null]
    ]);
  });

  it('rejects overlapping employee plan assignments in one branch', async () => {
    const firstPlan = (await createPlan({ code: 'PLAN-A' })).body.data.plan;
    const secondPlan = (await createPlan({ code: 'PLAN-B' })).body.data.plan;
    const first = await request(app).post(`/api/employee-commissions/plans/${firstPlan.id}/employees`).set(auth()).send({
      employeeId, effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31', autoAssignOwnPos: false
    });
    const overlap = await request(app).post(`/api/employee-commissions/plans/${secondPlan.id}/employees`).set(auth()).send({
      employeeId, effectiveFrom: '2026-12-01', effectiveTo: null, autoAssignOwnPos: false
    });

    expect(first.status).toBe(201);
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('COMMISSION_ASSIGNMENT_OVERLAP');
  });

  it('supports explicit nullable pre-recognition order-item assignment', async () => {
    const order = await prismaTest.order.create({
      data: { code: `ORDER-${Date.now()}`, totalAmount: 30_000, vatAmount: 0, finalAmount: 30_000, createdByUserId: adminId }
    });
    const item = await prismaTest.orderItem.create({
      data: { orderId: order.id, menuItemId, quantity: 1, unitPrice: 30_000, subtotal: 30_000 }
    });
    const assigned = await request(app).patch(`/api/employee-commissions/order-items/${item.id}/assignment`).set(auth(cashierToken)).send({ commissionEmployeeId: employeeId });
    const cleared = await request(app).patch(`/api/employee-commissions/order-items/${item.id}/assignment`).set(auth(cashierToken)).send({ commissionEmployeeId: null });

    expect(assigned.status).toBe(200);
    expect(cleared.status).toBe(200);
    expect((await prismaTest.orderItem.findUniqueOrThrow({ where: { id: item.id } })).commissionEmployeeId).toBeNull();
  });

  it('filters and paginates the item workspace with matrix cells', async () => {
    const plan = (await createPlan({ code: 'PLAN-MATRIX' })).body.data.plan;
    await prismaTest.commissionRule.create({
      data: { planId: plan.id, menuItemId, revision: 1, type: 'FIXED_PER_UNIT', fixedAmount: 12_000, effectiveFrom: new Date('2026-10-01T00:00:00.000Z') }
    });
    await prismaTest.menuItem.create({ data: { categoryId, sku: `TEA-${Date.now()}`, name: 'Trà đào', basePrice: 35_000 } });

    const response = await request(app)
      .get(`/api/employee-commissions/workspace?branchId=${branchId}&mode=ITEM&search=C%C3%A0%20ph%C3%AA&categoryId=${categoryId}&page=1&pageSize=1`)
      .set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(response.body.data.rows[0]).toMatchObject({ id: menuItemId, name: 'Cà phê sữa' });
    expect(response.body.data.rows[0].rules[String(plan.id)]).toMatchObject({ type: 'FIXED_PER_UNIT', fixedAmount: 12_000 });
    expect(response.body.data).toMatchObject({ issues: { openCount: 0 }, ledger: { total: 0 } });
  });

  it('activates and archives a valid plan without deleting history', async () => {
    const plan = (await createPlan({ code: 'PLAN-LIFECYCLE' })).body.data.plan;
    await prismaTest.commissionRule.create({
      data: { planId: plan.id, menuItemId, revision: 1, type: 'FIXED_PER_UNIT', fixedAmount: 10_000, effectiveFrom: new Date('2026-10-01T00:00:00.000Z') }
    });
    await prismaTest.commissionPlanEmployee.create({
      data: { planId: plan.id, employeeId, effectiveFrom: new Date('2026-10-01T00:00:00.000Z') }
    });

    const activated = await request(app).post(`/api/employee-commissions/plans/${plan.id}/activate`).set(auth()).send({});
    const archived = await request(app).post(`/api/employee-commissions/plans/${plan.id}/archive`).set(auth()).send({ reason: 'Thay bảng mới' });

    expect(activated.status).toBe(200);
    expect(archived.status).toBe(200);
    expect(await prismaTest.commissionPlan.count({ where: { id: plan.id } })).toBe(1);
    expect((await prismaTest.commissionPlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe('ARCHIVED');
  });
});
