import type { CashflowRecordType, EndOfDayPaymentMethod } from './end-of-day.types';
import { sourceTransactionKey } from '../../cashbook/cashbook.domain';
export interface CashflowCandidate {
  sourceType: CashflowRecordType | 'APPLY_TO_BILL' | 'FORFEIT';
  sourceTransactionId: number | null;
  sourceKey: string;
  status: string;
  occurredAt: string;
  direction: 'RECEIPT' | 'PAYMENT';
  amount: number;
  paymentMethod: EndOfDayPaymentMethod | null;
  documentCode: string;
  customerId: number | null;
  customerName: string | null;
  creatorUserId: number | null;
  creatorUserName: string | null;
  accountId: number | null;
  accountName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  externalReference: string | null;
  cashVoucherId: number | null;
  reversalOfId: number | null;
  refundCompletedAt?: string | null;
}
export interface CashflowEvent extends Omit<CashflowCandidate, 'status' | 'sourceKey' | 'sourceType'> {
  sourceType: CashflowRecordType;
  key: string;
  reconciliationStatus: 'RECONCILED' | 'UNRECONCILED';
  /** Actual OrderReturn.completedAt only; never a voucher-time fallback. */
  refundCompletedAt: string | null;
}
export function canonicalMoneyEventKey(sourceType: CashflowRecordType, sourceTransactionId: number): string {
  return sourceTransactionKey(sourceType, sourceTransactionId);
}

function keyOf(candidate: CashflowCandidate): string {
  return candidate.sourceTransactionId !== null && candidate.sourceType !== 'MANUAL'
    ? canonicalMoneyEventKey(candidate.sourceType as CashflowRecordType, candidate.sourceTransactionId)
    : candidate.sourceKey;
}

/** Also used by the SQL adapter at its JSON boundary. Amount is signed exactly once. */
export function toCashflowEvent(candidate: CashflowCandidate, reconciled: boolean): CashflowEvent {
  return { sourceType: candidate.sourceType as CashflowRecordType, key: keyOf(candidate),
    sourceTransactionId: candidate.sourceTransactionId, occurredAt: candidate.occurredAt,
    direction: candidate.direction, paymentMethod: candidate.paymentMethod, documentCode: candidate.documentCode,
    customerId: candidate.customerId, customerName: candidate.customerName,
    creatorUserId: candidate.creatorUserId, creatorUserName: candidate.creatorUserName,
    accountId: candidate.accountId, accountName: candidate.accountName,
    categoryId: candidate.categoryId, categoryName: candidate.categoryName,
    externalReference: candidate.externalReference, cashVoucherId: candidate.cashVoucherId, reversalOfId: candidate.reversalOfId,
    refundCompletedAt: candidate.refundCompletedAt ?? null,
    amount: (candidate.direction === 'RECEIPT' ? 1 : -1) * Math.abs(candidate.amount),
    reconciliationStatus: reconciled ? 'RECONCILED' : 'UNRECONCILED' };
}

/** Pure reference registry. The adapter applies these rules in SQL before filtering/pagination. */
export function buildCashflowRegistry(domains: CashflowCandidate[], vouchers: CashflowCandidate[]): CashflowEvent[] {
  const events = new Map<string, CashflowEvent>();
  const nonCashReservationKeys = new Set<string>();
  for (const domain of domains) {
    if ((domain.sourceType === 'APPLY_TO_BILL' || domain.sourceType === 'FORFEIT') && domain.sourceTransactionId !== null) {
      nonCashReservationKeys.add(canonicalMoneyEventKey('RESERVATION_DEPOSIT', domain.sourceTransactionId));
      nonCashReservationKeys.add(canonicalMoneyEventKey('RESERVATION_REFUND', domain.sourceTransactionId));
    }
    const isReturn = domain.sourceType === 'SALES_RETURN_REFUND';
    if (!['ORDER_PAYMENT', 'RESERVATION_DEPOSIT', 'RESERVATION_REFUND', 'SALES_RETURN_REFUND'].includes(domain.sourceType)
      || domain.status !== (isReturn ? 'COMPLETED' : 'SUCCESS') || (isReturn && domain.amount <= 0)) continue;
    const event = toCashflowEvent({ ...domain, refundCompletedAt: isReturn ? domain.occurredAt : null }, false);
    if (!events.has(event.key)) events.set(event.key, event);
  }
  // Choose the lowest ledger identity if historical data contains several links to one transaction.
  for (const voucher of [...vouchers].sort((a, b) => (a.cashVoucherId ?? 0) - (b.cashVoucherId ?? 0))) {
    if (voucher.status !== 'POSTED') continue;
    const key = keyOf(voucher);
    if ((voucher.sourceType === 'RESERVATION_DEPOSIT' || voucher.sourceType === 'RESERVATION_REFUND')
      && (nonCashReservationKeys.has(key) || nonCashReservationKeys.has(voucher.sourceKey))) continue;
    const domain = events.get(key) ?? events.get(voucher.sourceKey);
    if (domain) {
      if (domain.reconciliationStatus === 'RECONCILED') continue;
      events.set(domain.key, { ...domain, cashVoucherId: voucher.cashVoucherId,
        accountId: voucher.accountId, accountName: voucher.accountName,
        categoryId: voucher.categoryId, categoryName: voucher.categoryName,
        reconciliationStatus: 'RECONCILED' });
    } else if (!events.has(key)) events.set(key, toCashflowEvent(voucher, true));
  }
  return [...events.values()];
}
