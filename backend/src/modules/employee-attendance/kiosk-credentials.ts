import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const HASH_PATTERN = /^[a-f0-9]{64}$/i;

export interface IssuedKioskSecret {
  /** Returned to the caller only at issuance time. Never persist or log this value. */
  secret: string;
  /** Safe to persist in AttendanceKioskSession.tokenHash. */
  tokenHash: string;
}

export function hashKioskSecret(secret: string): string {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('A kiosk secret is required before hashing.');
  }
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function issueKioskSecret(): IssuedKioskSecret {
  const secret = randomBytes(32).toString('base64url');
  return { secret, tokenHash: hashKioskSecret(secret) };
}

export function kioskSecretMatches(secret: string, expectedHash: string): boolean {
  if (typeof secret !== 'string' || secret.length === 0 || !HASH_PATTERN.test(expectedHash)) return false;
  const actual = Buffer.from(hashKioskSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
