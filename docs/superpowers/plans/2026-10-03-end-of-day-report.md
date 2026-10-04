# End-of-Day Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng Báo cáo cuối ngày hoàn chỉnh với năm mối quan tâm Bán hàng, Thu chi, Hàng hóa, Hủy món và Tổng hợp, dùng đúng timestamp nghiệp vụ và đồng bộ với Orders, Cashbook, Inventory, Employees và giao diện Crispy Bite.

**Architecture:** Backend thêm read-model `EndOfDayReportService` chạy các concern adapter trong một Prisma interactive transaction MySQL `REPEATABLE READ`; adapter nhận cùng query chuẩn hóa và transaction client, còn Summary chỉ tái sử dụng normalized outputs. Order được bổ sung receiver FK bất biến và cancellation ledger append-only; frontend dùng API module/hook riêng, giữ Dashboard cũ dưới mục Bán hàng và chỉ giữ stale snapshot khi refresh cùng query thất bại.

**Tech Stack:** TypeScript 5, Express 4, Prisma 5/MySQL 8, Zod, Vitest/Supertest, XLSX, Expo 54 React Native Web, React 19.

**Spec:** `docs/superpowers/specs/2026-10-03-end-of-day-report-design.md` at design-freeze commit `6434bf7`.

## Global Constraints

- Ngày nghiệp vụ dùng `Asia/Ho_Chi_Minh` và khoảng nửa mở `[from,to)`; không thay `completedAt`, `confirmedAt`, `returnedAt`, `occurredAt` hoặc ledger timestamp bằng `Order.createdAt`.
- `Order.finalAmount` là snapshot hóa đơn hoàn tất; Sales Return không được mutate giá trị này và chỉ điều chỉnh qua `OrderReturn`.
- `receivedByEmployeeId` là receiver đầu tiên, nullable, độc lập `createdByUserId`, gán conditional một lần và không backfill dữ liệu cũ.
- `OrderItemCancellation` là append-only. `ORDER_VOID` dùng source key xác định `ORDER_VOID:<orderId>:<orderItemId>` với unique constraint; không update/delete lịch sử.
- Event/socket/KDS/inventory notification chỉ phát sau khi transaction ghi Order, cancellation, stock và audit đã commit.
- `summary`, `rows`, pagination và filter options của một response phải dùng cùng normalized query và cùng read-consistent transaction. `asOf` chỉ là mốc đại diện lấy từ DB clock ngay trước lần đọc đầu, không phải timestamp MVCC nội bộ.
- API trả `400 VALIDATION_ERROR` cho filter không hỗ trợ theo concern, record type sai allow-list hoặc chỉ có một trong `fromTime`/`toTime`; không silently ignore.
- Metadata dùng `operatingScope: { code: 'MAIN', name: 'Nhà hàng chính', locked: true }`; không có `branch.id` giả và không thêm branch FK cho Order/Cashbook/Inventory.
- Payment transaction và CashVoucher liên kết chỉ tạo một normalized money event. Cọc, apply-to-bill, return/refund và reversal tuân theo source mapping trong spec.
- `estimatedContributionBeforeWaste` và `estimatedContributionAfterWaste` là chỉ số vận hành ước tính; không đặt tên gross profit/gross margin kế toán.
- Endpoint `/api/reports/daily` và `DashboardScreen` hiện có tiếp tục hoạt động trong giai đoạn chuyển tiếp.
- Không thêm dependency UI/font mới. Dùng theme, typography, spacing, `ScreenHeader`, `Surface`, `InlineAlert`, `EmptyState`, `Button` và `AppIcon` hiện có.
- Database test/migration chỉ chạy trên MySQL cô lập với datadir/schema/port riêng và process-scoped `TEST_DATABASE_URL`; không reset/migrate/seed DEV/TEST dùng chung, không fallback sang `DATABASE_URL`.

## Review Focus

- Request có filter sai concern hoặc cặp giờ thiếu một phía phải bị từ chối rõ ràng, không cho số liệu tưởng là đã lọc.
- Ghi dữ liệu giữa lúc đọc summary và rows không được tạo snapshot lệch; `asOf` phải được hiểu đúng là correlation marker.
- Payment + CashVoucher, deposit + apply-to-bill, return + refund và reversal không được double count.
- Hai actor cùng nhận/hủy một order chỉ tạo một receiver/cancellation set; rollback không được phát socket hoặc để sót audit/stock side effect.
- Refresh cùng query thất bại phải giữ snapshot/`generatedAt` cũ; empty dataset phải khác snapshot có events nhưng tổng bằng 0.

---

### Task 1: Add the additive report data foundation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261008120000_end_of_day_report_foundation/migration.sql`
- Modify: `backend/test/helpers/database.ts`
- Create: `backend/test/reports/end-of-day-schema.spec.ts`

