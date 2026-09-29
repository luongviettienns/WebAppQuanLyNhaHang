import { describe, expect, it, vi } from 'vitest';
import {
  createAttendanceRateLimitMiddleware,
  enforceAttendanceRateLimit,
  deriveAttendanceRateLimitBuckets,
  deriveRateLimitBucketHash,
  type AttendanceRateLimitBucket,
  type AttendanceRateLimitBucketStore,
  type AttendanceRateLimitPolicy
} from './attendance-rate-limit';

const secret = 'server-side-rate-limit-secret-with-at-least-32-bytes';

describe('attendance rate-limit bucket derivation', () => {
  it('creates opaque, type-separated HMAC keys for kiosk, attendance code, and IP', () => {
    const buckets = deriveAttendanceRateLimitBuckets(secret, {
      kioskSessionId: 42,
      attendanceCode: ' nv-001 ',
      ipAddress: '192.0.2.10'
    });

    expect(buckets.map(bucket => bucket.type)).toEqual(['KIOSK_SESSION', 'ATTENDANCE_CODE', 'IP_ADDRESS']);
    expect(buckets.every(bucket => /^[a-f0-9]{64}$/.test(bucket.bucketHash))).toBe(true);
    expect(JSON.stringify(buckets)).not.toContain('nv-001');
    expect(JSON.stringify(buckets)).not.toContain('192.0.2.10');
  });

  it('normalizes codes for the same employee but separates dimensions and identities', () => {
    expect(deriveRateLimitBucketHash(secret, 'ATTENDANCE_CODE', ' nv-001 '))
      .toBe(deriveRateLimitBucketHash(secret, 'ATTENDANCE_CODE', 'NV-001'));
    expect(deriveRateLimitBucketHash(secret, 'ATTENDANCE_CODE', 'NV-001'))
      .not.toBe(deriveRateLimitBucketHash(secret, 'IP_ADDRESS', 'NV-001'));
    expect(deriveRateLimitBucketHash(secret, 'ATTENDANCE_CODE', 'NV-001'))
      .not.toBe(deriveRateLimitBucketHash(secret, 'ATTENDANCE_CODE', 'NV-002'));
  });

  it('rejects a weak HMAC key, blank identities, and invalid kiosk IDs', () => {
    expect(() => deriveRateLimitBucketHash('weak', 'IP_ADDRESS', '192.0.2.10')).toThrow(/32 bytes/i);
    expect(() => deriveRateLimitBucketHash(secret, 'ATTENDANCE_CODE', '   ')).toThrow(/identity/i);
    expect(() => deriveAttendanceRateLimitBuckets(secret, {
      kioskSessionId: 0,
      attendanceCode: 'NV-001',
      ipAddress: '192.0.2.10'
    })).toThrow(/kiosk/i);
  });
});

class MemoryBucketStore implements AttendanceRateLimitBucketStore {
  private readonly records = new Map<string, { count: number; windowStartedAt: number; expiresAt: number }>();

  async increment(bucket: AttendanceRateLimitBucket, now: Date, windowMs: number) {
    const current = this.records.get(bucket.bucketHash);
    const timestamp = now.getTime();
    const record = !current || current.expiresAt <= timestamp
      ? { count: 1, windowStartedAt: timestamp, expiresAt: timestamp + windowMs }
      : { ...current, count: current.count + 1 };
    this.records.set(bucket.bucketHash, record);
    return { requestCount: record.count, windowStartedAt: new Date(record.windowStartedAt), expiresAt: new Date(record.expiresAt) };
  }
}

const limitedPolicies: Record<AttendanceRateLimitBucket['type'], AttendanceRateLimitPolicy> = {
  KIOSK_SESSION: { limit: 2, windowMs: 60_000 },
  ATTENDANCE_CODE: { limit: 2, windowMs: 300_000 },
  IP_ADDRESS: { limit: 3, windowMs: 300_000 }
};

