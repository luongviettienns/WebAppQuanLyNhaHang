import { getApiBaseUrl } from './config';
import type { OrderStatus } from './contracts';

// Mirrors the serialized backend contracts; no Date, Prisma, or backend runtime imports.
export type EndOfDayConcern = 'SALES' | 'CASHFLOW' | 'GOODS' | 'CANCELLED_ITEMS' | 'SUMMARY';
export type EndOfDayView = 'VERTICAL' | 'HORIZONTAL';
export type EndOfDayPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'E_WALLET';
export type CashflowRecordType = 'MANUAL' | 'RESERVATION_DEPOSIT' | 'RESERVATION_REFUND' | 'ORDER_PAYMENT' | 'SALES_RETURN_REFUND' | 'PURCHASE_RECEIPT_PAYMENT' | 'SUPPLIER_PAYMENT' | 'PURCHASE_RETURN_REFUND' | 'PAYROLL_PAYMENT' | 'REVERSAL';
export type InventoryRecordType = 'STOCK_IN' | 'PURCHASE_RETURN' | 'AUTO_DEDUCT' | 'KITCHEN_WASTE' | 'MANUAL_ADJUST' | 'VOID_RESTORE' | 'SALES_RETURN';
export type GoodsRecordType = 'SALE_ITEM' | 'INVENTORY_EVENT' | InventoryRecordType;
export type EndOfDaySortBy = 'occurredAt' | 'documentCode' | 'amount' | 'sourceType' | 'recordType' | 'quantity' | 'menuItemName' | 'lineAmount';
export interface EndOfDayReportFilter {
  date?: string; fromTime?: string; toTime?: string; concern?: EndOfDayConcern; view?: EndOfDayView;
  customerId?: number; receiverEmployeeId?: number; creatorUserId?: number;
  paymentMethods?: EndOfDayPaymentMethod[]; delivery?: boolean; areaId?: number; tableId?: number;
  cancelReason?: string; recordTypes?: (CashflowRecordType | GoodsRecordType)[]; search?: string;
  page?: number; pageSize?: number; sortBy?: EndOfDaySortBy; sortOrder?: 'asc' | 'desc';
}
export interface EndOfDayReportMetadata {
  date: string; from: string; to: string; timezone: 'Asia/Ho_Chi_Minh';
  asOf: string; generatedAt: string; concern: EndOfDayConcern; view: EndOfDayView;
  operatingScope: { code: 'MAIN'; name: 'Nhà hàng chính'; locked: true };
}
export interface EndOfDayFilterOption { value: string | number | boolean | null; label: string }
export type EndOfDayFilterOptions = Partial<Record<'customerId' | 'receiverEmployeeId' | 'creatorUserId' | 'paymentMethods' | 'delivery' | 'areaId' | 'tableId' | 'cancelReason' | 'recordTypes' | 'search', EndOfDayFilterOption[]>>;

