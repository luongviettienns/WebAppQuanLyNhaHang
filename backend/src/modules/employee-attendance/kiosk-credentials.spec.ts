import { describe, expect, it } from 'vitest';
import { hashKioskSecret, issueKioskSecret, kioskSecretMatches } from './kiosk-credentials';

describe('kiosk credential helpers', () => {
  it('issues a high-entropy secret once and exposes only a SHA-256 database hash', () => {
    const first = issueKioskSecret();
    const second = issueKioskSecret();

    expect(first.secret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first.secret).not.toBe(second.secret);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toContain(first.secret);
    expect(first.tokenHash).toBe(hashKioskSecret(first.secret));
  });

  it('verifies valid secrets and rejects a different secret or malformed stored hash', () => {
    const issued = issueKioskSecret();

    expect(kioskSecretMatches(issued.secret, issued.tokenHash)).toBe(true);
    expect(kioskSecretMatches(`${issued.secret}x`, issued.tokenHash)).toBe(false);
    expect(kioskSecretMatches(issued.secret, 'not-a-sha256-hash')).toBe(false);
    expect(kioskSecretMatches('', issued.tokenHash)).toBe(false);
  });

  it('requires a non-empty kiosk secret before hashing', () => {
    expect(() => hashKioskSecret('')).toThrow(/secret/i);
  });
});
