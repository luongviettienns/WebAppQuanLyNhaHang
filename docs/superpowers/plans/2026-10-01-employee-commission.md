# Employee Commission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng Bảng hoa hồng nhân viên hoàn chỉnh, từ cấu hình rule theo món, gán nhân viên ở POS, ledger snapshot khi thanh toán/trả hàng/đổi người đến phân bổ vào bảng lương và giao diện Admin responsive.

**Architecture:** Backend thêm module `employee-commissions` với domain math thuần, Prisma persistence và service recognition dùng cùng transaction của payment/return. `CommissionSaleBasis` khóa căn cứ tại `PAID`; `CommissionEntry` append-only là nguồn tài chính; payroll dùng allocation events append-only. Frontend thêm API/view model/screen riêng, một revision realtime riêng và assignee nullable trên từng cart row.

**Tech Stack:** TypeScript, Express, Prisma/MySQL, Zod, Vitest/Supertest, React Native Web/Expo, react-test-renderer, Socket.IO.

**Spec:** `docs/superpowers/specs/2026-10-01-employee-commission-design.md`

## Global Constraints

- Không suy đoán người hưởng từ cashier/manager; `commissionEmployeeId` luôn nullable.
- Ba rule MVP: `FIXED_PER_UNIT`, `PERCENT_NET_REVENUE`, `PERCENT_GROSS_PROFIT`.
- Dùng integer VND và round-half-up; không dùng floating `Math.round()` cho percentage commission.
- Sale basis được tạo trong transaction chuyển order sang `PAID`; late recognition không đọc BOM/rule hiện tại.
- Ledger, basis, resolution và payroll allocation là append-only; không sửa lịch sử finalized.
- Return/reassignment khóa ownership chain; event key return chỉ theo return line.
- Mọi DB integration/migration test chỉ chạy với `TEST_DATABASE_URL` đã guard; không reset/seed DEV.
- Socket chỉ emit sau commit. Không push hoặc apply DEV migration nếu chưa có yêu cầu riêng.
- UI dùng theme/primitives Crispy Bite, không sao chép branding KiotViet; responsive và keyboard accessible.

## Review Focus

- Hai payment requests hoặc retry cùng event phải chỉ tạo một basis/earning; Task 4 có concurrency/idempotency tests.
- Return xảy ra trước late assignment phải giảm recognizable quantity, kể cả return hết; Task 4 có queued-return tests.
- Chuỗi nhiều reassignment xen partial return phải trừ current owner; Task 4 có ownership-chain test.
- Rule/BOM thay đổi sau sale không được đổi late recognition; Task 4 có historical-basis tests.
- Negative commission vượt payable kỳ hiện tại không được mất; Task 5 có partial allocation/carry-forward tests.

---

### Task 1: Commission domain math and ownership rules

**Files:**
- Create: `backend/src/modules/employee-commissions/employee-commission.domain.ts`
- Create: `backend/src/modules/employee-commissions/employee-commission.domain.spec.ts`

**Interfaces:**
- Produces: `allocateDiscountLargestRemainder(lines, discount)`, `calculateCommissionSnapshot(input)`, `prorateSnapshot(total, quantity, totalQuantity, alreadyConsumed)`, `resolveCurrentOwner(entries)`.
- Consumes: integer VND, basis points and signed entry DTOs only; no Prisma dependency.

- [ ] **Step 1: Write failing domain tests** for deterministic discount allocation/tie-break, exact `.5` half-up, all three rule types, missing profit cost, last-remainder proration and current owner after `EARNING → REASSIGN → RETURN`.
- [ ] **Step 2: Run RED** with `npm test -- --run src/modules/employee-commissions/employee-commission.domain.spec.ts` in `backend`; expect module/import failures.
- [ ] **Step 3: Implement minimal pure functions** with integer numerator/denominator and explicit conflict results.
- [ ] **Step 4: Run GREEN** on the same file; expect all domain tests pass.
- [ ] **Step 5: Commit** `feat(commission): add domain calculations`.

### Task 2: Additive Prisma schema and guarded migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261001100000_employee_commissions/migration.sql`
- Create: `backend/src/modules/employee-commissions/employee-commission.schema.spec.ts`
- Modify: `backend/test/helpers/database.ts`

**Interfaces:**
- Produces Prisma models/enums: `CommissionPlan`, `CommissionPlanEmployee`, `CommissionRule`, `CommissionSaleBasis`, `CommissionBasisResolution`, `CommissionRecognitionIssue`, `CommissionEntry`, `CommissionPayrollAllocation`; nullable `OrderItem.commissionEmployeeId`; payroll commission totals.
- Consumed by Tasks 3–5 through generated Prisma client.

