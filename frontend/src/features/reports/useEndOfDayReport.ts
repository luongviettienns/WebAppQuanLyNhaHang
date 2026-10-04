import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { buildEndOfDayReportQuery, fetchEndOfDayReportApi, type EndOfDayConcern, type EndOfDayReportFilter, type EndOfDayReportResponse } from '../../api/endOfDayReports';

function normalize(filter: EndOfDayReportFilter): EndOfDayReportFilter {
  const { search, cancelReason, ...filters } = filter;
  const normalizedSearch = search?.trim();
  const normalizedCancelReason = cancelReason?.trim();
  const concern = filter.concern ?? 'SALES';
  return {
    ...filters, date: filter.date ?? new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10),
    concern, view: filter.view ?? 'VERTICAL', page: filter.page ?? 1, pageSize: filter.pageSize ?? 50,
    ...(concern === 'SUMMARY' ? {} : { sortBy: filter.sortBy ?? 'occurredAt', sortOrder: filter.sortOrder ?? 'desc' }),
    ...(filter.paymentMethods ? { paymentMethods: [...new Set(filter.paymentMethods)].sort() } : {}),
    ...(filter.recordTypes ? { recordTypes: [...new Set(filter.recordTypes)].sort() } : {}),
    ...(normalizedSearch ? { search: normalizedSearch } : {}),
    ...(normalizedCancelReason ? { cancelReason: normalizedCancelReason } : {})
  };
}
const numericSummaryFields = {
  SALES: ['completedInvoiceCount', 'grossInvoiceValue', 'salesReturnValue', 'netInvoiceValue', 'goodsAmount', 'discountAmount', 'vatAmount', 'deliveryFee'],
  CASHFLOW: ['totalReceipts', 'totalPayments', 'netCashFlow', 'unreconciledCount'],
  GOODS: ['saleItemCount', 'soldMenuItemQuantity', 'saleItemAmount', 'inventoryEventCount', 'stockInCost', 'purchaseReturnCost', 'autoDeductCost', 'salesReturnCost', 'netSalesCogs', 'kitchenWasteCost', 'manualAdjustmentCost', 'voidRestoreCost'],
  CANCELLED_ITEMS: ['cancelledOrderCount', 'cancelledItemCount', 'cancelledQuantity', 'cancelledLineAmount', 'unrecognizedLineAmount', 'historicalFallbackRows'],
  SUMMARY: ['estimatedContributionBeforeWaste', 'estimatedContributionAfterWaste']
} satisfies Record<EndOfDayConcern, string[]>;
const arraySummaryFields = {
  SALES: [], CASHFLOW: ['byPaymentMethod', 'byAccount', 'byCategory', 'bySource'], GOODS: ['inventoryQuantityByUnit'],
  CANCELLED_ITEMS: ['byReason', 'byCancelledByUser', 'byPreparationState', 'byInventoryEffect'], SUMMARY: []
} satisfies Record<EndOfDayConcern, string[]>;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const cashflowBreakdown = z.object({ value: z.union([z.string(), z.number(), z.null()]), label: z.string(), totalReceipts: z.number().finite(), totalPayments: z.number().finite(), netCashFlow: z.number().finite(), eventCount: z.number().int().nonnegative() });
const cancellationBreakdown = { label: z.string(), rowCount: z.number().int().nonnegative(), quantity: z.number().finite(), lineAmount: z.number().finite() };
function completeBreakdown(value: unknown, concern: EndOfDayConcern, key: string): boolean {
  if (concern === 'CASHFLOW') return cashflowBreakdown.safeParse(value).success;
  if (concern === 'GOODS') return z.object({ unit: z.string(), quantity: z.number().finite() }).safeParse(value).success;
  if (concern === 'CANCELLED_ITEMS') return z.object({ ...cancellationBreakdown, ...(key === 'byCancelledByUser' ? { cancelledByUserId: z.number().nullable() } : { value: z.string().nullable() }) }).safeParse(value).success;
  return false;
}
function completeSummary(value: unknown, concern: EndOfDayConcern): boolean {
  if (!record(value) || !numericSummaryFields[concern].every(key => typeof value[key] === 'number' && Number.isFinite(value[key])) || !arraySummaryFields[concern].every(key => Array.isArray(value[key]) && (value[key] as unknown[]).every(entry => completeBreakdown(entry, concern, key)))) return false;
  return concern !== 'SUMMARY' || (['sales', 'cashflow', 'goods', 'cancellations'] as const).every((key, index) => completeSummary(value[key], (['SALES', 'CASHFLOW', 'GOODS', 'CANCELLED_ITEMS'] as const)[index]));
}
const envelope = z.object({
  metadata: z.object({ date: z.string(), from: z.string().datetime(), to: z.string().datetime(), timezone: z.literal('Asia/Ho_Chi_Minh'), asOf: z.string().datetime(), generatedAt: z.string().datetime(), concern: z.enum(['SALES', 'CASHFLOW', 'GOODS', 'CANCELLED_ITEMS', 'SUMMARY']), view: z.enum(['VERTICAL', 'HORIZONTAL']), operatingScope: z.object({ code: z.literal('MAIN'), name: z.literal('Nhà hàng chính'), locked: z.literal(true) }) }),
  hasData: z.boolean(), summary: z.object({ invariantCounters: z.record(z.number().finite()) }).passthrough(), rows: z.array(z.record(z.unknown())),
  pagination: z.object({ page: z.number().int().positive(), pageSize: z.number().int().positive(), totalRows: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }),
  filterOptions: z.record(z.array(z.object({ value: z.union([z.string(), z.number(), z.boolean(), z.null()]), label: z.string() })))
});
function rowFields(numbers: string[], strings: string[], nullableNumbers: string[] = [], nullableStrings: string[] = []) {
  return Object.fromEntries([
    ...numbers.map(key => [key, z.number().finite()]), ...strings.map(key => [key, z.string()]),
    ...nullableNumbers.map(key => [key, z.number().finite().nullable()]), ...nullableStrings.map(key => [key, z.string().nullable()])
  ]);
}
const paymentMethod = z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET']);
const rowSchemas = {
  SALES: z.object({
    ...rowFields(['orderId', 'amount', 'goodsAmount', 'discountAmount', 'vatAmount', 'deliveryFee'], ['documentCode', 'sourceOrderCode', 'customerName', 'receiverEmployeeName', 'creatorUserName', 'areaName'], ['orderReturnId', 'finalAmount', 'totalRefundDue', 'customerId', 'receiverEmployeeId', 'creatorUserId', 'areaId', 'tableId', 'tableNumber']),
    occurredAt: z.string().datetime(), recordType: z.enum(['INVOICE', 'SALES_RETURN']), delivery: z.boolean(), paymentMethods: z.array(paymentMethod), legacyPaymentMethodFallback: z.boolean()
  }),
  CASHFLOW: z.object({
    ...rowFields(['amount'], ['documentCode', 'key'], ['sourceTransactionId', 'customerId', 'creatorUserId', 'accountId', 'categoryId', 'cashVoucherId', 'reversalOfId'], ['customerName', 'creatorUserName', 'accountName', 'categoryName', 'externalReference', 'refundCompletedAt']),
    occurredAt: z.string().datetime(), sourceType: z.string(), direction: z.enum(['RECEIPT', 'PAYMENT']), paymentMethod: paymentMethod.nullable(), reconciliationStatus: z.enum(['RECONCILED', 'UNRECONCILED'])
  }),
  GOODS: z.object({
    ...rowFields(['quantity', 'amount'], ['rowKey', 'itemSku', 'itemName', 'unit', 'creatorUserName'], ['orderId', 'orderItemId', 'inventoryTransactionId', 'menuItemId', 'ingredientId', 'unitPrice', 'costAmount', 'signedCostAmount', 'creatorUserId'], ['inventoryType', 'documentCode', 'note']),
    occurredAt: z.string().datetime(), recordType: z.enum(['SALE_ITEM', 'INVENTORY_EVENT']), quantityKind: z.enum(['MENU_ITEM', 'INGREDIENT']), dataQuality: z.enum(['RECORDED', 'QUANTITY_SIGN_MISMATCH']), catalogLabelSource: z.literal('CURRENT_CATALOG')
  }),
  CANCELLED_ITEMS: z.object({
    ...rowFields(['orderId', 'orderItemId', 'menuItemId', 'quantity', 'unitPrice', 'lineAmount'], ['rowKey', 'sourceKey', 'documentCode', 'menuItemSku', 'menuItemName', 'cancelledByUserName', 'creatorUserName', 'receiverEmployeeName', 'areaName'], ['cancellationId', 'cancelledByUserId', 'inventoryWasteId', 'creatorUserId', 'receiverEmployeeId', 'areaId', 'tableId', 'tableNumber'], ['reason', 'orderStatusSnapshot', 'inventoryEffect']),
    occurredAt: z.string().datetime(), source: z.enum(['ORDER_VOID', 'ITEM_CANCEL', 'LEGACY_ORDER_VOID']), dataQuality: z.enum(['RECORDED', 'HISTORICAL_FALLBACK']), preparationStateSnapshot: z.enum(['NOT_STARTED', 'PREPARING', 'READY', 'UNKNOWN']), delivery: z.boolean()
  })
};
function completeRow(value: unknown, concern: EndOfDayConcern): boolean {
  if (concern !== 'SUMMARY') return rowSchemas[concern].safeParse(value).success;
  const summaryRow = z.object({ domain: z.enum(['SALES', 'CASHFLOW', 'GOODS', 'CANCELLED_ITEMS']), recordKind: z.string(), occurredAt: z.string().datetime(), sourceKey: z.string(), detail: z.unknown() }).safeParse(value);
  return summaryRow.success && completeRow(summaryRow.data.detail, summaryRow.data.domain);
}
interface ReportState {
  snapshot: EndOfDayReportResponse | null; committedFilter: EndOfDayReportFilter | null;
  loading: boolean; error: string | null; stale: boolean; refreshAttemptedAt: string | null;
}
function seededState(snapshot?: EndOfDayReportResponse, filter: EndOfDayReportFilter = {}): ReportState {
  return { snapshot: snapshot ?? null, committedFilter: snapshot ? normalize({ ...filter, date: snapshot.metadata.date, concern: snapshot.metadata.concern, view: snapshot.metadata.view, page: snapshot.pagination.page, pageSize: snapshot.pagination.pageSize }) : null, loading: false, error: null, stale: false, refreshAttemptedAt: null };
}

