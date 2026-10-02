import type { Prisma } from '@prisma/client';
import { ApiError } from '../../lib/api-error';

export interface ChronologicalVoucher {
  id: number;
  occurredAt: Date;
  direction: 'RECEIPT' | 'PAYMENT';
  amount: number;
}

export function calculateChronologicalBalances(openingBalance: number, vouchers: ChronologicalVoucher[]): number[] {
  let balance = openingBalance;
  const balances: number[] = [];
  for (const voucher of vouchers) {
    balance += voucher.direction === 'RECEIPT' ? voucher.amount : -voucher.amount;
    if (balance < 0) throw ApiError.conflict('Giao dịch làm số dư quỹ bị âm tại một thời điểm.', 'CASHBOOK_NEGATIVE_BALANCE');
    balances.push(balance);
  }
  return balances;
}

export class CashbookBalanceService {
  static async balanceAt(tx: Prisma.TransactionClient, accountId: number, at: Date): Promise<number> {
    const account = await tx.financialAccount.findUnique({
      where: { id: accountId }, select: { openingBalance: true, openingAt: true }
    });
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản quỹ.', 'CASHBOOK_ACCOUNT_NOT_FOUND');
    if (at < account.openingAt) return 0;
    const vouchers = await tx.cashVoucher.findMany({
      where: { accountId, occurredAt: { gte: account.openingAt, lte: at } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: { id: true, occurredAt: true, direction: true, amount: true }
    });
    const balances = calculateChronologicalBalances(account.openingBalance, vouchers as ChronologicalVoucher[]);
    return balances[balances.length - 1] ?? account.openingBalance;
  }

  static async assertDeltaPreservesRunningBalance(
    tx: Prisma.TransactionClient, accountId: number, occurredAt: Date, delta: number
  ): Promise<void> {
    // This must be a locking/current read: posting transactions may have established a
    // REPEATABLE READ snapshot before waiting for the account lock in CashbookPostingService.
    const accounts = await tx.$queryRaw<Array<{ openingBalance: number; openingAt: Date }>>`
      SELECT openingBalance, openingAt
      FROM FinancialAccount
      WHERE id = ${accountId}
      FOR UPDATE
    `;
    const account = accounts[0];
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản quỹ.', 'CASHBOOK_ACCOUNT_NOT_FOUND');
    if (occurredAt < account.openingAt) {
      throw new ApiError(422, 'CASHBOOK_BEFORE_OPENING', 'Thời điểm phát sinh sớm hơn ngày bắt đầu số dư tài khoản.');
    }
    // A normal Prisma SELECT would keep using the transaction's older snapshot even after
    // the account lock is granted. FOR UPDATE reads the latest committed ledger rows.
    const vouchers = await tx.$queryRaw<ChronologicalVoucher[]>`
      SELECT id, occurredAt, direction, amount
      FROM CashVoucher
      WHERE accountId = ${accountId} AND occurredAt >= ${account.openingAt}
      ORDER BY occurredAt ASC, id ASC
      FOR UPDATE
    `;
    const candidate: ChronologicalVoucher = {
      id: Number.MAX_SAFE_INTEGER,
      occurredAt,
      direction: delta >= 0 ? 'RECEIPT' : 'PAYMENT',
      amount: Math.abs(delta)
    };
    const all = [...vouchers, candidate].sort((left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime() || left.id - right.id
    );
    calculateChronologicalBalances(account.openingBalance, all);
  }
}
