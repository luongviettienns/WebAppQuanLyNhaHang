import { describe, expect, it, vi } from 'vitest';
import {
  EmployeeAttendanceKioskAdminService,
  type AttendanceKioskAdminStore,
  type KioskSessionPublicDto
} from './kiosk-session.service';

const publicSession: KioskSessionPublicDto = {
  id: 12,
  branchId: 1,
  branchCode: 'MAIN',
  deviceName: 'Quầy lễ tân',
  createdAt: new Date('2026-09-29T10:00:00.000Z'),
  expiresAt: new Date('2026-09-29T11:00:00.000Z'),
  revokedAt: null,
  lastUsedAt: null
};

function makeStore(): AttendanceKioskAdminStore {
  return {
    create: vi.fn().mockResolvedValue(publicSession),
    list: vi.fn().mockResolvedValue([publicSession]),
    revoke: vi.fn().mockResolvedValue({ ...publicSession, revokedAt: new Date('2026-09-29T10:30:00.000Z') })
  };
}

describe('employee attendance kiosk admin service', () => {
  it('returns a new secret once while persisting only its hash and server-calculated expiry', async () => {
    const store = makeStore();
    const now = new Date('2026-09-29T10:00:00.000Z');
    const service = new EmployeeAttendanceKioskAdminService(store, () => now);

    const result = await service.create({ branchId: 1, expiresInMinutes: 60, deviceName: 'Quầy lễ tân' }, { id: 4 });

    expect(result.session).toEqual(publicSession);
    expect(result.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({
      branchId: 1,
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      createdByUserId: 4,
      createdAt: now,
      expiresAt: new Date('2026-09-29T11:00:00.000Z')
    }));
    expect(JSON.stringify(await service.list(1))).not.toContain(result.secret);
  });

  it('rejects invalid durations and requires a session ID to revoke', async () => {
    const store = makeStore();
    const service = new EmployeeAttendanceKioskAdminService(store, () => new Date('2026-09-29T10:00:00.000Z'));

    await expect(service.create({ branchId: 1, expiresInMinutes: 14 }, { id: 4 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.revoke(0, { id: 4 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(store.create).not.toHaveBeenCalled();
    expect(store.revoke).not.toHaveBeenCalled();
  });

  it('returns not found when revoking an unknown session', async () => {
    const store = makeStore();
    vi.mocked(store.revoke).mockResolvedValue(null);
    const service = new EmployeeAttendanceKioskAdminService(store);

    await expect(service.revoke(900, { id: 4 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