**Interfaces:**
- Produces `Order.receivedByEmployeeId -> Employee` with relation name `OrderReceiver`, `onDelete: Restrict`, and receiver/date indexes.
- Produces enums `OrderItemCancellationSource`, `CancellationPreparationState`, `CancellationInventoryEffect` and model `OrderItemCancellation`.
- Produces unique `sourceKey`; `ORDER_VOID` keys are exactly `ORDER_VOID:<orderId>:<orderItemId>`.

- [ ] **Step 1: Write the failing schema contract test**

```ts
it('adds a nullable receiver FK without a default or historical backfill', () => {
  expect(schema).toContain('receivedByEmployeeId');
  expect(migration).not.toMatch(/UPDATE `?Order`?.*createdByUserId/is);
});

it('makes cancellation rows immutable and idempotent by source key', () => {
  expect(schema).toContain('sourceKey');
  expect(schema).toMatch(/sourceKey\s+String\s+@unique/);
  expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/);
});
```

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/reports/end-of-day-schema.spec.ts`

Expected: FAIL because the receiver relation, cancellation model and migration do not exist.

- [ ] **Step 3: Add schema and forward-only SQL**

Add nullable receiver relation on `Order`, inverse `receivedOrders` on `Employee`, and cancellation snapshot fields from the spec. Use `RESTRICT` FKs for historical references; add indexes for `(status, completedAt)`, receiver/date, `cancelledAt/orderId`, actor and source lookup only where an equivalent index does not already exist.

- [ ] **Step 4: Provision the task's isolated MySQL target before any DB-backed test**

Create/verify a unique temporary datadir, unused loopback port and `_test` schema as described in Task 13. Export its URL only as process-scoped `TEST_DATABASE_URL`, run the guarded migration deploy, and keep that isolated process for Tasks 2–9. Do not point the suite at the configured shared DEV/TEST schemas.

- [ ] **Step 5: Update test cleanup order and verify schema/migration**

Add `OrderItemCancellation` before `OrderItem`/`Order` in `truncateAllTables`. Run:

`npm exec --workspace=backend prisma validate`

`npm exec --workspace=backend prisma generate`

`npm run test --workspace=backend -- test/reports/end-of-day-schema.spec.ts test/scripts/test-database-guard.spec.ts`

`npm run typecheck:backend`

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/test/helpers/database.ts backend/test/reports/end-of-day-schema.spec.ts
git commit -m "feat(reports): add end-of-day data foundation"
```

### Task 2: Capture the first order receiver atomically

**Files:**
- Create: `backend/src/modules/orders/order-receiver.service.ts`
- Create: `backend/test/orders/order-receiver.spec.ts`
- Modify: `backend/src/modules/orders/orders.service.ts`
- Modify: `backend/src/modules/orders/orders.controller.ts`
- Modify: `frontend/src/api/contracts.ts`

**Interfaces:**
- Produces `resolveEmployeeForUser(tx, userId): Promise<number | null>`.
- Produces `claimInitialOrderReceiver(tx, orderId, userId): Promise<number | null>` using `updateMany({ where: { id, receivedByEmployeeId: null } })`, then returns the persisted receiver id whether this call won or observed an earlier winner.
- `OrdersService.createOrder` sets receiver from the authenticated creator's linked Employee in the create transaction; guest/QR creation remains null.
- `OrdersService.updateOrderStatus` attempts the first claim inside its lifecycle transaction before returning the DTO.

- [ ] **Step 1: Write failing receiver tests**

```ts
it('assigns a staff-created order from Employee.userId but keeps creator independent');
it('leaves a QR guest order receiver null until an authenticated lifecycle transition');
it('keeps historical/null receiver as Chưa xác định instead of inferring creator');
it('allows exactly one of two concurrent receiver claims to write');
```

