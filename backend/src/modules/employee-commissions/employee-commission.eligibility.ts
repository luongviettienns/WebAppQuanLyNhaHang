import type { Prisma } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import { businessDateAt } from '../employee-attendance/attendance-domain';

export function commissionBusinessDate(instant = new Date()) {
  return new Date(`${businessDateAt(instant)}T00:00:00.000Z`);
}

export async function assertCommissionEmployeeEligible(tx: Prisma.TransactionClient, employeeId: number, instant = new Date()) {
  const date = commissionBusinessDate(instant);
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true, code: true, name: true, status: true,
      commissionPlanAssignments: {
        where: {
          effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
          plan: { status: 'ACTIVE', effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }
        },
        take: 1,
        select: { id: true }
      }
    }
  });
  if (!employee) throw ApiError.notFound('Không tìm thấy nhân viên.', 'EMPLOYEE_NOT_FOUND');
  if (employee.status !== 'WORKING') throw ApiError.conflict('Nhân viên không còn làm việc.', 'EMPLOYEE_NOT_WORKING');
  if (!employee.commissionPlanAssignments.length) {
    throw ApiError.conflict('Nhân viên không thuộc bảng hoa hồng đang áp dụng.', 'COMMISSION_EMPLOYEE_NOT_ELIGIBLE');
  }
  return { id: employee.id, code: employee.code, name: employee.name };
}
