import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { EmployeeCommissionRecognitionService } from '../../src/modules/employee-commissions/employee-commission.recognition.service';
import { EmployeeCommissionMutationService } from '../../src/modules/employee-commissions/employee-commission.mutation.service';
import { createOrderSchema } from '../../src/modules/orders/orders.schemas';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('employee commission recognition ledger', () => {
  let branchId = 0;
  let adminId = 0;
  let employeeId = 0;
  let secondEmployeeId = 0;
  let menuItemId = 0;
  let planId = 0;

  beforeEach(async () => {
    await truncateAllTables();
    const nonce = Date.now();
    branchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    adminId = (await prismaTest.user.create({ data: { username: `ledger-admin-${nonce}`, passwordHash: 'hash', name: 'Ledger Admin', role: 'ADMIN' } })).id;
    employeeId = (await prismaTest.employee.create({ data: { code: `NV-A-${nonce}`, attendanceCode: `CC-A-${nonce}`, name: 'Nhân viên A', phone: '0900000001' } })).id;
    secondEmployeeId = (await prismaTest.employee.create({ data: { code: `NV-B-${nonce}`, attendanceCode: `CC-B-${nonce}`, name: 'Nhân viên B', phone: '0900000002' } })).id;
    const categoryId = (await prismaTest.category.create({ data: { name: `Món ${nonce}` } })).id;
    menuItemId = (await prismaTest.menuItem.create({ data: { categoryId, sku: `ITEM-${nonce}`, name: 'Món bán', basePrice: 30_000 } })).id;
    const ingredientId = (await prismaTest.ingredient.create({ data: { sku: `ING-${nonce}`, name: 'Nguyên liệu', unit: 'phần', costPerUnit: 10_000 } })).id;
    await prismaTest.menuItemIngredient.create({ data: { menuItemId, ingredientId, quantityRequired: 1 } });
    planId = (await prismaTest.commissionPlan.create({ data: {
      branchId, code: `PLAN-${nonce}`, name: 'Bảng chuẩn', status: 'ACTIVE',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), createdByUserId: adminId
    } })).id;
    await prismaTest.commissionPlanEmployee.createMany({ data: [
      { planId, employeeId, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
      { planId, employeeId: secondEmployeeId, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }
    ] });
    await prismaTest.commissionRule.create({ data: {
      planId, menuItemId, revision: 1, type: 'FIXED_PER_UNIT', fixedAmount: 5_000,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), createdByUserId: adminId
    } });
  });

  async function paidOrder(commissionEmployeeId: number | null, quantity = 2) {
    return prismaTest.order.create({ data: {
      code: `PAID-${Date.now()}-${Math.random()}`, status: 'COMPLETED', paymentStatus: 'PAID',
      paidAt: new Date('2026-10-01T03:00:00.000Z'), completedAt: new Date('2026-10-01T03:00:00.000Z'),
      totalAmount: 30_000 * quantity, discountAmount: 2_000, vatAmount: 0, finalAmount: 30_000 * quantity - 2_000,
      createdByUserId: adminId,
      items: { create: { menuItemId, quantity, unitPrice: 30_000, subtotal: 30_000 * quantity, commissionEmployeeId } }
    }, include: { items: true } });
  }

  it('accepts an explicit nullable commission employee in the order item contract', () => {
    const parsed = createOrderSchema.parse({
      orderType: 'TAKE_AWAY', items: [{ menuItemId, quantity: 1, commissionEmployeeId: null }]
    });
    expect(parsed.items[0].commissionEmployeeId).toBeNull();
  });

  it('captures one immutable basis and earning when payment recognition is retried', async () => {
    const order = await paidOrder(employeeId);

    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.recognizePaidOrder(tx, order.id, order.paidAt!, { id: adminId, name: 'Ledger Admin' }));
    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.recognizePaidOrder(tx, order.id, order.paidAt!, { id: adminId, name: 'Ledger Admin' }));

    const basis = await prismaTest.commissionSaleBasis.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } });
    const entries = await prismaTest.commissionEntry.findMany({ where: { orderItemId: order.items[0].id } });
    expect(basis).toMatchObject({ soldQuantity: 2, grossRevenue: 60_000, allocatedDiscount: 2_000, netRevenue: 58_000, unitCost: 10_000, totalCost: 20_000 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'EARNING', employeeId, quantityDelta: 2, commissionAmountDelta: 10_000 });
  });

  it('recognizes only quantity remaining after a return while an unassigned sale was queued', async () => {
    const order = await paidOrder(null);
    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.recognizePaidOrder(tx, order.id, order.paidAt!, { id: adminId }));
    expect((await prismaTest.commissionRecognitionIssue.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } })).type).toBe('UNASSIGNED_EMPLOYEE');

    const returned = await prismaTest.orderReturn.create({ data: {
      returnCode: `RETURN-${Date.now()}`, orderId: order.id, totalRefundDue: 30_000, refundedAmount: 30_000,
      completedAt: new Date('2026-10-02T00:00:00.000Z'), createdByUserId: adminId,
      lines: { create: { orderItemId: order.items[0].id, menuItemId, menuItemSku: 'ITEM', menuItemName: 'Món bán', quantity: 1, unitPrice: 30_000, lineAmount: 30_000 } }
    }, include: { lines: true } });
    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.reverseReturn(tx, returned.id, { id: adminId }));
    await EmployeeCommissionMutationService.assignOrderItem(order.items[0].id, employeeId, { id: adminId, name: 'Ledger Admin' });

    const earning = await prismaTest.commissionEntry.findFirstOrThrow({ where: { orderItemId: order.items[0].id, type: 'EARNING' } });
    expect(earning).toMatchObject({ employeeId, quantityDelta: 1, commissionAmountDelta: 5_000 });
  });

  it('uses payment-time rule and cost snapshots for late recognition', async () => {
    const order = await paidOrder(null, 1);
    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.recognizePaidOrder(tx, order.id, order.paidAt!, { id: adminId }));
    await prismaTest.commissionRule.update({ where: { planId_menuItemId_effectiveFrom_revision: {
      planId, menuItemId, effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), revision: 1
    } }, data: { fixedAmount: 99_000 } });
    await prismaTest.ingredient.updateMany({ data: { costPerUnit: 29_000 } });
    await prismaTest.orderItem.update({ where: { id: order.items[0].id }, data: { commissionEmployeeId: employeeId } });
    const basis = await prismaTest.commissionSaleBasis.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } });

    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.retrySaleBasis(tx, basis.id, { id: adminId }));

    const earning = await prismaTest.commissionEntry.findFirstOrThrow({ where: { orderItemId: order.items[0].id } });
    expect(earning).toMatchObject({ costAmountDelta: 10_000, commissionAmountDelta: 5_000 });
  });

  it('requires an audited historical cost override instead of reading a later BOM', async () => {
    await prismaTest.commissionRule.updateMany({ data: { type: 'PERCENT_GROSS_PROFIT', fixedAmount: null, rateBps: 1_000 } });
    await prismaTest.menuItemIngredient.deleteMany({ where: { menuItemId } });
    const order = await paidOrder(employeeId, 1);
    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.recognizePaidOrder(tx, order.id, order.paidAt!, { id: adminId }));
    const basis = await prismaTest.commissionSaleBasis.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } });
    expect((await prismaTest.commissionRecognitionIssue.findUniqueOrThrow({ where: { orderItemId: order.items[0].id } })).type).toBe('COST_MISSING');
    await prismaTest.menuItemIngredient.create({
      data: { menuItemId, ingredientId: (await prismaTest.ingredient.findFirstOrThrow()).id, quantityRequired: 1 }
    });

    await EmployeeCommissionMutationService.createResolution(basis.id, {
      type: 'COST_OVERRIDE', resolution: { unitCost: 10_000 }, reason: 'Khôi phục giá vốn theo chứng từ bán', idempotencyKey: 'cost-override-001'
    }, { id: adminId, name: 'Ledger Admin' });

    const earning = await prismaTest.commissionEntry.findFirstOrThrow({ where: { orderItemId: order.items[0].id } });
    expect(earning).toMatchObject({ costAmountDelta: 10_000, grossProfitDelta: 18_000, commissionAmountDelta: 1_800 });
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_COMMISSION_BASIS_RESOLUTION_CREATED', actorId: adminId } })).toBe(1);
  });

  it('returns against the current owner after reassignment and never the root employee', async () => {
    const order = await paidOrder(employeeId);
    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.recognizePaidOrder(tx, order.id, order.paidAt!, { id: adminId }));
    await EmployeeCommissionRecognitionService.reassignOrderItem(order.items[0].id, {
      employeeId: secondEmployeeId, reason: 'Đổi nhân viên phục vụ', idempotencyKey: 'reassign-owner-001'
    }, { id: adminId, name: 'Ledger Admin' });
    const returned = await prismaTest.orderReturn.create({ data: {
      returnCode: `RETURN-OWNER-${Date.now()}`, orderId: order.id, totalRefundDue: 30_000, refundedAmount: 30_000,
      completedAt: new Date('2026-10-02T00:00:00.000Z'), createdByUserId: adminId,
      lines: { create: { orderItemId: order.items[0].id, menuItemId, menuItemSku: 'ITEM', menuItemName: 'Món bán', quantity: 1, unitPrice: 30_000, lineAmount: 30_000 } }
    } });

    await prisma.$transaction(tx => EmployeeCommissionRecognitionService.reverseReturn(tx, returned.id, { id: adminId }));

    const reversal = await prismaTest.commissionEntry.findFirstOrThrow({ where: { orderReturnId: returned.id, type: 'RETURN_REVERSAL' } });
    expect(reversal.employeeId).toBe(secondEmployeeId);
    expect(reversal.commissionAmountDelta).toBe(-5_000);
  });
});
