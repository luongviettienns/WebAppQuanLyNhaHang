import { describe, expect, it, vi } from 'vitest';
import { createKioskCredentialStore } from './kioskCredentialStore';

describe('kiosk credential store', () => {
  it('restores, replaces, and clears only the device credential', async () => {
    let value: string | null = null;
    const storage = {
      getItem: vi.fn(async () => value),
      setItem: vi.fn(async (_key: string, next: string) => { value = next; }),
      removeItem: vi.fn(async () => { value = null; })
    };
    const store = createKioskCredentialStore(storage);

    expect(await store.load()).toBeNull();
    await store.save('opaque-kiosk-secret');
    expect(await store.load()).toBe('opaque-kiosk-secret');
    await store.save('rotated-kiosk-secret');
    expect(await store.load()).toBe('rotated-kiosk-secret');
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem.mock.calls[0][0]).toBe('attendance-kiosk-credential-v1');
  });

  it('does not persist a blank credential', async () => {
    const storage = { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() };
    const store = createKioskCredentialStore(storage);

    await expect(store.save('   ')).rejects.toThrow('Mã phiên kiosk không được để trống.');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