Assert that two parallel claims return one winner, the stored receiver is one of the linked employees, and a later transition cannot overwrite it.

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/orders/order-receiver.spec.ts`

Expected: FAIL because receiver storage/claiming is absent.

- [ ] **Step 3: Implement the minimal receiver service and wire create/status flows**

Keep `createdByUserId` untouched. Do not claim from guest input, actor name text, commission employee, or a historical creator. Include `receivedByEmployeeId` in `formatOrderDto` and the frontend `OrderDto` as nullable.

- [ ] **Step 4: Verify receiver and lifecycle regressions**

Run: `npm run test --workspace=backend -- test/orders/order-receiver.spec.ts test/orders/order-lifecycle.spec.ts test/orders/orders.spec.ts test/orders/order-fsm.spec.ts`

Run: `npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/orders backend/test/orders/order-receiver.spec.ts frontend/src/api/contracts.ts
git commit -m "feat(orders): capture first order receiver"
```

### Task 3: Persist cancellation snapshots inside the void transaction

**Files:**
- Create: `backend/src/modules/orders/order-cancellation.service.ts`
- Create: `backend/test/orders/order-cancellation.spec.ts`
- Modify: `backend/src/modules/orders/orders.service.ts`
- Modify: `backend/test/orders/table-operations-void.spec.ts`
- Modify: `backend/test/orders/auto-cancel-timeout.spec.ts`

**Interfaces:**
- Produces `recordOrderVoidCancellations(tx, order, context): Promise<void>`.
- Each row snapshots SKU/name/quantity/unit price/line amount, reason, actor, preparation state and inventory effect and uses deterministic `sourceKey`.
- Both manual void and auto-cancel create cancellation rows and `ORDER_VOIDED` audit in the same transaction as Order/table/stock changes.

- [ ] **Step 1: Write failing atomicity/idempotency tests**

```ts
it('creates one append-only ORDER_VOID snapshot per order item');
it('rolls back order, stock, cancellations and audit when cancellation persistence fails');
it('does not emit KDS, order, table or inventory events after a rollback');
it('keeps one cancellation set when the same void source is retried or races');
it('auto-cancel uses the same cancellation writer and emits only after commit');
```

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/orders/order-cancellation.spec.ts test/orders/table-operations-void.spec.ts test/orders/auto-cancel-timeout.spec.ts`

- [ ] **Step 3: Implement transactional cancellation and audit**

Call `AuditService.logInTransaction` before the callback returns. Return a post-commit event payload from the transaction; call `emitInventoryChanged`, `emitMenuStockChanged`, KDS/order/table socket emitters only after `$transaction` resolves. Do not add a line-item-cancel UI or mutate/delete cancellation history.

- [ ] **Step 4: Verify GREEN and socket regression**

Run the Step 2 command plus `npm run test --workspace=backend -- test/orders/order-socket.spec.ts test/orders/menu-stock.spec.ts`.

Run: `npm run typecheck:backend`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/orders backend/test/orders
git commit -m "feat(orders): record atomic cancellation history"
```

### Task 4: Freeze query, time-window and response contracts

**Files:**
- Create: `backend/src/modules/reports/end-of-day/end-of-day.types.ts`
- Create: `backend/src/modules/reports/end-of-day/end-of-day.time.ts`
- Create: `backend/src/modules/reports/end-of-day/end-of-day.schemas.ts`
- Create: `backend/src/modules/reports/end-of-day/end-of-day.schemas.spec.ts`

**Interfaces:**
- Produces `EndOfDayConcern`, `EndOfDayView`, `EndOfDayReportQuery`, `EndOfDayReportMetadata`, `NormalizedConcernResult<Row, Summary>` and `EndOfDayReportResponse<Row, Summary>`.
- Produces `parseEndOfDayQuery(input)` and `resolveBusinessWindow(date, fromTime?, toTime?, timezone)`.
- Defines exact `SUPPORTED_FILTERS_BY_CONCERN`, concern-specific `recordTypes`, sort allow-lists, page default 1, page size default 50/max 200.

- [ ] **Step 1: Write failing pure contract tests**

```ts
expect(resolveBusinessWindow('2026-10-03').from.toISOString()).toBe('2026-10-02T17:00:00.000Z');
expect(resolveBusinessWindow('2026-10-03').to.toISOString()).toBe('2026-10-03T17:00:00.000Z');
expect(() => parseEndOfDayQuery({ concern: 'SALES', cancelReason: 'x' })).toThrow();
expect(() => parseEndOfDayQuery({ concern: 'SALES', fromTime: '08:00' })).toThrow();
expect(() => parseEndOfDayQuery({ concern: 'SUMMARY', paymentMethods: 'CASH' })).toThrow();
```

Also assert boundary inclusion/exclusion helpers, invalid calendar dates, invalid times, `fromTime >= toTime`, unknown query keys, invalid sort and no `id` in `operatingScope`.

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- src/modules/reports/end-of-day/end-of-day.schemas.spec.ts`

- [ ] **Step 3: Implement contracts and validation**

Use strict Zod objects so unsupported/unknown filters fail instead of disappearing. Keep timezone fixed to `Asia/Ho_Chi_Minh` through this slice; serialize `from`/`to` as ISO timestamps.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and `npm run typecheck:backend`.

- [ ] **Step 5: Commit**

Commit `feat(reports): define end-of-day report contracts` with only the four files above.

### Task 5: Implement the Sales concern adapter

**Files:**
- Create: `backend/src/modules/reports/end-of-day/sales.adapter.ts`
- Create: `backend/test/reports/end-of-day-sales.spec.ts`

