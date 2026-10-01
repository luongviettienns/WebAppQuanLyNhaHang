import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import { ApiError } from '../../lib/api-error';

export type AttendanceRateLimitBucketType = 'KIOSK_SESSION' | 'ATTENDANCE_CODE' | 'IP_ADDRESS';

export interface AttendanceRateLimitBucket {
  type: AttendanceRateLimitBucketType;
  /** Opaque digest only; source identities must never be stored in the bucket table. */
  bucketHash: string;
}

export interface AttendanceRateLimitIdentities {
  kioskSessionId: number;
  attendanceCode: string;
  ipAddress: string;
}

export interface AttendanceRateLimitPolicy {
  limit: number;
  windowMs: number;
}

export interface AttendanceRateLimitBucketState {
  requestCount: number;
  windowStartedAt: Date;
  expiresAt: Date;
}

/** The implementation must increment/reset a bucket atomically across all server instances. */
export interface AttendanceRateLimitBucketStore {
  increment(bucket: AttendanceRateLimitBucket, now: Date, windowMs: number): Promise<AttendanceRateLimitBucketState>;
}

/** MySQL upsert + row lock keeps counters shared and atomic across backend instances. */
export class PrismaAttendanceRateLimitBucketStore implements AttendanceRateLimitBucketStore {
  constructor(private readonly prisma: PrismaClient) {}

  async increment(bucket: AttendanceRateLimitBucket, now: Date, windowMs: number): Promise<AttendanceRateLimitBucketState> {
    if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('Rate-limit window must be positive.');
    const expiresAt = new Date(now.getTime() + windowMs);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO AttendanceKioskRateLimitBucket
          (bucketHash, bucketType, requestCount, windowStartedAt, expiresAt, createdAt, updatedAt)
        VALUES
          (${bucket.bucketHash}, ${bucket.type}, 1, ${now}, ${expiresAt}, ${now}, ${now})
        ON DUPLICATE KEY UPDATE
          requestCount = IF(expiresAt <= VALUES(windowStartedAt), 1, requestCount + 1),
          expiresAt = IF(requestCount = 1, VALUES(expiresAt), expiresAt),
          windowStartedAt = IF(requestCount = 1, VALUES(windowStartedAt), windowStartedAt),
          updatedAt = VALUES(updatedAt)
      `;
      const rows = await tx.$queryRaw<AttendanceRateLimitBucketState[]>`
        SELECT requestCount, windowStartedAt, expiresAt
        FROM AttendanceKioskRateLimitBucket
        WHERE bucketHash = ${bucket.bucketHash}
        FOR UPDATE
      `;
      const state = rows[0];
      if (!state) throw new Error('Rate-limit bucket upsert did not return a row.');

      // Bound cleanup work per request so the shared bucket table cannot grow without bound.
      await tx.$executeRaw`
        DELETE FROM AttendanceKioskRateLimitBucket
        WHERE expiresAt <= ${now}
        ORDER BY expiresAt
        LIMIT 100
      `;
      return state;
    });
  }
}

export const DEFAULT_ATTENDANCE_RATE_LIMIT_POLICIES: Record<AttendanceRateLimitBucketType, AttendanceRateLimitPolicy> = {
  KIOSK_SESSION: { limit: 120, windowMs: 60_000 },
  ATTENDANCE_CODE: { limit: 5, windowMs: 5 * 60_000 },
  IP_ADDRESS: { limit: 60, windowMs: 5 * 60_000 }
};

function normalizeIdentity(type: AttendanceRateLimitBucketType, identity: string | number): string {
  const normalized = type === 'KIOSK_SESSION'
    ? (Number.isSafeInteger(identity) && Number(identity) > 0 ? String(identity) : '')
    : typeof identity === 'string'
      ? type === 'ATTENDANCE_CODE' ? identity.trim().toUpperCase() : identity.trim().toLowerCase()
      : '';
  if (!normalized) throw new Error(`A valid ${type.toLowerCase()} identity is required.`);
  return normalized;
}

export function deriveRateLimitBucketHash(
  hmacSecret: string,
  type: AttendanceRateLimitBucketType,
  identity: string | number
): string {
  if (typeof hmacSecret !== 'string' || Buffer.byteLength(hmacSecret, 'utf8') < 32) {
    throw new Error('Rate-limit HMAC secret must contain at least 32 bytes.');
  }
  const normalized = normalizeIdentity(type, identity);
  return createHmac('sha256', hmacSecret)
    .update(`${type}\0${normalized}`, 'utf8')
    .digest('hex');
}

export function deriveAttendanceRateLimitBuckets(
  hmacSecret: string,
  identities: AttendanceRateLimitIdentities
): AttendanceRateLimitBucket[] {
  return [
    { type: 'KIOSK_SESSION', bucketHash: deriveRateLimitBucketHash(hmacSecret, 'KIOSK_SESSION', identities.kioskSessionId) },
    { type: 'ATTENDANCE_CODE', bucketHash: deriveRateLimitBucketHash(hmacSecret, 'ATTENDANCE_CODE', identities.attendanceCode) },
    { type: 'IP_ADDRESS', bucketHash: deriveRateLimitBucketHash(hmacSecret, 'IP_ADDRESS', identities.ipAddress) }
  ];
}

export async function enforceAttendanceRateLimit(
  store: AttendanceRateLimitBucketStore,
  buckets: AttendanceRateLimitBucket[],
  now: Date,
  policies: Record<AttendanceRateLimitBucketType, AttendanceRateLimitPolicy> = DEFAULT_ATTENDANCE_RATE_LIMIT_POLICIES
): Promise<void> {
  if (Number.isNaN(now.getTime())) throw new Error('A valid server timestamp is required for rate limiting.');
  if (buckets.length === 0) throw new Error('At least one rate-limit bucket is required.');

  const states = await Promise.all(buckets.map(bucket => {
    const policy = policies[bucket.type];
    if (!policy || !Number.isInteger(policy.limit) || policy.limit < 1 || !Number.isFinite(policy.windowMs) || policy.windowMs <= 0) {
      throw new Error(`A valid rate-limit policy is required for ${bucket.type}.`);
    }
    return store.increment(bucket, now, policy.windowMs).then(state => ({ policy, state }));
  }));

  const blocked = states.filter(({ policy, state }) => state.requestCount > policy.limit);
  if (blocked.length === 0) return;

  const retryAfterSec = Math.max(...blocked.map(({ state }) =>
    Math.max(1, Math.ceil((state.expiresAt.getTime() - now.getTime()) / 1000))));
  throw ApiError.rateLimited('Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.', retryAfterSec);
}

export function createAttendanceRateLimitMiddleware(
  store: AttendanceRateLimitBucketStore,
  hmacSecret: string,
  serverNow: () => Date = () => new Date()
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const kioskSession = request.attendanceKioskSession;
      if (!kioskSession) throw ApiError.unauthorized('Phiên kiosk không hợp lệ.', 'KIOSK_SESSION_INVALID');
      const body = request.body !== null && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
      const attendanceCode = typeof body.attendanceCode === 'string' ? body.attendanceCode : '__INVALID_ATTENDANCE_CODE__';
      const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';
      const buckets = deriveAttendanceRateLimitBuckets(hmacSecret, {
        kioskSessionId: kioskSession.id,
        attendanceCode,
        ipAddress
      });
      await enforceAttendanceRateLimit(store, buckets, serverNow());
      next();
    } catch (error) {
      next(error);
    }
  };
}
