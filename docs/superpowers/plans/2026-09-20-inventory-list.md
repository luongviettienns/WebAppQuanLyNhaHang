# Danh sách kho hàng hợp nhất Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng màn hình Admin “Danh sách kho hàng” hợp nhất nguyên vật liệu và món bán, chỉ đọc tại màn hình danh sách, có lọc/tìm kiếm/export, điều hướng tới nghiệp vụ hiện có và phản ánh thay đổi tồn/giá vốn trên toàn hệ thống.

**Architecture:** Tạo một read model `InventoryCatalog` trong service, đọc batch từ `Ingredient`, `MenuItem` và `MenuItemIngredient`, không thêm bảng tồn kho thứ ba. Giá vốn BOM dùng helper chung với bảng giá; mọi cập nhật tồn vẫn đi qua các transaction hiện hữu, sau commit phát event invalidation để frontend refetch catalog. Màn hình mới nằm trong shell Kho hàng và giữ nguyên các flow nguyên liệu/BOM hiện có để không phá chức năng cũ.

**Tech Stack:** Node.js, TypeScript, Express, Prisma/MySQL, Socket.io, React Native/Expo Web, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-20-inventory-list-design.md`

## Global Constraints

- MVP chỉ triển khai `Danh sách kho hàng`; không dựng screen hoặc workflow ghi dữ liệu cho Kiểm kho, Xuất hủy, Nhập hàng, Hóa đơn đầu vào, Trả hàng nhập và Nhà cung cấp.
- Không tạo `InventoryItem`, `InventoryBalance` hoặc ledger mới trong đợt này.
- `Ingredient` map thành `MATERIAL`; `MenuItem` map thành `SELLABLE`; `TOOL` luôn rỗng vì chưa có model nguồn.
- `MenuItem.isActive` trong catalog map từ `MenuItem.isAvailable`; `unit` của món bán dùng giá trị hiển thị cố định `món`; `brand` và `attributes` trả `null`; `position` chỉ có ý nghĩa với món bán.
- Món bán không theo dõi tồn có `stockQuantity = null`, `minStock = null`, `stockStatus = NOT_TRACKED`; món không có BOM có `costPrice = null`.
- API mặc định chỉ trả bản ghi đang hoạt động; `isActive=all` được hỗ trợ để phục vụ bộ lọc quản trị, với nguyên liệu theo `Ingredient.isActive` và món theo `MenuItem.isAvailable`.
- Pagination là pagination toàn cục sau khi hai tập dữ liệu đã được filter, map và sort; sort luôn có tie-breaker `sourceType`, rồi `sourceId` để deterministic. MVP giới hạn `pageSize` tối đa 100.
- Response bổ sung `pagination: { page, pageSize, totalRows, totalPages }`; `summary` tính trên toàn bộ tập đã lọc, không chỉ trang hiện tại.
- Giá vốn món bán dùng helper BOM chung; không dùng `basePrice` hoặc `salePrice` làm giá vốn.
- Màn hình danh sách không gọi endpoint transaction mới và không sửa tồn trực tiếp; nút Thêm mới/Import chỉ điều hướng tới flow hiện hữu.
- Chỉ `ADMIN` được gọi catalog/export theo chính sách inventory hiện tại.
- Socket chỉ phát sau transaction thành công; frontend giữ nguyên filter/search khi refetch.
- Không commit hoặc stage `.review_tmp/` và các file tạm không liên quan.

## Review Focus

1. Hợp nhất hai bảng phải phân trang đúng toàn cục, không làm mất dòng khi một nguồn có nhiều bản ghi hơn nguồn còn lại — test service với hai nguồn, sort xen kẽ và page boundary.
2. Món bán thiếu BOM/không theo dõi tồn phải trả `null`/`NOT_TRACKED`, không biến thành giá vốn hoặc tồn giả — test mapping và summary.
3. Cập nhật giá vốn ingredient hoặc BOM phải làm catalog thay đổi nhưng không thay đổi `OrderItem` lịch sử — test shared cost helper và order snapshot regression.
4. Event phải chỉ phát sau commit và đúng nguồn: payment cho ingredient, void/adjust cho menu item, recipe update cho menu item — test event payload hoặc service seam.
5. Admin/CASHIER/unauthenticated, filter `isActive`, export và điều hướng read-only phải có hành vi rõ ràng — test API/auth và frontend API helpers.

---

### Task 1: Chuẩn hóa helper giá vốn BOM và contract catalog

**Files:**
- Modify: `backend/src/modules/inventory/inventory.math.ts`
- Modify: `backend/test/inventory/inventory.math.spec.ts`
- Modify: `backend/src/modules/price-lists/price-list.service.ts`
- Modify: `backend/test/price-lists/price-list.service.spec.ts`
- Create: `backend/src/modules/inventory/inventory-catalog.types.ts`
- Modify: `frontend/src/api/contracts.ts`

**Interfaces:**
- Produces `calculateRecipeCostOrNull(bom: Array<{ quantityRequired: number; costPerUnit: number }>): number | null`.
- Produces `InventorySourceType`, `InventoryManagementGroup`, `InventoryStockStatus`, `InventoryCatalogRowDto`, `InventoryCatalogSummaryDto`, `InventoryCatalogPaginationDto`, and `InventoryCatalogDataDto` shared by backend/frontend contracts.
- `InventoryCatalogDataDto` shape:

```ts
interface InventoryCatalogDataDto {
  rows: InventoryCatalogRowDto[];
  summary: InventoryCatalogSummaryDto;
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
}
```

- Consumes existing `calculateRecipeCost`, `MenuItem`, `Ingredient`, and price-list BOM projections.

- [x] **Step 1: Write failing math/contract tests**

Add tests asserting a non-empty BOM rounds to the existing integer VND total, an empty BOM returns `null` from the new helper, and the existing `calculateRecipeCost([]) === 0` behavior remains unchanged for legacy callers until migrated. Add a price-list regression asserting a menu with no BOM exposes `costPrice: null`.

Run: `npm --prefix backend test -- --run backend/test/inventory/inventory.math.spec.ts backend/test/price-lists/price-list.service.spec.ts`

Expected: FAIL because `calculateRecipeCostOrNull` and the shared price-list call do not exist yet.

- [x] **Step 2: Implement the helper and DTO types**

Implement `calculateRecipeCostOrNull` as `bom.length === 0 ? null : calculateRecipeCost(bom)`. Keep `calculateRecipeCost` unchanged for existing order/report behavior. Update `PriceListService` read/export paths to use the new helper so price-list and catalog agree on empty-BOM semantics. Add the TypeScript DTOs, including nullable `costPrice`, `stockQuantity`, and `minStock`.

- [x] **Step 3: Run focused tests and commit**

Run the command from Step 1 and `npm --prefix backend run typecheck`.

Expected: PASS with no Prisma or API changes.

Commit: `git add backend/src/modules/inventory/inventory.math.ts backend/src/modules/inventory/inventory-catalog.types.ts backend/src/modules/price-lists/price-list.service.ts backend/test/inventory/inventory.math.spec.ts backend/test/price-lists/price-list.service.spec.ts frontend/src/api/contracts.ts && git commit -m "refactor(inventory): share catalog cost contract"`

### Task 2: Implement the read-model catalog service

**Files:**
- Create: `backend/src/modules/inventory/inventory-catalog.service.ts`
- Create: `backend/test/inventory/inventory-catalog.service.spec.ts`
- Modify: `backend/src/modules/inventory/inventory.schemas.ts`

**Interfaces:**
- Produces `InventoryCatalogFilter`:

```ts
type InventoryCatalogFilter = {
  search?: string;
  managementGroup?: 'MATERIAL' | 'SELLABLE' | 'TOOL';
  categoryId?: number;
  menuType?: 'FOOD' | 'DRINK' | 'SERVICE' | 'OTHER';
  stockStatus?: 'ALL' | 'NORMAL' | 'LOW' | 'NEGATIVE' | 'NOT_TRACKED';
  position?: string;
  isActive?: 'true' | 'false' | 'all';
  page: number;
  pageSize: number;
  sortBy: 'sku' | 'name' | 'costPrice' | 'stockQuantity' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
};
```

- Produces `InventoryCatalogService.getCatalog(filter, db = prisma): Promise<InventoryCatalogDataDto>`.
- Produces `InventoryCatalogService.getCatalogSnapshot(filter, db = prisma): Promise<InventoryCatalogRowDto[]>` for export.

- [x] **Step 1: Write failing mapping and pagination tests**

Seed or create one ingredient, one tracked menu item with a BOM, one untracked menu item, and one menu item without a BOM. Assert:

```ts
expect(material.managementGroup).toBe('MATERIAL');
expect(tracked.costPrice).toBe(ingredient.costPerUnit * bom.quantityRequired);
expect(untracked.stockQuantity).toBeNull();
expect(untracked.stockStatus).toBe('NOT_TRACKED');
expect(noBom.costPrice).toBeNull();
expect(data.pagination.totalRows).toBe(4);
```

Add a page-boundary test with mixed SKUs and assert stable order across page 1/page 2, plus summary counts over all four rows. Add filter tests for `managementGroup`, `categoryId`, `menuType`, `stockStatus`, `position`, search, and `isActive=all`.

Run: `npm --prefix backend test -- --run test/inventory/inventory-catalog.service.spec.ts`

Expected: FAIL because the service and schemas do not exist.

- [x] **Step 2: Implement filter parsing and source queries**

Add Zod query validation with defaults `page=1`, `pageSize=50`, `sortBy=sku`, `sortOrder=asc`, clamp/reject `pageSize > 100`, and reject negative page values. Query ingredients and menu items separately with Prisma. Apply source-native filters in the database where possible; include menu category and `menuItemIngredients.ingredient.costPerUnit` in one batch query per source, never query a BOM inside a row loop.

- [x] **Step 3: Implement row mapping and status rules**

Map fields exactly as follows:

```ts
Ingredient -> sourceType INGREDIENT, managementGroup MATERIAL,
  unit=ingredient.unit, costPrice=costPerUnit, stockQuantity=currentStock,
  minStock=minThreshold, trackStock=true, isActive=ingredient.isActive.

