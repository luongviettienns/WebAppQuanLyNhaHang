# Bảng giá chung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng bảng giá chung tập trung, đồng bộ realtime với menu/POS/QR, giữ snapshot giá trong đơn và mở rộng được cho scope tương lai.

**Architecture:** Tách `PriceList`/`PriceListItem` khỏi `MenuItem`; `PriceListItem.salePrice` là nguồn sự thật, còn `MenuItem.basePrice` là mirror tương thích. Backend dùng `PriceListService` để resolve giá theo batch trong menu và trong transaction tạo đơn; frontend nhận thay đổi qua REST + Socket.io.

**Tech Stack:** Node.js 24.19.0, TypeScript, Express, Prisma, MySQL 8.4, Socket.io, React Native/Expo SDK 54, Vitest, Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-20-price-list-design.md`

## Global Constraints

- MVP chỉ có một bảng giá `GENERAL` tên “Bảng giá chung”, scope `GLOBAL`.
- `PriceListItem.salePrice` là nguồn sự thật; `MenuItem.basePrice` phải được duy trì như mirror/fallback.
- Backend là nguồn quyết định giá cuối; không tin giá do client gửi lên.
- `OrderItem.unitPrice` là snapshot và không được hồi tố khi đổi bảng giá.
- Chỉ `ADMIN` được xem/chỉnh sửa/import/export bảng giá; POS, KDS và khách QR chỉ nhận giá hiệu lực.
- Giá tiền là số nguyên VND dương; giá thấp hơn giá vốn chỉ cảnh báo, không chặn lưu.
- Mọi thay đổi giá phải ghi `AuditLog` và chỉ phát socket sau khi transaction thành công.
- `GET /api/menu` tiếp tục trả field `basePrice` để giữ tương thích với POS/QR.
- Resolver menu phải tải giá theo batch/map, không tạo N+1 query.
- Không xóa dữ liệu bảng giá trong rollback; không dùng migration down để xóa dữ liệu tài chính.
- Giữ tương thích responsive desktop/tablet/mobile, focus keyboard và vùng chạm tối thiểu 44px.

## Review Focus

1. Migration chạy lại hoặc database đã có dữ liệu: seed `GENERAL` và backfill phải idempotent, không đổi giá đã tồn tại.
2. Hai Admin sửa cùng một dòng: `version` phải trả 409 và không ghi đè giá mới hơn.
3. Giá đổi giữa lúc menu được tải và lúc tạo đơn: order phải resolve trong transaction và lưu giá mới nhất.
4. Socket mất kết nối hoặc phát trùng: frontend phải refetch khi reconnect và không làm giỏ hàng sai giá.
5. Món thiếu BOM hoặc giá vốn cao hơn giá bán: hiển thị “Chưa có dữ liệu”/cảnh báo, nhưng vẫn cho phép cập nhật hợp lệ.

---

### Task 1: Data model, migration và price resolver

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260920100000_add_general_price_list/migration.sql`
- Modify: `backend/prisma/seed.ts`
- Create: `backend/src/modules/price-lists/price-list.types.ts`
- Create: `backend/src/modules/price-lists/price-list.service.ts`
- Create: `backend/test/price-lists/price-list.service.spec.ts`

**Interfaces:**
- Consumes: `MenuItem.basePrice`, Prisma client, `AuditService` types.
- Produces:
  - `PriceResolveContext = { priceListId?: number; scopeType?: 'GLOBAL' | 'BRANCH' | 'CHANNEL' | 'CUSTOMER_GROUP'; scopeKey?: string; at?: Date }`.
  - `ResolvedPrice = { menuItemId: number; salePrice: number; priceListId: number | null; version: number | null; source: 'PRICE_LIST' | 'BASE_PRICE' }`.
  - `PriceListService.getGeneralPriceList()`.
  - `PriceListService.resolveEffectivePrices(client, menuItemIds, context?)` returning `Map<number, ResolvedPrice>`.
  - `PriceListService.syncMenuItemPrice(client, menuItemId, salePrice)`.

- [ ] **Step 1: Write failing resolver and seed tests**

Add integration tests that create/seed menu items and assert:

```ts
it('resolves the GENERAL price item before MenuItem.basePrice', async () => {
  const item = await prismaTest.menuItem.findFirstOrThrow();
  const general = await prismaTest.priceList.findUniqueOrThrow({ where: { code: 'GENERAL' } });
  await prismaTest.priceListItem.update({
    where: { priceListId_menuItemId: { priceListId: general.id, menuItemId: item.id } },
    data: { salePrice: item.basePrice + 5000 }
  });

  const prices = await PriceListService.resolveEffectivePrices(prismaTest, [item.id]);
  expect(prices.get(item.id)?.salePrice).toBe(item.basePrice + 5000);
  expect(prices.get(item.id)?.source).toBe('PRICE_LIST');
});

it('falls back to basePrice when a price row is missing', async () => {
  const item = await prismaTest.menuItem.findFirstOrThrow();
  const general = await prismaTest.priceList.findUniqueOrThrow({ where: { code: 'GENERAL' } });
  await prismaTest.priceListItem.delete({
    where: { priceListId_menuItemId: { priceListId: general.id, menuItemId: item.id } }
  });

  const prices = await PriceListService.resolveEffectivePrices(prismaTest, [item.id]);
  expect(prices.get(item.id)?.salePrice).toBe(item.basePrice);
  expect(prices.get(item.id)?.source).toBe('BASE_PRICE');
});
```

Run: `npm run test:backend -- --run backend/test/price-lists/price-list.service.spec.ts`

Expected: FAIL because Prisma models, seed data and resolver do not exist.

- [ ] **Step 2: Add Prisma models and migration SQL**

Add `PriceListType`, `PriceListScopeType`, `PriceList`, `PriceListItem`, `MenuItem.priceListItems`, and `Order.priceListId` relations exactly as specified in `docs/superpowers/specs/2026-09-20-price-list-design.md`.

Create the migration with concrete MySQL DDL matching the Prisma model:

