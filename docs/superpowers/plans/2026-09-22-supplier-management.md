# Supplier Management Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; user authorizes design selection and implementation without another approval gate.

**Goal:** Hoàn thiện Nhà cung cấp Native theo ảnh, đồng bộ phiếu nhập và số liệu mua hàng.
**Architecture:** Extend Supplier and add SupplierGroup; isolate report queries and import/export from profile CRUD. Reuse Native form for management and receipt quick-create.
**Tech Stack:** Prisma/MySQL, Express/Zod, XLSX, React Native/Expo, Vitest/Supertest.
**Spec:** docs/superpowers/specs/2026-09-22-supplier-management-design.md

## Global Constraints

- Giữ checkout pKhanh hiện tại; additive migration; ADMIN endpoints; no hard delete.
- Chỉ POSTED đóng góp thống kê; date filter chỉ cho tổng mua, outstanding luôn toàn thời gian.
- Nhập tự do địa chỉ, optional email/phone, reusable Native form, file operations Web adapter.
- Không thêm sổ thanh toán/công nợ độc lập. Không ghi CCCD/email/địa chỉ vào audit.

## Review Focus

- Profile: xóa email và nhóm phải lưu null, không giữ dữ liệu cũ.
- Stats: nhà cung cấp không mua vẫn hiện; tiền lọc trước phân trang; tổng không chỉ trang hiện tại.
- Import: duplicate trong file và DB, cạnh tranh ghi sau preview; tất cả rollback.
- UI: request tìm kiếm cũ không ghi đè mới, lưu thất bại giữ form, gửi trùng bị chặn.
- Receipt integration: chọn NCC vừa tạo và giữ nguyên dòng phiếu; NCC ngừng hoạt động bị loại khỏi tìm kiếm.

## Task 1: Profile and groups

Files: backend/prisma/schema.prisma; migrations/20260922150000_supplier_management/migration.sql; supplier.schemas.ts, supplier.service.ts, supplier.controller.ts, inventory.routes.ts, inventory.events.ts; backend/test/inventory/supplier-management.api.spec.ts; test/helpers/database.ts.
Interfaces: SupplierDto extended nullable profile fields and group {id,name}; groups list/create/update; SUPPLIER_UPDATED inventory event.
- [x] RED: add API test POST group then POST supplier with identityNumber/companyName/groupId, PATCH clear email/group, assert persisted fields. e.g. expect(created.body.data).toMatchObject({identityNumber:'012345678901', companyName:'Công ty A'}).
- [x] Run backend npm test -- --run test/inventory/supplier-management.api.spec.ts; expected missing endpoints/fields.
- [x] GREEN: additive model/migration, schemas trim/null, group existence checks, unique conflict, DTO include, audit/events; apply migration to dev/test without reset.
- [x] Run supplier.api.spec.ts plus new suite and backend typecheck; expected pass. Record verification.

## Task 2: Statistics, history, import/export

Files: supplier-report.service.ts, supplier-transfer.service.ts, supplier.schemas.ts/controller/routes; backend/test/inventory/supplier-management.api.spec.ts.
Interfaces: GET list returns items with totalPurchase/outstandingAmount, summary; detail and receipts; preview {validRows,errorRows}; commit {createdCount}.
- [x] RED: create POSTED 100000 subtotal, 10000 discount, 30000 paid; DRAFT ignored; assert totalPurchase 90000/outstanding 60000. Filter date outside posted => totalPurchase 0/outstanding 60000. Add pagination summary, permissions, import no-write and atomic conflict checks.
- [x] Run suite; expected missing totals and endpoints.
- [x] GREEN: parameterized SQL grouped receipt aggregation, outer monetary filters, summary over full match; detail/receipt pagination; template/preview validation, transactional create-only import, XLSX/CSV export text protection.
- [x] Run supplier and receipt suites; expected pass. Record verification.

## Task 3: Native form and data layer

Files: frontend/src/api/contracts.ts, suppliers.ts; frontend/src/features/admin/SupplierFormModal.tsx, supplierViewModel.ts, supplierForm.test.tsx, frontend/src/api/suppliers.test.ts.
Interfaces: SupplierFormModal {visible,supplier?,onClose,onSaved}; onSaved(SupplierDto); fetchSupplierGroupsApi/fetchSupplierDetailApi/fetchSupplierReceiptsApi and transfer API helpers.
- [x] RED: render form, enter required name and optional fields, simulate save failure then success; assert payload clears optional fields, onSaved selected result, validation prevents invalid email; API filters encode groupId=0 and minPurchase=0.
- [x] Run frontend focused suites; expected absent new behavior.
- [x] GREEN: typed optional backward-compatible DTO additions, shared form two/one columns, accordions, group creation, errors/loading; do not submit duplicate; date range view model validates real YYYY-MM-DD.
- [x] Run frontend focused suites; expected pass.

