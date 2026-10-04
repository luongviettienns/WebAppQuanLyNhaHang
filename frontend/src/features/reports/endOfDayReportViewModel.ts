import type { EndOfDayConcern, EndOfDayFilterOptions, EndOfDayReportFilter, EndOfDayReportRow, EndOfDayReportSummary } from '../../api/endOfDayReports';

export const CONCERN_OPTIONS: { value: EndOfDayConcern; label: string }[] = [
  { value: 'SALES', label: 'Bán hàng' }, { value: 'CASHFLOW', label: 'Thu chi' },
  { value: 'GOODS', label: 'Hàng hóa' }, { value: 'CANCELLED_ITEMS', label: 'Hủy món' }, { value: 'SUMMARY', label: 'Tổng hợp' }
];
export type ConcernFilter = keyof EndOfDayFilterOptions;
// Serialized client mirror of backend SUPPORTED_FILTERS_BY_CONCERN; parity is tested against the source contract.
const supportedFilters: Record<EndOfDayConcern, readonly ConcernFilter[]> = {
  SALES: ['customerId', 'receiverEmployeeId', 'creatorUserId', 'paymentMethods', 'delivery', 'areaId', 'tableId', 'search'],
  CASHFLOW: ['customerId', 'creatorUserId', 'paymentMethods', 'recordTypes', 'search'],
  GOODS: ['creatorUserId', 'recordTypes', 'search'],
  CANCELLED_ITEMS: ['receiverEmployeeId', 'creatorUserId', 'delivery', 'areaId', 'tableId', 'cancelReason', 'search'], SUMMARY: []
};
export const visibleFiltersForConcern = (concern: EndOfDayConcern) => supportedFilters[concern];
export const FILTER_LABELS: Record<ConcernFilter, string> = { customerId: 'Khách hàng', receiverEmployeeId: 'Người nhận', creatorUserId: 'Người tạo', paymentMethods: 'Phương thức thanh toán', delivery: 'Giao hàng', areaId: 'Khu vực', tableId: 'Bàn', cancelReason: 'Lý do hủy', recordTypes: 'Loại bản ghi', search: 'Tìm chứng từ / món' };
export const formatReceiver = (name: string | null | undefined) => name?.trim() || 'Chưa xác định';
export const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
export const formatTimestamp = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const qualityLabels: Record<string, string> = { legacyPaymentMethodFallbackRows: 'Phương thức thanh toán lịch sử', historicalFallbackRows: 'Dữ liệu hủy lịch sử', quantitySignMismatchRows: 'Số lượng kho sai dấu', unreconciledCount: 'Chưa đối soát', suppressedNonCashReservationVoucherCount: 'Chứng từ đặt bàn phi tiền mặt đã loại trùng', conflictingVoucherIdentityCount: 'Định danh chứng từ xung đột' };
export function qualityFlags(counters: Record<string, number>): string[] {
  return Object.entries(counters).flatMap(([key, count]) => {
    const label = qualityLabels[key.split('.').at(-1)!];
    return label && count > 0 ? [`${label}: ${formatNumber(count)}`] : [];
  });
}
export function changeConcern(filter: EndOfDayReportFilter, concern: EndOfDayConcern): EndOfDayReportFilter {
  const next: EndOfDayReportFilter = { concern, date: filter.date, fromTime: filter.fromTime, toTime: filter.toTime, view: filter.view, page: 1, pageSize: filter.pageSize };
  for (const key of visibleFiltersForConcern(concern)) if (filter[key] !== undefined) Object.assign(next, { [key]: filter[key] });
  return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined));
}
export const DETAIL_HEADERS = ['Mối quan tâm', 'Loại bản ghi', 'Thời điểm', 'Chứng từ', 'Nội dung', 'Người nhận', 'Người tạo', 'Số lượng / ĐVT', 'Giá trị', 'Ghi chú / chất lượng'];
const kindLabels: Record<string, string> = { INVOICE: 'Hóa đơn', SALES_RETURN: 'Trả hàng', SALE_ITEM: 'Món bán', INVENTORY_EVENT: 'Biến động kho', RECEIPT: 'Thu', PAYMENT: 'Chi', ORDER_VOID: 'Hủy đơn', ITEM_CANCEL: 'Hủy món', LEGACY_ORDER_VOID: 'Hủy đơn lịch sử' };
export function detailCells(row: EndOfDayReportRow): string[] {
  const detail = 'detail' in row ? row.detail : row;
  const domain = 'domain' in row ? row.domain : 'direction' in detail ? 'CASHFLOW' : 'quantityKind' in detail ? 'GOODS' : 'lineAmount' in detail ? 'CANCELLED_ITEMS' : 'SALES';
  const kind = 'recordKind' in row ? row.recordKind : 'sourceType' in detail ? detail.sourceType : 'source' in detail ? detail.source : detail.recordType;
  const notes: string[] = [];
  if ('reason' in detail && detail.reason) notes.push(detail.reason);
  if ('note' in detail && detail.note) notes.push(detail.note);
  if ('dataQuality' in detail && detail.dataQuality !== 'RECORDED') notes.push(detail.dataQuality);
  if ('legacyPaymentMethodFallback' in detail && detail.legacyPaymentMethodFallback) notes.push('Phương thức thanh toán lịch sử');
  if ('reconciliationStatus' in detail) notes.push(detail.reconciliationStatus === 'UNRECONCILED' ? 'Chưa đối soát' : 'Đã đối soát');
  if ('inventoryType' in detail && detail.inventoryType) notes.push(detail.inventoryType);
  return [CONCERN_OPTIONS.find(x => x.value === domain)!.label, kindLabels[kind] ?? kind,
    formatTimestamp(row.occurredAt), detail.documentCode ?? '—', 'itemName' in detail ? detail.itemName : 'menuItemName' in detail ? detail.menuItemName : detail.customerName ?? '—',
    'receiverEmployeeId' in detail ? formatReceiver(detail.receiverEmployeeId === null ? null : detail.receiverEmployeeName) : '—',
    formatReceiver(detail.creatorUserName), 'quantity' in detail ? `${formatNumber(detail.quantity)}${'unit' in detail ? ` ${detail.unit}` : ''}` : '—',
    formatNumber('lineAmount' in detail ? detail.lineAmount : detail.amount), notes.join(' · ') || '—'];
}
const summaryLabels: Record<string, string> = {
  sales: 'Bán hàng', cashflow: 'Thu chi', goods: 'Hàng hóa', cancellations: 'Hủy món', completedInvoiceCount: 'Hóa đơn hoàn tất', grossInvoiceValue: 'Giá trị hóa đơn', salesReturnValue: 'Giá trị trả hàng', netInvoiceValue: 'Giá trị hóa đơn thuần', goodsAmount: 'Tiền hàng', discountAmount: 'Giảm giá', vatAmount: 'Thuế VAT', deliveryFee: 'Phí giao hàng', totalReceipts: 'Tổng thu', totalPayments: 'Tổng chi', netCashFlow: 'Thu chi thuần', unreconciledCount: 'Chưa đối soát', byPaymentMethod: 'Theo thanh toán', byAccount: 'Theo tài khoản', byCategory: 'Theo danh mục', bySource: 'Theo nguồn', saleItemCount: 'Dòng món bán', soldMenuItemQuantity: 'Số lượng món bán', saleItemAmount: 'Giá trị món bán', inventoryEventCount: 'Biến động kho', inventoryQuantityByUnit: 'Số lượng kho theo đơn vị', stockInCost: 'Chi phí nhập kho', purchaseReturnCost: 'Chi phí trả nhà cung cấp', autoDeductCost: 'Chi phí xuất bán', salesReturnCost: 'Chi phí hàng trả', netSalesCogs: 'Giá vốn bán hàng thuần', kitchenWasteCost: 'Chi phí hao hụt bếp', manualAdjustmentCost: 'Chi phí điều chỉnh', voidRestoreCost: 'Chi phí hoàn kho', cancelledOrderCount: 'Đơn hủy', cancelledItemCount: 'Dòng món hủy', cancelledQuantity: 'Số lượng hủy', cancelledLineAmount: 'Giá trị dòng món hủy', unrecognizedLineAmount: 'Giá trị chưa ghi nhận', historicalFallbackRows: 'Dòng dữ liệu lịch sử', byReason: 'Theo lý do hủy', byCancelledByUser: 'Theo người hủy', byPreparationState: 'Theo trạng thái chế biến', byInventoryEffect: 'Theo tác động kho', estimatedContributionBeforeWaste: 'Đóng góp ước tính trước hao hụt', estimatedContributionAfterWaste: 'Đóng góp ước tính sau hao hụt', quantity: 'Số lượng', lineAmount: 'Giá trị dòng', eventCount: 'Số sự kiện', rowCount: 'Số dòng'
};
export interface SummarySection { title: string; metrics: { label: string; value: number }[]; breakdowns: { title: string; entries: { label: string; metrics: { label: string; value: number }[] }[] }[] }
export function summarySections(summary: EndOfDayReportSummary): SummarySection[] {
  const sections: SummarySection[] = [];
  function visit(value: Record<string, unknown>, title: string) {
    const section: SummarySection = { title, metrics: [], breakdowns: [] };
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'invariantCounters') continue;
      if (typeof entry === 'number') section.metrics.push({ label: summaryLabels[key] ?? key, value: entry });
      else if (Array.isArray(entry)) section.breakdowns.push({ title: summaryLabels[key] ?? key, entries: entry.map(item => ({ label: item.label ?? item.unit ?? 'Chưa xác định', metrics: Object.entries(item).filter(([k, v]) => typeof v === 'number' && !['value', 'cancelledByUserId'].includes(k)).map(([k, v]) => ({ label: summaryLabels[k] ?? k, value: v as number })) })) });
      else if (entry && typeof entry === 'object') visit(entry as Record<string, unknown>, summaryLabels[key] ?? key);
    }
    if (section.metrics.length || section.breakdowns.length) sections.push(section);
  }
  visit(summary as unknown as Record<string, unknown>, 'Tổng quan');
  return sections;
}
