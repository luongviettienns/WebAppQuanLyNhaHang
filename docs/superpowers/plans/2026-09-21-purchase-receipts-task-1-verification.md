# Task 1 — Data foundation verification

Scope: Task 1 only, starting from `555b406` on `pKhanh`. Stop after commit/push for user review.

## Delivered

- Supplier, PurchaseReceipt, PurchaseReceiptLine, PurchaseReceiptStatus and additive MySQL migration `20260921010000_add_purchase_receipts`.
- Nullable supplier on drafts; nullable receipt reference for legacy InventoryTransaction rows; unique supplier/receipt codes, unique receipt/ingredient pair and Restrict foreign keys protecting referenced data.
- Snapshot fields, fractional quantities, timestamps, payment metadata. No stored duplicate payable/outstanding balances.
- Pure `calculatePurchaseReceiptTotals`, with decimal half-up rounding per line, both discount levels, outstanding amount and finite/range validation.
- Backend/frontend `PURCHASE_RECEIPT_POSTED` event type only; no new emit call, API, UI or stock mutation command.

## Evidence

- Math test initially failed because the new module was missing.
- Additional decimal-boundary regression failed with 100 instead of 101 for `1.005 × 100`; fixed with exact decimal multiplication before rounding.
- 21 math tests pass.
- 4 real MySQL schema tests failed before migration (missing tables/column) and passed afterward. Tests roll back their own fixtures without truncating existing data.
- Prisma client generation and schema validation pass; backend `npm run typecheck` passes.
- Full backend `npm test`: **261 passed, 5 failed, 266 total** across 33 files (30 passed, 3 failed). All new tests pass. Failures are in unchanged order tests whose transaction mocks omit `priceList.findFirst`:
  - `test/orders/order-idempotency.spec.ts`: guest scope/hash, staff scope/hash, retry same scoped key/payload (3 failures).
  - `test/orders/table-order-consistency.spec.ts`: lock table before creating another order (1 failure).
  - `test/orders/order-modifiers.spec.ts`: use DB modifier prices/names (1 failure).
  - Shared stack: `PriceListService.getGeneralPriceList` -> `OrdersService.createOrder`; these production files are unchanged by Task 1. No claim that the full suite is green.

## Migration and operational boundary

SQL was generated from the baseline/current schema difference and executed successfully **only on localhost `crispy_bite_test`**, after verifying it differs from the application database. Prisma migration status already showed a pending older general-price-list migration despite its tables being present. Therefore only the new SQL was tested with `prisma db execute`; migration history was not rewritten or marked applied.

The application database has **not** been migrated. Apply the additive migration through the project's migration workflow before running the application with the regenerated client. No reset, seed or data deletion was performed on the application database. The existing full integration suite resets its separate test fixtures as usual.

## Implementation rulings and next-task notes

- Keep the existing clean `pKhanh` checkout and established push target for this single task. User's stop-after-each-task instruction overrides the skill's continuous-execution default.
- Money fields/results are limited to 0–2,147,483,647 VND to match MySQL Int. This rejects out-of-range receipts rather than failing at persistence; larger values require a future schema decision.
- Notes use VARCHAR(1000), supplier address VARCHAR(255), matching the documented limits instead of Prisma's default VARCHAR(191).
- Decimal multiplication replaces the illustrative `Math.round(quantity * unitCost)` expression; this changes only erroneous half-VND boundary results and keeps the public totals interface.
- Future Task 3 must persist only subtotal/discount/paid fields, not spread derived totals into Prisma update data. It must also conditionally claim the draft and serialize inventory updates; the illustrative transaction in the plan does not yet implement concurrency control.
- Self-review covered schema/migration parity, nullable compatibility, rounding, overflow, foreign keys and test isolation. No independent reviewer was dispatched for this single task.

Task 2 has not started.