## Task 4: List, transfer UI and receipt integration

Files: SupplierListScreen.tsx, SupplierDetailModal.tsx, SupplierImportModal.tsx, supplierFiles.ts; InventoryScreen.tsx, InventoryCatalogScreen.tsx, PurchaseReceiptComposerScreen.tsx; purchaseReceiptComposer.test.tsx.
Interfaces: SupplierListScreen {onOpenReceipt(id)}; shared form callback selects newly created supplier; inventoryRevision triggers refresh.
- [x] RED: receipt component integration test creates/selects NCC while preserving a line; assert draft payload has new supplier id and original ingredient quantity.
- [x] Run frontend test for receipt; expected no quick-create action.
- [x] GREEN: activate supplier nav; filters and summary/pagination; selected export, import preview/commit/template, column toggles; detail/history; quick-create, server search and response cancellation in receipts.
- [x] Run full frontend suite, targeted backend suites, typecheck/build, git diff --check. Run backend full suite once; capture baseline failures by name.
- [x] Separate self-review: contracts, permissions, stat signs/dates, migration, async loading/dirty form, report limitations. Record results here and commit scoped files with spec/plan.

## Execution record

Baseline 5e1502b, clean pKhanh. Skills applied as a working method; prior instruction to proceed without questions overrides skill approval gates. Native execution in current checkout per session preference; manual plan tracking instead of Bash-only skill scripts on Windows. No independent reviewer tool available.

### Implementation and verification — 2026-09-22

- Observed RED for new supplier API fields/endpoints, Native form/view-model/API tests, and receipt quick-create integration before implementing the corresponding behavior; targeted suites subsequently GREEN.
- Backend full suite: 328/333 tests pass (46/49 files). All 12 supplier tests and all 42 purchase-receipt tests pass. Five unrelated existing failures: order-idempotency (3), table-order-consistency (1), order-modifiers (1); their mocked transaction client lacks priceList.findFirst used by PriceListService. No order or price-list files changed.
- Backend typecheck and build pass. Backend full lint remains blocked by existing inventory-check.service.ts prefer-const error; existing unused-type/parameter warnings remain outside this change.
- Frontend full suite: 98/98 tests, 31 files pass. Targeted ESLint for supplier files and modified purchase receipt composer passes. Full frontend typecheck reports only pre-existing priceList.ts, PriceListScreen.tsx, PriceListImportModal.tsx errors; no supplier errors.
- Expo Web production export passes. Playwright supplier smoke: 2/2 projects pass, Desktop Chrome and Mobile Layout; additionally checks 1920px desktop, 250px sidebar, no page horizontal overflow, scrollable table and save footer in viewport. API fixtures isolate this smoke from real database writes. Corrected fixture contracts for orders/catalog; visual screenshots inspected after disabling capture-time animation.
- Expo export --platform all also passes (Web, iOS Hermes and Android Hermes bundles). Initial Native export revealed react-native-svg imports buffer but the installed tree lacked it. Added explicit buffer 5.7.1 dependency using the existing locked version, synchronized dependencies offline with lifecycle scripts disabled; only one dependency entry changed in each package manifest/lockfile. Re-ran frontend 98/98, supplier API 12/12, backend typecheck/build successfully afterward. Native compilation is verified, not device runtime behavior.
- Visual review found flex growth in the filter sidebar and mobile action toolbar overflow. Fixed Native flex constraints, then verified green browser regression checks. Table uses measured available width and retains horizontal scrolling at narrow widths. Core form and screens use React Native components and existing theme; no KiotViet branding copied.
- Migration: dev database was missing the old Supplier/PurchaseReceipt tables, although the test database already contained them. Read-only schema inspection confirmed the difference; applied the existing purchase-receipt migration to dev, then this additive supplier migration to dev/test and recorded them as applied. Initial attempt had created SupplierGroup before failing on missing Supplier; CREATE TABLE IF NOT EXISTS safely resumed that exact partial state. No database reset or deletion of business data.
- Separate self-review covered route ordering and ADMIN middleware, optional field clearing, immutable code, status/history preservation, POSTED-only net sums and Vietnam date boundaries, monetary filtering before pagination, atomic duplicate rollback, export formula protection, shared quick-create state preservation and async stale-response guards. No independent reviewer was available. No unresolved supplier-specific blocker found.
- Scope boundaries retained: phone/email optional; address components free-text; outstanding is receipt-derived, not a complete payable ledger; file transfer Web-only; no native device/emulator runtime test yet. New functionality does not mutate inventory stock.
- git diff --check passes. Delivery is a scoped local feature commit on pKhanh; no remote push requested for this new feature.
