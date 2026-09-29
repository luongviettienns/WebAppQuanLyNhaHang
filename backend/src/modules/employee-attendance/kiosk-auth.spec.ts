import type { Request, Response, NextFunction } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createKioskSessionAuthentication, type KioskSessionLookup } from './kiosk-auth';
import { hashKioskSecret } from './kiosk-credentials';

const secret = 'a'.repeat(43);
const now = new Date('2026-09-29T10:00:00.000Z');

function makeRequest(input: { header?: string; query?: Record<string, unknown>; params?: Record<string, unknown>; body?: unknown } = {}) {
  return {
    header: vi.fn((name: string) => name.toLowerCase() === 'x-kiosk-credential' ? input.header : undefined),
    query: input.query ?? {},
    params: input.params ?? {},
    body: input.body ?? {}
  } as unknown as Request;
}

function makeResponse() {
  return { locals: {} } as Response;
}

describe('kiosk session authentication', () => {
  it('accepts only a header credential and exposes the minimal branch-bound session context', async () => {
    const lookup: KioskSessionLookup = {
      findByTokenHash: vi.fn().mockResolvedValue({
        id: 9, branchId: 2, expiresAt: new Date('2026-09-29T11:00:00.000Z'), revokedAt: null
      })
    };
    const middleware = createKioskSessionAuthentication(lookup, () => now);
    const request = makeRequest({ header: secret });
    const response = makeResponse();
    const next = vi.fn() as unknown as NextFunction;

    await middleware(request, response, next);

    expect(lookup.findByTokenHash).toHaveBeenCalledWith(hashKioskSecret(secret));
    expect(request.attendanceKioskSession).toEqual({ id: 9, branchId: 2 });
    expect(JSON.stringify(response.locals)).not.toContain(secret);
    expect(next).toHaveBeenCalledWith();
  });

  it('does not accept credentials from query, route params, or body', async () => {
    for (const requestInput of [
      { query: { credential: secret } },
      { params: { credential: secret } },
      { body: { credential: secret } }
    ]) {
      const lookup: KioskSessionLookup = { findByTokenHash: vi.fn() };
      const middleware = createKioskSessionAuthentication(lookup, () => now);
      const next = vi.fn() as unknown as NextFunction;
      await middleware(makeRequest(requestInput), makeResponse(), next);
      expect(lookup.findByTokenHash).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'KIOSK_SESSION_INVALID' }));
    }
  });

  it('rejects unknown, expired, revoked, and malformed credentials without exposing a session', async () => {
    const cases = [
      { record: null, code: 'KIOSK_SESSION_INVALID' },
      { record: { id: 9, branchId: 2, expiresAt: now, revokedAt: null }, code: 'KIOSK_SESSION_EXPIRED' },
      { record: { id: 9, branchId: 2, expiresAt: new Date('2026-09-29T11:00:00.000Z'), revokedAt: now }, code: 'KIOSK_SESSION_REVOKED' }
    ];

    for (const testCase of cases) {
      const lookup: KioskSessionLookup = { findByTokenHash: vi.fn().mockResolvedValue(testCase.record) };
      const middleware = createKioskSessionAuthentication(lookup, () => now);
      const request = makeRequest({ header: secret });
      const next = vi.fn() as unknown as NextFunction;
      await middleware(request, makeResponse(), next);
      expect(request.attendanceKioskSession).toBeUndefined();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: testCase.code }));
    }

    const lookup: KioskSessionLookup = { findByTokenHash: vi.fn() };
    const next = vi.fn() as unknown as NextFunction;
    await createKioskSessionAuthentication(lookup, () => now)(makeRequest({ header: 'x'.repeat(513) }), makeResponse(), next);
    expect(lookup.findByTokenHash).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'KIOSK_SESSION_INVALID' }));
  });
});
