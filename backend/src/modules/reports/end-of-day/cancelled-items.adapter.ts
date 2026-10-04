import { Prisma, type CancellationInventoryEffect, type CancellationPreparationState, type OrderItemCancellationSource, type OrderStatus } from '@prisma/client';
import type { EndOfDayFilter, EndOfDayFilterOptions, EndOfDayReportQuery, NormalizedConcernResult } from './end-of-day.types';

export interface CancelledItemReportRow {
  rowKey: string;
  cancellationId: number | null;
  source: OrderItemCancellationSource | 'LEGACY_ORDER_VOID';
  sourceKey: string;
  dataQuality: 'RECORDED' | 'HISTORICAL_FALLBACK';
  orderId: number;
  orderItemId: number;
  menuItemId: number;
  occurredAt: string;
  documentCode: string;
  menuItemSku: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  reason: string | null;
  cancelledByUserId: number | null;
  cancelledByUserName: string;
  /** Unknown historical facts stay null rather than being reconstructed from current status. */
  orderStatusSnapshot: OrderStatus | null;
  preparationStateSnapshot: CancellationPreparationState;
  inventoryEffect: CancellationInventoryEffect | null;
  inventoryWasteId: number | null;
  creatorUserId: number | null;
  creatorUserName: string;
  receiverEmployeeId: number | null;
  receiverEmployeeName: string;
  delivery: boolean;
  areaId: number | null;
  areaName: string;
  tableId: number | null;
  tableNumber: number | null;
}
export interface CancellationBreakdown {
  value: string | null;
  label: string;
  rowCount: number;
  quantity: number;
  lineAmount: number;
}
export interface CancellationActorBreakdown {
  cancelledByUserId: number | null;
  label: string;
  rowCount: number;
  quantity: number;
  lineAmount: number;
}
export interface CancelledItemsSummary {
  cancelledOrderCount: number;
  cancelledItemCount: number;
  cancelledQuantity: number;
  cancelledLineAmount: number;
  /** Operational audit value only. Never subtract it from Sales or change Order.finalAmount. */
  unrecognizedLineAmount: number;
  historicalFallbackRows: number;
  byReason: CancellationBreakdown[];
  byCancelledByUser: CancellationActorBreakdown[];
  byPreparationState: CancellationBreakdown[];
  byInventoryEffect: CancellationBreakdown[];
}
type SqlNumber = number | bigint | Prisma.Decimal;
type SqlRow = Omit<CancelledItemReportRow, 'rowKey' | 'occurredAt' | 'delivery'> & {
  occurredAt: Date; rowKind: SqlNumber; sourceId: SqlNumber; delivery: SqlNumber; unrecognized: SqlNumber;
};
type SqlTotals = Record<'totalRows' | 'cancelledOrderCount' | 'cancelledQuantity' | 'cancelledLineAmount' | 'unrecognizedLineAmount' | 'historicalFallbackRows', SqlNumber>;
const text = (value: Prisma.Sql) => Prisma.sql`CAST(${value} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci`;
const dimensions = Prisma.sql`o.id AS orderId, ${text(Prisma.sql`o.code`)} AS documentCode,
  o.createdByUserId AS creatorUserId, ${text(Prisma.sql`COALESCE(u.name, 'Chưa xác định')`)} AS creatorUserName,
  o.receivedByEmployeeId AS receiverEmployeeId, ${text(Prisma.sql`COALESCE(e.name, 'Chưa xác định')`)} AS receiverEmployeeName,
  (o.orderType = 'DELIVERY') AS delivery, t.areaId, ${text(Prisma.sql`COALESCE(a.name, 'Chưa xác định')`)} AS areaName,
  o.tableId, t.tableNumber`;
const joins = Prisma.sql`LEFT JOIN User u ON u.id = o.createdByUserId
  LEFT JOIN Employee e ON e.id = o.receivedByEmployeeId
  LEFT JOIN DiningTable t ON t.id = o.tableId LEFT JOIN TableArea a ON a.id = t.areaId`;