**Interfaces:**
- Produces `SalesReportAdapter.read(tx, query): Promise<NormalizedConcernResult<SalesReportRow, SalesSummary>>`.
- Invoice rows use `Order.status=COMPLETED` and `completedAt`; return rows use `OrderReturn.status=COMPLETED` and `returnedAt`.
- Produces `grossInvoiceValue`, `salesReturnValue`, `netInvoiceValue` and explicitly labeled goods/discount/VAT/delivery components.

- [ ] **Step 1: Write failing Sales fixtures/tests**

```ts
it('uses completedAt rather than createdAt and applies [from,to)');
it('subtracts a later return without changing the invoice finalAmount snapshot');
it('filters by successful payment transactions with legacy Order.paymentMethod fallback flagged');
it('keeps rows, summary, totalRows and filter options consistent under the same filters');
```

The return regression must read `Order.finalAmount` before and after creating `OrderReturn` and expect equality; `netInvoiceValue` must subtract `totalRefundDue` once.

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- test/reports/end-of-day-sales.spec.ts test/orders/sales-return.api.spec.ts`

- [ ] **Step 3: Implement Sales adapter with SQL/Prisma aggregation**

Select only DTO fields. Apply customer/receiver/creator/payment/delivery/area/table/search filters identically to count, rows and summary. Each faceted option query applies every active filter except its own dimension, and all facets use the same transaction. Summary is not calculated from the paginated page.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and `npm run typecheck:backend`.

- [ ] **Step 5: Commit**

Commit `feat(reports): add end-of-day sales adapter`.

### Task 6: Normalize Cashflow without double counting

**Files:**
- Create: `backend/src/modules/reports/end-of-day/cashflow.registry.ts`
- Create: `backend/src/modules/reports/end-of-day/cashflow.adapter.ts`
- Create: `backend/src/modules/reports/end-of-day/cashflow.registry.spec.ts`
- Create: `backend/test/reports/end-of-day-cashflow.spec.ts`

**Interfaces:**
- Produces `CashflowEvent` and `canonicalMoneyEventKey(sourceType, sourceTransactionId)`.
- Produces `CashflowReportAdapter.read(tx, query)` with one event per immutable money transaction.
- Linked CashVoucher enriches the domain event; unlinked successful domain transactions are `UNRECONCILED`; manual/reversal vouchers remain standalone events.

- [ ] **Step 1: Write failing registry and integration tests**

```ts
it('deduplicates a successful order payment and its linked CashVoucher');
it('counts two payment transactions on one order as two events');
it('counts a deposit on confirmedAt but creates no second event for APPLY_TO_BILL');
it('uses refund completion time and treats POSTED reversal as a signed event');
it('returns hasData true when receipts and payments net to zero');
```

Also cover orphan payment `UNRECONCILED`, cancelled voucher exclusion, manual voucher inclusion, payment-method/source filters and midnight boundaries.

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=backend -- src/modules/reports/end-of-day/cashflow.registry.spec.ts test/reports/end-of-day-cashflow.spec.ts`

- [ ] **Step 3: Implement registry first, then adapter**

Key dedupe by `(sourceType, sourceTransactionId)`/stable `sourceKey`; domain timestamp wins when linked. Cashflow facets apply all active filters except the dimension being listed. Do not create/repair a CashVoucher from this read path.

- [ ] **Step 4: Verify GREEN and source regressions**

Run the Step 2 command plus `npm run test --workspace=backend -- src/modules/cashbook/cashbook.source-map.spec.ts test/orders/sales-return.api.spec.ts test/reservations/reservation-operations.api.spec.ts`.

- [ ] **Step 5: Commit**

Commit `feat(reports): add canonical cashflow reporting`.

### Task 7: Implement Goods and Cancelled Items adapters

**Files:**
- Create: `backend/src/modules/reports/end-of-day/goods.adapter.ts`
- Create: `backend/src/modules/reports/end-of-day/cancelled-items.adapter.ts`
- Create: `backend/test/reports/end-of-day-goods.spec.ts`
- Create: `backend/test/reports/end-of-day-cancelled-items.spec.ts`

**Interfaces:**
- Produces `GoodsReportAdapter.read(tx, query)` with separate `SALE_ITEM` and `INVENTORY_EVENT` rows.
- Produces `CancelledItemsReportAdapter.read(tx, query)` preferring cancellation ledger rows and using `LEGACY_ORDER_VOID/HISTORICAL_FALLBACK` only when an Order has no ledger rows.

- [ ] **Step 1: Write failing Goods tests**

```ts
it('selects sold items by Order.completedAt and inventory events by ledger createdAt');
it('maps all inventory types with explicit quantity/cost signs');
it('does not add menu-item quantity to ingredient quantity');
it('computes netSalesCogs as AUTO_DEDUCT minus SALES_RETURN and keeps waste separate');
```

- [ ] **Step 2: Write failing Cancelled Items tests**

