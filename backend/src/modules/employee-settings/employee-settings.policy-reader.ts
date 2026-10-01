import type { Prisma } from '@prisma/client';
import { ApiError } from '../../lib/api-error';

type SettingsClient = Prisma.TransactionClient;

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function resolveAccessibleMainBranch(client: SettingsClient, branchId: number) {
  const requested = await client.branch.findUnique({ where: { id: branchId } });
  if (!requested) {
    throw ApiError.notFound('Không tìm thấy chi nhánh.', 'EMPLOYEE_SETTINGS_BRANCH_NOT_FOUND');
  }
  const main = await client.branch.findUnique({ where: { code: 'MAIN' } });
  if (!main) {
    throw ApiError.notFound('Không tìm thấy chi nhánh mặc định MAIN.', 'EMPLOYEE_SETTINGS_BRANCH_NOT_FOUND');
  }
  if (requested.id !== main.id) {
    throw ApiError.forbidden('Admin chưa được cấp quyền thiết lập chi nhánh này.', 'BRANCH_ACCESS_DENIED');
  }
  return main;
}

export function getEffectiveAttendancePolicy(client: SettingsClient, branchId: number, businessDate: string) {
  return client.branchAttendancePolicyVersion.findFirst({
    where: { branchId, effectiveFrom: { lte: dateOnly(businessDate) } },
    orderBy: [{ effectiveFrom: 'desc' }, { revision: 'desc' }]
  });
}

export function getEffectivePayrollPolicy(client: SettingsClient, branchId: number, businessDate: string) {
  return client.branchPayrollPolicyVersion.findFirst({
    where: { branchId, effectiveFrom: { lte: dateOnly(businessDate) } },
    orderBy: [{ effectiveFrom: 'desc' }, { revision: 'desc' }]
  });
}

export function getEffectiveWorkweekPolicy(client: SettingsClient, branchId: number, businessDate: string) {
  return client.branchWorkweekPolicyVersion.findFirst({
    where: { branchId, effectiveFrom: { lte: dateOnly(businessDate) } },
    orderBy: [{ effectiveFrom: 'desc' }, { revision: 'desc' }]
  });
}

export function getHolidayPeriods(
  client: SettingsClient,
  branchId: number,
  from?: string,
  to?: string,
  includeArchived = false
) {
  return client.branchHolidayPeriod.findMany({
    where: {
      branchId,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(from && to ? { startDate: { lte: dateOnly(to) }, endDate: { gte: dateOnly(from) } } : {})
    },
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
  });
}

export const employeeSettingsDateOnly = dateOnly;
