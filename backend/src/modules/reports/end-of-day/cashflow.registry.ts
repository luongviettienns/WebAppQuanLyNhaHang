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
  if (candidate.sourceType === 'MANUAL' || candidate.sourceType === 'REVERSAL') return candidate.sourceKey;
  const id = candidate.sourceTransactionId ?? stableTransactionId(candidate);
  return id !== null ? canonicalMoneyEventKey(candidate.sourceType as CashflowRecordType, id)
    : `${candidate.sourceType}:VOUCHER:${candidate.cashVoucherId}`;
}

/** Exact canonical integer key only; legacy text and zero-padded IDs are not domain links. */
function stableTransactionId(candidate: CashflowCandidate): number | null {
  const match = new RegExp(`^${candidate.sourceType}:([1-9][0-9]{0,9})$`).exec(candidate.sourceKey);
  const id = match ? Number(match[1]) : null;
  return id !== null && id <= 2_147_483_647 ? id : null;
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
  const targets = new Map<string, CashflowCandidate>();
  for (const domain of domains) {
    if (domain.sourceTransactionId !== null) {
      if (['RESERVATION_DEPOSIT', 'RESERVATION_REFUND', 'APPLY_TO_BILL', 'FORFEIT'].includes(domain.sourceType)) {
        targets.set(canonicalMoneyEventKey('RESERVATION_DEPOSIT', domain.sourceTransactionId), domain);
        targets.set(canonicalMoneyEventKey('RESERVATION_REFUND', domain.sourceTransactionId), domain);
      } else targets.set(canonicalMoneyEventKey(domain.sourceType as CashflowRecordType, domain.sourceTransactionId), domain);
    }
    const isReturn = domain.sourceType === 'SALES_RETURN_REFUND';
    if (!['ORDER_PAYMENT', 'RESERVATION_DEPOSIT', 'RESERVATION_REFUND', 'SALES_RETURN_REFUND'].includes(domain.sourceType)
      || domain.status !== (isReturn ? 'COMPLETED' : 'SUCCESS') || (isReturn && domain.amount <= 0)) continue;
    const event = toCashflowEvent({ ...domain, refundCompletedAt: isReturn ? domain.occurredAt : null }, false);
    if (!events.has(event.key)) events.set(event.key, event);
  }
  const selectedKeys = new Set<string>();
  // Resolve one target first, then choose the lowest ledger identity before any downstream filter.
  for (const voucher of [...vouchers].sort((a, b) => (a.cashVoucherId ?? 0) - (b.cashVoucherId ?? 0))) {
    if (voucher.status !== 'POSTED') continue;
    const independent = voucher.sourceType === 'MANUAL' || voucher.sourceType === 'REVERSAL';
    const stableId = independent ? null : stableTransactionId(voucher);
    const explicitTarget = !independent && voucher.sourceTransactionId !== null
      ? targets.get(canonicalMoneyEventKey(voucher.sourceType as CashflowRecordType, voucher.sourceTransactionId)) : undefined;
    const keyTarget = stableId !== null ? targets.get(canonicalMoneyEventKey(voucher.sourceType as CashflowRecordType, stableId)) : undefined;
    const target = explicitTarget ?? keyTarget;
    const resolved: CashflowCandidate = { ...voucher,
      sourceTransactionId: independent ? voucher.sourceTransactionId : target?.sourceTransactionId ?? voucher.sourceTransactionId ?? stableId };
    const key = keyOf(resolved);
    if (selectedKeys.has(key)) continue;
    selectedKeys.add(key);
    if (target?.sourceType === 'APPLY_TO_BILL' || target?.sourceType === 'FORFEIT') continue;
    const domain = independent ? undefined : events.get(key);
    if (domain) {
      if (domain.reconciliationStatus === 'RECONCILED') continue;
      events.set(domain.key, { ...domain, cashVoucherId: voucher.cashVoucherId,
        accountId: voucher.accountId, accountName: voucher.accountName,
        categoryId: voucher.categoryId, categoryName: voucher.categoryName,
        reconciliationStatus: 'RECONCILED' });
    } else if (!events.has(key)) events.set(key, toCashflowEvent(target ? { ...resolved,
      occurredAt: target.occurredAt, creatorUserId: target.creatorUserId, creatorUserName: target.creatorUserName,
      customerId: target.customerId, customerName: target.customerName,
      refundCompletedAt: voucher.sourceType === 'SALES_RETURN_REFUND' && target.status === 'COMPLETED' && target.amount > 0 ? target.occurredAt : null
    } : resolved, true));
  }
  return [...events.values()];
}
