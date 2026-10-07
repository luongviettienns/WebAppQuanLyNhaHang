/** ISO timestamps are serialized strings at the response boundary, never Date objects. */
export type IsoTimestamp = string;
export type EndOfDayConcern = 'SALES' | 'CASHFLOW' | 'GOODS' | 'CANCELLED_ITEMS' | 'SUMMARY';
export type EndOfDayView = 'VERTICAL' | 'HORIZONTAL';
export type EndOfDayTimezone = 'Asia/Ho_Chi_Minh';
export type EndOfDayPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'E_WALLET';
export type CashflowRecordType =
  | 'MANUAL' | 'RESERVATION_DEPOSIT' | 'RESERVATION_REFUND' | 'ORDER_PAYMENT'
  | 'SALES_RETURN_REFUND' | 'PURCHASE_RECEIPT_PAYMENT' | 'SUPPLIER_PAYMENT'
  | 'PURCHASE_RETURN_REFUND' | 'PAYROLL_PAYMENT' | 'REVERSAL';
export type GoodsRecordType =
  | 'SALE_ITEM' | 'INVENTORY_EVENT' | 'STOCK_IN' | 'PURCHASE_RETURN' | 'AUTO_DEDUCT'
  | 'KITCHEN_WASTE' | 'MANUAL_ADJUST' | 'VOID_RESTORE' | 'SALES_RETURN';
export type EndOfDaySortBy = 'occurredAt' | 'documentCode' | 'amount' | 'sourceType' | 'recordType' | 'quantity' | 'menuItemName' | 'lineAmount';
export type EndOfDayFilter = 'customerId' | 'receiverEmployeeId' | 'creatorUserId' | 'paymentMethods' | 'delivery' | 'areaId' | 'tableId' | 'cancelReason' | 'recordTypes' | 'search';

/** Parser output. Filters are checked against concern before adapters receive this query. */
export interface EndOfDayReportQuery {
  date: string;
  fromTime?: string;
  toTime?: string;
  from: Date;
  to: Date;
  timezone: EndOfDayTimezone;
  concern: EndOfDayConcern;
  view: EndOfDayView;
  customerId?: number | null;
  receiverEmployeeId?: number | null;
  creatorUserId?: number | null;
  paymentMethods?: EndOfDayPaymentMethod[] | null;
  delivery?: boolean | null;
  areaId?: number | null;
  tableId?: number | null;
  cancelReason?: string | null;
  recordTypes?: (CashflowRecordType | GoodsRecordType)[] | null;
  search?: string | null;
  page: number;
  pageSize: number;
  sortBy?: EndOfDaySortBy;
  sortOrder?: 'asc' | 'desc';
}

export interface EndOfDayReportMetadata {
  date: string;
  from: IsoTimestamp;
  to: IsoTimestamp;
  timezone: EndOfDayTimezone;
  /** DB-clock correlation marker sampled inside the consistent-read transaction. */
  asOf: IsoTimestamp;
  /** Server completion time of the complete response; distinct from asOf. */
  generatedAt: IsoTimestamp;
  concern: EndOfDayConcern;
  view: EndOfDayView;
  operatingScope: { code: 'MAIN'; name: 'Nhà hàng chính'; locked: true };
}

export interface EndOfDayFilterOption {
  value: string | number | boolean | null;
  label: string;
}

/** Facets use all active filters except their own dimension, within the same snapshot. */
export type EndOfDayFilterOptions = Partial<Record<EndOfDayFilter, EndOfDayFilterOption[]>>;

export interface NormalizedConcernResult<Row = Record<string, unknown>, Summary = Record<string, unknown>> {
  records: Row[];
  summary: Summary;
  /** Unpaginated event/record count: never infer emptiness from a zero-valued aggregate. */
  totalRows: number;
  filterOptions: EndOfDayFilterOptions;
  invariantCounters: Record<string, number>;
}

export interface EndOfDayReportResponse<Row = Record<string, unknown>, Summary = Record<string, unknown>> {
  metadata: EndOfDayReportMetadata;
  /** True when the concern has records/events, even if its totals cancel to zero. */
  hasData: boolean;
  summary: Summary;
  rows: Row[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  filterOptions: EndOfDayFilterOptions;
}