export interface SalesReportRow {
  recordType: 'INVOICE' | 'SALES_RETURN'; orderId: number; orderReturnId: number | null; occurredAt: string;
  documentCode: string; sourceOrderCode: string; amount: number; finalAmount: number | null; totalRefundDue: number | null;
  goodsAmount: number; discountAmount: number; vatAmount: number; deliveryFee: number;
  customerId: number | null; customerName: string; receiverEmployeeId: number | null; receiverEmployeeName: string;
  creatorUserId: number | null; creatorUserName: string; delivery: boolean; areaId: number | null; areaName: string;
  tableId: number | null; tableNumber: number | null; paymentMethods: EndOfDayPaymentMethod[]; legacyPaymentMethodFallback: boolean;
}
export interface SalesSummary {
  completedInvoiceCount: number; grossInvoiceValue: number; salesReturnValue: number; netInvoiceValue: number;
  goodsAmount: number; discountAmount: number; vatAmount: number; deliveryFee: number;
}
export interface CashflowEvent {
  sourceType: CashflowRecordType; sourceTransactionId: number | null; occurredAt: string; direction: 'RECEIPT' | 'PAYMENT';
  amount: number; paymentMethod: EndOfDayPaymentMethod | null; documentCode: string;
  customerId: number | null; customerName: string | null; creatorUserId: number | null; creatorUserName: string | null;
  accountId: number | null; accountName: string | null; categoryId: number | null; categoryName: string | null;
  externalReference: string | null; cashVoucherId: number | null; reversalOfId: number | null;
  key: string; reconciliationStatus: 'RECONCILED' | 'UNRECONCILED'; refundCompletedAt: string | null;
}
export interface CashflowBreakdown {
  value: string | number | null; label: string; totalReceipts: number; totalPayments: number; netCashFlow: number; eventCount: number;
}
export interface CashflowSummary {
  totalReceipts: number; totalPayments: number; netCashFlow: number; unreconciledCount: number;
  byPaymentMethod: CashflowBreakdown[]; byAccount: CashflowBreakdown[]; byCategory: CashflowBreakdown[]; bySource: CashflowBreakdown[];
}
export interface GoodsReportRow {
  rowKey: string; recordType: 'SALE_ITEM' | 'INVENTORY_EVENT'; inventoryType: InventoryRecordType | null;
  orderId: number | null; orderItemId: number | null; inventoryTransactionId: number | null;
  occurredAt: string; documentCode: string | null; menuItemId: number | null; ingredientId: number | null;
  itemSku: string; itemName: string; quantityKind: 'MENU_ITEM' | 'INGREDIENT'; quantity: number; unit: string;
  unitPrice: number | null; amount: number; costAmount: number | null; signedCostAmount: number | null;
  creatorUserId: number | null; creatorUserName: string; note: string | null;
  dataQuality: 'RECORDED' | 'QUANTITY_SIGN_MISMATCH'; catalogLabelSource: 'CURRENT_CATALOG';
}
export interface GoodsSummary {
  saleItemCount: number; soldMenuItemQuantity: number; saleItemAmount: number; inventoryEventCount: number;
  inventoryQuantityByUnit: { unit: string; quantity: number }[]; stockInCost: number; purchaseReturnCost: number;
  autoDeductCost: number; salesReturnCost: number; netSalesCogs: number; kitchenWasteCost: number;
  manualAdjustmentCost: number; voidRestoreCost: number;
}
export interface CancelledItemReportRow {
  rowKey: string; cancellationId: number | null; source: 'ORDER_VOID' | 'ITEM_CANCEL' | 'LEGACY_ORDER_VOID';
  sourceKey: string; dataQuality: 'RECORDED' | 'HISTORICAL_FALLBACK'; orderId: number; orderItemId: number; menuItemId: number;
  occurredAt: string; documentCode: string; menuItemSku: string; menuItemName: string; quantity: number; unitPrice: number;
  lineAmount: number; reason: string | null; cancelledByUserId: number | null; cancelledByUserName: string;
  orderStatusSnapshot: OrderStatus | null; preparationStateSnapshot: 'NOT_STARTED' | 'PREPARING' | 'READY' | 'UNKNOWN';
  inventoryEffect: 'NONE' | 'RESTORED' | 'WASTE_RECORDED' | null; inventoryWasteId: number | null;
  creatorUserId: number | null; creatorUserName: string; receiverEmployeeId: number | null; receiverEmployeeName: string;
  delivery: boolean; areaId: number | null; areaName: string; tableId: number | null; tableNumber: number | null;
}
export interface CancellationBreakdown { value: string | null; label: string; rowCount: number; quantity: number; lineAmount: number }
export interface CancellationActorBreakdown { cancelledByUserId: number | null; label: string; rowCount: number; quantity: number; lineAmount: number }
export interface CancelledItemsSummary {
  cancelledOrderCount: number; cancelledItemCount: number; cancelledQuantity: number; cancelledLineAmount: number;
  unrecognizedLineAmount: number; historicalFallbackRows: number; byReason: CancellationBreakdown[];
  byCancelledByUser: CancellationActorBreakdown[]; byPreparationState: CancellationBreakdown[]; byInventoryEffect: CancellationBreakdown[];
}
export interface SummaryReportSummary {
  sales: SalesSummary; cashflow: CashflowSummary; goods: GoodsSummary; cancellations: CancelledItemsSummary;
  estimatedContributionBeforeWaste: number; estimatedContributionAfterWaste: number; invariantCounters: Record<string, number>;
}
interface SummaryRowBase { occurredAt: string; sourceKey: string }
export type SummaryReportRow =
  | (SummaryRowBase & { domain: 'SALES'; recordKind: SalesReportRow['recordType']; detail: SalesReportRow })
  | (SummaryRowBase & { domain: 'CASHFLOW'; recordKind: CashflowEvent['sourceType']; detail: CashflowEvent })
  | (SummaryRowBase & { domain: 'GOODS'; recordKind: GoodsReportRow['recordType']; detail: GoodsReportRow })
  | (SummaryRowBase & { domain: 'CANCELLED_ITEMS'; recordKind: CancelledItemReportRow['source']; detail: CancelledItemReportRow });