export function useEndOfDayReport(token: string | null, initialFilter: EndOfDayReportFilter = {}, initialSnapshot?: EndOfDayReportResponse) {
  const [state, setState] = useState<ReportState>(() => seededState(initialSnapshot, initialFilter));
  const stateRef = useRef(state);
  const latestQuery = useRef<EndOfDayReportFilter | null>(state.committedFilter);
  const requestId = useRef(0);
  const initial = useRef({ snapshot: initialSnapshot, filter: initialFilter });
  const commit = useCallback((next: ReportState) => { stateRef.current = next; setState(next); }, []);
  useEffect(() => () => { requestId.current += 1; }, []);
  useEffect(() => {
    if (initial.current.snapshot === initialSnapshot) return;
    initial.current = { snapshot: initialSnapshot, filter: initialFilter };
    requestId.current += 1;
    const next = seededState(initialSnapshot, initialFilter); latestQuery.current = next.committedFilter; commit(next);
  }, [initialSnapshot, initialFilter, commit]);
  const load = useCallback(async (filter: EndOfDayReportFilter) => {
    const query = normalize(filter); latestQuery.current = query;
    const id = ++requestId.current;
    const previous = stateRef.current;
    const sameQuery = previous.committedFilter !== null && buildEndOfDayReportQuery(previous.committedFilter) === buildEndOfDayReportQuery(query);
    const retained = sameQuery ? previous.snapshot : null;
    const refreshAttemptedAt = sameQuery ? new Date().toISOString() : null;
    commit({ snapshot: retained, committedFilter: sameQuery ? previous.committedFilter : null, loading: true, error: null, stale: false, refreshAttemptedAt });
    try {
      const response = await fetchEndOfDayReportApi(token, query);
      if (id !== requestId.current) return;
      if (!envelope.safeParse(response).success || !completeSummary(response.summary, query.concern!) || !response.rows.every(row => completeRow(row, query.concern!)) || response.metadata.date !== query.date || response.metadata.concern !== query.concern || response.metadata.view !== query.view) throw new Error('Báo cáo chưa đầy đủ hoặc không đúng phạm vi yêu cầu. Vui lòng thử lại.');
      commit({ snapshot: response, committedFilter: query, loading: false, error: null, stale: false, refreshAttemptedAt });
    } catch (error) {
      if (id !== requestId.current) return;
      commit({ snapshot: retained, committedFilter: sameQuery ? previous.committedFilter : null, loading: false, error: error instanceof Error ? error.message : 'Không thể tải báo cáo cuối ngày. Vui lòng thử lại.', stale: retained !== null, refreshAttemptedAt });
    }
  }, [token, commit]);
  const refresh = useCallback(async () => { if (latestQuery.current) await load(latestQuery.current); }, [load]);
  return { ...state, load, refresh };
}
