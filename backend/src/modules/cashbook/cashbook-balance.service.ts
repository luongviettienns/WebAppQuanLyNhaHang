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
    const account = await tx.financialAccount.findUnique({
      where: { id: accountId }, select: { openingBalance: true, openingAt: true }
    });
    if (!account) throw ApiError.notFound('Không tìm thấy tài khoản quỹ.', 'CASHBOOK_ACCOUNT_NOT_FOUND');
    if (occurredAt < account.openingAt) {
      throw new ApiError(422, 'CASHBOOK_BEFORE_OPENING', 'Thời điểm phát sinh sớm hơn ngày bắt đầu số dư tài khoản.');
    }
    const vouchers = await tx.cashVoucher.findMany({
      where: { accountId, occurredAt: { gte: account.openingAt } },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: { id: true, occurredAt: true, direction: true, amount: true }
    });
    const candidate: ChronologicalVoucher = {
      id: Number.MAX_SAFE_INTEGER,
      occurredAt,
      direction: delta >= 0 ? 'RECEIPT' : 'PAYMENT',
      amount: Math.abs(delta)
    };
    const all = [...vouchers as ChronologicalVoucher[], candidate].sort((left, right) =>
      left.occurredAt.getTime() - right.occurredAt.getTime() || left.id - right.id
    );
    calculateChronologicalBalances(account.openingBalance, all);
  }
}
