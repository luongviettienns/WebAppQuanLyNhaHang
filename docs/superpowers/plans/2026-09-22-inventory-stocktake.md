# Kiểm kho và điều chỉnh tồn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng trọn vẹn nghiệp vụ Kiểm kho gồm phiếu kiểm kho, dòng kiểm kho, nhập Excel, điều chỉnh tồn atomically, audit/event đồng bộ và giao diện bám theo hai ảnh tham chiếu.

**Architecture:** Thêm một module chứng từ kiểm kho độc lập trong `backend/src/modules/inventory`, dùng `Ingredient.currentStock` làm nguồn tồn duy nhất và liên kết mỗi điều chỉnh với `InventoryTransaction`. Frontend thêm API contracts/helpers, view model thuần để tính tab/tổng, màn hình danh sách và màn hình composer; `InventoryScreen` chỉ điều phối section và tái sử dụng design system hiện có.

**Tech Stack:** TypeScript, Express, Prisma, MySQL, Zod, Vitest, Supertest, React Native Web/Expo, React Native Testing Library, Socket.io.

**Spec:** `docs/superpowers/specs/2026-09-22-inventory-stocktake-design.md`

## Global Constraints

- Chỉ triển khai kiểm kho cho `Ingredient` đang hoạt động và theo dõi tồn; không thêm nhiều kho vật lý, lô/hạn dùng, chuyển kho, xuất hủy hoặc trả hàng nhập.
- `Ingredient.currentStock` là nguồn sự thật; không tạo bảng tồn kho thứ ba.
- Draft không thay đổi `Ingredient`, `InventoryTransaction` hoặc event tồn kho.
- Balance phải chạy trong một Prisma transaction và chỉ phát `inventory:changed` sau commit thành công.
- `null` ở `actualQuantity` nghĩa là chưa kiểm; `0` là đã kiểm với tồn thực tế bằng 0.
- Phiếu `BALANCED` và `CANCELLED` bất biến; thao tác balance phải idempotent theo trạng thái.
- Nếu tồn hiện tại khác snapshot `systemQuantity`, trả `409` và không ghi đè âm thầm.
- Client không được gửi totals, tồn mới, giá trị chênh lệch hoặc snapshot để server tin tưởng.
- Tái sử dụng component/token hiện có; thao tác chính có chiều cao tối thiểu 44px và phải chạy được trên React Native Web.
- Chạy đúng script repository: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` khi đến bước xác minh.

## Review Focus

- `actualQuantity = 0` phải được phân biệt với `null`; test thuộc Task 1 và Task 5.
- Tồn phát sinh sau khi tạo draft phải trả `409`, rollback toàn bộ và không tạo ledger; test thuộc Task 3.
- Gọi balance lần hai không được tăng/giảm tồn thêm lần nữa; test thuộc Task 3.
- Chênh lệch âm và số lượng thập phân phải giữ đúng dấu, giá trị VND và định dạng hiển thị; test thuộc Task 1 và Task 4.
- Excel preview chỉ đọc và không được làm thay đổi tồn/ledger trước khi người dùng lưu draft; test thuộc Task 3 và Task 6.

## File Map

- `backend/prisma/schema.prisma`: enum/model/quan hệ kiểm kho và liên kết ledger.
- `backend/prisma/migrations/<timestamp>_add_inventory_checks/migration.sql`: migration tạo bảng và index.
- `backend/src/modules/inventory/inventory-check.math.ts`: hàm thuần tính chênh lệch và tổng hợp.
- `backend/src/modules/inventory/inventory-check.schemas.ts`: Zod schemas/query/input contracts.
- `backend/src/modules/inventory/inventory-check.types.ts`: DTO response list/detail/import và actor input dùng chung.
- `backend/src/modules/inventory/inventory-check.export.ts`: CSV/XLSX export và template Excel kiểm kho.
- `backend/src/modules/inventory/inventory-check.service.ts`: CRUD draft, import preview, balance/cancel transaction.
- `backend/src/modules/inventory/inventory-check.controller.ts`: parse request và error forwarding.
- `backend/src/modules/inventory/inventory.routes.ts`: đăng ký routes dưới `/api/inventory`.
- `backend/src/modules/inventory/inventory.events.ts`: dùng reason `MANUAL_ADJUST` đã có.
- `backend/test/inventory/inventory-check.math.spec.ts`: unit test tính toán.
- `backend/test/inventory/inventory-check.schema.spec.ts`: validation test.
- `backend/test/inventory/inventory-check.service.spec.ts`: service/transaction behavior test.
- `backend/test/inventory/inventory-check.api.spec.ts`: Supertest endpoint test.
- `frontend/src/api/contracts.ts`: types `InventoryCheck*`.
- `frontend/src/api/inventoryChecks.ts`: list/detail/save/balance/cancel/import/export helpers.
- `frontend/src/api/inventoryChecks.test.ts`: API URL/method/body test.
- `frontend/src/features/admin/inventoryCheckViewModel.ts`: tab, status, totals và format helpers.
- `frontend/src/features/admin/inventoryCheckViewModel.test.ts`: pure view-model tests.
- `frontend/src/features/admin/InventoryCheckListScreen.tsx`: màn hình danh sách phiếu.
- `frontend/src/features/admin/InventoryCheckComposerScreen.tsx`: màn hình tạo/sửa/chốt phiếu.
- `frontend/src/features/admin/inventoryCheckComposer.test.tsx`: component interaction test.
- `frontend/src/features/admin/InventoryScreen.tsx`: thêm section `checks`/`check-composer` và điều hướng.

### Task 1: Pure inventory-check math and validation

**Files:**
- Create: `backend/src/modules/inventory/inventory-check.math.ts`
- Create: `backend/src/modules/inventory/inventory-check.schemas.ts`
- Test: `backend/test/inventory/inventory-check.math.spec.ts`
- Test: `backend/test/inventory/inventory-check.schema.spec.ts`

**Interfaces:**
- Produces `calculateInventoryCheckLine(input: { systemQuantity: number; actualQuantity: number; costPerUnit: number }): { varianceQuantity: number; varianceValue: number }`.
- Produces `summarizeInventoryCheck(lines: Array<{ systemQuantity: number; actualQuantity: number | null; costPerUnit: number }>): { totalActualQuantity: number; totalVarianceQuantity: number; increasedQuantity: number; decreasedQuantity: number; totalVarianceValue: number; uncheckedCount: number }`.
- Produces `inventoryCheckLineInputSchema`, `createInventoryCheckSchema`, `updateInventoryCheckSchema`, `inventoryCheckListQuerySchema`, `inventoryCheckImportPreviewSchema` and inferred types.

- [ ] **Step 1: Write the failing math tests.**

```ts
import { describe, expect, it } from 'vitest';
import { calculateInventoryCheckLine, summarizeInventoryCheck } from '../../src/modules/inventory/inventory-check.math';