function filtered(query: EndOfDayReportQuery, omitted?: EndOfDayFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  const columns = { creatorUserId: Prisma.sql`creatorUserId`, receiverEmployeeId: Prisma.sql`receiverEmployeeId`, areaId: Prisma.sql`areaId`, tableId: Prisma.sql`tableId` };
  for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
    if (key !== omitted && query[key] != null) conditions.push(Prisma.sql`${columns[key]} = ${query[key]}`);
  }
  if (omitted !== 'delivery' && query.delivery != null) conditions.push(Prisma.sql`delivery = ${query.delivery}`);
  if (omitted !== 'cancelReason' && query.cancelReason != null) conditions.push(Prisma.sql`reason = ${query.cancelReason}`);
  if (query.search) conditions.push(Prisma.sql`(LOCATE(${query.search}, documentCode) > 0 OR LOCATE(${query.search}, menuItemSku) > 0
    OR LOCATE(${query.search}, menuItemName) > 0 OR LOCATE(${query.search}, reason) > 0
    OR LOCATE(${query.search}, creatorUserName) > 0 OR LOCATE(${query.search}, cancelledByUserName) > 0
    OR LOCATE(${query.search}, receiverEmployeeName) > 0 OR LOCATE(${query.search}, areaName) > 0
    OR LOCATE(${query.search}, CAST(tableNumber AS CHAR)) > 0)`);
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

