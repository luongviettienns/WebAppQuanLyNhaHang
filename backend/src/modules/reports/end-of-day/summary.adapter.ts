import type { SalesSummary } from './sales.adapter';
import type { CashflowSummary } from './cashflow.adapter';
import type { GoodsSummary } from './goods.adapter';
import type { CancelledItemsSummary } from './cancelled-items.adapter';
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

export class SummaryReportAdapter {
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
