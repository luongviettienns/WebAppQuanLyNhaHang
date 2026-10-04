import { Prisma } from '@prisma/client';
import type {
  EndOfDayFilter, EndOfDayFilterOptions, EndOfDayPaymentMethod, EndOfDayReportQuery,
  NormalizedConcernResult
} from './end-of-day.types';

export interface SalesReportRow {
  recordType: 'INVOICE' | 'SALES_RETURN';
  orderId: number;
  orderReturnId: number | null;
  occurredAt: string;
  documentCode: string;
  sourceOrderCode: string;
  /** Signed invoice value or negative refund due, never a cash receipt/refund. */
  amount: number;
  finalAmount: number | null;
  totalRefundDue: number | null;
  /** Invoice snapshots only; return rows have zero component values. */
  goodsAmount: number;
  discountAmount: number;
  vatAmount: number;
  deliveryFee: number;
  customerId: number | null;
  customerName: string;
  receiverEmployeeId: number | null;
  receiverEmployeeName: string;
  creatorUserId: number | null;
  creatorUserName: string;
  delivery: boolean;
  areaId: number | null;
  areaName: string;
  tableId: number | null;
  tableNumber: number | null;
  paymentMethods: EndOfDayPaymentMethod[];
  legacyPaymentMethodFallback: boolean;
}

export interface SalesSummary {
  completedInvoiceCount: number;
  grossInvoiceValue: number;
  salesReturnValue: number;
  netInvoiceValue: number;
  goodsAmount: number;
  discountAmount: number;
  vatAmount: number;
  deliveryFee: number;
}

type SqlNumber = number | bigint | Prisma.Decimal;
type SqlRow = Omit<SalesReportRow, 'recordType' | 'occurredAt' | 'paymentMethods' | 'delivery' | 'legacyPaymentMethodFallback'> & {
  rowKind: SqlNumber;
  sourceId: SqlNumber;
  occurredAt: Date;
  paymentMethods: string | null;
  delivery: SqlNumber;
  legacyPaymentMethodFallback: SqlNumber;
};
type SqlTotals = Record<Exclude<keyof SalesSummary, 'netInvoiceValue'> | 'totalRows' | 'salesReturnCount' | 'legacyPaymentMethodFallbackRows', SqlNumber | null>;

const noPayments = Prisma.sql`NOT EXISTS (SELECT 1 FROM OrderPaymentTransaction p WHERE p.orderId = o.id)`;
// The existing migrations use different collations for legacy and transaction payment enums.
const paymentMethods = Prisma.sql`CASE WHEN ${noPayments} THEN o.paymentMethod ELSE
  (SELECT GROUP_CONCAT(DISTINCT p.paymentMethod COLLATE utf8mb4_unicode_ci ORDER BY p.paymentMethod SEPARATOR ',')
   FROM OrderPaymentTransaction p WHERE p.orderId = o.id AND p.status = 'SUCCESS') END`;
const dimensions = Prisma.sql`
  o.id AS orderId, o.code AS sourceOrderCode,
  o.customerId, COALESCE(c.name, 'Chưa xác định') AS customerName,
  o.receivedByEmployeeId AS receiverEmployeeId, COALESCE(e.name, 'Chưa xác định') AS receiverEmployeeName,
  o.createdByUserId AS creatorUserId, COALESCE(u.name, 'Chưa xác định') AS creatorUserName,
  (o.orderType = 'DELIVERY') AS delivery,
  t.areaId, COALESCE(a.name, 'Chưa xác định') AS areaName, o.tableId, t.tableNumber,
  ${paymentMethods} AS paymentMethods,
  (${noPayments} AND o.paymentMethod IS NOT NULL) AS legacyPaymentMethodFallback`;
const dimensionJoins = Prisma.sql`
  LEFT JOIN Customer c ON c.id = o.customerId
  LEFT JOIN Employee e ON e.id = o.receivedByEmployeeId
  LEFT JOIN User u ON u.id = o.createdByUserId
  LEFT JOIN DiningTable t ON t.id = o.tableId
  LEFT JOIN TableArea a ON a.id = t.areaId`;

