import { describe, expect, it } from 'vitest';
import { SummaryReportAdapter } from '../../src/modules/reports/end-of-day/summary.adapter';
import type { SalesSummary } from '../../src/modules/reports/end-of-day/sales.adapter';
import type { CashflowSummary } from '../../src/modules/reports/end-of-day/cashflow.adapter';
import type { GoodsSummary } from '../../src/modules/reports/end-of-day/goods.adapter';
import type { CancelledItemsSummary } from '../../src/modules/reports/end-of-day/cancelled-items.adapter';
import type { NormalizedConcernResult } from '../../src/modules/reports/end-of-day/end-of-day.types';

function normalized<S>(summary: S, totalRows: number): NormalizedConcernResult<never, S> {
  return { records: [], summary, totalRows, filterOptions: {}, invariantCounters: { totalRows, qualityIssue: 2 } };
}
const sales = normalized<SalesSummary>({ completedInvoiceCount: 2, grossInvoiceValue: 1000, salesReturnValue: 120,
  netInvoiceValue: 880, goodsAmount: 900, discountAmount: 30, vatAmount: 90, deliveryFee: 40 }, 3);
const cashflow = normalized<CashflowSummary>({ totalReceipts: 400, totalPayments: 400, netCashFlow: 0,
  unreconciledCount: 1, byPaymentMethod: [], byAccount: [], byCategory: [], bySource: [] }, 2);
const goods = normalized<GoodsSummary>({ saleItemCount: 2, soldMenuItemQuantity: 5, saleItemAmount: 900,
  inventoryEventCount: 3, inventoryQuantityByUnit: [{ unit: 'gram', quantity: -16 }], stockInCost: 0,
  purchaseReturnCost: 0, autoDeductCost: 300, salesReturnCost: 70, netSalesCogs: 230, kitchenWasteCost: 40,
  manualAdjustmentCost: 0, voidRestoreCost: 0 }, 5);
const cancellations = normalized<CancelledItemsSummary>({ cancelledOrderCount: 1, cancelledItemCount: 1,
  cancelledQuantity: 2, cancelledLineAmount: 250, unrecognizedLineAmount: 250, historicalFallbackRows: 0,
  byReason: [], byCancelledByUser: [], byPreparationState: [], byInventoryEffect: [] }, 1);

describe('Summary composition', () => {
  it('reuses domain summaries and subtracts COGS then separate waste without counting cash or cancellations as revenue', () => {
    const result = SummaryReportAdapter.compose(sales, cashflow, goods, cancellations);
    expect(result.summary).toMatchObject({ sales: { netInvoiceValue: 880 }, cashflow: { netCashFlow: 0 },
      goods: { netSalesCogs: 230, kitchenWasteCost: 40 }, cancellations: { cancelledLineAmount: 250 },
      estimatedContributionBeforeWaste: 650, estimatedContributionAfterWaste: 610 });
    expect(result.summary.sales).toEqual(sales.summary);
    expect(result.summary.cashflow).toEqual(cashflow.summary);
    expect(result.summary.goods).toEqual(goods.summary);
    expect(result.summary.cancellations).toEqual(cancellations.summary);
    expect(result.summary).not.toHaveProperty('grossProfit');
    expect(result.summary).not.toHaveProperty('grossMargin');
    expect(result.summary).not.toHaveProperty('estimatedGrossProfit');
    expect(result.totalRows).toBe(11);
    expect(result.records).toEqual([]);
    expect(result.filterOptions).toEqual({});
    expect(result.invariantCounters).toMatchObject({ 'cashflow.qualityIssue': 2, 'sales.totalRows': 3,
      'cashflow.totalRows': 2, 'goods.totalRows': 5, 'cancellations.totalRows': 1 });
  });
  it('uses normalized net values even when raw components would imply a competing formula', () => {
    const result = SummaryReportAdapter.compose({ ...sales, summary: { ...sales.summary, netInvoiceValue: 10 } },
      cashflow, { ...goods, summary: { ...goods.summary, netSalesCogs: 20, kitchenWasteCost: 5 } }, cancellations);
    expect(result.summary.estimatedContributionBeforeWaste).toBe(-10);
    expect(result.summary.estimatedContributionAfterWaste).toBe(-15);
  });
});