describe('inventory check math', () => {
  it('keeps a negative variance and computes negative VND value', () => {
    expect(calculateInventoryCheckLine({ systemQuantity: 10, actualQuantity: 7.5, costPerUnit: 12000 }))
      .toEqual({ varianceQuantity: -2.5, varianceValue: -30000 });
  });

  it('treats zero as checked and null as unchecked', () => {
    expect(summarizeInventoryCheck([
      { systemQuantity: 4, actualQuantity: 0, costPerUnit: 10 },
      { systemQuantity: 3, actualQuantity: null, costPerUnit: 10 }
    ])).toMatchObject({ totalActualQuantity: 0, decreasedQuantity: 4, uncheckedCount: 1 });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure.**

Run: `npm run test:backend -- inventory-check.math.spec.ts`

Expected: FAIL because `inventory-check.math.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure functions.**

```ts
function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function calculateInventoryCheckLine(input: InventoryCheckLineMathInput): InventoryCheckLineMathResult {
  const varianceQuantity = roundQuantity(input.actualQuantity - input.systemQuantity);
  return { varianceQuantity, varianceValue: Math.round(varianceQuantity * input.costPerUnit) };
}
```

Reject non-finite values, negative actual quantity and negative cost with explicit errors. Count `0` as checked and `null` as unchecked.

- [ ] **Step 4: Add Zod schemas and schema tests.**

```ts
export const inventoryCheckLineInputSchema = z.object({
  ingredientId: z.number().int().positive(),
  actualQuantity: z.number().finite().nonnegative().nullable().optional()
});

export const createInventoryCheckSchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
  lines: z.array(inventoryCheckLineInputSchema).default([])
});
```

The update schema must require at least one field and reject duplicate `ingredientId`; query schema must parse comma-separated `statuses`, dates, search, page and pageSize. Test that `null` is accepted, `-1` is rejected, duplicate ingredients are rejected and `pageSize > 100` is rejected.

- [ ] **Step 5: Run the focused math/schema tests.**

Run: `npm run test:backend -- inventory-check.math.spec.ts inventory-check.schema.spec.ts`

Expected: PASS with all new tests green.

- [ ] **Step 6: Commit the unit boundary.**

```bash
git add backend/src/modules/inventory/inventory-check.math.ts backend/src/modules/inventory/inventory-check.schemas.ts backend/test/inventory/inventory-check.math.spec.ts backend/test/inventory/inventory-check.schema.spec.ts
git commit -m "feat(inventory): add stocktake math and validation"
```

### Task 2: Prisma schema and database migration

**Files:**
- Modify: `backend/prisma/schema.prisma: InventoryTransaction, Ingredient relations`
- Create: `backend/prisma/migrations/<timestamp>_add_inventory_checks/migration.sql`
- Test: `backend/test/database/seed.spec.ts` only if generated client/seed assumptions require an assertion

**Interfaces:**
- Produces Prisma models `InventoryCheck`, `InventoryCheckLine` and enum `InventoryCheckStatus`.
- Produces nullable `InventoryTransaction.inventoryCheckId` and relations usable as `inventoryCheck`/`inventoryTransactions`.

- [ ] **Step 1: Extend the schema without changing existing ledger nullability.**

Add `InventoryCheckStatus { DRAFT BALANCED CANCELLED }`, the two models from the spec, `inventoryCheckId Int?` to `InventoryTransaction`, and `inventoryCheck InventoryCheck? @relation(...)`. Add the unique composite key on `(inventoryCheckId, ingredientId)` and indexes on status/date/ingredient.

- [ ] **Step 2: Generate the migration and Prisma client.**

Run: `npm run prisma:generate --workspace=backend`

Run: `npx prisma migrate dev --name add_inventory_checks --schema backend/prisma/schema.prisma`

Expected: a migration creates the enum, two tables, foreign keys, unique key and indexes without altering existing data.

- [ ] **Step 3: Verify schema typecheck before service work.**

Run: `npm run typecheck:backend`

Expected: PASS; generated Prisma types expose `inventoryCheck` relations and `InventoryCheckStatus`.

- [ ] **Step 4: Commit schema and migration.**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(inventory): add stocktake persistence"
```

### Task 3: Backend service, export/import and REST API

**Files:**
- Create: `backend/src/modules/inventory/inventory-check.types.ts`
- Create: `backend/src/modules/inventory/inventory-check.export.ts`
- Create: `backend/src/modules/inventory/inventory-check.service.ts`
- Create: `backend/src/modules/inventory/inventory-check.controller.ts`
- Modify: `backend/src/modules/inventory/inventory.routes.ts`
- Test: `backend/test/inventory/inventory-check.service.spec.ts`
- Test: `backend/test/inventory/inventory-check.api.spec.ts`

**Interfaces:**
- `InventoryCheckService.list(query): Promise<InventoryCheckListDataDto>`.
- `InventoryCheckService.getById(id): Promise<InventoryCheckDetailDto>` including five recent checks.
- `InventoryCheckService.create(input, actor): Promise<InventoryCheckDetailDto>`.
- `InventoryCheckService.update(id, input, actor): Promise<InventoryCheckDetailDto>` for `DRAFT` only.
- `InventoryCheckService.balance(id, actor): Promise<InventoryCheckDetailDto>`.
- `InventoryCheckService.cancel(id, actor): Promise<InventoryCheckDetailDto>` for `DRAFT` only.
- `InventoryCheckService.previewImport(fileBase64, fileName): Promise<InventoryCheckImportPreviewDto>` with no writes.
- `InventoryCheckService.export(query, format): Promise<Buffer>`.

- [ ] **Step 1: Write service tests for draft behavior and no side effects.**

```ts
it('creates a draft and does not change stock or ledger', async () => {
  const before = await prisma.ingredient.findUniqueOrThrow({ where: { sku: 'ING-CHICKEN-01' } });
  const result = await InventoryCheckService.create({ lines: [{ ingredientId: before.id, actualQuantity: null }] }, actor);
  const after = await prisma.ingredient.findUniqueOrThrow({ where: { id: before.id } });
  expect(result.status).toBe('DRAFT');
  expect(after.currentStock).toBe(before.currentStock);
  expect(await prisma.inventoryTransaction.count({ where: { inventoryCheckId: result.id } })).toBe(0);
});
```

Define the test-local fixtures before the test cases: `actor = { id: adminUser.id, name: adminUser.name }`, `createDraftWithLines(lines)` that calls the service and returns the created DTO, and `ingredientStock(id)` that reads `Ingredient.currentStock`. Use the existing `backend/test/helpers/database.ts` reset/setup pattern.

- [ ] **Step 2: Run the test and verify it fails for the missing service.**

Run: `npm run test:backend -- inventory-check.service.spec.ts`

Expected: FAIL because `InventoryCheckService` and persistence do not exist.

- [ ] **Step 3: Implement code generation and snapshot helpers.**

Use the existing purchase-receipt sequence pattern to generate `KK000001`. When creating/updating lines, fetch active ingredients from Prisma and snapshot `sku`, `name`, `unit`, `currentStock`, and `costPerUnit` into `InventoryCheckLine`. Never accept client-provided snapshot fields.

- [ ] **Step 4: Implement list/detail/create/update/cancel.**

Use the existing `purchaseReceiptWhere`/pagination pattern. `getById` includes lines and five newest other checks. `update` replaces lines inside a transaction and rejects non-draft states. `cancel` changes only a draft to `CANCELLED` and writes audit metadata.

- [ ] **Step 5: Write the failing balance/concurrency/idempotency tests.**

```ts
it('balances a draft atomically and creates only non-zero adjustment ledger rows', async () => {
  const draft = await createDraftWithLines([{ ingredientId, actualQuantity: 7.5 }]);
  const balanced = await InventoryCheckService.balance(draft.id, actor);
  expect(balanced.status).toBe('BALANCED');
  expect(await ingredientStock(ingredientId)).toBe(7.5);
  expect(await prisma.inventoryTransaction.findFirstOrThrow({ where: { inventoryCheckId: draft.id } }))
    .toMatchObject({ type: 'MANUAL_ADJUST', quantity: -2.5 });
  await expect(InventoryCheckService.balance(draft.id, actor)).rejects.toMatchObject({ statusCode: 409 });
});

it('rejects a balance when stock changed after the snapshot and writes nothing', async () => {
  const draft = await createDraftWithLines([{ ingredientId, actualQuantity: 7 }]);
  await prisma.ingredient.update({ where: { id: ingredientId }, data: { currentStock: { increment: 1 } } });
  await expect(InventoryCheckService.balance(draft.id, actor)).rejects.toMatchObject({ statusCode: 409 });
  expect(await prisma.inventoryTransaction.count({ where: { inventoryCheckId: draft.id } })).toBe(0);
});
```

- [ ] **Step 6: Run the new service tests and verify the expected failures.**

Run: `npm run test:backend -- inventory-check.service.spec.ts`

Expected: FAIL until the balance transaction is implemented.

- [ ] **Step 7: Implement balance as one Prisma transaction.**

Inside `prisma.$transaction`:

```ts
const check = await tx.inventoryCheck.findUniqueOrThrow({ where: { id }, include: { lines: true } });
if (check.status !== 'DRAFT') throw ApiError.conflict('Phiếu kiểm kho không còn ở trạng thái nháp');
if (check.lines.some(line => line.actualQuantity === null)) throw ApiError.badRequest('Còn nguyên liệu chưa kiểm');

for (const line of check.lines) {
  const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: line.ingredientId } });
  if (ingredient.currentStock !== line.systemQuantity) throw ApiError.conflict('Tồn kho đã thay đổi, cần tải lại phiếu kiểm kho');
  const variance = calculateInventoryCheckLine({ systemQuantity: line.systemQuantity, actualQuantity: line.actualQuantity!, costPerUnit: line.costPerUnit });
  if (variance.varianceQuantity !== 0) {
    await tx.ingredient.update({ where: { id: ingredient.id }, data: { currentStock: line.actualQuantity! } });
    await tx.inventoryTransaction.create({ data: { ingredientId: ingredient.id, inventoryCheckId: check.id, type: 'MANUAL_ADJUST', quantity: variance.varianceQuantity, costAmount: variance.varianceValue, note: `Kiểm kho ${check.checkCode}`, createdByUserId: actor.id } });
  }
}
```

Then update the check to `BALANCED`, write audit inside the existing repository pattern, and emit `MANUAL_ADJUST` only after the transaction resolves. Use the changed ingredient IDs only.

- [ ] **Step 8: Implement Excel preview/template/export.**

Reuse `xlsx` parser conventions from `inventory.excel.ts`. Preview validates `.xlsx`, SKU existence, unit match, finite nonnegative actual quantity, and returns valid/error rows. Export uses the filtered list and returns CSV/XLSX with the list columns. Neither preview nor export mutates the database.

- [ ] **Step 9: Add controller and routes.**

Register these routes after authentication/authorization in `inventory.routes.ts`:

```ts
inventoryRouter.get('/checks', InventoryCheckController.list);
inventoryRouter.post('/checks', InventoryCheckController.create);
inventoryRouter.get('/checks/export', InventoryCheckController.export);
inventoryRouter.post('/checks/import/preview', InventoryCheckController.previewImport);
inventoryRouter.get('/checks/:id', InventoryCheckController.detail);
inventoryRouter.patch('/checks/:id', InventoryCheckController.update);
inventoryRouter.post('/checks/:id/balance', InventoryCheckController.balance);
inventoryRouter.post('/checks/:id/cancel', InventoryCheckController.cancel);
```

The controller must parse with the schemas, extract `{ id, name }` from `req.user`, and call `next(error)` exactly like `PurchaseReceiptController`.

- [ ] **Step 10: Run backend tests and typecheck.**

Run: `npm run test:backend -- inventory-check.math.spec.ts inventory-check.schema.spec.ts inventory-check.service.spec.ts inventory-check.api.spec.ts`

Run: `npm run typecheck:backend`

Expected: PASS with no unhandled warnings.

- [ ] **Step 11: Commit the backend vertical slice.**

```bash
git add backend/src/modules/inventory backend/test/inventory backend/prisma
git commit -m "feat(inventory): add stocktake API and ledger adjustments"
```

### Task 4: Frontend contracts, API helpers and pure view model

**Files:**
- Modify: `frontend/src/api/contracts.ts`
- Create: `frontend/src/api/inventoryChecks.ts`
- Create: `frontend/src/api/inventoryChecks.test.ts`
- Create: `frontend/src/features/admin/inventoryCheckViewModel.ts`
- Create: `frontend/src/features/admin/inventoryCheckViewModel.test.ts`

**Interfaces:**
- `InventoryCheckStatus = 'DRAFT' | 'BALANCED' | 'CANCELLED'`.
- `InventoryCheckLineDto`, `InventoryCheckDto`, `InventoryCheckListDataDto`, `InventoryCheckDraftInput`, `InventoryCheckListFilter`, `InventoryCheckImportPreviewDto`.
- API helpers: `fetchInventoryChecksApi`, `fetchInventoryCheckDetailApi`, `saveInventoryCheckDraftApi`, `balanceInventoryCheckApi`, `cancelInventoryCheckApi`, `previewInventoryCheckImportApi`, `downloadInventoryCheckExportApi`.
- View model: `filterInventoryCheckLines`, `getInventoryCheckSummary`, `getInventoryCheckStatusPresentation`, `formatInventoryCheckQuantity`, `formatInventoryCheckMoney`.

- [ ] **Step 1: Write failing API helper tests.**

```ts
it('serializes status/date/search filters and calls the checks endpoint', async () => {
  await fetchInventoryChecksApi('token', { status: ['DRAFT', 'BALANCED'], from: '2026-09-01', page: 2, pageSize: 25, search: 'KK000001' });
  expect(fetchMock.mock.calls[0][0]).toContain('/api/inventory/checks?statuses=DRAFT%2CBALANCED&from=2026-09-01&search=KK000001&page=2&pageSize=25');
});
```

- [ ] **Step 2: Run focused frontend tests and verify failure.**

Run: `npm run test:frontend -- inventoryChecks.test.ts`

Expected: FAIL because the helper module and types do not exist.

- [ ] **Step 3: Implement contracts and fetch helpers.**

Match the error-envelope and `Blob` download patterns in `purchaseReceipts.ts`. Draft save uses `POST` for `id === null` and `PATCH` otherwise; balance/cancel use `POST` with auth headers; import uses JSON base64.

- [ ] **Step 4: Write failing view-model tests.**

```ts
it('separates zero from unchecked and calculates signed totals', () => {
  const lines = [
    { actualQuantity: 0, systemQuantity: 2, varianceQuantity: -2, varianceValue: -20 },
    { actualQuantity: null, systemQuantity: 3, varianceQuantity: null, varianceValue: null }
  ];
  expect(filterInventoryCheckLines(lines, 'BALANCED')).toHaveLength(0);
  expect(filterInventoryCheckLines(lines, 'UNCHECKED')).toHaveLength(1);
  expect(getInventoryCheckSummary(lines)).toMatchObject({ decreasedQuantity: 2, uncheckedCount: 1 });
});
```

- [ ] **Step 5: Implement pure view-model functions and run tests.**

Use a tab type `'ALL' | 'MATCHED' | 'VARIANCE' | 'UNCHECKED'`; never use truthiness to determine whether `actualQuantity` is filled. Format quantities with `vi-VN` and preserve the minus sign for value/quantity.

Run: `npm run test:frontend -- inventoryChecks.test.ts inventoryCheckViewModel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the frontend data boundary.**

```bash
git add frontend/src/api/contracts.ts frontend/src/api/inventoryChecks.ts frontend/src/api/inventoryChecks.test.ts frontend/src/features/admin/inventoryCheckViewModel.ts frontend/src/features/admin/inventoryCheckViewModel.test.ts
git commit -m "feat(inventory): add stocktake frontend contracts"
```

### Task 5: Inventory-check list screen

**Files:**
- Create: `frontend/src/features/admin/InventoryCheckListScreen.tsx`
- Create: `frontend/src/features/admin/inventoryCheckListViewModel.ts`
- Create: `frontend/src/features/admin/inventoryCheckListViewModel.test.ts`

**Interfaces:**
- `InventoryCheckListScreenProps { onCreateCheck: () => void; onOpenCheck: (id: number) => void }`.
- Consumes `fetchInventoryChecksApi`, `downloadInventoryCheckExportApi`, `InventoryCheckListFilter` and `inventoryRevision`.

- [ ] **Step 1: Add failing list view-model tests for status labels and date summary.**

```ts
it('maps the three backend statuses to the reference labels', () => {
  expect(getInventoryCheckStatusPresentation('DRAFT')).toEqual({ label: 'Phiếu tạm', tone: 'warning' });
  expect(getInventoryCheckStatusPresentation('BALANCED')).toEqual({ label: 'Đã cân bằng kho', tone: 'success' });
  expect(getInventoryCheckStatusPresentation('CANCELLED')).toEqual({ label: 'Đã hủy', tone: 'danger' });
});
```

- [ ] **Step 2: Run the test and verify failure.**

Run: `npm run test:frontend -- inventoryCheckListViewModel.test.ts`

Expected: FAIL because the list view-model does not exist.

- [ ] **Step 3: Implement the view model.**

Use the purchase receipt list screen conventions for date/money formatting and initial filter `{ status: ['DRAFT', 'BALANCED'], page: 1, pageSize: 50 }`.

- [ ] **Step 4: Build the list screen against the reference layout.**

Use `ScreenHeader`, a primary `+ Kiểm kho` button, search input, left filter surface, status checkboxes/chips, horizontal table, empty illustration/state, pagination and CSV/XLSX export. Clicking a row calls `onOpenCheck(id)`; `inventoryRevision` triggers a refetch.

- [ ] **Step 5: Run frontend tests and typecheck.**

Run: `npm run test:frontend -- inventoryCheckListViewModel.test.ts`

Run: `npm run typecheck:frontend`

Expected: PASS.

### Task 6: Inventory-check composer screen and Excel flow

**Files:**
- Create: `frontend/src/features/admin/InventoryCheckComposerScreen.tsx`
- Create: `frontend/src/features/admin/inventoryCheckComposerViewModel.ts`
- Create: `frontend/src/features/admin/inventoryCheckComposer.test.tsx`

**Interfaces:**
- `InventoryCheckComposerScreenProps { mode: 'create' | 'edit'; checkId: number | null; onFinished: (result: { id: number; balanced: boolean }) => void; onCancel: () => void }`.
- Consumes the draft/balance/import API helpers and line/tab view-models from Tasks 1/4.

- [ ] **Step 1: Write the failing component test for draft save and zero input.**

```tsx
it('saves zero as a checked quantity and does not treat it as empty', async () => {
  render(<InventoryCheckComposerScreen mode="create" checkId={null} onFinished={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.changeText(screen.getByTestId('inventory-check-actual-1'), '0');
  fireEvent.press(screen.getByTestId('inventory-check-save-draft'));
  await waitFor(() => expect(saveInventoryCheckDraftApi).toHaveBeenCalledWith(expect.anything(), null, expect.objectContaining({ lines: [{ ingredientId: 1, actualQuantity: 0 }] })));
});
```

- [ ] **Step 2: Run the component test and verify failure.**

Run: `npm run test:frontend -- inventoryCheckComposer.test.tsx`

Expected: FAIL because the screen and test IDs do not exist.

- [ ] **Step 3: Implement composer state and draft save.**

Load detail in edit mode, use `actualQuantity === null` checks, render search suggestions from `fetchIngredientsApi`, add each ingredient once, allow editing/removing rows, calculate signed variance live, and persist `{ note, lines: [{ ingredientId, actualQuantity }] }`.

- [ ] **Step 4: Implement tab filtering and right panel.**

Render tabs `Tất cả`, `Khớp`, `Lệch`, `Chưa kiểm`; render code/status/total actual/note/recent checks in the right panel. Disable editing and hide save/balance actions for `BALANCED` and `CANCELLED`.

- [ ] **Step 5: Implement Excel upload preview and apply.**

Use the existing web `FileReader` pattern. `previewInventoryCheckImportApi` populates a preview surface; the user action merges only `validRows` into current draft lines. Show row-level errors and ensure no balance call happens during import.

- [ ] **Step 6: Implement balance confirmation and conflict handling.**

Require every line to have a non-null actual quantity, save the draft first when needed, show a confirmation prompt, call `balanceInventoryCheckApi`, and display the server `409` message without navigating away. On success call `onFinished({ id, balanced: true })`.

- [ ] **Step 7: Run component tests and typecheck.**

Run: `npm run test:frontend -- inventoryCheckComposer.test.tsx inventoryCheckViewModel.test.ts`

Run: `npm run typecheck:frontend`

Expected: PASS.

- [ ] **Step 8: Commit the native UI flow.**

```bash
git add frontend/src/features/admin/InventoryCheckComposerScreen.tsx frontend/src/features/admin/inventoryCheckComposerViewModel.ts frontend/src/features/admin/inventoryCheckComposer.test.tsx frontend/src/features/admin/InventoryCheckListScreen.tsx frontend/src/features/admin/inventoryCheckListViewModel.ts frontend/src/features/admin/inventoryCheckListViewModel.test.ts
git commit -m "feat(inventory): add stocktake admin screens"
```

### Task 7: Wire navigation, realtime refresh and integration coverage

**Files:**
- Modify: `frontend/src/features/admin/InventoryScreen.tsx:1182-1244`
- Modify: `frontend/src/features/admin/InventoryCatalogScreen.tsx:reservedInventoryMenus`
- Modify: `frontend/src/features/admin/InventoryScreen.tsx` imports and styles
- Test: `frontend/src/features/admin/inventoryScreenNavigation.test.tsx`
- Test: `e2e/inventory-stocktake-flow.spec.ts`

**Interfaces:**
- `InventoryScreen` gains sections `'checks' | 'check-composer'` and callbacks `openInventoryChecks`, `createInventoryCheck`, `openInventoryCheck`, `finishInventoryCheck`.
- The catalog's reserved `Kiểm kho` item calls `onOpenInventoryChecks` instead of rendering `Chưa triển khai`.

- [ ] **Step 1: Write the failing navigation test.**

```tsx
it('opens the stocktake list from the inventory menu and opens create composer', () => {
  render(<InventoryScreen />);
  fireEvent.press(screen.getByText('Kiểm kho'));
  expect(screen.getByText('Phiếu kiểm kho')).toBeTruthy();
  fireEvent.press(screen.getByText('+ Kiểm kho'));
  expect(screen.getByText('Kiểm kho')).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused navigation test and verify failure.**

Run: `npm run test:frontend -- inventoryScreenNavigation.test.tsx`

Expected: FAIL because `Kiểm kho` is still a reserved placeholder.

- [ ] **Step 3: Wire the screen state and callbacks.**

Add the list/composer imports and the four callbacks; preserve existing catalog, legacy operations, and purchase receipt behavior. After `onFinished`, return to the list and let the list refetch.

- [ ] **Step 4: Wire realtime invalidation.**

Do not add a second socket listener. The existing `RestaurantContext` listener already increments `inventoryRevision` for `MANUAL_ADJUST`; the new list screen consumes that revision. Confirm the backend reason union already includes `MANUAL_ADJUST`.

- [ ] **Step 5: Add an E2E/admin integration path.**

Cover: login as admin, open Kho hàng, open Kiểm kho, create a draft, enter actual `0`, save, reopen, balance, assert the success state and refreshed catalog stock. Keep selectors on explicit `testID`s, not text that changes with data.

- [ ] **Step 6: Run frontend tests and the targeted E2E.**

Run: `npm run test:frontend -- inventoryScreenNavigation.test.tsx`

Run: `npx playwright test e2e/inventory-stocktake-flow.spec.ts`

Expected: PASS when the test database is configured according to `README.md`.

- [ ] **Step 7: Commit the integration wiring.**

```bash
git add frontend/src/features/admin/InventoryScreen.tsx frontend/src/features/admin/InventoryCatalogScreen.tsx frontend/src/features/admin/inventoryScreenNavigation.test.tsx e2e/inventory-stocktake-flow.spec.ts
git commit -m "feat(inventory): wire stocktake navigation and sync"
```

### Task 8: Full verification and delivery review

**Files:**
- Test: all existing repository suites.

- [ ] **Step 1: Run the complete backend suite.**

Run: `npm run test:backend`

Expected: exit code 0 and no failed tests.

- [ ] **Step 2: Run the complete frontend suite.**

Run: `npm run test:frontend`

Expected: exit code 0 and no failed tests.

- [ ] **Step 3: Run typechecks and lint.**

Run: `npm run typecheck`

Run: `npm run lint`

Expected: both exit code 0. Fix only errors caused by this feature; report unrelated baseline failures explicitly.

- [ ] **Step 4: Build both applications.**

Run: `npm run build`

Expected: frontend Expo web export and backend TypeScript build complete successfully.

- [ ] **Step 5: Review the diff against the spec.**

Run: `git diff origin/pKhanh...HEAD --stat`

Check each acceptance criterion: draft side-effect free, zero/null distinction, atomic balance, ledger link, audit/event after commit, conflict `409`, read-only terminal states, Excel preview isolation, navigation and inventory refresh.

- [ ] **Step 6: Report evidence.**

Include the exact test/build commands and exit results, the main files changed, any baseline failures, and the remaining out-of-scope items from the spec. Do not claim completion without fresh command output.