```sql
CREATE TABLE `PriceList` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` ENUM('GENERAL', 'CUSTOM') NOT NULL DEFAULT 'GENERAL',
  `scopeType` ENUM('GLOBAL', 'BRANCH', 'CHANNEL', 'CUSTOMER_GROUP') NOT NULL DEFAULT 'GLOBAL',
  `scopeKey` VARCHAR(191) NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `effectiveFrom` DATETIME(3) NULL,
  `effectiveTo` DATETIME(3) NULL,
  `createdByUserId` INT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `PriceList_code_key` (`code`),
  KEY `PriceList_scopeType_scopeKey_idx` (`scopeType`, `scopeKey`),
  KEY `PriceList_isDefault_isActive_idx` (`isDefault`, `isActive`),
  KEY `PriceList_effectiveFrom_effectiveTo_idx` (`effectiveFrom`, `effectiveTo`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PriceListItem` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `priceListId` INT NOT NULL,
  `menuItemId` INT NOT NULL,
  `salePrice` INT NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `PriceListItem_priceListId_menuItemId_key` (`priceListId`, `menuItemId`),
  KEY `PriceListItem_menuItemId_idx` (`menuItemId`),
  CONSTRAINT `PriceListItem_priceListId_fkey` FOREIGN KEY (`priceListId`) REFERENCES `PriceList` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PriceListItem_menuItemId_fkey` FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Order` ADD COLUMN `priceListId` INT NULL;
ALTER TABLE `Order`
  ADD CONSTRAINT `Order_priceListId_fkey`
  FOREIGN KEY (`priceListId`) REFERENCES `PriceList` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `Order_priceListId_idx` ON `Order` (`priceListId`);
```

The concrete SQL must match Prisma-generated column names/types and add indexes for scope, active/default, effective dates, menu item and order price list.

- [ ] **Step 3: Make seed/backfill idempotent**

In `backend/prisma/seed.ts`, upsert `GENERAL` with `GLOBAL` scope and create missing `PriceListItem` rows from each menu item’s current `basePrice`. Never overwrite an existing `PriceListItem.salePrice` during a rerun.

- [ ] **Step 4: Implement batch resolver and mirror sync**

Implement `resolveEffectivePrices` with one query for the active default global price list, one query for all requested price rows, and a map fallback to each menu item’s `basePrice`. Implement `syncMenuItemPrice` to update `PriceListItem.salePrice`, increment `version`, and update `MenuItem.basePrice` in the caller’s transaction.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm run test:backend -- --run backend/test/price-lists/price-list.service.spec.ts`

Expected: PASS, including idempotent seed and missing-row fallback.

Commit: `git add backend/prisma backend/src/modules/price-lists backend/test/price-lists && git commit -m "feat(price-list): add general price data model"`

### Task 2: Backend menu/order integration and price-list API

**Files:**
- Create: `backend/src/modules/price-lists/price-list.schemas.ts`
- Create: `backend/src/modules/price-lists/price-list.controller.ts`
- Create: `backend/src/modules/price-lists/price-list.routes.ts`
- Create: `backend/src/modules/price-lists/price-list.import.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/modules/menu/menu.service.ts`
- Modify: `backend/src/modules/orders/orders.service.ts`
- Modify: `backend/src/modules/menu/menu.service.ts` import/create/update paths
- Create: `backend/test/price-lists/price-list-api.spec.ts`
- Modify: `backend/test/menu/menu-admin.spec.ts`
- Modify: `backend/test/orders/orders.spec.ts`

**Interfaces:**
- Consumes: Task 1 `PriceListService`, `PriceResolveContext`, `ResolvedPrice`.
- Produces:
  - `GET /api/price-lists/general` returning `{ data: { priceList, items } }`.
  - `PATCH /api/price-lists/:priceListId/items/:menuItemId` accepting `{ salePrice, expectedVersion }`.
  - `PATCH /api/price-lists/:priceListId/items/bulk` accepting `{ menuItemIds, operation }`.
  - Preview/commit/export endpoints from the spec.

- [ ] **Step 1: Write failing API/auth/concurrency tests**

Cover unauthenticated/CASHIER rejection, ADMIN read/update, invalid zero/negative price, `409` version conflict, and atomic bulk failure. Use the existing `adminToken`, `cashierToken`, `prismaTest`, and `seedDatabase` pattern from `backend/test/menu/menu-admin.spec.ts`.

Example:

```ts
it('rejects a stale price update without changing the newer value', async () => {
  const row = await prismaTest.priceListItem.findFirstOrThrow();
  await prismaTest.priceListItem.update({ where: { id: row.id }, data: { version: row.version + 1, salePrice: row.salePrice + 1000 } });

  const res = await request(app)
    .patch(`/api/price-lists/${row.priceListId}/items/${row.menuItemId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ salePrice: row.salePrice + 2000, expectedVersion: row.version });

  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('CONFLICT');
  expect((await prismaTest.priceListItem.findUniqueOrThrow({ where: { id: row.id } })).salePrice).toBe(row.salePrice + 1000);
});
```

Run: `npm run test:backend -- --run backend/test/price-lists/price-list-api.spec.ts`

Expected: FAIL because routes/controller/service are not registered.

- [ ] **Step 2: Implement schemas, controller, routes and app registration**

Use Zod schemas to enforce positive integer prices, unique item IDs, valid `expectedVersion`, and formula operations `{ mode: 'fixed' | 'amount' | 'percent'; value: number; rounding?: 100 | 1000 | 10000 }`. Register `priceListRouter` at `/api/price-lists`, with `authenticate` and `authorize('ADMIN')` on every management route.

- [ ] **Step 3: Implement one-row and bulk updates**

For one row, execute conditional update by `id + version`, update mirror `MenuItem.basePrice`, write audit metadata with before/after values, and return the new row. For bulk, load all rows and current prices, calculate every result before opening the write transaction, reject invalid results as one request, then update all rows and mirrors in one transaction.

- [ ] **Step 4: Integrate menu create/update/import and GET menu**

Update `MenuService.getFullMenu()` to load the default price list once, resolve all menu item prices by map, and expose the resolved value through existing `basePrice`. Update menu create/update and `commitMenuImport` to call `syncMenuItemPrice` in the same transaction whenever a base price is created/changed. Add tests that menu API returns the `PriceListItem` value and menu import does not leave the mirror out of sync.

- [ ] **Step 5: Integrate order creation with price resolver**

Inside the order creation transaction, resolve all requested menu item prices through `PriceListService`, set `Order.priceListId`, and calculate `OrderItem.unitPrice = resolvedSalePrice + validatedModifierDelta`. Add a regression test that changes the price after the client menu was loaded and verifies the created order uses the new database price while a previously created order keeps its old `unitPrice`.

- [ ] **Step 6: Implement import/export and run backend tests**

Reuse the existing menu import workbook conventions. Required columns: `sku`, `name`, `categoryName`, `salePrice`; preview reports invalid/nonexistent SKU rows; commit is all-or-nothing and writes audit. Export CSV/XLSX includes SKU, name, category, BOM cost, sale price and margin; missing BOM cost is null/blank.

Run: `npm run test:backend`

Expected: all existing backend tests plus price-list API, menu integration and order snapshot tests PASS.

Commit: `git add backend/src backend/test backend/prisma && git commit -m "feat(price-list): expose pricing APIs and resolve order prices"`

### Task 3: Realtime event and shared frontend price state

**Files:**
- Modify: `backend/src/modules/price-lists/price-list.service.ts`
- Modify: `frontend/src/api/contracts.ts`
- Create: `frontend/src/api/priceList.ts`
- Modify: `frontend/src/contexts/RestaurantContext.tsx`
- Create: `frontend/src/api/priceList.test.ts`
- Modify: `frontend/src/contexts/RestaurantContext.tsx` socket listener section

**Interfaces:**
- Consumes: Task 2 API response shapes and backend event names.
- Produces:
  - `SocketPriceListItemChangedPayload` with `priceListId`, `menuItemId`, `salePrice`, `version`, `updatedAt`.
  - `SocketPriceListBulkChangedPayload` with `priceListId`, `menuItemIds`, `updatedAt`.
  - `fetchGeneralPriceListApi(token)`.
  - `updateGeneralPriceApi(token, priceListId, menuItemId, salePrice, expectedVersion)`.
  - Context methods `fetchGeneralPriceList`, `updateGeneralPrice`, `bulkUpdateGeneralPrices`, `importGeneralPrices`, `exportGeneralPrices`.

- [ ] **Step 1: Write API contract tests**

Mock `fetch` and assert URL, method, auth header, JSON body, successful response parsing, 409 error propagation and export response handling in `frontend/src/api/priceList.test.ts`.

Run: `npm run test:frontend -- --run src/api/priceList.test.ts`

Expected: FAIL because the API module does not exist.

- [ ] **Step 2: Add contracts and API helpers**

Define `PriceListDto`, `PriceListItemDto`, `PriceListRowDto`, `PriceFormulaOperation`, and the two socket payload interfaces in `frontend/src/api/contracts.ts`. Implement fetch helpers using `getApiBaseUrl()` and the existing `{ data }`/`ApiErrorResponse` envelope.

- [ ] **Step 3: Emit events after successful writes**

After the service transaction and audit complete, call `emitToAll('priceList:itemChanged', payload)` for one row and `emitToAll('priceList:bulkChanged', payload)` for bulk operations. Never emit from a failed or rolled-back transaction.

- [ ] **Step 4: Update RestaurantContext and cart on socket events**

Register listeners beside existing menu listeners. Update nested category menu items and every matching `CartItem.menuItem`, recomputing `unitPrice` with modifier deltas and `subtotal`. On socket reconnect, call `fetchMenu()`; do not apply a stale event with a lower `version` than the local item.

- [ ] **Step 5: Run focused frontend tests and commit**

Run: `npm run test:frontend -- --run src/api/priceList.test.ts src/contexts/themePreferenceCoordinator.test.ts`

Expected: PASS, with existing context behavior unchanged.

Commit: `git add backend/src/modules/price-lists frontend/src/api frontend/src/contexts/RestaurantContext.tsx && git commit -m "feat(price-list): sync effective prices in realtime"`

### Task 4: Price-list view model and Admin UI

**Files:**
- Create: `frontend/src/features/admin/priceListViewModel.ts`
- Create: `frontend/src/features/admin/priceListViewModel.test.ts`
- Create: `frontend/src/features/admin/PriceListScreen.tsx`
- Create: `frontend/src/features/admin/PriceFormulaModal.tsx`
- Create: `frontend/src/features/admin/PriceImportModal.tsx`
- Modify: `frontend/src/navigation/RoleTabs.tsx`

**Interfaces:**
- Consumes: Task 3 context methods, `PriceListRowDto`, existing `ScreenHeader`, `Surface`, `Button`, `Field`, `InlineAlert`, `useTheme`, `useToast`.
- Produces: Admin tab `price` rendering the approved desktop/tablet/mobile layout and calling only context/API methods for mutations.

- [ ] **Step 1: Write view-model tests first**

Test pure functions for VND parsing/formatting, search by SKU/name, category filtering, comparison operators against `costPrice`, margin calculation, formula preview and invalid non-positive result rejection.

Example:

```ts
it('filters rows whose sale price is below BOM cost', () => {
  const rows = [
    { menuItemId: 1, sku: 'SP000001', name: 'Burger', categoryId: 1, costPrice: 40000, salePrice: 35000 },
    { menuItemId: 2, sku: 'SP000002', name: 'Tea', categoryId: 2, costPrice: 5000, salePrice: 15000 }
  ];
  expect(filterPriceRows(rows, { query: '', categoryId: null, costOperator: 'lt', costTarget: 'cost' }).map(row => row.menuItemId)).toEqual([1]);
});
```

Run: `npm run test:frontend -- --run src/features/admin/priceListViewModel.test.ts`

Expected: FAIL because view-model functions do not exist.

- [ ] **Step 2: Implement pure view-model functions**

Implement `formatVnd`, `parseSalePriceInput`, `filterPriceRows`, `calculateMargin`, `previewFormula` and `validatePriceEdit`. Keep them independent from React Native so unit tests remain deterministic.

- [ ] **Step 3: Build the screen shell and filters**

Use `ScreenHeader` and existing theme tokens. Add a read-only current price-list selector displaying “Bảng giá chung”, action buttons for Import/Xuất file/Áp dụng công thức, a left filter panel on desktop, and a compact filter trigger on mobile.

- [ ] **Step 4: Build table editing and conflict/error states**

Render SKU, name, BOM cost, sale price, margin and status. Use controlled input buffers keyed by `menuItemId`; on save send `expectedVersion`, show `Đang lưu`, then `Đã lưu`; on 409 refetch and show a conflict toast. Keep keyboard focus and at least 44px controls.

- [ ] **Step 5: Add formula/import/export flows**

`PriceFormulaModal` previews affected rows and submits one bulk operation. `PriceImportModal` follows menu import preview/commit behavior. Export invokes the API and uses the existing web download pattern. Import/Formula dialogs must not mutate local rows until the backend succeeds.

- [ ] **Step 6: Add Admin navigation and run frontend tests**

Add `price` to `TabKey`, import `PriceListScreen`, and place it after `menu` in the ADMIN tab list. Preserve active-tab fallback and all existing `testID` values.

Run: `npm run test:frontend`

Expected: all existing frontend tests plus price-list view-model/UI tests PASS.

Commit: `git add frontend/src/features/admin frontend/src/navigation/RoleTabs.tsx && git commit -m "feat(price-list): add general price management screen"`

### Task 5: End-to-end synchronization and regression coverage

**Files:**
- Create: `e2e/price-list-sync.spec.ts`
- Modify: `e2e/ui-consistency.spec.ts` if shared navigation assertions require the new tab
- Modify: `backend/test/orders/orders.spec.ts` for final snapshot assertions
- Modify: `frontend/src/features/pos/POSScreen.tsx` only if a stale-price indicator requires an explicit UI hook
- Modify: `frontend/src/features/customer/TableOrderScreen.tsx` only if a stale-price indicator requires an explicit UI hook

**Interfaces:**
- Consumes: completed API, socket, context and Admin screen from Tasks 1–4.
- Produces: automated proof that Admin → menu/POS/QR → order uses one effective price path.

- [ ] **Step 1: Write the Playwright sync scenario**

Create a test that logs in as Admin, opens Bảng giá, edits a seeded item, opens/uses the POS path, creates an order and verifies the created receipt/order response reflects the new price. Then change the price again and verify the previously created order still shows its original `unitPrice`.

- [ ] **Step 2: Add no-reload realtime assertion**

Keep a POS or QR page open while Admin changes the price. Assert the visible price changes without a browser reload; if the test environment cannot host two pages reliably, use two Playwright contexts against the same backend and wait for the price-list socket event effect.

- [ ] **Step 3: Add mobile/tablet layout assertions**

At the project’s existing responsive viewports, verify the filter trigger is reachable, the table can scroll horizontally, the first columns remain visible, and the save bar does not cover the final row.

- [ ] **Step 4: Run focused E2E and all checks**

Run: `npm run test:e2e -- price-list-sync.spec.ts`

Expected: PASS. Then run `npm run check:all` and `npm run build`.

- [ ] **Step 5: Commit E2E and regression coverage**

Commit: `git add e2e backend/test/orders frontend/src/features/pos frontend/src/features/customer && git commit -m "test(price-list): verify cross-system price synchronization"`

### Task 6: Final review and delivery

**Files:**
- Modify: `PROJECT_PROGRESS.md` with the completed feature and test counts.
- Modify: `README.md` only if the supported admin flow or migration command needs a user-facing note.
- Modify: `progress.md` and `task_plan.md` locally for planning state.

**Interfaces:**
- Consumes: all completed implementation and test artifacts from Tasks 1–5.
- Produces: release-ready diff with no unverified completion claims.

- [ ] **Step 1: Review the diff and generated migration**

Run: `git diff --check`, `git status --short`, and inspect changed Prisma schema, migration, API routes, context, screen and tests. Confirm only intended files changed.

- [ ] **Step 2: Run the full verification matrix**

Run:

```powershell
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

Record actual output and any failed command in `progress.md`; do not claim completion from an unrun command.

- [ ] **Step 3: Update project history and commit**

Update `PROJECT_PROGRESS.md` with the new price-list milestone and exact verification results. Commit with `docs(price-list): record synchronized general price list milestone`.

- [ ] **Step 4: Final handoff**

Report the implementation commit(s), changed files, test commands/results, migration requirement, and the explicit future extension point for branch/channel scopes.
