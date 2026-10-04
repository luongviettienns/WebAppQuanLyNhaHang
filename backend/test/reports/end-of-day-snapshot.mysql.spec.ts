import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EndOfDayReportService } from '../../src/modules/reports/end-of-day/end-of-day.service';
import { parseEndOfDayQuery, endOfDayReportMetadataSchema } from '../../src/modules/reports/end-of-day/end-of-day.schemas';
import { SalesReportAdapter } from '../../src/modules/reports/end-of-day/sales.adapter';
import { CashflowReportAdapter } from '../../src/modules/reports/end-of-day/cashflow.adapter';
import { GoodsReportAdapter } from '../../src/modules/reports/end-of-day/goods.adapter';
import { CancelledItemsReportAdapter } from '../../src/modules/reports/end-of-day/cancelled-items.adapter';
import type { EndOfDayConcern } from '../../src/modules/reports/end-of-day/end-of-day.types';
import { resolveTestDatabaseTarget } from '../../scripts/test-database-guard';
import { prismaTest, truncateAllTables } from '../helpers/database';

const writer = new PrismaClient({ datasources: { db: { url: resolveTestDatabaseTarget(process.env).url } } });
const middle = new Date('2026-10-03T05:00:00Z');
const concerns = ['SALES', 'CASHFLOW', 'GOODS', 'CANCELLED_ITEMS', 'SUMMARY'] as const;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe('End-of-day consistent MySQL snapshots', () => {
  let menuId: number;
  let ingredientId: number;
  let sequence = 0;
  beforeEach(async () => {
    await truncateAllTables();
    const category = await prismaTest.category.create({ data: { name: 'Snapshot' } });
    menuId = (await prismaTest.menuItem.create({ data: { sku: 'SNAP', name: 'Snapshot dish', basePrice: 100, categoryId: category.id } })).id;
    ingredientId = (await prismaTest.ingredient.create({ data: { sku: 'SNAP-I', name: 'Snapshot ingredient', unit: 'gram' } })).id;
    sequence = 0;
  }, 60000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await writer.$disconnect(); await prismaTest.$disconnect(); });

  async function fixture(tx: Prisma.TransactionClient, amount = 100, occurredAt = middle) {
    const key = ++sequence;
    const user = await tx.user.create({ data: { username: `snapshot-${key}`, name: `Actor ${key}`, passwordHash: 'hash', role: 'ADMIN' } });
    const order = await tx.order.create({ data: { code: `SNAP-${key}`, status: 'COMPLETED', orderType: 'TAKE_AWAY', completedAt: occurredAt,
      createdByUserId: user.id, totalAmount: amount, finalAmount: amount, vatAmount: 0,
      items: { create: { menuItemId: menuId, quantity: 1, unitPrice: amount, subtotal: amount } } }, include: { items: true } });
    await tx.orderPaymentTransaction.create({ data: { orderId: order.id, status: 'SUCCESS', amount, confirmedAt: occurredAt,
      paymentMethod: 'CASH', confirmedByUserId: user.id } });
    await tx.inventoryTransaction.createMany({ data: [
      { ingredientId, orderId: order.id, type: 'AUTO_DEDUCT', quantity: -3, costAmount: amount * 0.3, createdAt: occurredAt, createdByUserId: user.id },
      { ingredientId, orderId: order.id, type: 'KITCHEN_WASTE', quantity: -1, costAmount: amount * 0.05, createdAt: occurredAt, createdByUserId: user.id }
    ] });
    await tx.orderItemCancellation.create({ data: { orderId: order.id, orderItemId: order.items[0].id, menuItemId: menuId,
      menuItemSku: 'SNAP', menuItemName: 'Snapshot dish', quantity: 1, unitPrice: amount * 0.4, lineAmount: amount * 0.4,
      reason: `Reason ${key}`, cancelledAt: occurredAt, cancelledByUserId: user.id, orderStatusSnapshot: 'COMPLETED',
      preparationStateSnapshot: 'READY', inventoryEffect: 'NONE', source: 'ITEM_CANCEL', sourceKey: `ITEM_CANCEL:${key}` } });
    return { orderId: order.id, documentCode: order.code, userId: user.id };
  }
  function query(concern: EndOfDayConcern, extra: Record<string, unknown> = {}) {
    return parseEndOfDayQuery({ date: '2026-10-03', concern, view: 'HORIZONTAL', ...extra });
  }

  it.each([...concerns.map(concern => ({ concern, exportMode: false })), { concern: 'SUMMARY' as const, exportMode: true }])(
    '$concern export=$exportMode excludes a commit after the first data read from totals, rows, count and facets until the next request', async ({ concern, exportMode }) => {
    const baseline = await prismaTest.$transaction(tx => fixture(tx));
    const entered = deferred(), release = deferred();
    let armed = true;
    // The clock SELECT has no InnoDB table read. Pause only AFTER a real adapter read returns.
    const observed = prismaTest.$extends({ query: { async $queryRaw({ args, query: execute }) {
      const result = await execute(args);
      const clock = Array.isArray(result) && result.length > 0 && 'asOf' in result[0];
      if (armed && !clock) { armed = false; entered.resolve(); await release.promise; }
      return result;
    } } });
    // Prisma 5 extension types include a different transaction-client surface;
    // the service consumes only the shared interactive-transaction operation.
    const service = new EndOfDayReportService(observed as unknown as Pick<PrismaClient, '$transaction'>);
    const options = exportMode ? { mode: 'EXPORT' as const, maxRows: 50_000 } : { mode: 'SCREEN' as const };
    const pending = service.get(query(concern), options);
    // Missing/failed service must fail immediately, without leaving a hung barrier.
    const reached = await Promise.race([entered.promise.then(() => true), pending.then(() => false, () => false)]);
    let concurrent: Awaited<ReturnType<typeof fixture>>;
    try {
      expect(reached).toBe(true);
      // A distinct connection commits ALL qualifying sources while the reader is held.
      concurrent = await writer.$transaction(tx => fixture(tx, 200));
    } finally { release.resolve(); }
    const first = await pending;
    const next = await service.get(query(concern), options);
    expect(first.hasData).toBe(true);
    expect(first.metadata.asOf <= first.metadata.generatedAt).toBe(true);
    expect(first.pagination.totalRows).toBe(concern === 'GOODS' ? 3 : concern === 'SUMMARY' ? 6 : 1);
    expect(next.pagination.totalRows).toBe(concern === 'GOODS' ? 6 : concern === 'SUMMARY' ? 12 : 2);
    if (concern === 'SUMMARY') {
      expect(first.rows).toHaveLength(6);
      expect(next.rows).toHaveLength(12);
      expect(first.rows).not.toEqual(expect.arrayContaining([expect.objectContaining({ detail: expect.objectContaining({ documentCode: concurrent!.documentCode }) })]));
      expect(next.rows).toEqual(expect.arrayContaining([expect.objectContaining({ detail: expect.objectContaining({ documentCode: concurrent!.documentCode }) })]));
      expect(first.filterOptions).toEqual({});
      expect(first.summary).toMatchObject({ sales: { netInvoiceValue: 100 }, cashflow: { totalReceipts: 100 },
        goods: { netSalesCogs: 30, kitchenWasteCost: 5 }, cancellations: { cancelledLineAmount: 40 },
        estimatedContributionBeforeWaste: 70, estimatedContributionAfterWaste: 65 });
      expect(next.summary).toMatchObject({ sales: { netInvoiceValue: 300 }, cashflow: { totalReceipts: 300 },
        goods: { netSalesCogs: 90, kitchenWasteCost: 15 }, cancellations: { cancelledLineAmount: 120 },
        estimatedContributionBeforeWaste: 210, estimatedContributionAfterWaste: 195 });
      expect(first.summary).toHaveProperty(['invariantCounters', 'cashflow.totalRows'], 1);
      expect(next.summary).toHaveProperty(['invariantCounters', 'cashflow.totalRows'], 2);
      expect(first.summary.invariantCounters.totalRows).toBe(6);
      expect(next.summary.invariantCounters.totalRows).toBe(12);
      expect(first.pagination.totalPages).toBe(1);
      expect(first.summary.invariantCounters).toMatchObject({ 'cashflow.unreconciledCount': 1,
        'cashflow.suppressedNonCashReservationVoucherCount': 0, 'cashflow.conflictingVoucherIdentityCount': 0,
        'goods.quantitySignMismatchRows': 0, 'cancellations.recordedCancellationRows': 1 });
    } else {
      expect(first.rows).toEqual(expect.arrayContaining([expect.objectContaining({ documentCode: baseline.documentCode })]));
      expect(first.rows).not.toEqual(expect.arrayContaining([expect.objectContaining({ documentCode: concurrent!.documentCode })]));
      expect(next.rows).toEqual(expect.arrayContaining([expect.objectContaining({ documentCode: concurrent!.documentCode })]));
      expect(first.filterOptions.creatorUserId?.map(option => option.value)).toEqual([baseline.userId]);
      expect(next.filterOptions.creatorUserId?.map(option => option.value)).toEqual([baseline.userId, concurrent!.userId]);
      const totals = concern === 'SALES' ? { netInvoiceValue: 100 } : concern === 'CASHFLOW' ? { totalReceipts: 100 }
        : concern === 'GOODS' ? { netSalesCogs: 30, kitchenWasteCost: 5 } : { cancelledLineAmount: 40 };
      const nextTotals = concern === 'SALES' ? { netInvoiceValue: 300 } : concern === 'CASHFLOW' ? { totalReceipts: 300 }
        : concern === 'GOODS' ? { netSalesCogs: 90, kitchenWasteCost: 15 } : { cancelledLineAmount: 120 };
      expect(first.summary).toMatchObject(totals);
      expect(next.summary).toMatchObject(nextTotals);
      expect(first.summary).toHaveProperty('invariantCounters.totalRows', first.pagination.totalRows);
      const counters = concern === 'SALES' ? { completedInvoiceCount: 1, legacyPaymentMethodFallbackRows: 0 }
        : concern === 'CASHFLOW' ? { receiptCount: 1, paymentCount: 0, unreconciledCount: 1,
          suppressedNonCashReservationVoucherCount: 0, conflictingVoucherIdentityCount: 0 }
          : concern === 'GOODS' ? { saleItemCount: 1, inventoryEventCount: 2, quantitySignMismatchRows: 0 }
            : { cancelledOrderCount: 1, historicalFallbackRows: 0, recordedCancellationRows: 1 };
      expect(first.summary.invariantCounters).toMatchObject(counters);
    }
  }, 60000);

  it('owns exactly one repeatable-read transaction with 30s timeout and passes the identical tx to all Summary adapters', async () => {
    await prismaTest.$transaction(async tx => { await fixture(tx); await fixture(tx, 200); await fixture(tx, 300); });
    const transaction = vi.spyOn(prismaTest, '$transaction');
    const adapters = [vi.spyOn(SalesReportAdapter, 'read'), vi.spyOn(CashflowReportAdapter, 'read'),
      vi.spyOn(GoodsReportAdapter, 'read'), vi.spyOn(CancelledItemsReportAdapter, 'read')];
    const result = await new EndOfDayReportService(prismaTest).get(query('SUMMARY', { view: 'VERTICAL', page: 10, pageSize: 1 }));
    expect(result.summary).toMatchObject({ sales: { completedInvoiceCount: 3 }, cashflow: { totalReceipts: 600 },
      invariantCounters: { totalRows: 18 } });
    expect(result.rows).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 1, totalRows: 0, totalPages: 0 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead', timeout: 30000 });
    const tx = adapters[0].mock.calls[0][0];
    for (const adapter of adapters) {
      expect(adapter.mock.calls).toHaveLength(1);
      expect(adapter.mock.calls[0][0]).toBe(tx);
      expect(adapter.mock.calls[0][1]).toMatchObject({ from: new Date('2026-10-02T17:00:00Z'), to: new Date('2026-10-03T17:00:00Z'),
        timezone: 'Asia/Ho_Chi_Minh', page: 1 });
      expect(adapter.mock.calls[0][1].pageSize).toBe(1);
      for (const field of ['customerId', 'creatorUserId', 'receiverEmployeeId', 'paymentMethods', 'recordTypes', 'search', 'cancelReason']) {
        expect(adapter.mock.calls[0][1]).not.toHaveProperty(field);
      }
    }
  });

  it('preserves single-concern pagination while summary/count/facets cover all filtered records', async () => {
    await prismaTest.$transaction(async tx => { await fixture(tx); await fixture(tx, 200); });
    const result = await new EndOfDayReportService(prismaTest).get(query('SALES', { page: 3, pageSize: 1 }));
    expect(result.rows).toEqual([]);
    expect(result.hasData).toBe(true);
    expect(result.summary).toMatchObject({ completedInvoiceCount: 2, netInvoiceValue: 300 });
    expect(result.pagination).toEqual({ page: 3, pageSize: 1, totalRows: 2, totalPages: 2 });
    expect(result.filterOptions.creatorUserId).toHaveLength(2);
    const filtered = await new EndOfDayReportService(prismaTest).get(query('SALES', { search: 'SNAP-2', pageSize: 1 }));
    expect(filtered.rows).toEqual([expect.objectContaining({ documentCode: 'SNAP-2' })]);
    expect(filtered.summary).toMatchObject({ completedInvoiceCount: 1, netInvoiceValue: 200 });
    expect(filtered.pagination.totalRows).toBe(1);
    expect(filtered.filterOptions.creatorUserId).toHaveLength(1);
  });

  it('marks populated zero-net cashflow true and truly empty concerns false without synthetic Summary rows', async () => {
    const service = new EndOfDayReportService(prismaTest);
    for (const concern of concerns) {
      const empty = await service.get(query(concern));
      expect(empty.hasData).toBe(false);
      expect(empty.rows).toEqual([]);
      expect(empty.pagination.totalRows).toBe(0);
      expect(empty.pagination.totalPages).toBe(0);
    }
    const user = await prismaTest.user.create({ data: { username: 'zero', name: 'Zero', passwordHash: 'hash', role: 'ADMIN' } });
    const account = await prismaTest.financialAccount.findUniqueOrThrow({ where: { code: 'CASH' } });
    const receipt = await prismaTest.cashFlowCategory.findUniqueOrThrow({ where: { code: 'OTHER_INCOME' } });
    const payment = await prismaTest.cashFlowCategory.findUniqueOrThrow({ where: { code: 'OTHER_EXPENSE' } });
    await prismaTest.cashVoucher.createMany({ data: [
      { code: 'ZERO-R', sourceKey: 'ZERO-R', sourceType: 'MANUAL', direction: 'RECEIPT', categoryId: receipt.id, amount: 100,
        accountId: account.id, createdByUserId: user.id, occurredAt: middle },
      { code: 'ZERO-P', sourceKey: 'ZERO-P', sourceType: 'MANUAL', direction: 'PAYMENT', categoryId: payment.id, amount: 100,
        accountId: account.id, createdByUserId: user.id, occurredAt: middle }
    ] });
    const zero = await service.get(query('CASHFLOW'));
    expect(zero.hasData).toBe(true);
    expect(zero.rows).toHaveLength(2);
    expect(zero.summary).toMatchObject({ totalReceipts: 100, totalPayments: 100, netCashFlow: 0 });
    const summary = await service.get(query('SUMMARY', { view: 'VERTICAL' }));
    expect(summary.hasData).toBe(true);
    expect(summary.rows).toEqual([]);
    expect(summary.pagination.totalRows).toBe(0);
    expect(summary.summary.invariantCounters.totalRows).toBe(2);
    expect(summary.summary).toMatchObject({ cashflow: { netCashFlow: 0 }, estimatedContributionAfterWaste: 0 });
    const horizontal = await service.get(query('SUMMARY'));
    expect(horizontal.hasData).toBe(true);
    expect(horizontal.rows).toHaveLength(2);
    expect(horizontal.pagination).toMatchObject({ totalRows: 2, totalPages: 1 });
    expect(horizontal.summary).toEqual(summary.summary);
  });

  it('merges four-domain horizontal details globally before stable pagination without loss or duplicate identities', async () => {
    const first = await prismaTest.$transaction(tx => fixture(tx));
    const later = new Date('2026-10-03T06:00:00Z');
    const second = await prismaTest.$transaction(tx => fixture(tx, 200, later));
    const service = new EndOfDayReportService(prismaTest);
    const pages = [];
    for (let page = 1; page <= 4; page++) pages.push(await service.get(query('SUMMARY', { page, pageSize: 3 })));
    const rows = pages.flatMap(page => page.rows);
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map(row => 'sourceKey' in row ? row.sourceKey : null)).size).toBe(12);
    expect(rows.map(row => 'domain' in row ? row.domain : null)).toEqual([
      'SALES', 'CASHFLOW', 'GOODS', 'GOODS', 'GOODS', 'CANCELLED_ITEMS',
      'SALES', 'CASHFLOW', 'GOODS', 'GOODS', 'GOODS', 'CANCELLED_ITEMS'
    ]);
    expect(rows.slice(0, 6).map(row => row.occurredAt)).toEqual(Array(6).fill(later.toISOString()));
    expect(rows.slice(6).map(row => row.occurredAt)).toEqual(Array(6).fill(middle.toISOString()));
    expect(rows[0]).toMatchObject({ domain: 'SALES', recordKind: 'INVOICE',
      sourceKey: `SALES:INVOICE:${second.orderId}`, detail: { documentCode: second.documentCode, amount: 200 } });
    expect(rows[6]).toMatchObject({ domain: 'SALES', recordKind: 'INVOICE',
      sourceKey: `SALES:INVOICE:${first.orderId}`, detail: { documentCode: first.documentCode, amount: 100 } });
    for (const page of pages) {
      expect(page.pagination).toMatchObject({ totalRows: 12, totalPages: 4 });
      expect(page.summary).toEqual(pages[0].summary);
      expect(page.filterOptions).toEqual({});
    }
    const all = await service.get(query('SUMMARY', { pageSize: 200 }));
    expect(all.rows).toEqual(rows);
    const emptyPage = await service.get(query('SUMMARY', { page: 5, pageSize: 3 }));
    expect(emptyPage.rows).toEqual([]);
    expect(emptyPage.hasData).toBe(true);
    expect(emptyPage.pagination).toEqual({ page: 5, pageSize: 3, totalRows: 12, totalPages: 4 });
    const vertical = await service.get(query('SUMMARY', { view: 'VERTICAL' }));
    expect(vertical.summary).toEqual(all.summary);
    const native = await prismaTest.$transaction(async tx => {
      const base = { ...query('SUMMARY'), page: 1, pageSize: 200 };
      return { sales: await SalesReportAdapter.read(tx, { ...base, concern: 'SALES' }),
        cashflow: await CashflowReportAdapter.read(tx, { ...base, concern: 'CASHFLOW' }),
        goods: await GoodsReportAdapter.read(tx, { ...base, concern: 'GOODS' }),
        cancellations: await CancelledItemsReportAdapter.read(tx, { ...base, concern: 'CANCELLED_ITEMS' }) };
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
    const summary = all.summary as typeof vertical.summary & Record<string, unknown>;
    const domainNames = { sales: 'SALES', cashflow: 'CASHFLOW', goods: 'GOODS', cancellations: 'CANCELLED_ITEMS' };
    for (const [domain, result] of Object.entries(native)) {
      expect(summary[domain]).toEqual(result.summary);
      for (const [key, value] of Object.entries(result.invariantCounters)) expect(summary.invariantCounters[`${domain}.${key}`]).toBe(value);
      expect(all.rows.filter(row => 'domain' in row && row.domain === domainNames[domain as keyof typeof domainNames])
        .map(row => 'detail' in row ? row.detail : null)).toEqual(result.records);
    }
  }, 60000);

  it('keeps native tie-breakers and stable source keys identical across page sizes when all business timestamps tie', async () => {
    await prismaTest.$transaction(async tx => { await fixture(tx); await fixture(tx, 200); await fixture(tx, 300); });
    const service = new EndOfDayReportService(prismaTest);
    const whole = await service.get(query('SUMMARY', { pageSize: 200 }));
    const fragmented = [];
    for (let page = 1; page <= 9; page++) fragmented.push(...(await service.get(query('SUMMARY', { page, pageSize: 2 }))).rows);
    expect(fragmented).toEqual(whole.rows);
    expect(whole.rows).toHaveLength(18);
    expect(whole.pagination.totalRows).toBe(18);
    expect(new Set(whole.rows.map(row => 'sourceKey' in row ? row.sourceKey : null)).size).toBe(18);
    expect(whole.rows.slice(0, 3)).toEqual([1, 2, 3].map(id => expect.objectContaining({ domain: 'SALES', sourceKey: `SALES:INVOICE:${id}` })));
  }, 60000);

  it('wraps returns, refunds and historical cancellations with immutable source identities and original detail flags', async () => {
    const baseline = await prismaTest.$transaction(tx => fixture(tx));
    const returned = await prismaTest.orderReturn.create({ data: { orderId: baseline.orderId, returnCode: 'SNAP-RETURN',
      status: 'COMPLETED', returnedAt: middle, completedAt: middle, totalRefundDue: 20, refundedAmount: 20 } });
    const historical = await prismaTest.order.create({ data: { code: 'SNAP-LEGACY', status: 'CANCELLED', orderType: 'TAKE_AWAY',
      cancelledAt: middle, totalAmount: 70, finalAmount: 70, vatAmount: 0,
      items: { create: { menuItemId: menuId, quantity: 1, unitPrice: 70, subtotal: 70 } } }, include: { items: true } });
    const result = await new EndOfDayReportService(prismaTest).get(query('SUMMARY'));
    expect(result.rows).toHaveLength(9);
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: 'SALES', recordKind: 'SALES_RETURN', sourceKey: `SALES:SALES_RETURN:${returned.id}`,
        detail: expect.objectContaining({ orderReturnId: returned.id, amount: -20 }) }),
      expect.objectContaining({ domain: 'CASHFLOW', recordKind: 'SALES_RETURN_REFUND', sourceKey: `CASHFLOW:SALES_RETURN_REFUND:${returned.id}`,
        detail: expect.objectContaining({ amount: -20, refundCompletedAt: middle.toISOString() }) }),
      expect.objectContaining({ domain: 'CANCELLED_ITEMS', recordKind: 'LEGACY_ORDER_VOID',
        sourceKey: `CANCELLED_ITEMS:LEGACY_ORDER_VOID:${historical.id}:${historical.items[0].id}`,
        detail: expect.objectContaining({ dataQuality: 'HISTORICAL_FALLBACK', preparationStateSnapshot: 'UNKNOWN' }) })
    ]));
    expect(result.summary).toMatchObject({ sales: { netInvoiceValue: 80 }, cashflow: { netCashFlow: 80 },
      invariantCounters: { 'cancellations.historicalFallbackRows': 1 } });
  });

  it('exports identical Summary detail semantics with all rows and applies the caller limit before full detail reads', async () => {
    await prismaTest.$transaction(async tx => { await fixture(tx); await fixture(tx, 200); });
    const service = new EndOfDayReportService(prismaTest);
    const screen = await service.get(query('SUMMARY', { pageSize: 200 }));
    const exported = await service.get(query('SUMMARY', { page: 9, pageSize: 1 }), { mode: 'EXPORT', maxRows: 12 });
    expect(exported.rows).toEqual(screen.rows);
    expect(exported.rows).toHaveLength(12);
    expect(exported.summary).toEqual(screen.summary);
    expect(exported.pagination).toEqual({ page: 1, pageSize: 12, totalRows: 12, totalPages: 1 });
    const exportedVertical = await service.get(query('SUMMARY', { view: 'VERTICAL' }), { mode: 'EXPORT', maxRows: 12 });
    expect(exportedVertical.rows).toEqual(screen.rows);
    expect(exportedVertical.metadata.view).toBe('VERTICAL');
    const spies = [vi.spyOn(SalesReportAdapter, 'read'), vi.spyOn(CashflowReportAdapter, 'read'),
      vi.spyOn(GoodsReportAdapter, 'read'), vi.spyOn(CancelledItemsReportAdapter, 'read')];
    await expect(service.get(query('SUMMARY'), { mode: 'EXPORT', maxRows: 11 })).rejects.toMatchObject({
      code: 'REPORT_EXPORT_TOO_LARGE', estimatedRows: 12, maxRows: 11
    });
    for (const spy of spies) {
      expect(spy.mock.calls).toHaveLength(1);
      expect(spy.mock.calls[0][1].pageSize).toBe(1);
    }
  });

  it('exports single concerns without screen pagination and retains their exact filters and totals', async () => {
    await prismaTest.$transaction(async tx => { await fixture(tx); await fixture(tx, 200); });
    const service = new EndOfDayReportService(prismaTest);
    const result = await service.get(query('SALES', { page: 9, pageSize: 1 }), { mode: 'EXPORT', maxRows: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.summary).toMatchObject({ netInvoiceValue: 300 });
    const filtered = await service.get(query('SALES', { search: 'SNAP-2' }), { mode: 'EXPORT', maxRows: 1 });
    expect(filtered.rows).toEqual([expect.objectContaining({ documentCode: 'SNAP-2' })]);
    expect(filtered.summary).toMatchObject({ netInvoiceValue: 200 });
  });

  it('ignores unsafe screen page arithmetic for all-row export', async () => {
    await prismaTest.$transaction(tx => fixture(tx));
    const service = new EndOfDayReportService(prismaTest);
    for (const concern of ['SUMMARY', 'SALES'] as const) {
      const result = await service.get(query(concern, { page: Number.MAX_SAFE_INTEGER, pageSize: 200 }),
        { mode: 'EXPORT', maxRows: 6 });
      expect(result.rows).toHaveLength(concern === 'SUMMARY' ? 6 : 1);
      expect(result.pagination).toEqual({ page: 1, pageSize: concern === 'SUMMARY' ? 6 : 1,
        totalRows: concern === 'SUMMARY' ? 6 : 1, totalPages: 1 });
    }
  });

  it('ignores unsafe detail page arithmetic for the Vertical Summary overview', async () => {
    await prismaTest.$transaction(tx => fixture(tx));
    const result = await new EndOfDayReportService(prismaTest).get(query('SUMMARY', {
      view: 'VERTICAL', page: Number.MAX_SAFE_INTEGER, pageSize: 200
    }));
    expect(result.hasData).toBe(true);
    expect(result.summary).toMatchObject({ sales: { netInvoiceValue: 100 }, invariantCounters: { totalRows: 6 } });
    expect(result.rows).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 200, totalRows: 0, totalPages: 0 });
  });

  it('refuses 50,001 real source rows before materialization even when the export caller asks for a higher limit', async () => {
    await prismaTest.order.createMany({ data: Array.from({ length: 50001 }, (_, index) => ({
      code: `EXPORT-${index}`, orderType: 'TAKE_AWAY' as const, status: 'COMPLETED' as const,
      totalAmount: 0, finalAmount: 0, vatAmount: 0, completedAt: middle
    })) });
    const spies = [vi.spyOn(SalesReportAdapter, 'read'), vi.spyOn(CashflowReportAdapter, 'read'),
      vi.spyOn(GoodsReportAdapter, 'read'), vi.spyOn(CancelledItemsReportAdapter, 'read')];
    await expect(new EndOfDayReportService(prismaTest).get(query('SUMMARY'), { mode: 'EXPORT', maxRows: 100000 })).rejects.toMatchObject({
      code: 'REPORT_EXPORT_TOO_LARGE', estimatedRows: 50001, maxRows: 50000
    });
    for (const spy of spies) expect(spy.mock.calls.map(call => call[1].pageSize)).toEqual([1]);
  }, 60000);

  it('returns out-of-range Summary pages without expanding detail reads and rejects unsafe page arithmetic', async () => {
    await prismaTest.$transaction(tx => fixture(tx));
    const service = new EndOfDayReportService(prismaTest);
    const spies = [vi.spyOn(SalesReportAdapter, 'read'), vi.spyOn(CashflowReportAdapter, 'read'),
      vi.spyOn(GoodsReportAdapter, 'read'), vi.spyOn(CancelledItemsReportAdapter, 'read')];
    const result = await service.get(query('SUMMARY', { page: 100000, pageSize: 200 }));
    expect(result.rows).toEqual([]);
    expect(result.pagination).toMatchObject({ totalRows: 6, totalPages: 1 });
    for (const spy of spies) expect(spy.mock.calls.map(call => call[1].pageSize)).toEqual([1]);
    await expect(service.get(query('SUMMARY', { page: Number.MAX_SAFE_INTEGER, pageSize: 200 }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('emits validated ISO metadata and samples completion only after every adapter has finished', async () => {
    await prismaTest.$transaction(tx => fixture(tx));
    let completedAt = 0;
    const original = CancelledItemsReportAdapter.read;
    vi.spyOn(CancelledItemsReportAdapter, 'read').mockImplementation(async (tx, input) => {
      const result = await original(tx, input);
      completedAt = Date.now();
      return result;
    });
    const result = await new EndOfDayReportService(prismaTest).get(query('SUMMARY', { fromTime: '07:00', toTime: '18:00' }));
    expect(endOfDayReportMetadataSchema.parse(result.metadata)).toEqual(result.metadata);
    expect(result.metadata).toMatchObject({ from: '2026-10-03T00:00:00.000Z', to: '2026-10-03T11:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh', concern: 'SUMMARY', view: 'HORIZONTAL',
      operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true } });
    expect(result.metadata.operatingScope).not.toHaveProperty('id');
    expect(Date.parse(result.metadata.generatedAt)).toBeGreaterThanOrEqual(completedAt);
    expect(Date.parse(result.metadata.generatedAt)).toBeGreaterThanOrEqual(Date.parse(result.metadata.asOf));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('propagates an adapter failure and rolls the interactive transaction back without a partial payload', async () => {
    await prismaTest.$transaction(tx => fixture(tx));
    vi.spyOn(GoodsReportAdapter, 'read').mockImplementation(async tx => {
      // Deliberate test-only write proves the transaction fails atomically, not merely a rejected promise.
      await tx.user.create({ data: { username: 'rollback-probe', name: 'Rollback', role: 'ADMIN', passwordHash: 'hash' } });
      throw new Error('adapter failure');
    });
    await expect(new EndOfDayReportService(prismaTest).get(query('SUMMARY'))).rejects.toThrow('adapter failure');
    expect(await prismaTest.user.findUnique({ where: { username: 'rollback-probe' } })).toBeNull();
  });
});