```ts
it('reads append-only snapshots by cancelledAt');
it('creates one historical fallback per old cancelled OrderItem');
it('does not emit fallback when any new cancellation row exists for the order');
it('never subtracts revenue for an order that never completed');
```

- [ ] **Step 3: Run RED**

Run: `npm run test --workspace=backend -- test/reports/end-of-day-goods.spec.ts test/reports/end-of-day-cancelled-items.spec.ts`

- [ ] **Step 4: Implement both adapters and verify**

Use concern-specific filters/allow-lists from Task 4; preserve signed quantity and expose quality flags. Goods and Cancelled Items facets apply all active filters except their own dimension. In Cancelled Items, `creatorUserId` means the Order creator; cancellation actor remains a separate row/breakdown field, not an overloaded filter. Run the Step 3 command plus focused inventory and void suites, then `npm run typecheck:backend`.

- [ ] **Step 5: Commit**

Commit `feat(reports): add goods and cancellation reporting`.

### Task 8: Compose Summary and prove one read-consistent snapshot

**Files:**
- Create: `backend/src/modules/reports/end-of-day/summary.adapter.ts`
- Create: `backend/src/modules/reports/end-of-day/end-of-day.service.ts`
- Create: `backend/test/reports/end-of-day-summary.spec.ts`
- Create: `backend/test/reports/end-of-day-snapshot.mysql.spec.ts`

**Interfaces:**
- Produces `SummaryReportAdapter.compose(sales, cashflow, goods, cancellations): SummaryConcernResult`.
- Produces `EndOfDayReportService.get(query): Promise<EndOfDayReportResponse>`.
- Service opens `prisma.$transaction(..., { isolationLevel: RepeatableRead, timeout: 30_000 })`, samples DB clock for representative `asOf`, and executes every query through that transaction client.

- [ ] **Step 1: Write failing summary formula/invariant tests**

```ts
expect(summary.estimatedContributionBeforeWaste).toBe(netInvoiceValue - netSalesCogs);
expect(summary.estimatedContributionAfterWaste).toBe(summary.estimatedContributionBeforeWaste - kitchenWasteCost);
expect(summary).not.toHaveProperty('grossProfit');
expect(summary.sales.netInvoiceValue).toBe(sales.summary.netInvoiceValue);
```

- [ ] **Step 2: Write the deterministic MySQL concurrency test**

Start the report, pause through a test spy/barrier after the first adapter query, commit a new qualifying row through a second Prisma connection, then release the report. Assert rows/summary/facets all either exclude that row in the first response and include it in the next response. Assert `asOf <= generatedAt`; do not assert `asOf` equals an internal MVCC timestamp.

- [ ] **Step 3: Run RED on an isolated MySQL target only**

Run: `npm run test --workspace=backend -- test/reports/end-of-day-summary.spec.ts test/reports/end-of-day-snapshot.mysql.spec.ts`

- [ ] **Step 4: Implement service/summary and verify**

`hasData` derives from record/event count, not aggregate nonzero. For `SUMMARY`, run unpaginated summary projections for all four adapters in the same transaction and expose no domain-specific facets. Set `generatedAt` only after the complete payload has been assembled. Re-run Step 3 and `npm run typecheck:backend`.

- [ ] **Step 5: Commit**

Commit `feat(reports): add consistent end-of-day snapshots`.

### Task 9: Expose secured API and safe XLSX export

**Files:**
- Create: `backend/src/modules/reports/end-of-day/end-of-day.export.ts`
- Modify: `backend/src/modules/reports/reports.controller.ts`
- Modify: `backend/src/modules/reports/reports.routes.ts`
- Modify: `backend/src/lib/api-error.ts`
- Create: `backend/test/reports/end-of-day-report.api.spec.ts`
- Create: `backend/test/reports/end-of-day-export.spec.ts`

**Interfaces:**
- Adds ADMIN-only `GET /api/reports/end-of-day` and `/api/reports/end-of-day/export?format=xlsx` while preserving `/daily`.
- Adds `REPORT_EXPORT_TOO_LARGE` mapped to HTTP 413 with `estimatedRows`.
- Produces `serializeEndOfDayWorkbook(snapshot)` with data and summary/metadata sheets.

- [ ] **Step 1: Write failing auth/validation API tests**

```ts
it.each(['guest', 'CASHIER', 'KITCHEN'])('rejects %s for report and export');
it('returns 400 for unsupported concern filters and incomplete time pairs');
it('returns metadata with operatingScope and no branch id');
it('preserves GET /api/reports/daily during transition');
```

- [ ] **Step 2: Write failing export parity/limit tests**

Assert the workbook row count and aggregates equal the unpaginated service result for the same fixture/filter; metadata contains from/to/timezone/asOf/generatedAt/filters/quality flags. Assert 50,001 estimated rows returns 413 and no truncated workbook.

- [ ] **Step 3: Run RED**

