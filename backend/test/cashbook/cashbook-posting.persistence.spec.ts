import { CashVoucherDirection, CashVoucherSourceType, Prisma, type CashVoucher } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { calculateChronologicalBalances } from '../../src/modules/cashbook/cashbook-balance.service';
import { CashbookPostingService } from '../../src/modules/cashbook/cashbook-posting.service';

describe('cashbook chronological balance invariants', () => {
  it('places a new voucher after existing vouchers at the same timestamp', () => {
    const at = new Date('2026-10-01T10:00:00.000Z');
    expect(calculateChronologicalBalances(0, [
      { id: 1, occurredAt: at, direction: 'RECEIPT', amount: 100 },
      { id: 2, occurredAt: at, direction: 'PAYMENT', amount: 100 },
      { id: Number.MAX_SAFE_INTEGER, occurredAt: at, direction: 'RECEIPT', amount: 30 }
    ])).toEqual([100, 0, 30]);
  });

  it('rejects a backdated receipt reversal that makes a later balance negative', () => {
    const at = new Date('2026-10-01T10:00:00.000Z');
    const later = new Date('2026-10-02T10:00:00.000Z');
    expect(() => calculateChronologicalBalances(0, [
      { id: 1, occurredAt: at, direction: 'RECEIPT', amount: 100 },
      { id: 2, occurredAt: later, direction: 'PAYMENT', amount: 80 },
      { id: Number.MAX_SAFE_INTEGER, occurredAt: at, direction: 'PAYMENT', amount: 30 }
    ])).toThrow(/âm/i);
  });

  it('locks the account before reading the ledger and inserts one stable manual voucher', async () => {
    const occurredAt = new Date('2026-10-01T10:00:00.000Z');
    const lock = vi.fn().mockResolvedValue([]);
    const ledgerRead = vi.fn().mockResolvedValue([]);
    const create = vi.fn().mockResolvedValue({ id: 9 } as unknown as CashVoucher);
    const tx = {
      $queryRaw: lock,
      cashbookSetting: { findUnique: vi.fn().mockResolvedValue({ activatedAt: new Date('2026-09-01T00:00:00.000Z') }) },
      financialAccount: { findUnique: vi.fn().mockResolvedValue({ id: 1, type: 'CASH', isActive: true, openingBalance: 0, openingAt: new Date('2026-09-01T00:00:00.000Z') }) },
      cashFlowCategory: { findUnique: vi.fn().mockResolvedValue({ id: 2, direction: 'RECEIPT', isActive: true, isSystem: false, affectsBusinessResultDefault: true }) },
      cashVoucher: { findUnique: vi.fn().mockResolvedValue(null), findMany: ledgerRead, create }
    } as unknown as Prisma.TransactionClient;

    await CashbookPostingService.post(tx, {
      direction: CashVoucherDirection.RECEIPT, amount: 500, accountId: 1, categoryId: 2,
      occurredAt, sourceType: CashVoucherSourceType.MANUAL, clientRequestId: 'retry-abc', note: 'Thu khác', reason: 'Chứng từ về trễ'
    }, { id: 7, role: 'ADMIN' });

    expect(lock).toHaveBeenCalledOnce();
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(ledgerRead.mock.invocationCallOrder[0]);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][0].data).toMatchObject({ sourceKey: 'MANUAL:7:retry-abc', sourceType: 'MANUAL', amount: 500 });
  });

  it('does not write when a backdated posting makes a later running balance negative', async () => {
    const occurredAt = new Date('2026-10-01T10:00:00.000Z');
    const later = new Date('2026-10-02T10:00:00.000Z');
    const create = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      cashbookSetting: { findUnique: vi.fn().mockResolvedValue({ activatedAt: new Date('2026-09-01T00:00:00.000Z') }) },
      financialAccount: { findUnique: vi.fn().mockResolvedValue({ id: 1, type: 'CASH', isActive: true, openingBalance: 0, openingAt: new Date('2026-09-01T00:00:00.000Z') }) },
      cashFlowCategory: { findUnique: vi.fn().mockResolvedValue({ id: 3, direction: 'PAYMENT', isActive: true, isSystem: false, affectsBusinessResultDefault: false }) },
      cashVoucher: {
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([{ id: 5, occurredAt: later, direction: 'RECEIPT', amount: 100 }]),
        create
      }
    } as unknown as Prisma.TransactionClient;

    await expect(CashbookPostingService.post(tx, {
      direction: CashVoucherDirection.PAYMENT, amount: 120, accountId: 1, categoryId: 3,
      occurredAt, sourceType: CashVoucherSourceType.MANUAL, clientRequestId: 'retry-negative', reason: 'Hạch toán bổ sung'
    }, { id: 7, role: 'ADMIN' })).rejects.toMatchObject({ code: 'CASHBOOK_NEGATIVE_BALANCE' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects reversing a receipt that has already been spent', async () => {
    const receiptAt = new Date(Date.now() - 60_000);
    const spentAt = new Date(Date.now() - 30_000);
    const original = {
      id: 11, accountId: 1, direction: CashVoucherDirection.RECEIPT, amount: 100, status: 'POSTED',
      sourceType: CashVoucherSourceType.MANUAL
    } as unknown as CashVoucher;
    const create = vi.fn();
    const findUnique = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(null);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      financialAccount: { findUnique: vi.fn().mockResolvedValue({ openingBalance: 0, openingAt: new Date('2026-09-01T00:00:00.000Z') }) },
      cashVoucher: {
        findUnique,
        findMany: vi.fn().mockResolvedValue([
          { id: 11, occurredAt: receiptAt, direction: 'RECEIPT', amount: 100 },
          { id: 12, occurredAt: spentAt, direction: 'PAYMENT', amount: 90 }
        ]),
        create
      }
    } as unknown as Prisma.TransactionClient;

    await expect(CashbookPostingService.reverseManualVoucher(tx, 11, { id: 7, role: 'ADMIN' }, 'Hủy phiếu thu'))
      .rejects.toMatchObject({ code: 'CASHBOOK_NEGATIVE_BALANCE' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a second reversal of the same original voucher', async () => {
    const original = {
      id: 11, accountId: 1, direction: CashVoucherDirection.PAYMENT, amount: 100, status: 'POSTED',
      sourceType: CashVoucherSourceType.MANUAL
    } as unknown as CashVoucher;
    const create = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      cashVoucher: {
        findUnique: vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce({ id: 12 }),
        create
      }
    } as unknown as Prisma.TransactionClient;

    await expect(CashbookPostingService.reverseManualVoucher(tx, 11, { id: 7, role: 'ADMIN' }, 'Hủy phiếu chi'))
      .rejects.toMatchObject({ code: 'CASHBOOK_REVERSAL_ALREADY_EXISTS' });
    expect(create).not.toHaveBeenCalled();
  });
});