export type EndOfDayReportRow = SalesReportRow | CashflowEvent | GoodsReportRow | CancelledItemReportRow | SummaryReportRow;
export type EndOfDayReportSummary = (SalesSummary | CashflowSummary | GoodsSummary | CancelledItemsSummary | SummaryReportSummary) & { invariantCounters: Record<string, number> };
export interface EndOfDayReportResponse<Row = EndOfDayReportRow, Summary = EndOfDayReportSummary> {
  metadata: EndOfDayReportMetadata; hasData: boolean; summary: Summary; rows: Row[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number }; filterOptions: EndOfDayFilterOptions;
}

const queryKeys = ['date', 'fromTime', 'toTime', 'concern', 'view', 'customerId', 'receiverEmployeeId', 'creatorUserId', 'paymentMethods', 'delivery', 'areaId', 'tableId', 'cancelReason', 'recordTypes', 'search', 'page', 'pageSize', 'sortBy', 'sortOrder'] as const satisfies readonly (keyof EndOfDayReportFilter)[];

/** Preserve supplied concern semantics; the server owns validation and defaults. */
export function buildEndOfDayReportQuery(filter: EndOfDayReportFilter = {}, includePagination = true): string {
  const params = new URLSearchParams();
  for (const key of queryKeys) {
    if (!includePagination && (key === 'page' || key === 'pageSize')) continue;
    const value = filter[key];
    if (value !== undefined) params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export class EndOfDayReportApiError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly status: number, readonly details?: Record<string, unknown>) {
    super(message); this.name = 'EndOfDayReportApiError';
  }
}
const authHeaders = (token: string | null): Record<string, string> => token ? { Authorization: `Bearer ${token}` } : {};
async function fail(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
  throw new EndOfDayReportApiError(payload?.error?.message || `${fallback} (${response.status})`, payload?.error?.code, response.status, payload?.error?.details);
}
export async function fetchEndOfDayReportApi(token: string | null, filter: EndOfDayReportFilter = {}): Promise<EndOfDayReportResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/reports/end-of-day${buildEndOfDayReportQuery(filter)}`, { headers: authHeaders(token) });
  if (!response.ok) await fail(response, 'Không thể tải báo cáo cuối ngày');
  return (await response.json() as { data: EndOfDayReportResponse }).data;
}
export async function downloadEndOfDayReportApi(token: string | null, filter: EndOfDayReportFilter = {}): Promise<Blob> {
  const query = buildEndOfDayReportQuery(filter, false);
  const response = await fetch(`${getApiBaseUrl()}/api/reports/end-of-day/export${query}${query ? '&' : '?'}format=xlsx`, { headers: authHeaders(token) });
  if (!response.ok) await fail(response, 'Không thể xuất báo cáo cuối ngày');
  return response.blob();
}