describe('attendance rate-limit enforcement', () => {
  const buckets: AttendanceRateLimitBucket[] = [
    { type: 'KIOSK_SESSION', bucketHash: 'a'.repeat(64) },
    { type: 'ATTENDANCE_CODE', bucketHash: 'b'.repeat(64) },
    { type: 'IP_ADDRESS', bucketHash: 'c'.repeat(64) }
  ];

  it('allows requests through each bucket threshold and blocks the next request without identifying the bucket', async () => {
    const store = new MemoryBucketStore();
    const now = new Date('2026-09-29T10:00:00.000Z');
    await enforceAttendanceRateLimit(store, buckets, now, limitedPolicies);
    await enforceAttendanceRateLimit(store, buckets, now, limitedPolicies);
    await expect(enforceAttendanceRateLimit(store, buckets, now, limitedPolicies)).rejects.toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      retryAfterSec: 300
    });
  });

  it('resets expired buckets and uses the maximum retry interval when dimensions differ', async () => {
    const store = new MemoryBucketStore();
    const now = new Date('2026-09-29T10:00:00.000Z');
    await enforceAttendanceRateLimit(store, buckets, now, limitedPolicies);
    await enforceAttendanceRateLimit(store, buckets, now, limitedPolicies);
    await expect(enforceAttendanceRateLimit(store, buckets, now, limitedPolicies)).rejects.toBeTruthy();

    await expect(enforceAttendanceRateLimit(store, buckets, new Date(now.getTime() + 300_001), limitedPolicies)).resolves.toBeUndefined();
  });

  it('uses store-atomic increments under concurrent requests at the limit boundary', async () => {
    const store = new MemoryBucketStore();
    const now = new Date('2026-09-29T10:00:00.000Z');
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () =>
      enforceAttendanceRateLimit(store, buckets, now, limitedPolicies)));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(2);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(8);
  });
});

describe('attendance rate-limit middleware', () => {
  it('derives opaque buckets from the kiosk session, submitted code, and request IP', async () => {
    const seen: AttendanceRateLimitBucket[] = [];
    const store: AttendanceRateLimitBucketStore = {
      increment: async (bucket, now, windowMs) => {
        seen.push(bucket);
        return { requestCount: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + windowMs) };
      }
    };
    const request = {
      ip: '192.0.2.10',
      body: { attendanceCode: 'NV-SECRET-09' },
      attendanceKioskSession: { id: 42, branchId: 1 }
    } as never;
    const next = vi.fn();

    await createAttendanceRateLimitMiddleware(store, secret, () => new Date('2026-09-29T10:00:00.000Z'))(request, {} as never, next);

    expect(seen.map(bucket => bucket.type)).toEqual(['KIOSK_SESSION', 'ATTENDANCE_CODE', 'IP_ADDRESS']);
    expect(JSON.stringify(seen)).not.toContain('NV-SECRET-09');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects requests before employee lookup when a bucket is over its limit', async () => {
    const store: AttendanceRateLimitBucketStore = {
      increment: async (bucket, now, windowMs) => ({
        requestCount: bucket.type === 'ATTENDANCE_CODE' ? 6 : 1,
        windowStartedAt: now,
        expiresAt: new Date(now.getTime() + windowMs)
      })
    };
    const request = {
      ip: '192.0.2.10', body: { attendanceCode: 'NV-SECRET-09' },
      attendanceKioskSession: { id: 42, branchId: 1 }
    } as never;
    const next = vi.fn();

    await createAttendanceRateLimitMiddleware(store, secret, () => new Date('2026-09-29T10:00:00.000Z'))(request, {} as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED', retryAfterSec: 300 }));
  });
});

describe('Prisma rate-limit bucket store', () => {
  it('increments and reads the locked bucket inside a transaction, then bounds expired-row cleanup', async () => {
    const { PrismaAttendanceRateLimitBucketStore } = await import('./attendance-rate-limit');
    const state = {
      requestCount: 7,
      windowStartedAt: new Date('2026-09-29T10:00:00.000Z'),
      expiresAt: new Date('2026-09-29T10:05:00.000Z')
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([state])
    };
    const prisma = { $transaction: vi.fn(async callback => callback(tx)) };
    const store = new PrismaAttendanceRateLimitBucketStore(prisma as never);
    const bucket = { type: 'ATTENDANCE_CODE' as const, bucketHash: 'b'.repeat(64) };

    await expect(store.increment(bucket, new Date('2026-09-29T10:00:00.000Z'), 300_000)).resolves.toEqual(state);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.calls[0][0].join(' ')).toMatch(/ON DUPLICATE KEY UPDATE/i);
    expect(tx.$executeRaw.mock.calls[0][0].join(' ')).toMatch(/requestCount = IF\(expiresAt <= VALUES\(windowStartedAt\)/i);
    expect(tx.$queryRaw.mock.calls[0][0].join(' ')).toMatch(/FOR UPDATE/i);
    expect(tx.$executeRaw.mock.calls[1][0].join(' ')).toMatch(/LIMIT 100/i);
  });
});
