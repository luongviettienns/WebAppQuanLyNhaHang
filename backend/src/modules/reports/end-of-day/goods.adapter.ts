import { Prisma, type InventoryTransactionType } from '@prisma/client';
import type { EndOfDayFilter, EndOfDayFilterOptions, EndOfDayReportQuery, NormalizedConcernResult } from './end-of-day.types';

export interface GoodsReportRow {
  rowKey: string;
  recordType: 'SALE_ITEM' | 'INVENTORY_EVENT';
  inventoryType: InventoryTransactionType | null;
  orderId: number | null;
  orderItemId: number | null;
  inventoryTransactionId: number | null;
  occurredAt: string;
  documentCode: string | null;
  menuItemId: number | null;
  ingredientId: number | null;
  itemSku: string;
  itemName: string;
  quantityKind: 'MENU_ITEM' | 'INGREDIENT';
  /** Signed source quantity. Ingredient units must never be added to menu portions. */
  quantity: number;
  unit: string;
  unitPrice: number | null;
  /** Sale subtotal or interpreted signed inventory cost; these are distinct row kinds. */
  amount: number;
  /** Stored ledger cost, followed by type-interpreted inventory value. Sales have neither. */
  costAmount: number | null;
  signedCostAmount: number | null;
  creatorUserId: number | null;
  creatorUserName: string;
  note: string | null;
  dataQuality: 'RECORDED' | 'QUANTITY_SIGN_MISMATCH';
  /** Existing OrderItem stores quantity/price/subtotal, but names and units come from catalog. */
  catalogLabelSource: 'CURRENT_CATALOG';
}
export interface GoodsSummary {
  saleItemCount: number;
  soldMenuItemQuantity: number;
  saleItemAmount: number;
  inventoryEventCount: number;
  inventoryQuantityByUnit: { unit: string; quantity: number }[];
  stockInCost: number;
  purchaseReturnCost: number;
  autoDeductCost: number;
  salesReturnCost: number;
  netSalesCogs: number;
  kitchenWasteCost: number;
  manualAdjustmentCost: number;
  voidRestoreCost: number;
}
type SqlNumber = number | bigint | Prisma.Decimal;
type SqlRow = Omit<GoodsReportRow, 'rowKey' | 'occurredAt' | 'dataQuality' | 'catalogLabelSource'> & {
  rowKind: SqlNumber; sourceId: SqlNumber; occurredAt: Date; signMismatch: SqlNumber;
};
type SqlTotals = Record<Exclude<keyof GoodsSummary, 'inventoryQuantityByUnit' | 'netSalesCogs'> | 'totalRows' | 'quantitySignMismatchRows', SqlNumber>;

// Normalize historical column collations before UNION, including notes and type enums.
const text = (value: Prisma.Sql) => Prisma.sql`CAST(${value} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci`;
const signedCost = Prisma.sql`CASE
  WHEN i.type IN ('STOCK_IN', 'VOID_RESTORE', 'SALES_RETURN') THEN ABS(i.costAmount)
  WHEN i.type IN ('PURCHASE_RETURN', 'AUTO_DEDUCT', 'KITCHEN_WASTE') THEN -ABS(i.costAmount)
  WHEN i.type = 'MANUAL_ADJUST' THEN SIGN(i.quantity) * ABS(i.costAmount) END`;
const signMismatch = Prisma.sql`CASE
  WHEN i.type IN ('STOCK_IN', 'VOID_RESTORE', 'SALES_RETURN') AND i.quantity < 0 THEN 1
  WHEN i.type IN ('PURCHASE_RETURN', 'AUTO_DEDUCT', 'KITCHEN_WASTE') AND i.quantity > 0 THEN 1
  ELSE 0 END`;

/** Apply one predicate to every downstream aggregate, detail query and self-excluding facet. */
function filtered(query: EndOfDayReportQuery, omitted?: EndOfDayFilter): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (omitted !== 'creatorUserId' && query.creatorUserId != null) conditions.push(Prisma.sql`creatorUserId = ${query.creatorUserId}`);
  if (omitted !== 'recordTypes' && query.recordTypes?.length) {
    conditions.push(Prisma.sql`(recordType IN (${Prisma.join(query.recordTypes)}) OR inventoryType IN (${Prisma.join(query.recordTypes)}))`);
  }
  if (query.search) conditions.push(Prisma.sql`(LOCATE(${query.search}, itemSku) > 0 OR LOCATE(${query.search}, itemName) > 0
    OR LOCATE(${query.search}, documentCode) > 0 OR LOCATE(${query.search}, creatorUserName) > 0 OR LOCATE(${query.search}, note) > 0)`);
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

