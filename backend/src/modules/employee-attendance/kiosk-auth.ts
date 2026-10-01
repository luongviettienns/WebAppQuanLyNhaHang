import type { Request, RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../../lib/api-error';
import { hashKioskSecret } from './kiosk-credentials';

export interface KioskSessionAuthRecord {
  id: number;
  branchId: number;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface KioskSessionLookup {
  findByTokenHash(tokenHash: string): Promise<KioskSessionAuthRecord | null>;
}

export class PrismaKioskSessionLookup implements KioskSessionLookup {
  constructor(private readonly prisma: PrismaClient) {}

  findByTokenHash(tokenHash: string): Promise<KioskSessionAuthRecord | null> {
    return this.prisma.attendanceKioskSession.findUnique({
      where: { tokenHash },
      select: { id: true, branchId: true, expiresAt: true, revokedAt: true }
    });
  }
}

export interface KioskSessionContext {
  id: number;
  branchId: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      attendanceKioskSession?: KioskSessionContext;
    }
  }
}

const ALTERNATE_CREDENTIAL_KEYS = new Set(['credential', 'kioskcredential', 'kiosktoken', 'token']);

function hasAlternateCredentialTransport(request: Request): boolean {
  const hasCredentialKey = (input: unknown): boolean => input !== null && typeof input === 'object'
    && Object.keys(input).some(key => ALTERNATE_CREDENTIAL_KEYS.has(key.toLowerCase()));
  return hasCredentialKey(request.query) || hasCredentialKey(request.params) || hasCredentialKey(request.body);
}

function readKioskCredential(request: Request): string {
  const credential = request.header('x-kiosk-credential');
  if (hasAlternateCredentialTransport(request) || typeof credential !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(credential)) {
    throw ApiError.unauthorized('Phiên kiosk không hợp lệ.', 'KIOSK_SESSION_INVALID');
  }
  return credential;
}

export function createKioskSessionAuthentication(
  lookup: KioskSessionLookup,
  serverNow: () => Date = () => new Date()
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const credential = readKioskCredential(request);
      const session = await lookup.findByTokenHash(hashKioskSecret(credential));
      if (!session) throw ApiError.unauthorized('Phiên kiosk không hợp lệ.', 'KIOSK_SESSION_INVALID');
      if (session.revokedAt) throw ApiError.unauthorized('Phiên kiosk đã bị thu hồi.', 'KIOSK_SESSION_REVOKED');
      if (session.expiresAt.getTime() <= serverNow().getTime()) {
        throw ApiError.unauthorized('Phiên kiosk đã hết hạn.', 'KIOSK_SESSION_EXPIRED');
      }
      request.attendanceKioskSession = { id: session.id, branchId: session.branchId };
      next();
    } catch (error) {
      next(error);
    }
  };
}