Run: `npm run test --workspace=backend -- test/reports/end-of-day-report.api.spec.ts test/reports/end-of-day-export.spec.ts test/reports/reports.spec.ts`

- [ ] **Step 4: Implement controller/routes/export and verify**

Reuse the Task 4 parser and Task 8 service for both screen and export. Export removes pagination only after enforcing configured row/memory limits; never log sensitive customer/account data. Run Step 3 and backend typecheck.

- [ ] **Step 5: Commit**

Commit `feat(reports): expose end-of-day report and export`.

### Task 10: Add the frontend API client and Reports workspace

**Files:**
- Create: `frontend/src/api/endOfDayReports.ts`
- Create: `frontend/src/api/endOfDayReports.test.ts`
- Create: `frontend/src/features/reports/ReportsWorkspaceScreen.tsx`
- Create: `frontend/src/features/reports/ReportsWorkspaceScreen.test.tsx`
- Modify: `frontend/src/navigation/RoleTabs.tsx`
- Modify: `frontend/src/features/admin/AdminScreen.tsx`
- Modify: `frontend/src/features/admin/employeeManagementScreen.test.tsx`

**Interfaces:**
- Produces typed `EndOfDayReportFilter`, metadata/row/summary unions, `fetchEndOfDayReportApi`, `downloadEndOfDayReportApi`, and a query builder that omits undefined filters but never remaps concern semantics.
- Reports workspace sections are `end-of-day`, `sales`, `goods`, `customers`, `suppliers`, `employees`, `channels`, `finance`.

- [ ] **Step 1: Write failing API-client tests**

```ts
it('serializes arrays and both time bounds without adding unsupported keys');
it('unwraps VALIDATION_ERROR and REPORT_EXPORT_TOO_LARGE messages');
it('downloads XLSX with the same filter query and without screen pagination');
```

- [ ] **Step 2: Write failing workspace/navigation tests**

Assert Cuối ngày is default, Bán hàng renders `DashboardScreen`, the remaining six items are disabled/accessibly marked, and ADMIN `reports` now mounts `ReportsWorkspaceScreen` without changing other role tabs.

- [ ] **Step 3: Run RED**

Run: `npm run test --workspace=frontend -- src/api/endOfDayReports.test.ts src/features/reports/ReportsWorkspaceScreen.test.tsx src/features/admin/employeeManagementScreen.test.tsx`

- [ ] **Step 4: Implement client/workspace and verify**

Do not move the legacy daily client yet; Dashboard remains a transition consumer. Run Step 3 and `npm run typecheck:frontend`.

- [ ] **Step 5: Commit**

Commit `feat(reports): add report workspace and API client`.

### Task 11: Build the concern-aware filter rail and report surface

**Files:**
- Create: `frontend/src/features/reports/EndOfDayReportScreen.tsx`
- Create: `frontend/src/features/reports/EndOfDayReportFilters.tsx`
- Create: `frontend/src/features/reports/EndOfDayReportView.tsx`
- Create: `frontend/src/features/reports/endOfDayReportViewModel.ts`
- Create: `frontend/src/features/reports/endOfDayReportViewModel.test.ts`
- Create: `frontend/src/features/reports/EndOfDayReportScreen.test.tsx`
- Modify: `frontend/src/features/reports/ReportsWorkspaceScreen.tsx`

**Interfaces:**
- Produces five concern options in order: Bán hàng, Thu chi, Hàng hóa, Hủy món, Tổng hợp.
- Produces `visibleFiltersForConcern(concern)` from the same support map as the backend contract.
- Dọc renders KPI/breakdowns; Ngang renders paginated detail rows. Both show snapshot metadata and quality flags.

- [ ] **Step 1: Write failing pure view-model tests**

```ts
expect(CONCERN_OPTIONS.map(x => x.label)).toEqual(['Bán hàng', 'Thu chi', 'Hàng hóa', 'Hủy món', 'Tổng hợp']);
expect(visibleFiltersForConcern('SALES')).toContain('paymentMethods');
expect(visibleFiltersForConcern('CANCELLED_ITEMS')).not.toContain('paymentMethods');
expect(formatReceiver(null)).toBe('Chưa xác định');
```

- [ ] **Step 2: Write failing component tests**

Assert the 272 px desktop filter rail, locked “Nhà hàng chính” scope without numeric id, paired time controls, Dọc/Ngang radios, correct hidden filters, 44 px interactive targets, report title/metadata and horizontal detail pagination.

- [ ] **Step 3: Run RED**

Run: `npm run test --workspace=frontend -- src/features/reports/endOfDayReportViewModel.test.ts src/features/reports/EndOfDayReportScreen.test.tsx`

- [ ] **Step 4: Implement with existing design tokens**

