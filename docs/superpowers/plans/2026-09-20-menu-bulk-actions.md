# Phase 6 – Menu bulk actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Thêm bulk action ADMIN-only cho tối đa 200 menu item với validation trước transaction, soft-delete an toàn và toolbar quản trị desktop/mobile.

**Architecture:** Backend nhận một discriminated action contract tại `PATCH /api/menu/bulk`, preflight resolve toàn bộ IDs/payload rồi update trong một Prisma transaction. Frontend giữ action model ở API helper/view-model, gọi context để refetch và chỉ clear selection sau success; UI xác nhận các thao tác hàng loạt trước khi gửi.

**Tech Stack:** Express, Zod, Prisma/MySQL, Vitest, React Native/Expo, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-20-menu-bulk-actions-design.md`

## Global Constraints

- Chỉ role `ADMIN` được gọi bulk API.
- Một request tối đa 200 item và không được chứa ID trùng lặp.
- Nếu bất kỳ ID hoặc payload nào không hợp lệ, toàn bộ request bị từ chối và database không thay đổi.
- `delete` là soft delete bằng `isAvailable=false`; không hard-delete menu item.
- `adjustStock` nhận delta nguyên, tồn kho sau cập nhật không âm và không tự bật `trackStock`.
- Không thay đổi nghiệp vụ trừ tồn khi tạo order của Phase 7.
- Không sửa `task_plan.md`, `progress.md`, `findings.md` hoặc mã Phase 7.

## Review Focus

- Payload action bị gửi sai shape hoặc action không thuộc enum phải trả `400` trước mọi write; test ở Task 1.
- Danh sách có ID tồn tại xen ID thiếu phải rollback toàn bộ, không update item hợp lệ; test ở Task 2.
- `adjustStock` trên item có tồn khác nhau phải tính từng kết quả và reject nếu bất kỳ kết quả nào âm; test ở Task 2.
- Gọi lặp request hoặc chứa ID trùng không được tạo side effect ngoài dự kiến; test duplicate ở Task 1/2.
- UI phải giữ selection sau lỗi và chỉ clear sau success; test view-model ở Task 4.

---

### Task 1: Bulk API contract, RBAC và failing integration tests

**Files:**
- Modify: `backend/src/modules/menu/menu.schemas.ts`
- Modify: `backend/src/modules/menu/menu.controller.ts`
- Modify: `backend/src/modules/menu/menu.routes.ts`
- Create/modify: `backend/test/menu/menu-bulk.spec.ts`

**Interfaces:**
- Consumes: existing `MenuItem` enums, `authenticate`, `authorize('ADMIN')`, and menu route error envelope.
- Produces: `menuBulkActionSchema`, `MenuBulkActionInput`, `MenuController.bulkUpdateMenuItems`, and `PATCH /api/menu/bulk` before `/:id`.

- [ ] **Step 1: Write the failing integration tests**

  Add tests with the existing JWT/database setup for:

  - ADMIN request to `/api/menu/bulk` is currently `404`.
  - unauthenticated, CASHIER, and KITCHEN requests receive `401/403`.
  - invalid action/payload, empty IDs, duplicate IDs, and 201 IDs are validation failures.
  - valid action payloads are accepted by the route contract once the service exists.

- [ ] **Step 2: Run the tests and verify RED**

  Run:

  ```powershell
  npm.cmd run test --workspace=backend -- test/menu/menu-bulk.spec.ts
  ```

  Expected: authorization tests pass through existing middleware; ADMIN endpoint tests fail with `404` because the route/controller/schema are not present.

- [ ] **Step 3: Add the discriminated Zod contract**

  Implement a shared IDs schema with `.min(1).max(200)` and a uniqueness refinement. Define the union exactly as:

  ```ts
  type MenuBulkActionInput =
    | { ids: number[]; action: 'setAvailability'; payload: { isAvailable: boolean } }
    | { ids: number[]; action: 'setCategory'; payload: { categoryId: number } }
    | { ids: number[]; action: 'setMenuType'; payload: { menuType: MenuType } }
    | { ids: number[]; action: 'setItemType'; payload: { itemType: MenuItemType } }
    | { ids: number[]; action: 'setTrackStock'; payload: { trackStock: boolean } }
    | { ids: number[]; action: 'adjustStock'; payload: { delta: number } }
    | { ids: number[]; action: 'delete'; payload?: Record<string, never> };
  ```

  `delta` must be an integer; `categoryId` and all IDs must be positive integers. Export the inferred type.

- [ ] **Step 4: Wire the ADMIN controller and route**

  Parse `menuBulkActionSchema` in `MenuController.bulkUpdateMenuItems`, call `MenuService.bulkUpdateMenuItems(validated, req.user?.id, req.user?.name)`, and return `{ data }` with HTTP 200. Register `PATCH /bulk` before `PATCH /:id` and protect it with `authenticate` and `authorize('ADMIN')`.

- [ ] **Step 5: Run contract tests and verify GREEN**

  Run the same focused command. Expected: authorization, schema, and route contract tests pass; service can be mocked or the valid ADMIN test may temporarily expect the service boundary error until Task 2 adds the implementation.

- [ ] **Step 6: Commit**

  ```powershell
  git add backend/src/modules/menu/menu.schemas.ts backend/src/modules/menu/menu.controller.ts backend/src/modules/menu/menu.routes.ts backend/test/menu/menu-bulk.spec.ts
  git commit -m "test(menu): define bulk action api contract"
  ```

### Task 2: Atomic bulk service and backend verification

**Files:**
- Modify: `backend/src/modules/menu/menu.service.ts`
- Modify: `backend/test/menu/menu-bulk.spec.ts`

**Interfaces:**
- Consumes: `MenuBulkActionInput` and `MenuService.bulkUpdateMenuItems(input, actorId?, actorName?)` route boundary from Task 1.
- Produces: `MenuBulkActionResult { updatedCount: number; action: MenuBulkActionInput['action'] }`, one audit event, and `menu:bulkChanged` socket payload.

- [ ] **Step 1: Extend tests with failing service behavior**

  Add integration tests for ADMIN:

  - set availability for two items and assert both changed plus `updatedCount=2`.
  - set category/menuType/itemType/trackStock and assert fields changed.
  - adjust stock with positive and negative deltas, including different starting quantities.
  - reject a delta that would make any selected item negative and assert every selected item is unchanged.
  - soft-delete selected items and assert rows remain with `isAvailable=false`.
  - reject an unknown ID, duplicate IDs, missing category, and mixed valid/invalid IDs; assert no partial write.
  - reject a negative final stock and verify no audit log is created for the failed request.

- [ ] **Step 2: Run service tests and verify RED**

  Run:

  ```powershell
  npm.cmd run test --workspace=backend -- test/menu/menu-bulk.spec.ts
  ```

  Expected: tests fail because `MenuService.bulkUpdateMenuItems` is not implemented or does not mutate the expected fields.

- [ ] **Step 3: Implement preflight validation**

  In `MenuService.bulkUpdateMenuItems`:

  1. Fetch all `MenuItem` rows by `ids` and compare the count/set to the request.
  2. For `setCategory`, fetch the target category before opening the write transaction.
  3. For `adjustStock`, calculate `stockQuantity + delta` for every selected row and reject with row/item details if any value is negative.
  4. Reject duplicate IDs and all contract-invalid input before this service is called by the controller schema.

- [ ] **Step 4: Implement the single transaction**

  Use `prisma.$transaction(async tx => ...)` and update all selected rows according to the discriminant. Use `updateMany` only after preflight has established the same update applies to every row; use one update per item for `adjustStock` so each resulting quantity is exact. For `delete`, set only `isAvailable=false`.

- [ ] **Step 5: Add audit and event side effects**

  After a successful transaction, call `AuditService.log` once with action `MENU_ITEMS_BULK_UPDATED`, target `MenuItem`, and metadata `{ action, ids, updatedCount }`. Emit `menu:bulkChanged` with `{ action, ids, updatedCount }`. Do not emit audit/event side effects after a failed preflight or rolled-back transaction.

- [ ] **Step 6: Run GREEN regression tests**

  Run:

  ```powershell
  npm.cmd run test --workspace=backend -- test/menu/menu-bulk.spec.ts test/menu/menu-admin.spec.ts test/menu/category-admin.spec.ts
  npm.cmd run typecheck --workspace=backend
  npm.cmd run lint --workspace=backend
  ```

  Expected: all focused menu tests pass, typecheck has no errors, and lint has no errors beyond the existing warning in `tables.service.ts`.

- [ ] **Step 7: Commit**

  ```powershell
  git add backend/src/modules/menu/menu.service.ts backend/test/menu/menu-bulk.spec.ts
  git commit -m "feat(menu): add atomic bulk actions"
  ```

### Task 3: Frontend contract, API helper and view-model tests

**Files:**
- Modify: `frontend/src/api/contracts.ts`
- Create: `frontend/src/api/menuBulk.ts`
- Create: `frontend/src/api/menuBulk.test.ts`
- Create: `frontend/src/features/admin/menuBulkViewModel.ts`
- Create: `frontend/src/features/admin/menuBulkViewModel.test.ts`

**Interfaces:**
- Consumes: backend action names/payloads and existing `getApiBaseUrl`/error envelope.
- Produces: `MenuBulkAction`, `MenuBulkPayload`, `bulkUpdateMenuItemsApi(token, ids, action, payload)`, `hasBulkSelection`, `getBulkActionLabel`, and `buildBulkPayload`.

- [ ] **Step 1: Write failing helper/view-model tests**

  Mock `fetch` and assert:

  - helper uses `PATCH /api/menu/bulk`, bearer auth, and exact JSON body.
  - backend error message becomes a thrown `Error`.
  - empty selection returns false; action labels are stable Vietnamese strings.
  - `buildBulkPayload` maps availability/category/menuType/itemType/trackStock/adjustStock/delete to the exact payload shape.

- [ ] **Step 2: Run tests and verify RED**

  Run:

  ```powershell
  npm.cmd run test --workspace=frontend -- src/api/menuBulk.test.ts src/features/admin/menuBulkViewModel.test.ts
  ```

  Expected: module import failures because the helper/view-model files do not exist.

- [ ] **Step 3: Add frontend DTOs and API helper**

  Mirror the backend action union and result DTO in `contracts.ts`. Implement the helper with JSON headers and the same error extraction pattern used by `menuImport.ts`.

- [ ] **Step 4: Add pure view-model helpers**

  Keep selection/action mapping outside the screen:

  ```ts
  hasBulkSelection(ids: number[]): boolean;
  getBulkActionLabel(action: MenuBulkAction): string;
  buildBulkPayload(action: MenuBulkAction, value?: unknown): MenuBulkPayload;
  ```

  `adjustStock` accepts only an integer delta; `delete` produces `{}`.

- [ ] **Step 5: Run helper tests and verify GREEN**

  Run the same focused frontend command; expected all helper/view-model tests pass.

- [ ] **Step 6: Commit**

  ```powershell
  git add frontend/src/api/contracts.ts frontend/src/api/menuBulk.ts frontend/src/api/menuBulk.test.ts frontend/src/features/admin/menuBulkViewModel.ts frontend/src/features/admin/menuBulkViewModel.test.ts
  git commit -m "feat(admin): add menu bulk action client contracts"
  ```

### Task 4: Bulk toolbar, confirmation UI and context integration

**Files:**
- Modify: `frontend/src/contexts/RestaurantContext.tsx`
- Create: `frontend/src/features/admin/MenuBulkActions.tsx`
- Modify: `frontend/src/features/admin/MenuManagementScreen.tsx`

**Interfaces:**
- Consumes: `bulkUpdateMenuItemsApi`, view-model action labels/payload builder, existing `useAuth`, `useToast`, `Button`, `Field`, `Modal`, `Alert` patterns.
- Produces: `bulkUpdateMenuItems(ids, action, payload)` context method; a toolbar that calls it, refetches menu and clears selection only on success.

- [ ] **Step 1: Add context API method**

  Implement `bulkUpdateMenuItems` beside existing menu mutations. On HTTP 401 call `handleUnauthorized`; on success return `{ success: true, result }`; on failure return `{ success: false, error }` without mutating local menu state.

- [ ] **Step 2: Create the toolbar/modal component**

  `MenuBulkActions` receives selected IDs, categories, loading state, and an `onSubmit` callback. Render actions for availability, category, menuType, itemType, trackStock, adjustStock, and soft delete. Use a modal to choose the target value; use `Alert.alert`/confirmation UI for apply and delete. Disable submit while loading and show the selected count.

- [ ] **Step 3: Integrate desktop and mobile screen**

  Render the component when `selectedItemIds.length > 0`, reuse existing checkboxes, and pass `toggleVisibleSelection`/clear selection behavior. On success call `fetchMenu`, clear `selectedItemIds`, and show a success toast. On error keep selection and show an error toast. Ensure the toolbar wraps on narrow widths.

- [ ] **Step 4: Run frontend tests and typecheck**

  Run:

  ```powershell
  npm.cmd run test --workspace=frontend -- src/api/menuBulk.test.ts src/features/admin/menuBulkViewModel.test.ts
  npm.cmd run test --workspace=frontend
  npm.cmd run typecheck --workspace=frontend
  npm.cmd run lint --workspace=frontend
  ```

  Expected: all frontend tests pass, typecheck has no errors, and lint has no errors beyond existing warnings in unrelated files.

- [ ] **Step 5: Commit**

  ```powershell
  git add frontend/src/contexts/RestaurantContext.tsx frontend/src/features/admin/MenuBulkActions.tsx frontend/src/features/admin/MenuManagementScreen.tsx
  git commit -m "feat(admin): add menu bulk action toolbar"
  ```

### Task 5: Full Phase 6 verification and handoff

**Files:**
- No changes to `task_plan.md`, `progress.md`, `findings.md`, Phase 7 files, or Prisma schema/migrations.

- [ ] **Step 1: Run focused backend verification**

  ```powershell
  npm.cmd run test --workspace=backend -- test/menu/menu-bulk.spec.ts test/menu/menu-import-api.spec.ts test/menu/menu-admin.spec.ts test/menu/category-admin.spec.ts
  ```

- [ ] **Step 2: Run full backend tests and typecheck**

  ```powershell
  npm.cmd run test --workspace=backend
  npm.cmd run typecheck --workspace=backend
  ```

- [ ] **Step 3: Run full frontend tests and typecheck**

  ```powershell
  npm.cmd run test --workspace=frontend
  npm.cmd run typecheck --workspace=frontend
  ```

- [ ] **Step 4: Inspect isolation and diff**

  Run `git diff --check`, `git status -sb`, and `git diff --stat`. Confirm only Phase 6 implementation files plus the separate spec/plan are changed and the phase tracking files remain untouched.

- [ ] **Step 5: Final review and commit summary**

  Review the complete Phase 6 diff for atomicity, RBAC, soft-delete behavior, negative stock protection, and selection clearing. Record any deferred minor findings in the SDD ledger. Do not push unless the user explicitly requests it.