/** Ledger facts do not depend on the Order's current status, item values, or menu catalog. */
function source(query: EndOfDayReportQuery, omitted?: EndOfDayFilter): Prisma.Sql {
  return Prisma.sql`SELECT * FROM (
    SELECT 0 AS rowKind, c.id AS sourceId, c.id AS cancellationId,
      ${text(Prisma.sql`c.source`)} AS source, ${text(Prisma.sql`c.sourceKey`)} AS sourceKey,
      'RECORDED' AS dataQuality, c.orderItemId, c.menuItemId, c.cancelledAt AS occurredAt,
      ${text(Prisma.sql`c.menuItemSku`)} AS menuItemSku, ${text(Prisma.sql`c.menuItemName`)} AS menuItemName,
      c.quantity, c.unitPrice, c.lineAmount, ${text(Prisma.sql`c.reason`)} AS reason,
      c.cancelledByUserId, ${text(Prisma.sql`COALESCE(actor.name, 'Chưa xác định')`)} AS cancelledByUserName,
      ${text(Prisma.sql`c.orderStatusSnapshot`)} AS orderStatusSnapshot,
      ${text(Prisma.sql`c.preparationStateSnapshot`)} AS preparationStateSnapshot,
      ${text(Prisma.sql`c.inventoryEffect`)} AS inventoryEffect, c.inventoryWasteId,
      (c.orderStatusSnapshot <> 'COMPLETED') AS unrecognized, ${dimensions}
    FROM OrderItemCancellation c JOIN \`Order\` o ON o.id = c.orderId ${joins}
    LEFT JOIN User actor ON actor.id = c.cancelledByUserId
    WHERE c.cancelledAt >= ${query.from} AND c.cancelledAt < ${query.to}
    UNION ALL
    SELECT 1, oi.id, NULL, 'LEGACY_ORDER_VOID', ${text(Prisma.sql`CONCAT('LEGACY_ORDER_VOID:', o.id, ':', oi.id)`)},
      'HISTORICAL_FALLBACK', oi.id, oi.menuItemId, o.cancelledAt, ${text(Prisma.sql`m.sku`)}, ${text(Prisma.sql`m.name`)},
      oi.quantity, oi.unitPrice, oi.subtotal, ${text(Prisma.sql`o.voidReason`)}, o.voidedByUserId,
      ${text(Prisma.sql`COALESCE(actor.name, 'Chưa xác định')`)}, NULL, 'UNKNOWN', NULL, NULL,
      (o.completedAt IS NULL), ${dimensions}
    FROM \`Order\` o JOIN OrderItem oi ON oi.orderId = o.id JOIN MenuItem m ON m.id = oi.menuItemId ${joins}
    LEFT JOIN User actor ON actor.id = o.voidedByUserId
    WHERE o.status = 'CANCELLED' AND o.cancelledAt >= ${query.from} AND o.cancelledAt < ${query.to}
      AND NOT EXISTS (SELECT 1 FROM OrderItemCancellation anyCancellation WHERE anyCancellation.orderId = o.id)
  ) cancellationSource ${filtered(query, omitted)}`;
}
const numeric = (value: number | null) => value === null ? null : Number(value);
function mapRow(row: SqlRow): CancelledItemReportRow {
  return {
    rowKey: `${Number(row.rowKind) === 0 ? 'CANCELLATION' : 'LEGACY_ORDER_VOID'}:${Number(row.sourceId)}`,
    cancellationId: numeric(row.cancellationId), source: row.source, sourceKey: row.sourceKey, dataQuality: row.dataQuality,
    orderId: Number(row.orderId), orderItemId: Number(row.orderItemId), menuItemId: Number(row.menuItemId),
    occurredAt: row.occurredAt.toISOString(), documentCode: row.documentCode,
    menuItemSku: row.menuItemSku, menuItemName: row.menuItemName, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), lineAmount: Number(row.lineAmount), reason: row.reason,
    cancelledByUserId: numeric(row.cancelledByUserId), cancelledByUserName: row.cancelledByUserName,
    orderStatusSnapshot: row.orderStatusSnapshot, preparationStateSnapshot: row.preparationStateSnapshot,
    inventoryEffect: row.inventoryEffect, inventoryWasteId: numeric(row.inventoryWasteId),
    creatorUserId: numeric(row.creatorUserId), creatorUserName: row.creatorUserName,
    receiverEmployeeId: numeric(row.receiverEmployeeId), receiverEmployeeName: row.receiverEmployeeName,
    delivery: Boolean(Number(row.delivery)), areaId: numeric(row.areaId), areaName: row.areaName, tableId: numeric(row.tableId), tableNumber: numeric(row.tableNumber)
  };
}
const facetColumns = {
  creatorUserId: Prisma.sql`creatorUserId AS value, creatorUserName AS label`,
  receiverEmployeeId: Prisma.sql`receiverEmployeeId AS value, receiverEmployeeName AS label`,
  areaId: Prisma.sql`areaId AS value, areaName AS label`,
  tableId: Prisma.sql`tableId AS value, COALESCE(CONCAT('Bàn ', tableNumber), 'Chưa xác định') AS label`,
  delivery: Prisma.sql`delivery AS value, CASE WHEN delivery = 1 THEN 'Giao hàng' ELSE 'Không giao hàng' END AS label`,
  cancelReason: Prisma.sql`reason AS value, COALESCE(reason, 'Chưa xác định') AS label`
};
const breakdownColumns = {
  byReason: Prisma.sql`reason`, byPreparationState: Prisma.sql`preparationStateSnapshot`, byInventoryEffect: Prisma.sql`inventoryEffect`
};

