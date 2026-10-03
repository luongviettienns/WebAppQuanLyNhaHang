import { Prisma } from '@prisma/client';
import type { EndOfDayFilter, EndOfDayFilterOptions, EndOfDayReportQuery, NormalizedConcernResult } from './end-of-day.types';
import { toCashflowEvent, type CashflowCandidate, type CashflowEvent } from './cashflow.registry';
export interface CashflowBreakdown {
  value: string | number | null;
  label: string;
  totalReceipts: number;
  totalPayments: number;
  netCashFlow: number;
  eventCount: number;
}
export interface CashflowSummary {
  totalReceipts: number;
  totalPayments: number;
  netCashFlow: number;
  unreconciledCount: number;
  byPaymentMethod: CashflowBreakdown[];
  byAccount: CashflowBreakdown[];
  byCategory: CashflowBreakdown[];
  bySource: CashflowBreakdown[];
}
type SqlNumber = number | bigint | Prisma.Decimal;
type SqlEvent = Omit<CashflowCandidate, 'occurredAt' | 'amount' | 'refundCompletedAt'> & {
  occurredAt: Date; amount: SqlNumber; reconciled: SqlNumber; refundCompletedAt: Date | null;
};
type SqlTotals = Record<'totalRows' | 'totalReceipts' | 'totalPayments' | 'unreconciledCount' | 'receiptCount' | 'paymentCount' | 'suppressedNonCashReservationVoucherCount', SqlNumber>;
type SqlBreakdown = Omit<CashflowBreakdown, 'totalReceipts' | 'totalPayments' | 'eventCount' | 'netCashFlow'> & {
  dimension: 'byPaymentMethod' | 'byAccount' | 'byCategory' | 'bySource';
  totalReceipts: SqlNumber; totalPayments: SqlNumber; eventCount: SqlNumber;
};

// Historical migrations use different collations for money enums and document strings.
const textValue = (expression: Prisma.Sql) => Prisma.sql`CAST(${expression} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci`;
const keyMatch = Prisma.sql`v.sourceType COLLATE utf8mb4_unicode_ci = d.sourceType
  AND (v.sourceTransactionId = d.sourceTransactionId OR v.sourceKey COLLATE utf8mb4_unicode_ci = d.sourceKey)`;

/**
 * Resolve money truth before date/filter predicates. Core successful transactions exist even
 * without a ledger voucher. Other integrated sources exist only through a posted voucher.
 * PURCHASE_RECEIPT_PAYMENT references SupplierPayment.id, not PurchaseReceipt.id.
 * The creator filter uses the money actor: payment/deposit confirmer, return creator,
 * supplier/payment/payroll creator or purchase-return completer. A missing actor stays NULL;
 * it is never inferred from the Order creator or voucher creator when the domain exists.
 */
