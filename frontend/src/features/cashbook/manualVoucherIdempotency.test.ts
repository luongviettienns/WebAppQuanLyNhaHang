import { describe, expect, it } from 'vitest';
import { ManualVoucherIdempotency } from './manualVoucherIdempotency';

describe('manual voucher idempotency', () => {
  it('keeps the same key after failure/retry and rotates only on success', () => {
    let count = 0;
    const keys = new ManualVoucherIdempotency(() => `key-${++count}`);
    const input = { direction: 'PAYMENT', amount: 1200, accountId: 1, categoryId: 4 };
    const first = keys.get(input);
    expect(keys.get(input)).toBe(first);
    expect(keys.get({ ...input, amount: 1300 })).not.toBe(first);
    keys.complete(keys.get({ ...input, amount: 1300 }));
    expect(keys.get({ ...input, amount: 1300 })).not.toBe(first);
  });

  it('retains a failed request key when asking again with unchanged data', () => {
    let count = 0;
    const keys = new ManualVoucherIdempotency(() => `key-${++count}`);
    const input = { direction: 'RECEIPT', amount: 500, accountId: 1, categoryId: 3 };
    expect(keys.get(input)).toBe(keys.get(input));
  });
});
