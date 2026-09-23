import { prisma } from '../../config/prisma';
import { GetAuditLogsQuery } from './audit.schemas';
import { Prisma } from '@prisma/client';

export interface LogAuditInput {
  action: string;
  targetType: string;
  targetId?: number | null;
  actorId?: number | null;
  actorName?: string | null;
  metadata?: any;
}

export class AuditService {
  static async logInTransaction(tx: Prisma.TransactionClient, input: LogAuditInput) {
    let finalActorName = input.actorName;
    if (!finalActorName && input.actorId) {
      const user = await tx.user.findUnique({ where: { id: input.actorId }, select: { name: true, username: true } });
      finalActorName = user?.name || user?.username || null;
    }
    return tx.auditLog.create({ data: { action: input.action, targetType: input.targetType, targetId: input.targetId ?? null, actorId: input.actorId ?? null, actorName: finalActorName ?? null, metadata: input.metadata ?? undefined } });
  }

  /**
   * Ghi log he thong cho cac hanh dong quan tri (Menu, Image, Order Void)
   */
  static async log(input: LogAuditInput) {
    try {
      let finalActorName = input.actorName;
      if (!finalActorName && input.actorId) {
        const user = await prisma.user.findUnique({
          where: { id: input.actorId },
          select: { name: true, username: true }
        });
        finalActorName = user?.name || user?.username || null;
      }

      return await prisma.auditLog.create({
        data: {
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          actorId: input.actorId ?? null,
          actorName: finalActorName ?? null,
          metadata: input.metadata ?? undefined
        }
      });
    } catch (error) {
      console.error('[AuditService.log] Failed to write audit log:', error);
      return null;
    }
  }

  /**
   * Lay danh sach audit log phan trang va loc theo action / targetType (Admin only)
   */
  static async getLogs(query: GetAuditLogsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.category) {
      switch (query.category) {
        case 'MENU':
          where.targetType = 'MenuItem';
          where.action = { not: 'MENU_RECIPE_UPDATED' };
          break;
        case 'INVENTORY':
          where.OR = [
            { targetType: 'Ingredient' },
            { action: 'MENU_RECIPE_UPDATED' }
          ];
          break;
        case 'IMAGE':
          where.action = 'MENU_IMAGE_UPLOADED';
          break;
        case 'ORDER':
          where.action = 'ORDER_VOIDED';
          break;
        case 'ALL':
        default:
          break;
      }
    }
    if (query.action) {
      where.action = query.action;
    }
    if (query.targetType) {
      where.targetType = query.targetType;
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return {
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }
}