/** Shared predicate for invoices, returns, summary and each self-excluding facet. */
function filters(query: EndOfDayReportQuery, documentCode: Prisma.Sql, omitted?: EndOfDayFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  const ids = {
    customerId: Prisma.sql`o.customerId`, receiverEmployeeId: Prisma.sql`o.receivedByEmployeeId`,
    creatorUserId: Prisma.sql`o.createdByUserId`, areaId: Prisma.sql`t.areaId`, tableId: Prisma.sql`o.tableId`
  };
  for (const dimension of Object.keys(ids) as (keyof typeof ids)[]) {
    const value = query[dimension];
    if (dimension !== omitted && value != null) conditions.push(Prisma.sql`${ids[dimension]} = ${value}`);
  }
  if (omitted !== 'delivery' && query.delivery != null) {
    conditions.push(query.delivery ? Prisma.sql`o.orderType = 'DELIVERY'` : Prisma.sql`o.orderType <> 'DELIVERY'`);
  }
  if (omitted !== 'paymentMethods' && query.paymentMethods?.length) {
    conditions.push(Prisma.sql`(
      EXISTS (SELECT 1 FROM OrderPaymentTransaction p WHERE p.orderId = o.id
        AND p.status = 'SUCCESS' AND p.paymentMethod IN (${Prisma.join(query.paymentMethods)}))
      OR (${noPayments} AND o.paymentMethod IN (${Prisma.join(query.paymentMethods)})))`);
  }
  if (omitted !== 'search' && query.search) {
    // Literal substring semantics: SQL wildcard characters in a search are ordinary text.
    conditions.push(Prisma.sql`(LOCATE(${query.search}, o.code) > 0 OR LOCATE(${query.search}, c.name) > 0
      OR LOCATE(${query.search}, e.name) > 0 OR LOCATE(${query.search}, u.name) > 0
      OR LOCATE(${query.search}, a.name) > 0 OR LOCATE(${query.search}, CAST(t.tableNumber AS CHAR)) > 0
      OR LOCATE(${query.search}, ${documentCode}) > 0)`);
  }
  return conditions.length ? Prisma.sql`AND ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

function source(query: EndOfDayReportQuery, omitted?: EndOfDayFilter): Prisma.Sql {
  return Prisma.sql`
    SELECT 0 AS rowKind, o.id AS sourceId, NULL AS orderReturnId,
      o.completedAt AS occurredAt, o.code AS documentCode, o.finalAmount AS amount,
      o.finalAmount, NULL AS totalRefundDue, o.totalAmount AS goodsAmount,
      o.discountAmount, o.vatAmount, o.deliveryFee, ${dimensions}
    FROM \`Order\` o
    ${dimensionJoins}
    WHERE o.status = 'COMPLETED' AND o.completedAt >= ${query.from} AND o.completedAt < ${query.to}
    ${filters(query, Prisma.sql`o.code`, omitted)}
    UNION ALL
    SELECT 1 AS rowKind, r.id AS sourceId, r.id AS orderReturnId,
      r.returnedAt AS occurredAt, r.returnCode AS documentCode, -r.totalRefundDue AS amount,
      NULL AS finalAmount, r.totalRefundDue, 0 AS goodsAmount, 0 AS discountAmount, 0 AS vatAmount, 0 AS deliveryFee,
      ${dimensions}
    FROM OrderReturn r JOIN \`Order\` o ON o.id = r.orderId
    ${dimensionJoins}
    WHERE r.status = 'COMPLETED' AND r.returnedAt >= ${query.from} AND r.returnedAt < ${query.to}
    ${filters(query, Prisma.sql`r.returnCode`, omitted)}`;
}

function mapRow(row: SqlRow): SalesReportRow {
  const nullableNumber = (value: number | null) => value === null ? null : Number(value);
  return {
    recordType: Number(row.rowKind) === 0 ? 'INVOICE' : 'SALES_RETURN',
    orderId: Number(row.orderId), orderReturnId: nullableNumber(row.orderReturnId),
    occurredAt: row.occurredAt.toISOString(), documentCode: row.documentCode, sourceOrderCode: row.sourceOrderCode,
    amount: Number(row.amount), finalAmount: nullableNumber(row.finalAmount), totalRefundDue: nullableNumber(row.totalRefundDue),
    goodsAmount: Number(row.goodsAmount), discountAmount: Number(row.discountAmount), vatAmount: Number(row.vatAmount), deliveryFee: Number(row.deliveryFee),
    customerId: nullableNumber(row.customerId), customerName: row.customerName,
    receiverEmployeeId: nullableNumber(row.receiverEmployeeId), receiverEmployeeName: row.receiverEmployeeName,
    creatorUserId: nullableNumber(row.creatorUserId), creatorUserName: row.creatorUserName,
    delivery: Boolean(Number(row.delivery)), areaId: nullableNumber(row.areaId), areaName: row.areaName,
    tableId: nullableNumber(row.tableId), tableNumber: nullableNumber(row.tableNumber),
    paymentMethods: row.paymentMethods ? row.paymentMethods.split(',') as EndOfDayPaymentMethod[] : [],
    legacyPaymentMethodFallback: Boolean(Number(row.legacyPaymentMethodFallback))
  };
}

