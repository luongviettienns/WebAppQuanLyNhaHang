import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { issueKioskSecret } from './kiosk-credentials';

export interface KioskSessionPublicDto {
  id: number;
  branchId: number;
  branchCode: string;
  deviceName: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface CreateKioskSessionRecord {
  branchId: number;
  tokenHash: string;
  createdByUserId: number;
  deviceName?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AttendanceKioskAdminStore {
  create(record: CreateKioskSessionRecord): Promise<KioskSessionPublicDto>;
  list(branchId: number): Promise<KioskSessionPublicDto[]>;
  revoke(id: number, actorId: number, revokedAt: Date): Promise<KioskSessionPublicDto | null>;
}

export interface CreateKioskSessionServiceInput {
  branchId: number;
  expiresInMinutes: number;
  deviceName?: string;
}

export class EmployeeAttendanceKioskAdminService {
  constructor(
    private readonly store: AttendanceKioskAdminStore,
    private readonly serverNow: () => Date = () => new Date()
  ) {}

  async create(input: CreateKioskSessionServiceInput, actor: { id: number }) {
    if (!Number.isSafeInteger(input.branchId) || input.branchId <= 0
      || !Number.isInteger(input.expiresInMinutes) || input.expiresInMinutes < 15 || input.expiresInMinutes > 1440
      || (input.deviceName !== undefined && (input.deviceName.trim().length === 0 || input.deviceName.length > 120))) {
      throw ApiError.badRequest('Thông tin cấp kiosk không hợp lệ.');
    }
    const createdAt = this.serverNow();
    const expiresAt = new Date(createdAt.getTime() + input.expiresInMinutes * 60_000);
    const issued = issueKioskSecret();
    const session = await this.store.create({
      branchId: input.branchId,
      tokenHash: issued.tokenHash,
      createdByUserId: actor.id,
      deviceName: input.deviceName?.trim(),
      createdAt,
      expiresAt
    });
    return { session, secret: issued.secret };
  }

  list(branchId: number) {
    if (!Number.isSafeInteger(branchId) || branchId <= 0) throw ApiError.badRequest('Chi nhánh không hợp lệ.');
    return this.store.list(branchId);
  }

  async revoke(id: number, actor: { id: number }) {
    if (!Number.isSafeInteger(id) || id <= 0) throw ApiError.badRequest('Mã phiên kiosk không hợp lệ.');
    const session = await this.store.revoke(id, actor.id, this.serverNow());
    if (!session) throw ApiError.notFound('Không tìm thấy phiên kiosk.');
    return session;
  }
}

type PrismaKioskSessionRecord = {
  id: number;
  branchId: number;
  branch: { code: string };
  deviceName: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

function toPublicSession(record: PrismaKioskSessionRecord): KioskSessionPublicDto {
  return {
    id: record.id,
    branchId: record.branchId,
    branchCode: record.branch.code,
    deviceName: record.deviceName,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt
  };
}

export class PrismaAttendanceKioskAdminStore implements AttendanceKioskAdminStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(record: CreateKioskSessionRecord): Promise<KioskSessionPublicDto> {
    return this.prisma.$transaction(async tx => {
      const branch = await tx.branch.findFirst({ where: { id: record.branchId, isActive: true }, select: { id: true } });
      if (!branch) throw ApiError.badRequest('Chi nhánh không tồn tại hoặc đang ngừng hoạt động.');
      const created = await tx.attendanceKioskSession.create({
        data: record,
        include: { branch: { select: { code: true } } }
      });
      await AuditService.logInTransaction(tx, {
        action: 'ATTENDANCE_KIOSK_SESSION_CREATED',
        targetType: 'AttendanceKioskSession',
        targetId: created.id,
        actorId: record.createdByUserId,
        metadata: { branchId: record.branchId, expiresAt: record.expiresAt.toISOString(), deviceName: record.deviceName ?? null }
      });
      return toPublicSession(created);
    });
  }

  async list(branchId: number): Promise<KioskSessionPublicDto[]> {
    const sessions = await this.prisma.attendanceKioskSession.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, branchId: true, branch: { select: { code: true } }, deviceName: true,
        createdAt: true, expiresAt: true, revokedAt: true, lastUsedAt: true
      }
    });
    return sessions.map(toPublicSession);
  }

  async revoke(id: number, actorId: number, revokedAt: Date): Promise<KioskSessionPublicDto | null> {
    return this.prisma.$transaction(async tx => {
      const current = await tx.attendanceKioskSession.findUnique({
        where: { id },
        include: { branch: { select: { code: true } } }
      });
      if (!current) return null;
      if (!current.revokedAt) {
        const result = await tx.attendanceKioskSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt } });
        if (result.count > 0) {
          await AuditService.logInTransaction(tx, {
            action: 'ATTENDANCE_KIOSK_SESSION_REVOKED',
            targetType: 'AttendanceKioskSession',
            targetId: id,
            actorId,
            metadata: { branchId: current.branchId, revokedAt: revokedAt.toISOString() }
          });
        }
      }
      const updated = await tx.attendanceKioskSession.findUnique({
        where: { id },
        include: { branch: { select: { code: true } } }
      });
      return updated ? toPublicSession(updated) : null;
    });
  }
}
