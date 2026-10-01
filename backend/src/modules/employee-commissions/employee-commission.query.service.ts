import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import type { CommissionListQuery, CommissionWorkspaceQuery } from './employee-commission.schemas';
import { commissionBusinessDate } from './employee-commission.eligibility';

function isoDate(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

async function assertMainBranch(branchId: number) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw ApiError.notFound('Không tìm thấy chi nhánh.', 'NOT_FOUND');
  if (branch.code !== 'MAIN') throw ApiError.forbidden('Chi nhánh này chưa được bật quản lý hoa hồng.', 'BRANCH_ACCESS_DENIED');
  return branch;
}

function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export class EmployeeCommissionQueryService {
  static async workspace(query: CommissionWorkspaceQuery) {
    await assertMainBranch(query.branchId);
    const plans = await prisma.commissionPlan.findMany({
      where: { branchId: query.branchId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, status: true, effectiveFrom: true, effectiveTo: true, revision: true }
    });
    const selectedPlanIds = query.selectedPlanIds?.length ? query.selectedPlanIds : plans.map(plan => plan.id);
    const skip = (query.page - 1) * query.pageSize;

    if (query.mode === 'EMPLOYEE') {
      const where: Prisma.EmployeeWhereInput = {
        ...(query.search ? { OR: [
          { code: { contains: query.search } }, { name: { contains: query.search } }
        ] } : {})
      };
      const [total, employees] = await Promise.all([
        prisma.employee.count({ where }),
        prisma.employee.findMany({
          where, skip, take: query.pageSize, orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: {
            id: true, code: true, name: true, status: true,
            department: { select: { name: true } },
            commissionPlanAssignments: {
              where: selectedPlanIds.length ? { planId: { in: selectedPlanIds } } : undefined,
              orderBy: { effectiveFrom: 'desc' },
              select: { id: true, planId: true, effectiveFrom: true, effectiveTo: true, autoAssignOwnPos: true }
            }
          }
        })
      ]);
      return {
        mode: query.mode, plans: plans.map(plan => ({ ...plan, effectiveFrom: isoDate(plan.effectiveFrom), effectiveTo: isoDate(plan.effectiveTo) })),
        rows: employees.map(employee => ({
          ...employee, departmentName: employee.department?.name ?? null, department: undefined,
          assignments: employee.commissionPlanAssignments.map(item => ({ ...item, effectiveFrom: isoDate(item.effectiveFrom), effectiveTo: isoDate(item.effectiveTo) })),
          commissionPlanAssignments: undefined
        })),
        pagination: pagination(query.page, query.pageSize, total),
        issues: { openCount: await prisma.commissionRecognitionIssue.count({ where: { status: 'OPEN' } }) },
        ledger: { total: await prisma.commissionEntry.count() }
      };
    }

    const where: Prisma.MenuItemWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? { OR: [{ sku: { contains: query.search } }, { name: { contains: query.search } }] } : {})
    };
    const [total, items, openCount, ledgerTotal] = await Promise.all([
      prisma.menuItem.count({ where }),
      prisma.menuItem.findMany({
        where, skip, take: query.pageSize, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true, sku: true, name: true, basePrice: true, categoryId: true,
          category: { select: { name: true } },
          commissionRules: {
            where: selectedPlanIds.length ? { planId: { in: selectedPlanIds } } : undefined,
            orderBy: [{ effectiveFrom: 'desc' }, { revision: 'desc' }],
            select: { id: true, planId: true, revision: true, type: true, fixedAmount: true, rateBps: true, effectiveFrom: true, effectiveTo: true }
          }
        }
      }),
      prisma.commissionRecognitionIssue.count({ where: { status: 'OPEN' } }),
      prisma.commissionEntry.count()
    ]);
    return {
      mode: query.mode,
      plans: plans.map(plan => ({ ...plan, effectiveFrom: isoDate(plan.effectiveFrom), effectiveTo: isoDate(plan.effectiveTo) })),
      rows: items.map(item => ({
        id: item.id, sku: item.sku, name: item.name, basePrice: item.basePrice,
        categoryId: item.categoryId, categoryName: item.category.name,
        rules: Object.fromEntries(item.commissionRules.map(rule => [String(rule.planId), {
          ...rule, effectiveFrom: isoDate(rule.effectiveFrom), effectiveTo: isoDate(rule.effectiveTo)
        }]))
      })),
      pagination: pagination(query.page, query.pageSize, total), issues: { openCount }, ledger: { total: ledgerTotal }
    };
  }

  static async assignees(branchId: number, currentUserId: number) {
    await assertMainBranch(branchId);
    const today = commissionBusinessDate();
    const assignments = await prisma.commissionPlanEmployee.findMany({
      where: {
        plan: { branchId, status: 'ACTIVE', effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
        effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        employee: { status: 'WORKING' }
      },
      orderBy: [{ employee: { name: 'asc' } }, { employeeId: 'asc' }],
      select: { autoAssignOwnPos: true, employee: { select: { id: true, code: true, name: true, userId: true } } }
    });
    const byEmployee = new Map(assignments.map(item => [item.employee.id, item]));
    const safeDefault = assignments.find(item => item.autoAssignOwnPos && item.employee.userId === currentUserId)?.employee.id ?? null;
    return { assignees: [...byEmployee.values()].map(item => ({ id: item.employee.id, code: item.employee.code, name: item.employee.name })), safeDefaultEmployeeId: safeDefault };
  }

  static async issues(query: CommissionListQuery) {
    await assertMainBranch(query.branchId);
    const where: Prisma.CommissionRecognitionIssueWhereInput = query.status ? { status: query.status as any } : {};
    const [total, rows] = await Promise.all([
      prisma.commissionRecognitionIssue.count({ where }),
      prisma.commissionRecognitionIssue.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { lastDetectedAt: 'desc' } })
    ]);
    return { rows, pagination: pagination(query.page, query.pageSize, total) };
  }

  static async ledger(query: CommissionListQuery) {
    await assertMainBranch(query.branchId);
    const where: Prisma.CommissionEntryWhereInput = {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.orderItemId ? { orderItemId: query.orderItemId } : {})
    };
    const [total, rows] = await Promise.all([
      prisma.commissionEntry.count({ where }),
      prisma.commissionEntry.findMany({
        where, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        orderBy: [{ accountingDate: 'desc' }, { id: 'desc' }],
        include: { allocations: { orderBy: { createdAt: 'asc' }, include: { payrollBatch: { select: { id: true, code: true, status: true } } } } }
      })
    ]);
    return { rows, pagination: pagination(query.page, query.pageSize, total) };
  }
}
