# Phiếu nhập hàng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng phiếu nhập hàng Native với supplier tối thiểu, lifecycle draft/post/cancel, ledger tồn kho và đồng bộ realtime.

**Architecture:** Supplier và PurchaseReceipt là source document mới trong inventory module. Chỉ khi `POSTED`, service chạy Prisma transaction để cập nhật Ingredient/weighted cost và tạo InventoryTransaction liên kết phiếu; sau commit emit event invalidation để các read model hiện có tự tải lại.

**Tech Stack:** Prisma 5, Express, Zod, Vitest/Supertest, React Native/Expo Web, React Context, socket.io-client, xlsx.

**Spec:** `docs/superpowers/specs/2026-09-21-purchase-receipts-design.md`

## Global Constraints

- Chỉ role `ADMIN` truy cập supplier và purchase receipt API/UI.
- Phiếu `DRAFT` có thể chưa có supplier/dòng hàng và không thay đổi tồn, giá vốn hoặc InventoryTransaction.
- Chỉ `POSTED` tạo ledger và cập nhật tồn/weighted cost; thao tác phải atomic và post lặp trả `409`.
- Phiếu `POSTED`/`CANCELLED` bất biến; cancel chỉ cho `DRAFT`; không xóa cứng phiếu.
- `paidAmount` chỉ là metadata trên phiếu; không tạo sổ quỹ, tiền mặt hoặc bút toán công nợ.
- Snapshot SKU/tên/đơn vị và mọi total lấy/tính ở server; client không được là nguồn sự thật.
- Import Excel chỉ preview/thêm dòng draft, không được ghi tồn.
- Phát `inventory:changed` chỉ sau transaction commit thành công.
- Không thêm package production mới.
- Mỗi task phải chạy test liên quan, typecheck phù hợp, commit và push trước task kế tiếp.

## Review Focus

- Post cùng một phiếu từ hai thao tác gần đồng thời: chỉ một thao tác được tăng tồn và tạo ledger.
- Một dòng invalid hoặc ingredient ngừng hoạt động khi post: toàn bộ phiếu rollback, không có số dư một phần.
- Giảm giá dòng, giảm giá phiếu và số đã trả biên: total/payable/outstanding không âm và không lệch 1 VND.
- Import Excel có SKU trùng hoặc lỗi: chỉ preview; UI không ghi tồn trước khi người dùng post draft.
- Socket event sau post: catalog đang mở tải lại nhưng draft/form không tự submit hoặc mất thay đổi chưa lưu.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `backend/prisma/schema.prisma` | Supplier, purchase receipt, line, status enum và relation ledger |
| `backend/prisma/migrations/<timestamp>_add_purchase_receipts/migration.sql` | Migration có thể chạy trên DB hiện tại |
| `backend/src/modules/inventory/purchase-receipt.math.ts` | Pure totals và validation số tiền dùng chung |
| `backend/src/modules/inventory/supplier.*.ts` | Zod, service, controller cho supplier tối thiểu |
| `backend/src/modules/inventory/purchase-receipt.*.ts` | DTO/schema/service/controller/export cho chứng từ |
| `backend/src/modules/inventory/inventory.excel.ts` | Parser SKU tái sử dụng ở chế độ preview-only |
| `backend/src/modules/inventory/inventory.events.ts` | Bổ sung lý do event phiếu nhập |
| `backend/src/modules/inventory/inventory.routes.ts` | Route protected của supplier/receipt |
| `frontend/src/api/contracts.ts` | DTO, filter và socket contract |
| `frontend/src/api/suppliers.ts`, `frontend/src/api/purchaseReceipts.ts` | API clients có auth/error envelope nhất quán |
| `frontend/src/features/admin/purchaseReceiptViewModel.ts` | Format tiền, status và thao tác form thuần |
| `frontend/src/features/admin/PurchaseReceiptListScreen.tsx` | Danh sách/filter/export theo ảnh tham chiếu |
| `frontend/src/features/admin/PurchaseReceiptComposerScreen.tsx` | Draft composer, lines, import preview và post |
| `frontend/src/features/admin/InventoryScreen.tsx`, `InventoryCatalogScreen.tsx` | Điều hướng từ nghiệp vụ kho và legacy stock-in còn tương thích |