function source(query: EndOfDayReportQuery, omitted?: EndOfDayFilter): Prisma.Sql {
  return Prisma.sql`SELECT * FROM (
    SELECT 0 AS rowKind, oi.id AS sourceId, 'SALE_ITEM' AS recordType, NULL AS inventoryType,
      o.id AS orderId, oi.id AS orderItemId, NULL AS inventoryTransactionId, o.completedAt AS occurredAt,
      ${text(Prisma.sql`o.code`)} AS documentCode, oi.menuItemId, NULL AS ingredientId,
      ${text(Prisma.sql`m.sku`)} AS itemSku, ${text(Prisma.sql`m.name`)} AS itemName,
      'MENU_ITEM' AS quantityKind, oi.quantity, 'portion' AS unit, oi.unitPrice, oi.subtotal AS amount,
      NULL AS costAmount, NULL AS signedCostAmount, o.createdByUserId AS creatorUserId,
      ${text(Prisma.sql`COALESCE(u.name, 'Chưa xác định')`)} AS creatorUserName,
      ${text(Prisma.sql`oi.notes`)} AS note, 0 AS signMismatch
    FROM OrderItem oi JOIN \`Order\` o ON o.id = oi.orderId JOIN MenuItem m ON m.id = oi.menuItemId
    LEFT JOIN User u ON u.id = o.createdByUserId
    WHERE o.status = 'COMPLETED' AND o.completedAt >= ${query.from} AND o.completedAt < ${query.to}
    UNION ALL
    SELECT 1, i.id, 'INVENTORY_EVENT', ${text(Prisma.sql`i.type`)}, i.orderId, NULL, i.id, i.createdAt,
      ${text(Prisma.sql`o.code`)}, NULL, i.ingredientId, ${text(Prisma.sql`g.sku`)}, ${text(Prisma.sql`g.name`)},
      'INGREDIENT', i.quantity, ${text(Prisma.sql`g.unit`)}, NULL, ${signedCost}, i.costAmount, ${signedCost},
      i.createdByUserId, ${text(Prisma.sql`COALESCE(u.name, 'Chưa xác định')`)}, ${text(Prisma.sql`i.note`)}, ${signMismatch}
    FROM InventoryTransaction i JOIN Ingredient g ON g.id = i.ingredientId
    LEFT JOIN \`Order\` o ON o.id = i.orderId LEFT JOIN User u ON u.id = i.createdByUserId
    WHERE i.createdAt >= ${query.from} AND i.createdAt < ${query.to}
  ) goodsSource ${filtered(query, omitted)}`;
}
const numeric = (value: number | null) => value === null ? null : Number(value);
function mapRow(row: SqlRow): GoodsReportRow {
  return {
    rowKey: `${row.recordType}:${Number(row.sourceId)}`, recordType: row.recordType, inventoryType: row.inventoryType,
    orderId: numeric(row.orderId), orderItemId: numeric(row.orderItemId), inventoryTransactionId: numeric(row.inventoryTransactionId),
    occurredAt: row.occurredAt.toISOString(), documentCode: row.documentCode,
    menuItemId: numeric(row.menuItemId), ingredientId: numeric(row.ingredientId), itemSku: row.itemSku, itemName: row.itemName,
    quantityKind: row.quantityKind, quantity: Number(row.quantity), unit: row.unit, unitPrice: numeric(row.unitPrice),
    amount: Number(row.amount), costAmount: numeric(row.costAmount), signedCostAmount: numeric(row.signedCostAmount),
    creatorUserId: numeric(row.creatorUserId), creatorUserName: row.creatorUserName, note: row.note,
    dataQuality: Number(row.signMismatch) ? 'QUANTITY_SIGN_MISMATCH' : 'RECORDED', catalogLabelSource: 'CURRENT_CATALOG'
  };
}