Use warm canvas/sunken viewer plus a white printable report surface; support dark chrome while keeping print white. At widths below 1024 collapse/move filters above the report; at 390 px use two-column KPI cards and controlled horizontal table scrolling without shrinking report text.

- [ ] **Step 5: Verify and commit**

Run Step 3 and frontend typecheck, then commit `feat(reports): build end-of-day report interface`.

### Task 12: Add atomic request state, stale refresh, export and print UX

**Files:**
- Create: `frontend/src/features/reports/useEndOfDayReport.ts`
- Create: `frontend/src/features/reports/useEndOfDayReport.test.tsx`
- Modify: `frontend/src/features/reports/EndOfDayReportScreen.tsx`
- Modify: `frontend/src/features/reports/EndOfDayReportScreen.test.tsx`

**Interfaces:**
- Produces `{ snapshot, loading, error, stale, refreshAttemptedAt, load, refresh }` and commits only the newest request id/AbortController result.
- A failed refresh of the same normalized query retains the last snapshot and `generatedAt`; a different-query failure never labels the previous snapshot as matching the new query.
- Produces Web XLSX download and print actions; non-Web download reports the existing platform limitation instead of claiming success.

- [ ] **Step 1: Write failing state-machine tests**

```ts
it('keeps the last snapshot and generatedAt when same-query refresh fails');
it('does not replace a valid snapshot with zero, null or a partial response');
it('renders an empty state only when hasData is false');
it('renders netCashFlow zero when hasData is true');
it('ignores an older response that resolves after a newer query');
```

- [ ] **Step 2: Write failing export/print tests**

Assert export uses the committed filter set, shows 413 guidance, and can export a stale snapshot only with its timestamp visible. Assert print targets the current report surface/metadata and disables actions only when no usable snapshot exists.

- [ ] **Step 3: Run RED**

Run: `npm run test --workspace=frontend -- src/features/reports/useEndOfDayReport.test.tsx src/features/reports/EndOfDayReportScreen.test.tsx`

- [ ] **Step 4: Implement and verify**

Use `InlineAlert`, `EmptyState`, `Button` and the established browser Blob download pattern. Run Step 3, all reports frontend tests, frontend typecheck and focused lint.

- [ ] **Step 5: Commit**

Commit `feat(reports): handle report refresh export and print`.

### Task 13: Isolated migration, regression and visual acceptance

**Files:**
- Modify only if failures reveal an in-scope defect; otherwise no source files.
- Update implementation evidence in `progress.md` after verification.

**Interfaces:**
- Proves the migration from a clean baseline, MySQL concurrency/read consistency, backend/frontend regression, responsive UI and no shared-database writes.

- [ ] **Step 1: Provision and verify an isolated MySQL 8.4 target**

Create a unique temporary datadir, unused loopback port and schema ending `_test`. Resolve and compare absolute datadir/port/schema against running DEV/TEST before starting. Set `TEST_DATABASE_URL` only for the child process; leave `DATABASE_URL` unchanged. If identity/isolation cannot be proven, stop DB acceptance and report the blocker.

- [ ] **Step 2: Review SQL and deploy all migrations to the isolated target**

Run the guarded migration path, then `prisma validate` and `prisma migrate status`. Assert the new migration is additive, receiver remains nullable, cancellation source key is unique and no backfill/update touches old Order receiver values.

- [ ] **Step 3: Run backend acceptance sequentially**

Run all new report/order suites, Cashbook source suites, Orders lifecycle/void/return/socket suites, Inventory suites and reservation deposit/refund suites with file parallelism disabled. Then run backend typecheck, build and focused lint.

- [ ] **Step 4: Run frontend acceptance**

Run all frontend report/workspace/API tests, then full frontend tests, typecheck, lint and Expo Web export.

- [ ] **Step 5: Perform responsive visual QA**

Open the built/running app as ADMIN and inspect light/dark at 1440 px, 1024 px and 390 px. Verify all five concerns, Dọc/Ngang, filter collapse, horizontal table, stale alert, empty vs zero, locked operating scope, print preview and XLSX error/success affordances. Capture evidence without committing temporary browser artifacts.

- [ ] **Step 6: Final review and commit any verification-only fixes**

Run `git diff --check`, inspect `git status`, confirm no credentials/temp datadir/browser state is tracked, and request a whole-branch code review. If fixes were necessary, rerun their owning test cycle and commit them separately as `fix(reports): address end-of-day acceptance findings`.

## Execution Safety Note

The DB commands in this plan are not authorization to use the configured shared DEV/TEST schemas. Before every DB-backed command, verify `backend/scripts/test-database-guard.ts`, the effective `TEST_DATABASE_URL` target and the isolated server identity. Never run `prisma migrate reset`, `db:reset`, the seed script, or a destructive cleanup against `DATABASE_URL` or the known schema-drifted shared databases.

### Task 14: Repeat report table headers in print and specialize empty states