const facetColumns = {
  customerId: Prisma.sql`customerId AS value, customerName AS label`,
  receiverEmployeeId: Prisma.sql`receiverEmployeeId AS value, receiverEmployeeName AS label`,
  creatorUserId: Prisma.sql`creatorUserId AS value, creatorUserName AS label`,
  areaId: Prisma.sql`areaId AS value, areaName AS label`,
  tableId: Prisma.sql`tableId AS value, COALESCE(CONCAT('Bàn ', tableNumber), 'Chưa xác định') AS label`,
  delivery: Prisma.sql`delivery AS value, CASE WHEN delivery = 1 THEN 'Giao hàng' ELSE 'Không giao hàng' END AS label`
};

export class SalesReportAdapter {
  static async read(tx: Prisma.TransactionClient, query: EndOfDayReportQuery): Promise<NormalizedConcernResult<SalesReportRow, SalesSummary>> {
    const dataset = source(query);
    const [totals] = await tx.$queryRaw<SqlTotals[]>(Prisma.sql`
      SELECT COUNT(*) AS totalRows, COALESCE(SUM(rowKind = 0), 0) AS completedInvoiceCount,
        COALESCE(SUM(rowKind = 1), 0) AS salesReturnCount,
        COALESCE(SUM(finalAmount), 0) AS grossInvoiceValue, COALESCE(SUM(totalRefundDue), 0) AS salesReturnValue,
        COALESCE(SUM(goodsAmount), 0) AS goodsAmount, COALESCE(SUM(discountAmount), 0) AS discountAmount,
        COALESCE(SUM(vatAmount), 0) AS vatAmount, COALESCE(SUM(deliveryFee), 0) AS deliveryFee,
        COALESCE(SUM(legacyPaymentMethodFallback), 0) AS legacyPaymentMethodFallbackRows
      FROM (${dataset}) sales`);
    const sortColumns = { occurredAt: Prisma.sql`occurredAt`, documentCode: Prisma.sql`documentCode`, amount: Prisma.sql`amount` };
    const sortBy = query.sortBy ?? 'occurredAt';
    if (!(sortBy in sortColumns)) throw new Error('Unsupported Sales sort field');
    const sortColumn = sortColumns[sortBy as keyof typeof sortColumns];
    const direction = query.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const rows = await tx.$queryRaw<SqlRow[]>(Prisma.sql`
      SELECT * FROM (${dataset}) sales ORDER BY ${sortColumn} ${direction}, rowKind ASC, sourceId ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    const filterOptions: EndOfDayFilterOptions = {};
    for (const dimension of Object.keys(facetColumns) as (keyof typeof facetColumns)[]) {
      const options = await tx.$queryRaw<Array<{ value: number | null; label: string }>>(Prisma.sql`
        SELECT DISTINCT ${facetColumns[dimension]} FROM (${source(query, dimension)}) sales ORDER BY value ASC`);
      filterOptions[dimension] = options.map(option => ({
        value: option.value === null ? null : dimension === 'delivery' ? Boolean(Number(option.value)) : Number(option.value),
        label: option.label
      }));
    }
    const methods = await tx.$queryRaw<Array<{ paymentMethods: string | null }>>(Prisma.sql`
      SELECT DISTINCT paymentMethods FROM (${source(query, 'paymentMethods')}) sales`);
    const distinctMethods = new Set(methods.flatMap(row => row.paymentMethods?.split(',') ?? []));
    filterOptions.paymentMethods = [...distinctMethods].sort().map(value => ({ value, label: {
      CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', CREDIT_CARD: 'Thẻ tín dụng', E_WALLET: 'Ví điện tử'
    }[value as EndOfDayPaymentMethod] }));
    const grossInvoiceValue = Number(totals.grossInvoiceValue);
    const salesReturnValue = Number(totals.salesReturnValue);
    const completedInvoiceCount = Number(totals.completedInvoiceCount);
    const totalRows = Number(totals.totalRows);
    return {
      records: rows.map(mapRow), totalRows, filterOptions,
      summary: {
        completedInvoiceCount, grossInvoiceValue, salesReturnValue, netInvoiceValue: grossInvoiceValue - salesReturnValue,
        goodsAmount: Number(totals.goodsAmount), discountAmount: Number(totals.discountAmount),
        vatAmount: Number(totals.vatAmount), deliveryFee: Number(totals.deliveryFee)
      },
      invariantCounters: { totalRows, completedInvoiceCount, salesReturnCount: Number(totals.salesReturnCount),
        legacyPaymentMethodFallbackRows: Number(totals.legacyPaymentMethodFallbackRows) }
    };
  }
}
