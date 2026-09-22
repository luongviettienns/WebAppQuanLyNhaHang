# Phiếu xuất hủy — Implementation Plan

> For agentic workers: use superpowers:executing-plans task-by-task. Mark a step complete only after its focused verification passes.

**Goal:** Hoàn thiện phiếu xuất hủy với dòng hàng, chặn hoàn thành khi số hủy vượt tồn, sinh ledger KITCHEN_WASTE, audit/realtime và hai màn hình React Native theo luồng danh sách → soạn phiếu.

**Architecture:** InventoryWaste sở hữu InventoryWasteLine snapshot. Phiếu nháp không thay đổi tồn. Hoàn thành phiếu thực hiện trong Prisma transaction: khóa nguyên liệu theo ID tăng dần, kiểm tồn mới nhất, giảm tồn và ghi ledger. API typed phục vụ Native view-model thuần và UI dùng semantic tokens hiện có.

**Tech stack:** Express, Prisma/MySQL, Zod, Vitest/Supertest; React Native/Expo, TypeScript, Vitest.

**Specification:** docs/superpowers/specs/2026-09-22-inventory-waste-design.md

## Constraints and review focus

- Admin-only APIs; draft có thể không có dòng hoặc ghi chú.
- Complete yêu cầu có dòng hợp lệ và ghi chú sau khi trim; số lượng hữu hạn, lớn hơn 0.
- Nếu bất kỳ dòng nào quantity > currentStock tại thời điểm complete, toàn bộ transaction trả 409 và rollback.
- Giá trị phiếu/dòng luôn dương. KITCHEN_WASTE ledger quantity và costAmount luôn âm.
- Không được cập nhật, hủy hay hoàn thành lại phiếu COMPLETED; cancel draft không tạo ledger đảo.
- Không thêm chi nhánh giả. Native UI dùng theme hiện có, không sao chép branding KiotViet.
- Review kỹ migration/FK cleanup, thứ tự khóa, dữ liệu client không được override snapshot/tổng, và event/audit chỉ sau commit.

## Task 1 — Pure rules, validation, and backend contracts

**Files**

- Create backend/src/modules/inventory/inventory-waste.math.ts
- Create backend/src/modules/inventory/inventory-waste.schemas.ts
- Create backend/src/modules/inventory/inventory-waste.types.ts
- Create backend/src/modules/inventory/__tests__/inventory-waste.math.spec.ts
- Create backend/src/modules/inventory/__tests__/inventory-waste.schemas.spec.ts

- [ ] Write failing math tests for decimal quantity, empty/multi-line summary, and rounding: quantity 1.5 × cost 12000 equals positive value 18000.
- [ ] Run backend focused math test and observe RED because the module does not exist.
- [ ] Implement deterministic calculateInventoryWasteLine and summarizeInventoryWaste helpers using Math.round.
- [ ] Write failing schema tests: empty draft accepted; duplicate ingredient, nonpositive/nonfinite quantity, invalid pagination/import row rejected; status accepts DRAFT, COMPLETED, CANCELLED.
- [ ] Run schema RED; add Zod create/update/list/import-preview schemas and typed DTOs. Do not require note in draft schemas.
- [ ] Re-run both focused suites GREEN.
- [ ] Commit: feat(inventory): add waste rules and validation.

## Task 2 — Prisma persistence and test database cleanup

**Files**

- Modify backend/prisma/schema.prisma
- Create backend/prisma/migrations/20260922120000_add_inventory_wastes/migration.sql
- Modify backend/test/helpers/database.ts
- Create backend/src/modules/inventory/__tests__/inventory-waste.persistence.spec.ts

- [ ] Write failing persistence test that creates an ingredient then a waste with a snapshot line, loads it through prismaTest.inventoryWaste with lines, and checks InventoryTransaction.inventoryWasteId exists.
- [ ] Run the persistence test RED; Prisma client must report that inventoryWaste is unavailable.
- [ ] Add InventoryWasteStatus enum; InventoryWaste with unique wasteCode, lifecycle users/timestamps, totalValue and indexes [status,wastedAt]/[wastedAt]; InventoryWasteLine snapshot fields and unique [inventoryWasteId,ingredientId]; nullable InventoryTransaction.inventoryWasteId relation/index; inverse Ingredient/User relations.
- [ ] Add reviewed migration SQL, generate Prisma client, and apply SQL directly to configured dev/test DBs without printing database URLs (Prisma shadow DB is unavailable).
- [ ] Delete waste lines before wastes before inventory transactions in database test cleanup.
- [ ] Re-run persistence test GREEN.
- [ ] Commit: feat(inventory): add waste voucher persistence.

## Task 3 — Atomic service, imports/exports, APIs, audit and realtime

**Files**

- Create backend/src/modules/inventory/inventory-waste.service.ts
- Create backend/src/modules/inventory/inventory-waste.controller.ts
- Create backend/src/modules/inventory/inventory-waste.export.ts
- Modify backend/src/modules/inventory/inventory.routes.ts
- Modify backend/src/modules/inventory/inventory.events.ts
- Create backend/src/modules/inventory/__tests__/inventory-waste.service.spec.ts
- Create backend/src/modules/inventory/__tests__/inventory-waste.api.spec.ts