export class GoodsReportAdapter {
  static async read(tx: Prisma.TransactionClient, query: EndOfDayReportQuery): Promise<NormalizedConcernResult<GoodsReportRow, GoodsSummary>> {
    const dataset = source(query);
    const [totals] = await tx.$queryRaw<SqlTotals[]>(Prisma.sql`SELECT COUNT(*) AS totalRows,
      COALESCE(SUM(rowKind = 0), 0) AS saleItemCount, COALESCE(SUM(rowKind = 1), 0) AS inventoryEventCount,
      COALESCE(SUM(CASE WHEN rowKind = 0 THEN quantity ELSE 0 END), 0) AS soldMenuItemQuantity,
      COALESCE(SUM(CASE WHEN rowKind = 0 THEN amount ELSE 0 END), 0) AS saleItemAmount,
      COALESCE(SUM(CASE WHEN inventoryType = 'STOCK_IN' THEN ABS(costAmount) ELSE 0 END), 0) AS stockInCost,
      COALESCE(SUM(CASE WHEN inventoryType = 'PURCHASE_RETURN' THEN ABS(costAmount) ELSE 0 END), 0) AS purchaseReturnCost,
      COALESCE(SUM(CASE WHEN inventoryType = 'AUTO_DEDUCT' THEN ABS(costAmount) ELSE 0 END), 0) AS autoDeductCost,
      COALESCE(SUM(CASE WHEN inventoryType = 'SALES_RETURN' THEN ABS(costAmount) ELSE 0 END), 0) AS salesReturnCost,
      COALESCE(SUM(CASE WHEN inventoryType = 'KITCHEN_WASTE' THEN ABS(costAmount) ELSE 0 END), 0) AS kitchenWasteCost,
      COALESCE(SUM(CASE WHEN inventoryType = 'MANUAL_ADJUST' THEN signedCostAmount ELSE 0 END), 0) AS manualAdjustmentCost,
      COALESCE(SUM(CASE WHEN inventoryType = 'VOID_RESTORE' THEN ABS(costAmount) ELSE 0 END), 0) AS voidRestoreCost,
      COALESCE(SUM(signMismatch), 0) AS quantitySignMismatchRows FROM (${dataset}) goods`);
    const sortColumns = { occurredAt: Prisma.sql`occurredAt`, recordType: Prisma.sql`recordType`, quantity: Prisma.sql`quantity`, amount: Prisma.sql`amount` };
    const sortBy = query.sortBy ?? 'occurredAt';
    if (!(sortBy in sortColumns)) throw new Error('Unsupported Goods sort field');
    const direction = query.sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const rows = await tx.$queryRaw<SqlRow[]>(Prisma.sql`SELECT * FROM (${dataset}) goods
      ORDER BY ${sortColumns[sortBy as keyof typeof sortColumns]} ${direction}, rowKind ASC, sourceId ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    const units = await tx.$queryRaw<{ unit: string; quantity: SqlNumber }[]>(Prisma.sql`
      SELECT unit, SUM(quantity) AS quantity FROM (${dataset}) goods WHERE rowKind = 1 GROUP BY unit ORDER BY unit ASC`);
    const creators = await tx.$queryRaw<{ value: number | null; label: string }[]>(Prisma.sql`
      SELECT DISTINCT creatorUserId AS value, creatorUserName AS label FROM (${source(query, 'creatorUserId')}) goods ORDER BY value ASC`);
    const kinds = await tx.$queryRaw<{ recordType: string; inventoryType: string | null }[]>(Prisma.sql`
      SELECT DISTINCT recordType, inventoryType FROM (${source(query, 'recordTypes')}) goods`);
    const types = new Set(kinds.flatMap(row => row.inventoryType ? [row.recordType, row.inventoryType] : [row.recordType]));
    const filterOptions: EndOfDayFilterOptions = {
      creatorUserId: creators.map(option => ({ value: numeric(option.value), label: option.label })),
      recordTypes: [...types].sort().map(value => ({ value, label: value }))
    };
    const autoDeductCost = Number(totals.autoDeductCost), salesReturnCost = Number(totals.salesReturnCost);
    const totalRows = Number(totals.totalRows), saleItemCount = Number(totals.saleItemCount), inventoryEventCount = Number(totals.inventoryEventCount);
    return {
      records: rows.map(mapRow), totalRows, filterOptions,
      summary: {
        saleItemCount, inventoryEventCount, soldMenuItemQuantity: Number(totals.soldMenuItemQuantity), saleItemAmount: Number(totals.saleItemAmount),
        inventoryQuantityByUnit: units.map(row => ({ unit: row.unit, quantity: Number(row.quantity) })),
        stockInCost: Number(totals.stockInCost), purchaseReturnCost: Number(totals.purchaseReturnCost), autoDeductCost, salesReturnCost,
        netSalesCogs: autoDeductCost - salesReturnCost, kitchenWasteCost: Number(totals.kitchenWasteCost),
        manualAdjustmentCost: Number(totals.manualAdjustmentCost), voidRestoreCost: Number(totals.voidRestoreCost)
      },
      invariantCounters: { totalRows, saleItemCount, inventoryEventCount, quantitySignMismatchRows: Number(totals.quantitySignMismatchRows) }
    };
  }
}
