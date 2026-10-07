import type { SalesReportRow, SalesSummary } from './sales.adapter';
import type { CashflowSummary } from './cashflow.adapter';
import type { CashflowEvent } from './cashflow.registry';
import type { GoodsReportRow, GoodsSummary } from './goods.adapter';
import type { CancelledItemReportRow, CancelledItemsSummary } from './cancelled-items.adapter';
import type { NormalizedConcernResult } from './end-of-day.types';

export interface SummaryReportSummary {
  sales: SalesSummary;
  cashflow: CashflowSummary;
  goods: GoodsSummary;
  cancellations: CancelledItemsSummary;
  estimatedContributionBeforeWaste: number;
  estimatedContributionAfterWaste: number;
  invariantCounters: Record<string, number>;
}
export type SummaryConcernResult = NormalizedConcernResult<never, SummaryReportSummary>;

interface SummaryRowBase { occurredAt: string; sourceKey: string }
export type SummaryReportRow =
  | (SummaryRowBase & { domain: 'SALES'; recordKind: SalesReportRow['recordType']; detail: SalesReportRow })
  | (SummaryRowBase & { domain: 'CASHFLOW'; recordKind: CashflowEvent['sourceType']; detail: CashflowEvent })
  | (SummaryRowBase & { domain: 'GOODS'; recordKind: GoodsReportRow['recordType']; detail: GoodsReportRow })
  | (SummaryRowBase & { domain: 'CANCELLED_ITEMS'; recordKind: CancelledItemReportRow['source']; detail: CancelledItemReportRow });

export class SummaryReportAdapter {
  static mergeRecords(
    sales: NormalizedConcernResult<SalesReportRow, SalesSummary>,
    cashflow: NormalizedConcernResult<CashflowEvent, CashflowSummary>,
    goods: NormalizedConcernResult<GoodsReportRow, GoodsSummary>,
    cancellations: NormalizedConcernResult<CancelledItemReportRow, CancelledItemsSummary>
  ): SummaryReportRow[] {
    const candidates: { row: SummaryReportRow; domainOrder: number; nativePosition: number }[] = [];
    function append<Row>(records: Row[], domainOrder: number, wrap: (detail: Row) => SummaryReportRow) {
      records.forEach((detail, nativePosition) => candidates.push({ row: wrap(detail), domainOrder, nativePosition }));
    }
    append(sales.records, 0, detail => ({ domain: 'SALES', recordKind: detail.recordType, occurredAt: detail.occurredAt,
      sourceKey: `SALES:${detail.recordType}:${detail.recordType === 'INVOICE' ? detail.orderId : detail.orderReturnId}`, detail }));
    append(cashflow.records, 1, detail => ({ domain: 'CASHFLOW', recordKind: detail.sourceType, occurredAt: detail.occurredAt,
      sourceKey: `CASHFLOW:${detail.key}`, detail }));
    append(goods.records, 2, detail => ({ domain: 'GOODS', recordKind: detail.recordType, occurredAt: detail.occurredAt,
      sourceKey: `GOODS:${detail.rowKey}`, detail }));
    append(cancellations.records, 3, detail => ({ domain: 'CANCELLED_ITEMS', recordKind: detail.source, occurredAt: detail.occurredAt,
      sourceKey: `CANCELLED_ITEMS:${detail.sourceKey}`, detail }));
    // Each adapter supplies occurredAt DESC plus its stable native tie-breakers.
    // Preserve that native order inside a domain rather than reinterpreting its identity.
    candidates.sort((left, right) => Date.parse(right.row.occurredAt) - Date.parse(left.row.occurredAt)
      || left.domainOrder - right.domainOrder || left.nativePosition - right.nativePosition);
    return candidates.map(candidate => candidate.row);
  }

  static compose(
    sales: NormalizedConcernResult<unknown, SalesSummary>,
    cashflow: NormalizedConcernResult<unknown, CashflowSummary>,
    goods: NormalizedConcernResult<unknown, GoodsSummary>,
    cancellations: NormalizedConcernResult<unknown, CancelledItemsSummary>
  ): SummaryConcernResult {
    const totalRows = sales.totalRows + cashflow.totalRows + goods.totalRows + cancellations.totalRows;
    const invariantCounters: Record<string, number> = { totalRows };
    for (const [domain, result] of Object.entries({ sales, cashflow, goods, cancellations })) {
      for (const [key, value] of Object.entries(result.invariantCounters)) invariantCounters[`${domain}.${key}`] = value;
    }
    const estimatedContributionBeforeWaste = sales.summary.netInvoiceValue - goods.summary.netSalesCogs;
    return { records: [], totalRows, filterOptions: {}, invariantCounters, summary: {
      sales: sales.summary, cashflow: cashflow.summary, goods: goods.summary, cancellations: cancellations.summary,
      estimatedContributionBeforeWaste,
      estimatedContributionAfterWaste: estimatedContributionBeforeWaste - goods.summary.kitchenWasteCost,
      invariantCounters
    } };
  }
}