- [ ] Write failing complete-draft service test: stock 10/cost 12000; 2-unit noted draft becomes COMPLETED with stock 8, totalValue 24000, KITCHEN_WASTE ledger quantity -2/costAmount -24000 and its waste id.
- [ ] Run service RED because no service exists.
- [ ] Implement code generator XH000001 with uniqueness retry; create/get/list/update/cancel. Resolve active ingredients server-side and snapshot SKU/name/unit/stock/cost on create or update.
- [ ] Implement complete in one transaction: require DRAFT, lines and trimmed note; lock ingredient rows ascending with FOR UPDATE; re-read stock/cost; return 409 before mutation for an insufficient line; update effective snapshots; decrement stock; create negative KITCHEN_WASTE ledger rows; update positive total and lifecycle fields.
- [ ] Extend service tests RED for blank note/no line, insufficient stock with no partial decrement, completed immutability, duplicate active ingredient, draft cancel without ledger, and fresh stock/cost snapshot on complete.
- [ ] Fill the gaps until service suite GREEN; post-commit write audit actions INVENTORY_WASTE_CREATED/UPDATED/COMPLETED/CANCELLED and emit inventory:changed with KITCHEN_WASTE only after commit.
- [ ] Add export CSV-compatible columns Mã xuất hủy, Thời gian, Người tạo, Tổng giá trị hủy, Ghi chú, Trạng thái. Add import preview with row errors for inactive/missing SKU, unit mismatch, duplicate SKU, invalid quantity; stock is advisory until complete.
- [ ] Add admin routes before dynamic id route: GET/POST wastes, GET wastes/export, POST wastes/import/preview, GET/PATCH wastes/:id, POST wastes/:id/complete, POST wastes/:id/cancel.
- [ ] Write API tests RED for access, list filters/search/paging, post/patch contract, complete 409, preview/export contract. Wire controller and event union, then make service/API focused suites GREEN.
- [ ] Commit: feat(inventory): add waste voucher APIs.

## Task 4 — Typed Native data layer and pure view-model

**Files**

- Modify frontend/src/api/contracts.ts
- Create frontend/src/api/inventoryWastes.ts
- Create frontend/src/features/admin/inventoryWasteViewModel.ts
- Create frontend/src/features/admin/__tests__/inventoryWasteViewModel.test.ts

- [ ] Write failing view-model tests: display values/totals positive, duplicate blocked, blank trimmed note disables complete, quantity exceeding loaded stock produces local error.
- [ ] Run frontend focused test RED because module is absent.
- [ ] Add typed waste contracts, list/detail/import DTOs and KITCHEN_WASTE socket reason. Add immutable calculateWasteRow, summarizeWasteRows, upsertWasteRow and validateWasteForCompletion helpers.
- [ ] Add typed API calls for list/detail/create/update/complete/cancel/export/import-preview; components must not call HTTP endpoints directly.
- [ ] Re-run focused view-model test GREEN.
- [ ] Commit: feat(inventory): add native waste data layer.

## Task 5 — Native list, composer, and navigation

**Files**

- Create frontend/src/features/admin/InventoryWasteListScreen.tsx
- Create frontend/src/features/admin/InventoryWasteComposerScreen.tsx
- Modify frontend/src/features/admin/InventoryScreen.tsx
- Modify frontend/src/features/admin/InventoryCatalogScreen.tsx
- Create frontend/src/features/admin/__tests__/InventoryWasteComposerScreen.test.tsx if current renderer supports it

- [ ] Write a failing UI or component-contract test that completion stays disabled without a valid row/note and insufficient-stock error stays visible; do not add a new renderer dependency solely for this feature.
- [ ] Run it RED because screen is absent.
- [ ] Build list using stocktake/receipt conventions: title Phiếu xuất hủy, code search, date preset/custom range/status filters, responsive table/cards, + Xuất hủy, export, loading/error/empty states, inventoryRevision refetch.
- [ ] Build composer: ingredient search/add, editable quantity, current stock/cost/value columns, code/total/note/recent vouchers sidebar, draft save/complete. Web empty state includes spreadsheet import drop zone and consumes preview before adding valid rows. Narrow screen stacks sidebar. Surface server 409 per relevant row.
- [ ] Add wastes and waste-composer sections to InventoryScreen; activate Xuất hủy in InventoryCatalogScreen without changing catalog/receipt/check behavior.
- [ ] Run focused UI/view-model tests then frontend tsc. Record unrelated pre-existing type failures instead of suppressing them.
- [ ] Commit: feat(inventory): add native waste screens.

## Task 6 — Verification and handoff

- [ ] Run all focused backend waste suites: math, schema, persistence, service and API.
- [ ] Run all focused frontend waste suites, frontend lint, and frontend build.
- [ ] Inspect git status/diff: no generated artifacts or unrelated files staged.
- [ ] Run full suites if stable; report known baseline failures separately from this feature.
- [ ] Commit only any final scoped fixes and report code, tests, baseline caveats, and commits. Do not push unless the user makes a new push request.