## Task 1: Data foundation and receipt calculations

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_purchase_receipts/migration.sql`
- Create: `backend/src/modules/inventory/purchase-receipt.math.ts`
- Test: `backend/test/inventory/purchase-receipt.math.spec.ts`
- Modify: `backend/src/modules/inventory/inventory.events.ts`
- Modify: `frontend/src/api/contracts.ts`

**Interfaces:**
- Produces `PurchaseReceiptStatus = 'DRAFT' | 'POSTED' | 'CANCELLED'` and `calculatePurchaseReceiptTotals(input): PurchaseReceiptTotals`.
- Produces nullable `InventoryTransaction.purchaseReceiptId` for Task 3.

- [ ] **Step 1: Write failing calculation tests**

```ts
it('calculates line, receipt discount, payable and outstanding in VND', () => {
  expect(calculatePurchaseReceiptTotals({
    lines: [{ quantity: 2, unitCost: 15000, discountAmount: 1000 }],
    discountAmount: 2000,
    paidAmount: 12000
  })).toEqual({ subtotalAmount: 29000, payableAmount: 27000, outstandingAmount: 15000 });
});

it('rejects paid amount above payable amount', () => {
  expect(() => calculatePurchaseReceiptTotals({
    lines: [{ quantity: 1, unitCost: 10000, discountAmount: 0 }],
    discountAmount: 0,
    paidAmount: 10001
  })).toThrow('Số tiền đã trả không được vượt số cần trả');
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm test -- --run test/inventory/purchase-receipt.math.spec.ts` from `backend`.

Expected: FAIL because `purchase-receipt.math.ts` does not exist.

- [ ] **Step 3: Add schema, migration and pure calculation implementation**

```ts
export type PurchaseReceiptTotals = {
  subtotalAmount: number;
  payableAmount: number;
  outstandingAmount: number;
};

export function calculatePurchaseReceiptTotals(input: {
  lines: Array<{ quantity: number; unitCost: number; discountAmount: number }>;
  discountAmount: number;
  paidAmount: number;
}): PurchaseReceiptTotals {
  const subtotalAmount = input.lines.reduce((sum, line) => {
    const gross = Math.round(line.quantity * line.unitCost);
    if (line.discountAmount > gross) throw new Error('Giảm giá dòng không được vượt thành tiền');
    return sum + gross - line.discountAmount;
  }, 0);
  if (input.discountAmount > subtotalAmount) throw new Error('Giảm giá phiếu không được vượt tổng tiền hàng');
  const payableAmount = subtotalAmount - input.discountAmount;
  if (input.paidAmount > payableAmount) throw new Error('Số tiền đã trả không được vượt số cần trả');
  return { subtotalAmount, payableAmount, outstandingAmount: payableAmount - input.paidAmount };
}
```

Add `Supplier`, `PurchaseReceipt`, `PurchaseReceiptLine`, `PurchaseReceiptStatus`, `PurchaseReceiptLine @@unique([purchaseReceiptId, ingredientId])`, `InventoryTransaction.purchaseReceiptId` and its Restrict relation exactly as specified. Generate Prisma client after migration. Add `PURCHASE_RECEIPT_POSTED` to backend/frontend event unions.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run test/inventory/purchase-receipt.math.spec.ts` and `npm run typecheck` from `backend`.

Expected: PASS.

- [ ] **Step 5: Commit and push Task 1**

```bash
git add backend/prisma backend/src/modules/inventory/purchase-receipt.math.ts backend/src/modules/inventory/inventory.events.ts backend/test/inventory/purchase-receipt.math.spec.ts frontend/src/api/contracts.ts
git commit -m "feat(inventory): add purchase receipt data foundation"
git push origin pKhanh
```

## Task 2: Supplier API and lifecycle-safe lookup

**Files:**
- Create: `backend/src/modules/inventory/supplier.schemas.ts`
- Create: `backend/src/modules/inventory/supplier.service.ts`
- Create: `backend/src/modules/inventory/supplier.controller.ts`
- Modify: `backend/src/modules/inventory/inventory.routes.ts`
- Modify: `frontend/src/api/contracts.ts`
- Test: `backend/test/inventory/supplier.api.spec.ts`

**Interfaces:**
- Consumes Prisma `Supplier` from Task 1.
- Produces `GET/POST/PATCH /api/inventory/suppliers`, `SupplierDto` and `SupplierService.findSelectable` for Task 3.

- [ ] **Step 1: Write failing API tests**

```ts
it('creates supplier with a server-generated NCC code and returns it', async () => {
  const response = await request(app).post('/api/inventory/suppliers')
    .set(adminAuth).send({ name: 'Công ty Hoàng Gia' });
  expect(response.status).toBe(201);
  expect(response.body.data.code).toMatch(/^NCC\d{6}$/);
});

it('does not allow an inactive supplier in selectable results', async () => {
  await createSupplier({ name: 'Ngưng dùng', isActive: false });
  const response = await request(app).get('/api/inventory/suppliers?isActive=true').set(adminAuth);
  expect(response.body.data.items.map((item: { name: string }) => item.name)).not.toContain('Ngưng dùng');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run test/inventory/supplier.api.spec.ts` from `backend`.

Expected: FAIL with route not found.

- [ ] **Step 3: Implement schemas, service and controller**

```ts
export const createSupplierSchema = z.object({
  code: z.string().trim().min(2).max(32).optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(120).optional(),
  address: z.string().trim().max(255).optional(),
  taxCode: z.string().trim().max(32).optional(),
  note: z.string().trim().max(1000).optional()
});
```

Generate code inside a transaction by looking up the highest existing `NCC` suffix and retrying unique conflict once. `PATCH` may change profile/isActive but must not hard delete. Log `SUPPLIER_CREATED` and `SUPPLIER_UPDATED` through `AuditService`.

- [ ] **Step 4: Run API tests and backend typecheck**

Run: `npm test -- --run test/inventory/supplier.api.spec.ts` and `npm run typecheck` from `backend`.

Expected: PASS.

- [ ] **Step 5: Commit and push Task 2**

```bash
git add backend/src/modules/inventory/supplier.* backend/src/modules/inventory/inventory.routes.ts backend/test/inventory/supplier.api.spec.ts frontend/src/api/contracts.ts
git commit -m "feat(inventory): add supplier management API"
git push origin pKhanh
```

## Task 3: Purchase receipt command API and inventory ledger posting

**Files:**
- Create: `backend/src/modules/inventory/purchase-receipt.schemas.ts`
- Create: `backend/src/modules/inventory/purchase-receipt.types.ts`
- Create: `backend/src/modules/inventory/purchase-receipt.service.ts`
- Create: `backend/src/modules/inventory/purchase-receipt.controller.ts`
- Modify: `backend/src/modules/inventory/inventory.routes.ts`
- Test: `backend/test/inventory/purchase-receipt.api.spec.ts`
- Test: `backend/test/inventory/purchase-receipt.service.spec.ts`

**Interfaces:**
- Consumes `calculatePurchaseReceiptTotals`, `SupplierService.findSelectable`, `calculateNewWeightedAverageCost`, `emitInventoryChanged`.
- Produces receipt list/detail/create/update/post/cancel endpoints and `PurchaseReceiptService.postReceipt(id, actor)`.

- [ ] **Step 1: Write failing lifecycle and transaction tests**

```ts
it('keeps stock and ledger unchanged while saving a draft', async () => {
  const receipt = await createDraft({ lines: [{ ingredientId, quantity: 3, unitCost: 12000 }] });
  expect(await ingredientStock(ingredientId)).toBe(10);
  expect(await transactionCount(ingredientId)).toBe(0);
  expect(receipt.status).toBe('DRAFT');
});

it('posts each line atomically and rejects a second post', async () => {
  const receipt = await createDraft({ lines: [{ ingredientId, quantity: 3, unitCost: 12000 }] });
  await postReceipt(receipt.id);
  expect(await ingredientStock(ingredientId)).toBe(13);
  expect(await receiptLedgerCount(receipt.id)).toBe(1);
  await expect(postReceipt(receipt.id)).rejects.toMatchObject({ statusCode: 409 });
  expect(await ingredientStock(ingredientId)).toBe(13);
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- --run test/inventory/purchase-receipt.api.spec.ts test/inventory/purchase-receipt.service.spec.ts` from `backend`.

Expected: FAIL because receipt routes/service do not exist.

- [ ] **Step 3: Implement draft commands and post transaction**

```ts
await prisma.$transaction(async (tx) => {
  const receipt = await tx.purchaseReceipt.findUniqueOrThrow({
    where: { id }, include: { lines: { include: { ingredient: true } }, supplier: true }
  });
  if (receipt.status !== 'DRAFT') throw ApiError.conflict('Chỉ phiếu tạm mới có thể hoàn thành');
  const totals = calculatePurchaseReceiptTotals(toCalculationInput(receipt));
  for (const line of receipt.lines) {
    if (!line.ingredient.isActive) throw ApiError.badRequest('Nguyên liệu đã ngừng hoạt động');
    const lineNetAmount = Math.round(line.quantity * line.unitCost) - line.discountAmount;
    const incomingCost = Math.round(lineNetAmount / line.quantity);
    const next = calculateNewWeightedAverageCost({ currentStock: line.ingredient.currentStock, currentCost: line.ingredient.costPerUnit, incomingQty: line.quantity, incomingCost });
    await tx.ingredient.update({ where: { id: line.ingredientId }, data: { currentStock: next.newStock, costPerUnit: next.newCost } });
    await tx.inventoryTransaction.create({ data: { ingredientId: line.ingredientId, purchaseReceiptId: receipt.id, type: 'STOCK_IN', quantity: line.quantity, costAmount: lineNetAmount, note: line.note, createdByUserId: actor.id } });
  }
  await tx.purchaseReceipt.update({ where: { id }, data: { status: 'POSTED', ...totals, postedAt: new Date(), postedByUserId: actor.id } });
});
```

Run `emitInventoryChanged` only after the transaction resolves. `PATCH` and cancel must reject non-draft status. Add audit metadata including receiptCode, supplierId, totals and line count.

- [ ] **Step 4: Run focused tests and inventory regression tests**

Run: `npm test -- --run test/inventory/purchase-receipt.api.spec.ts test/inventory/purchase-receipt.service.spec.ts test/inventory/inventory.service.spec.ts test/inventory/inventory.api.spec.ts` and `npm run typecheck` from `backend`.

Expected: PASS.

- [ ] **Step 5: Commit and push Task 3**

```bash
git add backend/src/modules/inventory/purchase-receipt.* backend/src/modules/inventory/inventory.routes.ts backend/test/inventory/purchase-receipt*.spec.ts
git commit -m "feat(inventory): post purchase receipts to inventory ledger"
git push origin pKhanh
```

## Task 4: Receipt search, export and preview-only Excel import

**Files:**
- Modify: `backend/src/modules/inventory/inventory.excel.ts`
- Create: `backend/src/modules/inventory/purchase-receipt.export.ts`
- Modify: `backend/src/modules/inventory/purchase-receipt.service.ts`
- Modify: `backend/src/modules/inventory/purchase-receipt.controller.ts`
- Test: `backend/test/inventory/purchase-receipt-export.spec.ts`
- Test: `backend/test/inventory/purchase-receipt-import.spec.ts`

**Interfaces:**
- Consumes receipt list query and `xlsx` dependency already installed.
- Produces list filters, `GET /export` and `POST /import/preview` for Task 5/6.

- [ ] **Step 1: Write failing export/import tests**

```ts
it('exports only POSTED receipts inside the selected date range', async () => {
  const response = await request(app).get('/api/inventory/purchase-receipts/export?status=POSTED&from=2026-09-01&to=2026-09-30&format=csv').set(adminAuth);
  expect(response.status).toBe(200);
  expect(response.text).toContain('PN000010');
  expect(response.text).not.toContain('PN000011');
});

it('previews an Excel row without creating stock transactions', async () => {
  const response = await previewPurchaseReceiptFile(validWorkbookBase64);
  expect(response.data.validRows).toHaveLength(1);
  expect(await transactionCount(ingredientId)).toBe(0);
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- --run test/inventory/purchase-receipt-export.spec.ts test/inventory/purchase-receipt-import.spec.ts` from `backend`.

Expected: FAIL with missing export/preview route.

- [ ] **Step 3: Implement filter query, snapshot export and non-mutating preview**

Use Zod `z.coerce.date()` for inclusive `from`/`to`, a comma-separated `statuses` enum list and trimmed `search`. Export columns `Mã phiếu, Thời gian, Nhà cung cấp, Tổng tiền hàng, Giảm giá, Cần trả, Đã trả, Công nợ, Trạng thái`. Extract parser behavior that maps SKU to active Ingredient but do not call `commitExcelStockIn` or write a transaction. Return `{ validRows, errorRows }` with `ingredientId`, snapshot fields, `quantity`, `unitCost` and zero `discountAmount`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run test/inventory/purchase-receipt-export.spec.ts test/inventory/purchase-receipt-import.spec.ts` and `npm run typecheck` from `backend`.

Expected: PASS.

- [ ] **Step 5: Commit and push Task 4**

```bash
git add backend/src/modules/inventory/inventory.excel.ts backend/src/modules/inventory/purchase-receipt.* backend/test/inventory/purchase-receipt-export.spec.ts backend/test/inventory/purchase-receipt-import.spec.ts
git commit -m "feat(inventory): add purchase receipt import and export"
git push origin pKhanh
```

## Task 5: Frontend contracts, API clients and pure view model

**Files:**
- Modify: `frontend/src/api/contracts.ts`
- Create: `frontend/src/api/suppliers.ts`
- Create: `frontend/src/api/purchaseReceipts.ts`
- Create: `frontend/src/features/admin/purchaseReceiptViewModel.ts`
- Test: `frontend/src/api/purchaseReceipts.test.ts`
- Test: `frontend/src/features/admin/purchaseReceiptViewModel.test.ts`

**Interfaces:**
- Consumes endpoints from Tasks 2–4.
- Produces typed `fetchPurchaseReceiptsApi`, `savePurchaseReceiptDraftApi`, `postPurchaseReceiptApi`, `previewPurchaseReceiptImportApi`, and form formatting for Task 6/7.

- [ ] **Step 1: Write failing client and view-model tests**

```ts
it('serializes receipt filters without undefined values', async () => {
  await fetchPurchaseReceiptsApi('token', { status: ['DRAFT', 'POSTED'], page: 2, pageSize: 50 });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.anything());
});

it('derives outstanding amount from payable minus paid', () => {
  expect(getReceiptPaymentSummary({ subtotalAmount: 50000, discountAmount: 5000, paidAmount: 10000 }))
    .toEqual({ payableAmount: 45000, outstandingAmount: 35000 });
});
```

- [ ] **Step 2: Run focused frontend tests to verify failure**

Run: `npm test -- --run src/api/purchaseReceipts.test.ts src/features/admin/purchaseReceiptViewModel.test.ts` from `frontend`.

Expected: FAIL because clients/view model do not exist.

- [ ] **Step 3: Add contracts, authenticated clients and pure formatting**

```ts
export async function postPurchaseReceiptApi(token: string | null, id: number): Promise<PurchaseReceiptDetailDto> {
  return requestJson<PurchaseReceiptDetailDto>(`/api/inventory/purchase-receipts/${id}/post`, token, { method: 'POST' });
}
```

Use existing API base URL and error-envelope behavior. Keep `outstandingAmount` as a response/view-model derived field; do not invent frontend cash state.

- [ ] **Step 4: Run focused tests and frontend typecheck**

Run: `npm test -- --run src/api/purchaseReceipts.test.ts src/features/admin/purchaseReceiptViewModel.test.ts` and `npm run typecheck` from `frontend`.

Expected: focused tests PASS; document any pre-existing unrelated type errors separately.

- [ ] **Step 5: Commit and push Task 5**

```bash
git add frontend/src/api/contracts.ts frontend/src/api/suppliers.ts frontend/src/api/purchaseReceipts.ts frontend/src/api/purchaseReceipts.test.ts frontend/src/features/admin/purchaseReceiptViewModel.*
git commit -m "feat(inventory): add purchase receipt client contracts"
git push origin pKhanh
```

## Task 6: Native receipt list and inventory navigation

**Files:**
- Create: `frontend/src/features/admin/PurchaseReceiptListScreen.tsx`
- Modify: `frontend/src/features/admin/InventoryScreen.tsx`
- Modify: `frontend/src/features/admin/InventoryCatalogScreen.tsx`
- Test: `frontend/src/features/admin/purchaseReceiptListViewModel.test.ts`

**Interfaces:**
- Consumes Task 5 clients and `inventoryRevision` invalidation from RestaurantContext.
- Produces a route-state callback `onCreateReceipt`, `onOpenReceipt(id)` for Task 7.

- [ ] **Step 1: Write failing list view-model test**

```ts
it('shows an overdue draft and formats VND totals for the receipt table', () => {
  expect(getPurchaseReceiptStatusPresentation('DRAFT').label).toBe('Phiếu tạm');
  expect(formatReceiptMoney(1013000)).toBe('1.013.000 đ');
});
```

- [ ] **Step 2: Run focused test to verify failure**

Run: `npm test -- --run src/features/admin/purchaseReceiptListViewModel.test.ts` from `frontend`.

Expected: FAIL because the presentation helpers do not exist.

- [ ] **Step 3: Implement list screen and route state**

Render title/search, date/status filter controls, total payable, paginated table and CSV/XLSX actions. Replace the `Nhập hàng` reserved item with a pressable action. Preserve the legacy ingredient/BOM screen and manual stock-in action; do not remove it. Reload on `inventoryRevision` only when the list is visible.

- [ ] **Step 4: Run focused tests and web bundle**

Run: `npm test -- --run src/features/admin/purchaseReceiptListViewModel.test.ts` and `npm run build` from `frontend`.

Expected: PASS.

- [ ] **Step 5: Commit and push Task 6**

```bash
git add frontend/src/features/admin/PurchaseReceiptListScreen.tsx frontend/src/features/admin/InventoryScreen.tsx frontend/src/features/admin/InventoryCatalogScreen.tsx frontend/src/features/admin/purchaseReceiptListViewModel.test.ts
git commit -m "feat(inventory): add purchase receipt list screen"
git push origin pKhanh
```

## Task 7: Native draft composer, Excel preview and post experience

**Files:**
- Create: `frontend/src/features/admin/PurchaseReceiptComposerScreen.tsx`
- Modify: `frontend/src/features/admin/PurchaseReceiptListScreen.tsx`
- Modify: `frontend/src/features/admin/InventoryScreen.tsx`
- Test: `frontend/src/features/admin/purchaseReceiptComposerViewModel.test.ts`
- Test: `frontend/src/features/admin/purchaseReceiptComposer.test.tsx`

**Interfaces:**
- Consumes Task 5 clients and Task 6 callbacks.
- Produces draft creation/editing, import preview, explicit save/post actions and navigation back to list.

- [ ] **Step 1: Write failing composer tests**

```tsx
it('does not call post when saving a draft', async () => {
  render(<PurchaseReceiptComposerScreen mode="create" onFinished={vi.fn()} />);
  await userEvent.press(screen.getByText('Lưu tạm'));
  expect(savePurchaseReceiptDraftApi).toHaveBeenCalled();
  expect(postPurchaseReceiptApi).not.toHaveBeenCalled();
});

it('requires a supplier and one line before completion', () => {
  expect(validateReceiptForPost({ supplierId: null, lines: [] })).toEqual([
    'Vui lòng chọn nhà cung cấp', 'Phiếu nhập cần ít nhất một nguyên liệu'
  ]);
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- --run src/features/admin/purchaseReceiptComposerViewModel.test.ts src/features/admin/purchaseReceiptComposer.test.tsx` from `frontend`.

Expected: FAIL because composer and validation do not exist.

- [ ] **Step 3: Implement responsive composer**

Use a scrollable left line table and right metadata/payment panel on web; stack panels on narrow layouts. Implement ingredient search, supplier search, duplicate-line merge, local quantity/cost/discount validation, import preview confirmation, draft save and a separate post confirmation. Disable all editable fields while post is pending. After successful post, show success feedback and return to list; refresh comes from the emitted inventory event plus local list reload.

- [ ] **Step 4: Run frontend tests, typecheck and production web export**

Run: `npm test -- --run src/features/admin/purchaseReceiptComposerViewModel.test.ts src/features/admin/purchaseReceiptComposer.test.tsx`; `npm run typecheck`; `npm run build` from `frontend`.

Expected: composer tests and web export PASS; record unrelated existing type errors if present.

- [ ] **Step 5: Run end-to-end regression verification**

Run: `npm test` and `npm run typecheck` from `backend`; `npm test` and `npm run build` from `frontend`.

Expected: all tests PASS; backend typecheck PASS; frontend web bundle PASS.

- [ ] **Step 6: Commit and push Task 7**

```bash
git add frontend/src/features/admin/PurchaseReceiptComposerScreen.tsx frontend/src/features/admin/PurchaseReceiptListScreen.tsx frontend/src/features/admin/InventoryScreen.tsx frontend/src/features/admin/purchaseReceiptComposer*.test.tsx frontend/src/features/admin/purchaseReceiptComposerViewModel.test.ts
git commit -m "feat(inventory): add purchase receipt composer"
git push origin pKhanh
```
