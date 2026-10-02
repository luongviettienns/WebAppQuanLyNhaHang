import { describe, expect, it } from 'vitest';
import {
  assertPostingTimePolicy,
  assertVndAmount,
  amountReceivedAfterCredit,
  manualSourceKey,
  requiredAccountType,
  signedAmount,
  sourceTransactionKey
} from './cashbook.domain';

describe('cashbook money domain', () => {
  it('counts only new money after an already-paid deposit credit', () => {
    expect(amountReceivedAfterCredit(1_000_000, 250_000)).toBe(750_000);
    expect(amountReceivedAfterCredit(1_000_000, 1_000_000)).toBe(0);
    expect(() => amountReceivedAfterCredit(1_000_000, 1_000_001)).toThrow();
  });

  it('accepts only positive whole VND amounts within the voucher limit', () => {
    expect(assertVndAmount(1)).toBe(1);
    expect(assertVndAmount(2_000_000_000)).toBe(2_000_000_000);
    expect(() => assertVndAmount(0)).toThrow();
    expect(() => assertVndAmount(-1)).toThrow();
    expect(() => assertVndAmount(1.25)).toThrow();
    expect(() => assertVndAmount(2_000_000_001)).toThrow();
  });

  it('requires a compatible financial account for each payment method', () => {
    expect(requiredAccountType('CASH')).toBe('CASH');
    expect(requiredAccountType('BANK_TRANSFER')).toBe('BANK');
    expect(requiredAccountType('CREDIT_CARD')).toBe('BANK');
    expect(requiredAccountType('E_WALLET')).toBe('E_WALLET');
  });

  it('signs receipts positive and payments negative without accepting invalid amounts', () => {
    expect(signedAmount('RECEIPT', 125_000)).toBe(125_000);
    expect(signedAmount('PAYMENT', 125_000)).toBe(-125_000);
    expect(() => signedAmount('PAYMENT', 0)).toThrow();
  });

  it('keys automatic postings by the immutable money transaction, not its parent document', () => {
    expect(sourceTransactionKey('ORDER_PAYMENT', 41)).toBe('ORDER_PAYMENT:41');
    expect(sourceTransactionKey('ORDER_PAYMENT', 42)).toBe('ORDER_PAYMENT:42');
    expect(() => sourceTransactionKey('ORDER_PAYMENT', 0)).toThrow();
    expect(() => sourceTransactionKey('ORDER_PAYMENT', 1.5)).toThrow();
  });

  it('keeps the same manual idempotency key scoped to its actor', () => {
    expect(manualSourceKey(7, 'retry-01')).toBe('MANUAL:7:retry-01');
    expect(manualSourceKey(7, 'retry-01')).toBe(manualSourceKey(7, 'retry-01'));
    expect(manualSourceKey(8, 'retry-01')).not.toBe(manualSourceKey(7, 'retry-01'));
    expect(() => manualSourceKey(0, 'retry-01')).toThrow();
    expect(() => manualSourceKey(7, '   ')).toThrow();
  });

  it('rejects future and pre-activation posting times for every role', () => {
    const now = new Date('2026-10-02T10:00:00.000Z');
    const activatedAt = new Date('2026-10-01T00:00:00.000Z');

    expect(() => assertPostingTimePolicy({ role: 'ADMIN', occurredAt: new Date('2026-10-02T10:01:00.000Z'), now, activatedAt, reason: 'late entry' })).toThrow();
    expect(() => assertPostingTimePolicy({ role: 'ADMIN', occurredAt: new Date('2026-09-30T23:59:59.999Z'), now, activatedAt, reason: 'late entry' })).toThrow();
  });

  it('requires server time for Cashier and a reason for Admin backdating', () => {
    const now = new Date('2026-10-02T10:00:00.000Z');
    const activatedAt = new Date('2026-10-01T00:00:00.000Z');
    const yesterday = new Date('2026-10-01T09:00:00.000Z');

    expect(() => assertPostingTimePolicy({ role: 'CASHIER', occurredAt: yesterday, now, activatedAt })).toThrow();
    expect(() => assertPostingTimePolicy({ role: 'ADMIN', occurredAt: yesterday, now, activatedAt })).toThrow();
    expect(() => assertPostingTimePolicy({ role: 'ADMIN', occurredAt: yesterday, now, activatedAt, reason: 'Đối chiếu chứng từ giấy' })).not.toThrow();
    expect(() => assertPostingTimePolicy({ role: 'CASHIER', occurredAt: now, now, activatedAt })).not.toThrow();
  });
});