export class CancelledItemsReportAdapter {
  static async read(tx: Prisma.TransactionClient, query: EndOfDayReportQuery): Promise<NormalizedConcernResult<CancelledItemReportRow, CancelledItemsSummary>> {
    const dataset = source(query);
    const [totals] = await tx.$queryRaw<SqlTotals[]>(Prisma.sql`SELECT COUNT(*) AS totalRows,
      COUNT(DISTINCT orderId) AS cancelledOrderCount, COALESCE(SUM(quantity), 0) AS cancelledQuantity,
      COALESCE(SUM(lineAmount), 0) AS cancelledLineAmount,
      COALESCE(SUM(CASE WHEN unrecognized = 1 THEN lineAmount ELSE 0 END), 0) AS unrecognizedLineAmount,
      COALESCE(SUM(rowKind = 1), 0) AS historicalFallbackRows FROM (${dataset}) cancellations`);
    const sortColumns = { occurredAt: Prisma.sql`occurredAt`, menuItemName: Prisma.sql`menuItemName`, quantity: Prisma.sql`quantity`, lineAmount: Prisma.sql`lineAmount` };
    const sortBy = query.sortBy ?? 'occurredAt';
    if (!(sortBy in sortColumns)) throw new Error('Unsupported Cancelled Items sort field');
    const direction = query.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const rows = await tx.$queryRaw<SqlRow[]>(Prisma.sql`SELECT * FROM (${dataset}) cancellations
      ORDER BY ${sortColumns[sortBy as keyof typeof sortColumns]} ${direction}, rowKind ASC, sourceId ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    const filterOptions: EndOfDayFilterOptions = {};
    for (const dimension of Object.keys(facetColumns) as (keyof typeof facetColumns)[]) {
      const options = await tx.$queryRaw<{ value: string | number | null; label: string }[]>(Prisma.sql`
        SELECT DISTINCT ${facetColumns[dimension]} FROM (${source(query, dimension)}) cancellations ORDER BY value ASC`);
      filterOptions[dimension] = options.map(option => ({
        value: option.value === null ? null : dimension === 'cancelReason' ? String(option.value) : dimension === 'delivery' ? Boolean(Number(option.value)) : Number(option.value),
        label: option.label
      }));
    }
    const breakdowns = {} as Pick<CancelledItemsSummary, keyof typeof breakdownColumns>;
    for (const dimension of Object.keys(breakdownColumns) as (keyof typeof breakdownColumns)[]) {
      const column = breakdownColumns[dimension];
      const values = await tx.$queryRaw<{ value: string | null; label: string; rowCount: SqlNumber; quantity: SqlNumber; lineAmount: SqlNumber }[]>(Prisma.sql`
        SELECT ${column} AS value, COALESCE(${column}, 'Chưa xác định') AS label, COUNT(*) AS rowCount,
          SUM(quantity) AS quantity, SUM(lineAmount) AS lineAmount FROM (${dataset}) cancellations GROUP BY ${column} ORDER BY value ASC`);
      breakdowns[dimension] = values.map(row => ({ value: row.value, label: row.label, rowCount: Number(row.rowCount), quantity: Number(row.quantity), lineAmount: Number(row.lineAmount) }));
    }
    const actors = await tx.$queryRaw<{ cancelledByUserId: number | null; label: string; rowCount: SqlNumber; quantity: SqlNumber; lineAmount: SqlNumber }[]>(Prisma.sql`
      SELECT cancelledByUserId, cancelledByUserName AS label, COUNT(*) AS rowCount, SUM(quantity) AS quantity,
        SUM(lineAmount) AS lineAmount FROM (${dataset}) cancellations GROUP BY cancelledByUserId, cancelledByUserName ORDER BY cancelledByUserId ASC`);
    const totalRows = Number(totals.totalRows), cancelledOrderCount = Number(totals.cancelledOrderCount), historicalFallbackRows = Number(totals.historicalFallbackRows);
    return {
      records: rows.map(mapRow), totalRows, filterOptions,
      summary: {
        cancelledOrderCount, cancelledItemCount: totalRows, cancelledQuantity: Number(totals.cancelledQuantity),
        cancelledLineAmount: Number(totals.cancelledLineAmount), unrecognizedLineAmount: Number(totals.unrecognizedLineAmount), historicalFallbackRows,
        ...breakdowns, byCancelledByUser: actors.map(row => ({ cancelledByUserId: numeric(row.cancelledByUserId), label: row.label, rowCount: Number(row.rowCount), quantity: Number(row.quantity), lineAmount: Number(row.lineAmount) }))
      },
      invariantCounters: { totalRows, cancelledOrderCount, historicalFallbackRows, recordedCancellationRows: totalRows - historicalFallbackRows }
    };
  }
}
