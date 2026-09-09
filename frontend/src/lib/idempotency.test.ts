import { describe, it, expect } from 'vitest';
import { IdempotencyKeyStore } from './idempotency';

describe('IdempotencyKeyStore', () => {
  it('keeps a key across retries of the same payload and rotates it after success', () => {
    let sequence = 0;
    const store = new IdempotencyKeyStore(() => `key-${++sequence}`);
    const first = store.get('same-payload');

    expect(store.get('same-payload')).toBe(first);

    store.complete(first);
    expect(store.get('same-payload')).not.toBe(first);
  });

  it('uses a new key when the order payload changes', () => {
    let sequence = 0;
    const store = new IdempotencyKeyStore(() => `key-${++sequence}`);

    expect(store.get('payload-a')).not.toBe(store.get('payload-b'));
  });
});