MenuItem -> sourceType MENU_ITEM, managementGroup SELLABLE,
  unit='món', costPrice=calculateRecipeCostOrNull(BOM),
  stockQuantity=trackStock ? stockQuantity : null,
  minStock=trackStock ? 0 : null, trackStock=trackStock,
  isActive=isAvailable, position=position, brand=null, attributes=null.
```

Use status precedence `NEGATIVE` then `LOW` then `NORMAL`; untracked always wins as `NOT_TRACKED`. Filter computed status after mapping, merge both source arrays, sort with the requested field plus `sourceType`/`sourceId` tie-breakers, compute full summary, and slice the requested page.

- [x] **Step 4: Run focused tests and commit**

Run the service test and `npm --prefix backend run typecheck`.

Expected: PASS with deterministic page metadata and no N+1 query in the service implementation.

Commit: `git add backend/src/modules/inventory/inventory-catalog.service.ts backend/src/modules/inventory/inventory.schemas.ts backend/test/inventory/inventory-catalog.service.spec.ts && git commit -m "feat(inventory): add unified catalog read model"`

### Task 3: Add catalog API, export and authorization

**Files:**
- Modify: `backend/src/modules/inventory/inventory.routes.ts`
- Modify: `backend/src/modules/inventory/inventory.controller.ts`
- Create: `backend/src/modules/inventory/inventory-catalog.export.ts`
- Create: `backend/test/inventory/inventory-catalog.api.spec.ts`
- Modify: `backend/src/config/swagger.ts`

**Interfaces:**
- `GET /api/inventory/catalog` returns `{ data: InventoryCatalogDataDto }`.
- `GET /api/inventory/catalog/export?format=csv|xlsx&...filters` returns a snapshot file using the same filters but no pagination.
- Both endpoints use existing `authenticate` + `authorize('ADMIN')` middleware.

- [x] **Step 1: Write failing API/auth/filter tests**

Cover unauthenticated and CASHIER `401/403`, ADMIN default catalog, query validation, page metadata, `isActive=all`, empty result, and export. The export test must assert headers and that reading/exporting does not create an `InventoryTransaction`.

Run: `npm --prefix backend test -- --run test/inventory/inventory-catalog.api.spec.ts`

Expected: FAIL because routes/controller/exporter are not registered.

- [x] **Step 2: Implement controller and route registration**

Parse the query with the catalog schema, call `getCatalog`, and return `{ data }`. Add a separate export handler that strips pagination, serializes the snapshot, and sets `Content-Disposition` with a timestamped filename. Do not reuse the existing ingredient-only `/excel/export` route for the merged export.

- [x] **Step 3: Implement CSV/XLSX serialization and Swagger**

Serialize columns `sourceType`, `managementGroup`, `sku`, `name`, `categoryName`, `menuType`, `unit`, `costPrice`, `stockQuantity`, `minStock`, `stockStatus`, `isActive`, `position`, and `updatedAt`. Escape CSV cells and use the existing `xlsx` dependency for XLSX. Document query parameters, `data.rows`, `data.summary`, pagination and the ADMIN requirement in Swagger.

- [x] **Step 4: Run API tests and commit**

Run the focused API test and `npm --prefix backend run typecheck`.

Expected: PASS; existing ingredient routes and Excel routes remain unchanged.

Commit: `git add backend/src/modules/inventory/inventory.routes.ts backend/src/modules/inventory/inventory.controller.ts backend/src/modules/inventory/inventory-catalog.export.ts backend/src/config/swagger.ts backend/test/inventory/inventory-catalog.api.spec.ts && git commit -m "feat(inventory): expose unified catalog API"`

### Task 4: Add post-commit inventory events and preserve existing workflows

**Files:**
- Create: `backend/src/modules/inventory/inventory.events.ts`
- Modify: `backend/src/modules/inventory/inventory.service.ts`
- Modify: `backend/src/modules/menu/menu.service.ts`
- Modify: `backend/src/modules/orders/orders.service.ts`
- Modify: `backend/test/inventory/inventory.service.spec.ts`
- Modify: `backend/test/menu/menu-bulk.spec.ts`
- Modify: `backend/test/orders/menu-stock.spec.ts`
- Modify: `backend/test/orders/order-lifecycle.spec.ts`

**Interfaces:**
- Produces `InventoryChangedPayload`:

```ts
type InventoryChangedPayload = {
  sourceType: 'INGREDIENT' | 'MENU_ITEM';
  sourceIds: number[];
  reason: 'STOCK_IN' | 'ORDER_PAID' | 'ORDER_VOIDED' | 'MANUAL_ADJUST'
    | 'RECIPE_UPDATED' | 'INGREDIENT_UPDATED' | 'MENU_ITEM_UPDATED';
  updatedAt: string;
};
```

- Produces `emitInventoryChanged(payload): void`, which calls `emitToAll('inventory:changed', payload)`.
- Changes `InventoryService.deductInventoryForOrder` to return `{ totalOrderCogs: number; ingredientIds: number[] }` so `payOrder` can emit after commit without another query.

- [x] **Step 1: Write failing event tests**

Add tests that spy on the socket emitter seam and assert stock-in emits ingredient IDs only after success; a failed stock-in emits nothing; recipe update emits the menu item ID; menu stock adjustment emits menu item IDs; pay emits ingredient IDs with `ORDER_PAID`; void/auto-cancel emits restored menu IDs with `ORDER_VOIDED`.

Run: `npm --prefix backend test -- --run test/inventory/inventory.service.spec.ts test/menu/menu-bulk.spec.ts test/orders/menu-stock.spec.ts test/orders/order-lifecycle.spec.ts`

Expected: FAIL because the shared event helper and source ID return values are not wired.

- [x] **Step 2: Add the event helper and stock-in/recipe events**

Emit only after `stockIn`, Excel commit, ingredient update, and recipe update transactions resolve. For recipe updates, emit `MENU_ITEM`/`RECIPE_UPDATED`; changing the BOM affects catalog cost but not existing order snapshots.

- [x] **Step 3: Wire menu and order events**

Emit `MENU_ITEM`/`MANUAL_ADJUST` after successful menu bulk stock adjustment. In `payOrder`, capture the ingredient IDs from the transaction result and emit `INGREDIENT`/`ORDER_PAID` after commit. Reuse `stockChanges` from `voidOrder` and `autoCancelExpiredOrders` to emit `MENU_ITEM`/`ORDER_VOIDED` after commit. Preserve existing `menu:stockChanged` and order events for POS/KDS compatibility.

- [x] **Step 4: Run regression tests and commit**

Run the focused command from Step 1, then `npm --prefix backend test -- --run test/orders`.

Expected: existing stock reservation/restore and ingredient deduction behavior remains unchanged; only additional invalidation events are emitted.

Commit: `git add backend/src/modules/inventory backend/src/modules/menu/menu.service.ts backend/src/modules/orders/orders.service.ts backend/test/inventory backend/test/menu/menu-bulk.spec.ts backend/test/orders && git commit -m "feat(inventory): publish catalog change events"`

### Task 5: Add frontend catalog API, contracts and realtime invalidation

**Files:**
- Create: `frontend/src/api/inventoryCatalog.ts`
- Create: `frontend/src/api/inventoryCatalog.test.ts`
- Modify: `frontend/src/api/contracts.ts`
- Modify: `frontend/src/contexts/RestaurantContext.tsx`

**Interfaces:**
- `fetchInventoryCatalogApi(token, filter): Promise<InventoryCatalogDataDto>`.
- `downloadInventoryCatalogExportApi(token, filter, format): Promise<Blob>`.
- Add `SocketInventoryChangedPayload` and catalog DTOs to `contracts.ts`.

- [ ] **Step 1: Write failing API helper tests**

Mock `fetch` like `frontend/src/api/priceList.test.ts` and assert query serialization for search, group, category, menu type, status, `isActive`, page, page size and sorting. Assert export URL/headers and error handling.

Run: `npm --prefix frontend test -- --run src/api/inventoryCatalog.test.ts`

Expected: FAIL because the API module and DTOs do not exist.

- [ ] **Step 2: Implement typed API helpers**

Use the existing `getApiBaseUrl`, auth header and API error envelope. Omit default/empty query parameters, preserve `page` and `pageSize`, and expose a separate blob download helper for CSV/XLSX.

- [ ] **Step 3: Add shared invalidation state**

Register `socket.on('inventory:changed')` in `RestaurantContext`. Expose a monotonically increasing `inventoryRevision` or callback that `InventoryCatalogScreen` can subscribe to; do not refetch the catalog from the global context itself because its filters and pagination are screen-local. Keep existing menu stock and price-list listeners unchanged.

- [ ] **Step 4: Run frontend tests and typecheck**

Run `npm --prefix frontend test -- --run src/api/inventoryCatalog.test.ts` and `npm --prefix frontend run typecheck`.

Expected: PASS with no changes to POS/QR pricing behavior.

Commit: `git add frontend/src/api/inventoryCatalog.ts frontend/src/api/inventoryCatalog.test.ts frontend/src/api/contracts.ts frontend/src/contexts/RestaurantContext.tsx && git commit -m "feat(inventory): add catalog client contract"`

### Task 6: Build Native catalog screen and navigation shell

**Files:**
- Create: `frontend/src/features/admin/InventoryCatalogScreen.tsx`
- Create: `frontend/src/features/admin/inventoryCatalogViewModel.ts`
- Create: `frontend/src/features/admin/inventoryCatalogViewModel.test.ts`
- Modify: `frontend/src/features/admin/InventoryScreen.tsx`
- Modify: `frontend/src/navigation/RoleTabs.tsx`
- Modify: `frontend/src/ui/index.ts`

**Interfaces:**
- `InventoryCatalogScreen` consumes `fetchInventoryCatalogApi`, `downloadInventoryCatalogExportApi`, `inventoryRevision`, and existing `navigation`/callback props.
- `inventoryCatalogViewModel` produces pure functions for status labels, filter serialization, row action target, summary formatting and stable row keys.
- `InventoryScreen` remains the RoleTabs entry point and preserves the existing ingredient/BOM operations behind the “Quản lý nguyên liệu/BOM” section.

- [ ] **Step 1: Write failing view-model tests**

Test status precedence, labels for `LOW`, `NEGATIVE`, `NOT_TRACKED`, missing cost display, row keys `${sourceType}:${sourceId}`, row action mapping, and summary formatting without adding business logic to JSX.

Run: `npm --prefix frontend test -- --run src/features/admin/inventoryCatalogViewModel.test.ts`

Expected: FAIL because the view-model does not exist.

- [ ] **Step 2: Implement the catalog screen shell**

Render the title “Kho hàng”, search field, management-group filters, category/menu type/status filters, summary cards, data table, loading/empty/error states, and export action. Keep columns aligned to the reference image: SKU, name, management group/category, cost, stock, min stock, status, and row action. Use existing theme tokens, `Button`, `Surface`, `StatusBadge`, `ScreenHeader`, icons and 44px touch targets.

- [ ] **Step 3: Implement read-only row actions and reserved sections**

For `INGREDIENT`, navigate/open the existing ingredient detail or stock-in path; for `MENU_ITEM`, navigate/open existing menu management and recipe/BOM path. Do not update catalog rows inline. Show reserved menu labels as disabled/non-navigable “Chưa triển khai” entries only; do not create routes or screens for them. “Thêm mới” and “Import” must open the existing ingredient/menu flows rather than writing through the catalog.

- [ ] **Step 4: Preserve existing InventoryScreen operations**

Refactor the current ingredient/BOM UI into a section component or keep it as the legacy section under the new shell. Verify ingredient create/edit, stock-in, Excel preview/commit, and recipe update retain their current API calls and behavior. The catalog is the default section, but the existing operations remain reachable from explicit navigation.

- [ ] **Step 5: Add revision-driven refetch and export**

When `inventoryRevision` changes, refetch using the current filters/page and retain the current scroll/filter state. Export uses the current filters and downloads the server snapshot; it must not create a transaction. Reset page to 1 when search or a filter changes, and show an empty-page fallback if the current page becomes invalid after an update.

- [ ] **Step 6: Run frontend tests and typecheck**

Run the view-model/API tests, `npm --prefix frontend test`, and `npm --prefix frontend run typecheck`.

Expected: PASS; RoleTabs still renders the Admin Kho hàng tab and the existing menu/price/POS screens are unaffected.

Commit: `git add frontend/src/features/admin frontend/src/navigation/RoleTabs.tsx frontend/src/ui/index.ts && git commit -m "feat(inventory): add unified catalog screen"`

### Task 7: End-to-end verification, documentation and delivery review

**Files:**
- Modify: `docs/superpowers/specs/2026-09-20-inventory-list-design.md` only if implementation clarifies an already-approved contract.
- Modify: `docs/superpowers/plans/2026-09-20-inventory-list.md` to mark completed tasks and record test results.
- Modify: `progress.md` with session/test results.

- [ ] **Step 1: Run focused backend and frontend suites**

Run:

```powershell
npm --prefix backend test -- --run backend/test/inventory backend/test/menu/menu-bulk.spec.ts backend/test/orders/menu-stock.spec.ts backend/test/orders/order-lifecycle.spec.ts backend/test/price-lists
npm --prefix backend run typecheck
npm --prefix frontend test
npm --prefix frontend run typecheck
```

Record exact pass/fail output. Existing unrelated cross-suite database failures must be reported separately rather than hidden.

- [ ] **Step 2: Run manual/E2E acceptance flow**

Verify as ADMIN: open Kho hàng → Danh sách kho hàng; see ingredients and sellable items; search SKU; filter Món bán; inspect BOM cost; see untracked and missing-BOM states; export; navigate to existing ingredient/menu flows. Then stock-in an ingredient, pay an order with a BOM, adjust/void a tracked menu item, update a recipe, and verify the catalog refetches while preserving filters. Verify CASHIER cannot access catalog.

- [ ] **Step 3: Review diff and scope**

Run `git diff --check`, inspect `git status --short`, confirm no new warehouse/void/purchase/supplier screens or tables were introduced, and confirm `.review_tmp/` remains untracked and untouched. Run a reserved-term scan over the plan and modified docs.

- [ ] **Step 4: Commit documentation state**

Commit only completed plan/progress/spec clarifications with:

`git add docs/superpowers/plans/2026-09-20-inventory-list.md progress.md docs/superpowers/specs/2026-09-20-inventory-list-design.md && git commit -m "docs(inventory): record catalog implementation verification"`

## Execution Order

1. Task 1 — shared cost and types.
2. Task 2 — catalog service and deterministic pagination.
3. Task 3 — API/export/auth.
4. Task 4 — post-commit events and regression preservation.
5. Task 5 — frontend contract/API/revision signal.
6. Task 6 — Native UI and navigation.
7. Task 7 — verification and delivery review.

Each task ends with a focused test cycle and commit. Do not start a later task if the preceding focused tests or typecheck fail; record the error in `progress.md` and change the approach before retrying.