**Files:**
- Modify: `frontend/src/features/reports/EndOfDayReportScreen.tsx`
- Modify: `frontend/src/features/reports/EndOfDayReportView.tsx`
- Modify: `frontend/src/features/reports/EndOfDayReportScreen.test.tsx`
- Update acceptance evidence: `.superpowers/sdd/2026-10-03-end-of-day-report/task-13-report.md`
- Update SDD ledger: `.superpowers/sdd/2026-10-03-end-of-day-report/progress.md`

**Interfaces:**
- The on-screen React Native Web table remains unchanged; only its print-document clone becomes a semantic HTML `table` with `thead`/`tbody` so the browser repeats the complete header on each printed page.
- Empty-state titles are concern-specific for SALES, CASHFLOW, GOODS, CANCELLED_ITEMS and SUMMARY, with shared date/filter guidance.

- [ ] **Step 1: Write failing empty-state and print regression tests**

Assert each concern renders its own empty-state title and the common guidance. Use Chromium print/PDF layout to assert every page repeats the full ten-column header, preserves report metadata and detail content, and the horizontal layout keeps every column within the printable page.

- [ ] **Step 2: Run RED**

Run: `npm run test --workspace=frontend -- src/features/reports/EndOfDayReportScreen.test.tsx`

Expected: fail because the empty copy is generic and the print clone does not have a semantic repeating table header.

- [ ] **Step 3: Implement the print-only table conversion and concern copy**

Convert the cloned ARIA rows/cells to native `table`/`thead`/`tbody`/`tr`/`th`/`td`; use `display: table-header-group` for `thead` in print. Preserve cell text, horizontal A4 landscape, all ten columns, current-page rows, metadata, and the existing on-screen scrolling table. Do not lower the 50,000-row export cap or add export-concurrency behavior.

Concern copy:
- SALES: `Không có hóa đơn bán hàng trong phạm vi đã chọn.`
- CASHFLOW: `Không có giao dịch thu hoặc chi trong phạm vi đã chọn.`
- GOODS: `Không phát sinh hoạt động hàng hóa trong phạm vi đã chọn.`
- CANCELLED_ITEMS: `Không có món hoặc đơn bị hủy trong phạm vi đã chọn.`
- SUMMARY: `Không có hoạt động trong ngày trong phạm vi đã chọn.`
- Shared guidance: `Thử đổi ngày hoặc điều chỉnh bộ lọc.`

- [ ] **Step 4: Verify and update acceptance evidence**

Re-run the focused report tests, full frontend suite, frontend typecheck, focused ESLint for changed report sources and Expo Web export. Update Task 13 acceptance evidence with the repeating-header/PDF outcome; retain the measured sequential 50,000-row figures and explicitly state that production memory/replica limits are unknown and concurrent-export testing/resource controls remain uncommitted pending infrastructure details.

- [ ] **Step 5: Commit and request independent task review**

Run `git diff --check` and commit the UI/tests/evidence as `fix(reports): repeat end-of-day print headers`.

### Task 14 PDF regression acceptance

The Chromium regression uses `pdfjs-dist` 6.4.299 as an exact frontend development dependency recorded in `package-lock.json`. Its Node PDF reader consumes the actual print PDF bytes, verifies all ten repeated Vietnamese headings on every A4 landscape page, all 500 current-page cell values, report metadata/footer and horizontal text bounds within printable margins. It is loaded only by the test and adds no application UI/font dependency.

With the repository's declared Node/npm versions, install dependencies using `npm ci` and provide the existing Playwright Chromium browser (`npx playwright install chromium` when it is not already installed). Then ordinary `npm run test --workspace=frontend` runs the PDF regression without a Python installation, external PDF parser, machine-specific path or parser environment variable. The print-dialog fixture remains deterministic; Task 13's actual exported-app acceptance is retained separately.

## Export capacity status (2026-10-04)

Keep the accepted export cap at 50,000 rows. The production XLSX serializer was measured sequentially on 50,000 Sales rows: serialized input 31,217,233 bytes (~29.8 MiB), XLSX output 15,425,272 bytes (~14.7 MiB), 10.5–15.0 seconds per export, and cumulative process peak RSS 876,424 KiB (~856.9 MiB). A prior single-run measurement was 8.45 seconds / 842,324 KiB (~822.6 MiB). The 32 MiB source-data bound is not a process-RSS limit.

The repository has no production backend memory limit, maximum instance/replica count, autoscaling policy, or export queue configuration. Concurrent-export performance and peak memory have not been measured by request, and no concurrency limit, worker, or streaming change is selected until deployment capacity is supplied. Before production rollout, confirm per-instance RAM, maximum backend instances, shared-database topology, request timeout and any existing queue/worker; then set a resource policy and run a capacity-appropriate concurrency benchmark. No production deployment is authorized by this note.