function canonicalSource(): Prisma.Sql {
  return Prisma.sql`WITH domainMoney AS (
    SELECT 'ORDER_PAYMENT' COLLATE utf8mb4_unicode_ci AS sourceType, p.id AS sourceTransactionId,
      p.confirmedAt AS occurredAt, 'RECEIPT' AS direction, p.amount,
      ${textValue(Prisma.sql`p.paymentMethod`)} AS paymentMethod, ${textValue(Prisma.sql`o.code`)} AS documentCode,
      o.customerId, p.confirmedByUserId AS creatorUserId, p.financialAccountId AS accountId,
      ${textValue(Prisma.sql`p.externalReference`)} AS externalReference
    FROM OrderPaymentTransaction p JOIN \`Order\` o ON o.id = p.orderId
    WHERE p.status = 'SUCCESS' AND p.confirmedAt IS NOT NULL
    UNION ALL
    SELECT CASE WHEN p.type = 'DEPOSIT' THEN 'RESERVATION_DEPOSIT' ELSE 'RESERVATION_REFUND' END,
      p.id, p.confirmedAt, CASE WHEN p.type = 'DEPOSIT' THEN 'RECEIPT' ELSE 'PAYMENT' END, p.amount,
      ${textValue(Prisma.sql`p.paymentMethod`)}, ${textValue(Prisma.sql`r.code`)}, r.customerId,
      p.confirmedByUserId, p.financialAccountId, ${textValue(Prisma.sql`p.externalReference`)}
    FROM ReservationDepositTransaction p JOIN Reservation r ON r.id = p.reservationId
    WHERE p.status = 'SUCCESS' AND p.confirmedAt IS NOT NULL AND p.type IN ('DEPOSIT', 'REFUND', 'PARTIAL_REFUND')
    UNION ALL
    SELECT 'SALES_RETURN_REFUND', r.id, r.completedAt, 'PAYMENT', r.refundedAmount,
      ${textValue(Prisma.sql`r.refundMethod`)}, ${textValue(Prisma.sql`r.returnCode`)}, o.customerId,
      r.createdByUserId, r.financialAccountId, NULL
    FROM OrderReturn r JOIN \`Order\` o ON o.id = r.orderId
    WHERE r.status = 'COMPLETED' AND r.refundedAmount > 0 AND r.completedAt IS NOT NULL
  ), domains AS (
    SELECT d.*, CONCAT(d.sourceType, ':', d.sourceTransactionId) AS sourceKey FROM domainMoney d
  ), posted AS (
    SELECT * FROM CashVoucher WHERE status = 'POSTED'
  ), links AS (
    SELECT d.sourceKey, MIN(v.id) AS voucherId FROM domains d JOIN posted v ON ${keyMatch} GROUP BY d.sourceKey
  ), canonical AS (
    SELECT d.sourceType, d.sourceTransactionId, d.sourceKey, d.occurredAt, d.direction, d.amount,
      d.paymentMethod, d.documentCode, d.customerId, d.creatorUserId,
      COALESCE(v.accountId, d.accountId) AS accountId, v.categoryId, d.externalReference,
      v.id AS cashVoucherId, v.reversalOfId, (v.id IS NOT NULL) AS reconciled, 0 AS suppressedNonCashReservationVoucher,
      CASE WHEN d.sourceType = 'SALES_RETURN_REFUND' THEN d.occurredAt ELSE NULL END AS refundCompletedAt
    FROM domains d LEFT JOIN links l ON l.sourceKey = d.sourceKey LEFT JOIN posted v ON v.id = l.voucherId
    UNION ALL
    SELECT ${textValue(Prisma.sql`v.sourceType`)}, v.sourceTransactionId,
      ${textValue(Prisma.sql`CASE WHEN v.sourceTransactionId IS NOT NULL AND v.sourceType <> 'MANUAL'
        THEN CONCAT(v.sourceType, ':', v.sourceTransactionId) ELSE v.sourceKey END`)},
      COALESCE(op.confirmedAt, rp.confirmedAt, sr.completedAt, sp.paidAt, pr.completedAt, pp.paidAt, v.occurredAt),
      ${textValue(Prisma.sql`v.direction`)}, v.amount, ${textValue(Prisma.sql`v.paymentMethod`)},
      ${textValue(Prisma.sql`COALESCE(v.sourceCode, v.code)`)},
      CASE WHEN op.id IS NOT NULL THEN oo.customerId WHEN rp.id IS NOT NULL THEN rs.customerId
        WHEN sr.id IS NOT NULL THEN so.customerId WHEN v.counterpartyType = 'CUSTOMER' THEN v.counterpartyId ELSE NULL END,
      CASE WHEN op.id IS NOT NULL THEN op.confirmedByUserId WHEN rp.id IS NOT NULL THEN rp.confirmedByUserId
        WHEN sr.id IS NOT NULL THEN sr.createdByUserId WHEN sp.id IS NOT NULL THEN sp.createdByUserId
        WHEN pr.id IS NOT NULL THEN pr.completedByUserId WHEN pp.id IS NOT NULL THEN pp.createdByUserId ELSE v.createdByUserId END,
      v.accountId, v.categoryId, NULL, v.id, v.reversalOfId, 1,
      CASE WHEN rp.type IN ('APPLY_TO_BILL', 'FORFEIT') THEN 1 ELSE 0 END,
      CASE WHEN sr.status = 'COMPLETED' AND sr.refundedAmount > 0 THEN sr.completedAt ELSE NULL END
    FROM posted v
    LEFT JOIN OrderPaymentTransaction op ON v.sourceType = 'ORDER_PAYMENT'
      AND (op.id = v.sourceTransactionId OR v.sourceKey = CONCAT('ORDER_PAYMENT:', op.id))
    LEFT JOIN \`Order\` oo ON oo.id = op.orderId
    LEFT JOIN ReservationDepositTransaction rp ON v.sourceType IN ('RESERVATION_DEPOSIT', 'RESERVATION_REFUND')
      AND (rp.id = v.sourceTransactionId OR v.sourceKey = CONCAT(v.sourceType, ':', rp.id))
    LEFT JOIN Reservation rs ON rs.id = rp.reservationId
    LEFT JOIN OrderReturn sr ON v.sourceType = 'SALES_RETURN_REFUND'
      AND (sr.id = v.sourceTransactionId OR v.sourceKey = CONCAT('SALES_RETURN_REFUND:', sr.id))
    LEFT JOIN \`Order\` so ON so.id = sr.orderId
    LEFT JOIN SupplierPayment sp ON v.sourceType IN ('SUPPLIER_PAYMENT', 'PURCHASE_RECEIPT_PAYMENT')
      AND (sp.id = v.sourceTransactionId OR v.sourceKey = CONCAT(v.sourceType, ':', sp.id))
    LEFT JOIN PurchaseReturn pr ON v.sourceType = 'PURCHASE_RETURN_REFUND'
      AND (pr.id = v.sourceTransactionId OR v.sourceKey = CONCAT('PURCHASE_RETURN_REFUND:', pr.id))
    LEFT JOIN EmployeePayrollPayment pp ON v.sourceType = 'PAYROLL_PAYMENT'
      AND (pp.id = v.sourceTransactionId OR v.sourceKey = CONCAT('PAYROLL_PAYMENT:', pp.id))
    WHERE NOT EXISTS (SELECT 1 FROM domains d WHERE ${keyMatch})
  ), events AS (
    SELECT e.*, c.name AS customerName, u.name AS creatorUserName, a.name AS accountName, g.name AS categoryName
    FROM canonical e LEFT JOIN Customer c ON c.id = e.customerId LEFT JOIN User u ON u.id = e.creatorUserId
    LEFT JOIN FinancialAccount a ON a.id = e.accountId LEFT JOIN CashFlowCategory g ON g.id = e.categoryId
  )`;
}

