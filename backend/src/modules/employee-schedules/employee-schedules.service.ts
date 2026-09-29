import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import type { CreateWorkShiftInput } from './employee-schedules.schemas';

function emitScheduleChanged(employeeIds: number[] = [], changedFrom: string | null = null, changedThrough: string | null = null) {
  emitToAll('employee-schedules:changed', { employeeIds, changedFrom, changedThrough, updatedAt: new Date().toISOString() });
}

export class EmployeeSchedulesService {
  static async listShifts() {
    return prisma.workShift.findMany({
      orderBy: [{ isActive: 'desc' }, { startMinute: 'asc' }, { name: 'asc' }]
    });
  }

  static async createShift(input: CreateWorkShiftInput, actor: { id: number; name: string }) {
    try {
      const shift = await prisma.$transaction(async tx => {
        const created = await tx.workShift.create({
          data: {
            ...input,
            isActive: true,
            createdByUserId: actor.id
          }
        });
        await AuditService.logInTransaction(tx, {
          action: 'EMPLOYEE_WORK_SHIFT_CREATED',
          targetType: 'WorkShift',
          targetId: created.id,
          actorId: actor.id,
          actorName: actor.name,
          metadata: { code: created.code, startMinute: created.startMinute, endMinute: created.endMinute }
        });
        return created;
      });
      emitScheduleChanged();
      return shift;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw ApiError.conflict('Mã hoặc tên ca làm việc đã tồn tại', 'SCHEDULE_DUPLICATE', { code: input.code });
        }
        if (error.code === 'P2003') throw ApiError.notFound('Tài khoản tạo ca làm việc không tồn tại');
      }
      throw error;
    }
  }
}