- [ ] **Step 1: Write failing schema contract test** asserting nullable assignment, required unique event keys, ownership relations, issue fields, allocation event fields and payroll extensions.
- [ ] **Step 2: Run RED**; expect missing schema models/fields.
- [ ] **Step 3: Modify Prisma schema and add forward-only SQL migration** with indexes/FKs/enum values; extend cleanup order before Employee/Order/Payroll parents.
- [ ] **Step 4: Run `npm run prisma:generate --workspace=backend`, Prisma validate and schema test**; expect pass.
- [ ] **Step 5: Apply migration only through guarded TEST migration command**, then verify table/index presence with integration test; never use `DATABASE_URL` fallback.
- [ ] **Step 6: Commit** `feat(commission): add persistence schema`.

### Task 3: Configuration, workspace, issue and ledger APIs

**Files:**
- Create: `backend/src/modules/employee-commissions/employee-commission.schemas.ts`
- Create: `backend/src/modules/employee-commissions/employee-commission.query.service.ts`
- Create: `backend/src/modules/employee-commissions/employee-commission.mutation.service.ts`
- Create: `backend/src/modules/employee-commissions/employee-commission.controller.ts`
- Create: `backend/src/modules/employee-commissions/employee-commission.routes.ts`
- Create: `backend/test/employee-commissions/employee-commission-config.api.spec.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Produces Admin endpoints under `/api/employee-commissions` for workspace, plans, rule versions, employee assignments, issues, sale-basis resolutions, ledger and reassign.
- Produces Cashier/Admin `GET /assignees` and pre-recognition assignment endpoint.
- Consumes Task 1 validation/math and Task 2 Prisma models.

- [ ] **Step 1: Write failing API tests** for Admin authorization, Cashier minimal assignee DTO, nullable assignment, plan/rule validation, overlap conflict, audit, pagination/filtering and post-commit realtime.
- [ ] **Step 2: Run RED**; expect 404/missing module.
- [ ] **Step 3: Implement Zod parsing, query projections and atomic mutations** following existing workforce conventions; close previous inclusive effective range at `D-1` and reject remaining overlap.
- [ ] **Step 4: Run GREEN** for config API plus employee/settings authorization regression.
- [ ] **Step 5: Commit** `feat(commission): add configuration APIs`.

### Task 4: Payment recognition, queued returns and ownership ledger

**Files:**
- Create: `backend/src/modules/employee-commissions/employee-commission.recognition.service.ts`
- Create: `backend/test/employee-commissions/employee-commission-recognition.api.spec.ts`
- Modify: `backend/src/modules/orders/orders.schemas.ts`
- Modify: `backend/src/modules/orders/orders.service.ts`
- Modify: `backend/src/modules/orders/sales-return.service.ts`

**Interfaces:**
- Produces `recognizePaidOrder(tx, orderId, occurredAt, actor?)`, `retrySaleBasis(tx, saleBasisId, actor)`, `reverseReturn(tx, orderReturnId, actor)`, `reassignOrderItem(input, actor)`.
- Consumes Task 1 math/ownership and Task 2 persistence; called inside all three existing PAID transitions and sales-return transaction.

- [ ] **Step 1: Write failing integration tests** for nullable employee create payload, three PAID paths, unique basis/earning retry, missing employee/rule/cost issues, queued partial/full return, historical rule/BOM snapshot, override audit and multi-generation owner return.
- [ ] **Step 2: Run RED**; expect missing basis/entries and payload rejection.
- [ ] **Step 3: Implement sale-basis capture and recognition** inside existing payment transactions; lock order/items in stable order and emit only after commit.
- [ ] **Step 4: Implement return/reassignment ledger operations** with fixed return-line event key, direct-owner bounds, reason/actor and conflict issue.
- [ ] **Step 5: Run GREEN** for commission recognition plus all existing payment/reservation/return suites.
- [ ] **Step 6: Commit** `feat(commission): recognize sales and reversals`.

### Task 5: Payroll allocation and immutable release history

**Files:**
- Create: `backend/src/modules/employee-commissions/employee-commission.payroll.ts`
- Create: `backend/src/modules/employee-commissions/employee-commission.payroll.spec.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.mutation.service.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.query.service.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.export.ts`
- Modify: relevant payroll tests under `backend/src/modules/employee-payroll` and `backend/test/employee-payroll`.

**Interfaces:**
- Produces `reserveCommissionForPayroll(tx, batch, lines)`, `finalizeCommissionAllocations`, `releaseCommissionAllocations`; returns applied commission, deferred debit and source IDs by employee.
- Consumes unallocated signed `CommissionEntry` amounts ordered by accounting date/id.

- [ ] **Step 1: Write failing payroll tests** for positive allocation, partial negative cap, next-period remainder, recalculate release/re-reserve, finalized unpaid cancellation release, paid cancellation rejection and finalized immutability.
- [ ] **Step 2: Run RED**; expect missing commission fields/allocations.
- [ ] **Step 3: Implement allocator and integrate create/recalculate/finalize/cancel** in the same payroll transactions; update query/export snapshots.
- [ ] **Step 4: Run GREEN** for allocator and all payroll suites.
- [ ] **Step 5: Commit** `feat(commission): integrate payroll allocations`.

### Task 6: Frontend contracts, API, view model and realtime

**Files:**
- Create: `frontend/src/api/employeeCommissions.ts`
- Create: `frontend/src/api/employeeCommissions.test.ts`
- Create: `frontend/src/features/admin/employeeCommissionViewModel.ts`
- Create: `frontend/src/features/admin/employeeCommissionViewModel.test.ts`
- Create: `frontend/src/lib/employeeCommissionRealtime.ts`
- Create: `frontend/src/lib/employeeCommissionRealtime.test.ts`
- Modify: `frontend/src/contexts/RestaurantContext.tsx`

**Interfaces:**
- Produces typed workspace/plan/rule/issue/ledger/assignee DTOs, API calls, formatting/filter helpers and `employeeCommissionRevision`.
- Consumed by Tasks 7–8.

- [ ] **Step 1: Write failing API/view-model/realtime tests** for URL/query/body contracts, signed currency labels, rule cell labels, conflict/empty states and monotonic socket revision.
- [ ] **Step 2: Run RED**; expect missing modules.
- [ ] **Step 3: Implement minimal typed modules and RestaurantContext subscription** preserving current modal state on invalidation.
- [ ] **Step 4: Run GREEN** for focused frontend tests and existing realtime helpers.
- [ ] **Step 5: Commit** `feat(commission): add frontend contracts`.

### Task 7: Responsive Admin commission workspace

**Files:**
- Create: `frontend/src/features/admin/EmployeeCommissionScreen.tsx`
- Create: `frontend/src/features/admin/EmployeeCommissionScreen.test.tsx`
- Create focused form/detail components only when the screen tests require them.
- Modify: `frontend/src/features/admin/EmployeeWorkspaceScreen.tsx`
- Modify: `frontend/src/features/admin/employeeWorkspaceScreen.test.tsx`

**Interfaces:**
- Consumes Task 6 API/view model/revision.
- Produces the `Bảng hoa hồng` tab between payroll and settings; item/employee matrices, sidebar/drawer, plan/rule forms, queues and read-only ledger.

- [ ] **Step 1: Write failing workspace/screen tests** for tab order, item/employee mode, filters, plan/rule edit flow, unassigned/issues, ledger/reassign, loading/error/empty and compact drawer.
- [ ] **Step 2: Run RED**; expect missing tab/screen.
- [ ] **Step 3: Implement screen using existing Crispy Bite tokens**. Design direction: cool canvas, white operational surfaces, blue-green financial accents, compact matrix density, one distinctive vertical plan rail; no decorative gradients/cards.
- [ ] **Step 4: Run GREEN** for screen/workspace and accessibility assertions.
- [ ] **Step 5: Commit** `feat(commission): add admin workspace`.

### Task 8: POS per-line assignee and QR-safe payload

**Files:**
- Modify: `frontend/src/api/contracts.ts`
- Modify: `frontend/src/contexts/RestaurantContext.tsx`
- Modify: staff POS cart component(s) found by the Task 8 brief.
- Create/modify focused cart/POS tests.

**Interfaces:**
- Consumes Task 3 assignee endpoint and Task 6 client.
- Produces nullable `commissionEmployeeId` per cart row/create payload; rows with different assignees never merge; QR remains null.

- [ ] **Step 1: Write failing tests** for safe default, explicit null, manual employee selection, row merge identity and QR payload omission/null.
- [ ] **Step 2: Run RED**; expect missing field/control.
- [ ] **Step 3: Implement CartItem/payload/control changes** only on authenticated staff surfaces.
- [ ] **Step 4: Run GREEN** for POS/QR/order contracts and regressions.
- [ ] **Step 5: Commit** `feat(commission): assign POS order lines`.

### Task 9: Whole-system verification and acceptance hardening

**Files:**
- Modify only files required by RED acceptance tests or review findings.
- Update: `task_plan.md`, `findings.md`, `progress.md` (ignored working memory).

**Interfaces:**
- Consumes all prior tasks; produces a verified branch ready for explicit DEV migration/push decision.

- [ ] **Step 1: Add any missing acceptance test** found by requirement audit before fixing behavior.
- [ ] **Step 2: Run commission-focused backend/frontend suites, then all backend and frontend tests serially**; record exact counts/failures.
- [ ] **Step 3: Run Prisma validate/migration status on TEST, typecheck, focused lint, production builds, `git diff --check` and secret scan**.
- [ ] **Step 4: Perform whole-branch code review against spec and Review Focus; fix Critical/Important findings via RED→GREEN, ledger minors/rulings**.
- [ ] **Step 5: Commit** `test(commission): complete acceptance verification` when a verification/fix diff exists.

## Self-review result

- Spec coverage: all 17 sections map to Tasks 1–9; manual generic correction remains intentionally outside MVP.
- Shared interfaces: domain math → recognition/payroll; Prisma models → all backend tasks; API/view model → UI/POS; names are consistent above.
- Risk coverage: exactly-once, queued return, current-owner reversal, historical basis and negative payroll carry-forward each have an owning RED test.
- Execution: user explicitly requested inline implementation now, so execution proceeds without another approval stop. The current clean feature branch `pKhanh` is used in place; no unrequested linked worktree is created.