function filters(query: EndOfDayReportQuery, omitted?: EndOfDayFilter, includeSuppressed = false): Prisma.Sql {
  const conditions = [Prisma.sql`occurredAt >= ${query.from}`, Prisma.sql`occurredAt < ${query.to}`];
  if (!includeSuppressed) conditions.push(Prisma.sql`suppressedNonCashReservationVoucher = 0`);
  if (omitted !== 'customerId' && query.customerId != null) conditions.push(Prisma.sql`customerId = ${query.customerId}`);
  if (omitted !== 'creatorUserId' && query.creatorUserId != null) conditions.push(Prisma.sql`creatorUserId = ${query.creatorUserId}`);
  if (omitted !== 'paymentMethods' && query.paymentMethods?.length) conditions.push(Prisma.sql`paymentMethod IN (${Prisma.join(query.paymentMethods)})`);
  if (omitted !== 'recordTypes' && query.recordTypes?.length) conditions.push(Prisma.sql`sourceType IN (${Prisma.join(query.recordTypes)})`);
  if (query.search) conditions.push(Prisma.sql`(LOCATE(${query.search}, documentCode) > 0
    OR LOCATE(${query.search}, sourceKey) > 0 OR LOCATE(${query.search}, externalReference) > 0
    OR LOCATE(${query.search}, customerName) > 0 OR LOCATE(${query.search}, creatorUserName) > 0
    OR LOCATE(${query.search}, accountName) > 0 OR LOCATE(${query.search}, categoryName) > 0
    OR EXISTS (SELECT 1 FROM CashVoucher searched WHERE searched.id = events.cashVoucherId
      AND (LOCATE(${query.search}, searched.code) > 0 OR LOCATE(${query.search}, searched.note) > 0)))`);
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

const totalsProjection = Prisma.sql`COALESCE(SUM(CASE WHEN direction = 'RECEIPT' THEN amount ELSE 0 END), 0) AS totalReceipts,
  COALESCE(SUM(CASE WHEN direction = 'PAYMENT' THEN amount ELSE 0 END), 0) AS totalPayments, COUNT(*) AS eventCount`;
const facetColumns = {
  customerId: { value: Prisma.sql`customerId`, label: Prisma.sql`COALESCE(customerName, 'Chưa xác định')` },
  creatorUserId: { value: Prisma.sql`creatorUserId`, label: Prisma.sql`COALESCE(creatorUserName, 'Chưa xác định')` },
  paymentMethods: { value: Prisma.sql`paymentMethod`, label: Prisma.sql`COALESCE(paymentMethod, 'Chưa xác định')` },
  recordTypes: { value: Prisma.sql`sourceType`, label: Prisma.sql`sourceType` }
};

/** Read-only, seven fixed SQL reads through the supplied consistent transaction; no N+1. */
export class CashflowReportAdapter {
  static async read(tx: Prisma.TransactionClient, query: EndOfDayReportQuery): Promise<NormalizedConcernResult<CashflowEvent, CashflowSummary>> {
    const source = canonicalSource();
    const predicate = filters(query);
    const [totals] = await tx.$queryRaw<SqlTotals[]>(Prisma.sql`${source}
      SELECT COUNT(*) AS totalRows, ${totalsProjection}, COALESCE(SUM(reconciled = 0), 0) AS unreconciledCount,
        COALESCE(SUM(direction = 'RECEIPT'), 0) AS receiptCount, COALESCE(SUM(direction = 'PAYMENT'), 0) AS paymentCount,
        (SELECT COUNT(*) FROM events ${filters(query, undefined, true)} AND suppressedNonCashReservationVoucher = 1) AS suppressedNonCashReservationVoucherCount
      FROM events ${predicate}`);
    const sortColumns = { occurredAt: Prisma.sql`occurredAt`, amount: Prisma.sql`CASE WHEN direction = 'RECEIPT' THEN amount ELSE -amount END`, sourceType: Prisma.sql`sourceType` };
    const sortBy = query.sortBy ?? 'occurredAt';
    if (!(sortBy in sortColumns)) throw new Error('Unsupported Cashflow sort field');
    const sortColumn = sortColumns[sortBy as keyof typeof sortColumns];
    const direction = query.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const rows = await tx.$queryRaw<SqlEvent[]>(Prisma.sql`${source} SELECT * FROM events ${predicate}
      ORDER BY ${sortColumn} ${direction}, sourceType ASC, sourceTransactionId ASC, sourceKey ASC, cashVoucherId ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    const breakdownDimensions = {
      byPaymentMethod: [Prisma.sql`paymentMethod`, Prisma.sql`COALESCE(paymentMethod, 'Chưa xác định')`],
      byAccount: [Prisma.sql`accountId`, Prisma.sql`COALESCE(accountName, 'Chưa xác định')`],
      byCategory: [Prisma.sql`categoryId`, Prisma.sql`COALESCE(categoryName, 'Chưa xác định')`],
      bySource: [Prisma.sql`sourceType`, Prisma.sql`sourceType`]
    };
    const breakdowns = await tx.$queryRaw<SqlBreakdown[]>(Prisma.sql`${source} ${Prisma.join(
      Object.entries(breakdownDimensions).map(([dimension, [value, label]]) => Prisma.sql`
        SELECT ${dimension} AS dimension, ${value} AS value, ${label} AS label, ${totalsProjection}
        FROM events ${predicate} GROUP BY ${value}, ${label}`), ' UNION ALL ')} ORDER BY dimension, value`);
    const totalReceipts = Number(totals.totalReceipts), totalPayments = Number(totals.totalPayments);
    const summary: CashflowSummary = { totalReceipts, totalPayments, netCashFlow: totalReceipts - totalPayments,
      unreconciledCount: Number(totals.unreconciledCount), byPaymentMethod: [], byAccount: [], byCategory: [], bySource: [] };
    for (const row of breakdowns) {
      const receipts = Number(row.totalReceipts), payments = Number(row.totalPayments);
      summary[row.dimension].push({ value: row.value !== null && (row.dimension === 'byAccount' || row.dimension === 'byCategory') ? Number(row.value) : row.value,
        label: row.label, totalReceipts: receipts, totalPayments: payments, netCashFlow: receipts - payments, eventCount: Number(row.eventCount) });
    }
    const filterOptions: EndOfDayFilterOptions = {};
    for (const dimension of Object.keys(facetColumns) as (keyof typeof facetColumns)[]) {
      const { value, label } = facetColumns[dimension];
      filterOptions[dimension] = await tx.$queryRaw(Prisma.sql`${source}
        SELECT DISTINCT ${value} AS value, ${label} AS label FROM events ${filters(query, dimension)} ORDER BY value`);
    }
    const totalRows = Number(totals.totalRows);
    return { totalRows, summary, filterOptions,
      records: rows.map(row => toCashflowEvent({ ...row, occurredAt: row.occurredAt.toISOString(),
        refundCompletedAt: row.refundCompletedAt?.toISOString() ?? null, amount: Number(row.amount), status: 'POSTED' }, Boolean(Number(row.reconciled)))),
      invariantCounters: { totalRows, receiptCount: Number(totals.receiptCount), paymentCount: Number(totals.paymentCount),
        unreconciledCount: summary.unreconciledCount, suppressedNonCashReservationVoucherCount: Number(totals.suppressedNonCashReservationVoucherCount) } };
  }
}
