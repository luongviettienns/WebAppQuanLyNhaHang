# Employee Payroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Admin-only monthly payroll workspace that calculates from effective compensation and actual attendance, freezes auditable snapshots, and supports finalization, adjustments, payments, exports and realtime UI updates.

**Architecture:** Add branch-aware payroll batch/line/ledger persistence and keep all arithmetic in a pure calculation module. Backend query, mutation, payment and export services remain separate; every mutation is transactional and emits invalidation only after commit. Frontend uses a typed client, pure view model, dedicated list/create/detail components and the existing employee workspace/realtime revision pattern.

**Tech Stack:** TypeScript, Express, Prisma/MySQL, Zod, Vitest/Supertest, React Native/Expo Web, Socket.IO, SheetJS (`xlsx`).

**Spec:** `docs/superpowers/specs/2026-09-30-employee-payroll-design.md`

## Global Constraints

- Business dates use `Asia/Ho_Chi_Minh`; sessions belong to the period by check-in business date.
- MVP supports only complete calendar-month periods and VND integer results.
- Actual timestamps never fall back to planned schedule timestamps.
- Finalized payroll is immutable; later source changes never rewrite its snapshot.
- `MISSING_CHECK_OUT`, `ATTENDANCE_NEEDS_REVIEW`, `INVALID_ATTENDANCE_DURATION`, and `COMPENSATION_MISSING` block finalization.
- Batch create/recalculate is atomic across all selected employees; no partial subset persists.
- All routes require `ADMIN`; server ignores client-supplied totals.
- Audit writes share the business transaction; realtime emits only after commit.
- Migrations run only on verified `TEST_DATABASE_URL` during implementation. Never reset/drop/seed or migrate `DATABASE_URL` without explicit rollout authorization.
- Keep real bank details, attendance codes and national IDs out of list responses, logs and source control.

## Review Focus

1. Mid-month hire/resignation and multiple compensation-term changes must prorate/select the correct term without double-counting; Task 1 pins this with mixed-term domain tests.
2. Overnight sessions near the `Asia/Ho_Chi_Minh` month boundary must belong to the check-in business date; Tasks 1 and 5 pin the boundary.
3. Two overlapping batch-create requests must serialize so only one commits; Task 5 includes a real MySQL concurrency test.
4. Blocked attendance or missing compensation must persist a complete `DRAFT` snapshot but reject finalization; Tasks 5 and 6 cover both state and rollback behavior.
5. Concurrent/retried payments must neither overpay nor duplicate ledger entries; Task 7 covers row locks, idempotent replay and key-reuse conflicts.

---

## File structure

### Backend

- `backend/src/modules/employee-payroll/employee-payroll.calculation.ts` — pure date/formula/warning engine.
- `backend/src/modules/employee-payroll/employee-payroll.schemas.ts` — Zod route/query/body contracts.
- `backend/src/modules/employee-payroll/employee-payroll.query.service.ts` — list/detail and full-result summaries.
- `backend/src/modules/employee-payroll/employee-payroll.mutation.service.ts` — create, recalculate, adjust, finalize and cancel.
- `backend/src/modules/employee-payroll/employee-payroll.payment.service.ts` — payment and reversal locking/idempotency.
- `backend/src/modules/employee-payroll/employee-payroll.export.ts` — CSV/XLSX serialization.
- `backend/src/modules/employee-payroll/employee-payroll.controller.ts` — HTTP mapping and attachment response.
- `backend/src/modules/employee-payroll/employee-payroll.routes.ts` — Admin-only routing.

### Frontend

- `frontend/src/api/employeePayroll.ts` — DTOs and API calls.
- `frontend/src/features/admin/employeePayrollViewModel.ts` — labels, money/time formatting, period defaults and expansion projections.
- `frontend/src/features/admin/EmployeePayrollCreateModal.tsx` — complete-month and employee-scope form.
- `frontend/src/features/admin/EmployeePayrollDetail.tsx` — expanded employee lines, warnings, ledgers and actions.
- `frontend/src/features/admin/EmployeePayrollScreen.tsx` — list/filter/search/pagination/summary/export orchestration.
- `frontend/src/lib/employeePayrollRealtime.ts` — socket event guard and revision extraction.

---

### Task 1: Pure payroll calculation domain

**Files:**
- Create: `backend/src/modules/employee-payroll/employee-payroll.calculation.ts`
- Test: `backend/src/modules/employee-payroll/employee-payroll.calculation.spec.ts`

**Interfaces:**
- Produces: `getPayrollMonthBounds(month: string): { periodStart: string; periodEnd: string; calendarDays: number }`
- Produces: `calculatePayrollLine(input: PayrollCalculationInput): PayrollCalculationResult`
- `PayrollCalculationInput` contains employee employment bounds, effective terms, actual sessions, absence count and business timezone.
- `PayrollCalculationResult` contains source snapshot, active days, completed sessions, actual minutes, gross amount, warning codes and `READY | REVIEW_REQUIRED`.

- [ ] **Step 1: Write RED month/date tests** asserting leap-month bounds, rejection of malformed months, hire/resignation intersection and overnight ownership by check-in business date.
- [ ] **Step 2: Run** `npm test -- src/modules/employee-payroll/employee-payroll.calculation.spec.ts` from `backend`; expect missing-module failure.
- [ ] **Step 3: Implement month validation, employment intersection and `Asia/Ho_Chi_Minh` business-date helpers.**
- [ ] **Step 4: Write RED formula tests** for full monthly salary, partial monthly proration, mid-month monthly rate change, hourly minutes, per-shift sessions, mixed bases and line-level rounding.
- [ ] **Step 5: Implement `calculatePayrollLine`** using latest-effective term per day/session and no planned-time fallback.
- [ ] **Step 6: Write RED warning tests** for missing compensation, missing checkout, review status, non-positive duration, unscheduled informational warning and confirmed absence informational warning.
- [ ] **Step 7: Implement stable warning ordering and `REVIEW_REQUIRED` classification.**
- [ ] **Step 8: Run focused tests and backend typecheck; expect all green.**
- [ ] **Step 9: Commit** `feat(payroll): add payroll calculation domain`.

### Task 2: Additive payroll schema and TEST migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260930100000_employee_payroll/migration.sql`
- Modify: `backend/test/helpers/database.ts`
- Create: `backend/src/modules/employee-payroll/employee-payroll.schema.spec.ts`
- Create: `backend/test/employee-payroll/employee-payroll-schema.api.spec.ts`

**Interfaces:**
- Produces Prisma models: `EmployeePayrollBatch`, `EmployeePayrollLine`, `EmployeePayrollAdjustment`, `EmployeePayrollPayment`, `EmployeePayrollIdempotency`.
- Produces enums and relations exactly matching the approved spec; stores `warningCodes` and `sourceSnapshot` as JSON.

- [ ] **Step 1: Write RED static schema/migration tests** for models, enums, branch/user/employee relations, indexes, foreign keys and default `MAIN` compatibility.
- [ ] **Step 2: Run the static test; expect missing payroll schema failure.**
- [ ] **Step 3: Add Prisma models/enums and hand-written additive migration.** Include unique batch code, line-per-employee uniqueness, period indexes, ledger indexes and idempotency uniqueness `(actorId, operation, idempotencyKey)`.
- [ ] **Step 4: Update TEST truncation order** so idempotency, payment, adjustment, line and batch tables clear before Employee/Branch/User.
- [ ] **Step 5: Validate with** `npx prisma validate` using a process-only valid datasource.
- [ ] **Step 6: Run guarded TEST migration** via `npm run prisma:migrate:test`; verify the wrapper names only the dedicated test database.
- [ ] **Step 7: Write RED/GREEN persistence tests** for frozen JSON, ledger foreign keys, unique employee line and default branch relation.
- [ ] **Step 8: Run schema API tests and `prisma migrate status` against TEST; expect up-to-date.**
- [ ] **Step 9: Commit** `feat(payroll): add payroll persistence foundation`.

### Task 3: Route contracts, authorization and error codes

**Files:**
- Create: `backend/src/modules/employee-payroll/employee-payroll.schemas.ts`
- Modify: `backend/src/lib/api-error.ts`
- Create: `backend/src/modules/employee-payroll/employee-payroll.schemas.spec.ts`

**Interfaces:**
- Produces parsers for list filters, batch ID, create/recalculate/finalize/cancel, adjustment/payment/reversal and export format.
- Produces error codes: `PAYROLL_PERIOD_INVALID`, `PAYROLL_OVERLAP`, `PAYROLL_COMPENSATION_MISSING`, `PAYROLL_ATTENDANCE_UNRESOLVED`, `PAYROLL_STATE_INVALID`, `PAYROLL_PAYMENT_EXCEEDS_REMAINING`, `PAYROLL_IDEMPOTENCY_KEY_REUSED`.

- [ ] **Step 1: Write RED parser tests** for exact calendar month, all/custom employee selection, non-empty custom IDs, positive amounts, required reasons and 128-character idempotency keys.
- [ ] **Step 2: Implement schemas and stable error mapping.**
- [ ] **Step 3: Run schema tests and backend typecheck; expect green.**
- [ ] **Step 4: Commit** `feat(payroll): add payroll API contracts`.

### Task 4: Payroll list, detail and export read models

**Files:**
- Create: `backend/src/modules/employee-payroll/employee-payroll.query.service.ts`
- Create: `backend/src/modules/employee-payroll/employee-payroll.export.ts`
- Create: `backend/src/modules/employee-payroll/employee-payroll.controller.ts`
- Create: `backend/src/modules/employee-payroll/employee-payroll.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/src/modules/employee-payroll/employee-payroll.query.service.spec.ts`
- Create: `backend/test/employee-payroll/employee-payroll-auth.api.spec.ts`
- Create: `backend/test/employee-payroll/employee-payroll-query.api.spec.ts`

**Interfaces:**
- Produces `EmployeePayrollQueryService.list(query)` with paged rows and full-filter summary.
- Produces `EmployeePayrollQueryService.detail(batchId)` with line snapshots, active adjustments, payment/reversal history and `sourceStale` for non-finalized batches.
- Produces `serializeEmployeePayrollCsv(rows)` and `serializeEmployeePayrollWorkbook(rows)`.
- Mounts `GET /api/employee-payrolls`, `GET /api/employee-payrolls/:id`, and export behind `authenticate` plus `authorize('ADMIN')`.

- [ ] **Step 1: Write RED query tests** for code/name search, frequency/status/month filters, deterministic ordering, pagination and full-result totals rather than page totals.
- [ ] **Step 2: Implement list read model with Prisma aggregate queries and integer totals.**
- [ ] **Step 3: Write RED detail tests** asserting sensitive attendance/national ID fields are absent, approved bank/admin data and frozen sources are present, and source edits after `calculatedAt` mark only non-finalized batches stale.
- [ ] **Step 4: Implement detail read model, source-staleness comparison and not-found behavior.**
- [ ] **Step 5: Write RED export tests** for CSV formula-injection escaping, UTF-8 BOM, XLSX headers and all matching lines.
- [ ] **Step 6: Implement serializers/controller attachment response using existing SheetJS patterns.**
- [ ] **Step 7: Write RED Supertest authorization tests** for guest/CASHIER/KITCHEN rejection, then mount Admin-only read routes in `app.ts`.
- [ ] **Step 8: Run focused unit/API tests and typecheck.**
- [ ] **Step 9: Commit** `feat(payroll): add payroll queries and export`.

### Task 5: Atomic batch creation and recalculation

**Files:**
- Create: `backend/src/modules/employee-payroll/employee-payroll.mutation.service.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.controller.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.routes.ts`
- Test: `backend/src/modules/employee-payroll/employee-payroll.mutation.service.spec.ts`
- Create: `backend/test/employee-payroll/employee-payroll-create.api.spec.ts`

**Interfaces:**
- Produces `EmployeePayrollMutationService.create(input, actor, idempotencyKey)`.
- Produces `EmployeePayrollMutationService.recalculate(batchId, actor, idempotencyKey)`.
- Consumes `calculatePayrollLine` from Task 1 and Prisma models from Task 2.

- [ ] **Step 1: Write RED service tests** for all/custom scope, resigned-in-period inclusion, missing employee rollback, generated code/name and `DRAFT` versus `CALCULATED` result.
- [ ] **Step 2: Implement stable employee locking, source loading, calculation and audit inside one transaction; emit `employee-payroll:changed` after commit.**
- [ ] **Step 3: Write RED idempotency tests** for replay, mismatched request digest and no event before commit.
- [ ] **Step 4: Implement create/recalculate idempotency persistence and response replay.**
- [ ] **Step 5: Write RED authorization/integration tests** proving guest/CASHIER/KITCHEN cannot create or recalculate, one invalid employee rolls back all lines/audits and frozen snapshots survive later source edits.
- [ ] **Step 6: Write RED real-concurrency test** issuing two overlapping batch creates; expect one success, one `PAYROLL_OVERLAP`, one batch and one audit set.
- [ ] **Step 7: Implement overlap recheck after employee row locks under a visibility-safe transaction pattern.**
- [ ] **Step 8: Mount `POST /api/employee-payrolls` and `POST /api/employee-payrolls/:id/recalculate` behind `authenticate` plus `authorize('ADMIN')`.**
- [ ] **Step 9: Add month-boundary integration fixture** proving an overnight session is assigned by check-in business date.
- [ ] **Step 10: Run mutation unit/API/concurrency tests and typecheck.**
- [ ] **Step 11: Commit** `feat(payroll): calculate payroll batches atomically`.

### Task 6: Adjustment, finalization and cancellation lifecycle

**Files:**
- Modify: `backend/src/modules/employee-payroll/employee-payroll.mutation.service.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.controller.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.routes.ts`
- Test: `backend/src/modules/employee-payroll/employee-payroll.mutation.service.spec.ts`
- Create: `backend/test/employee-payroll/employee-payroll-lifecycle.api.spec.ts`

**Interfaces:**
- Produces `addAdjustment`, `reverseAdjustment`, `finalize`, and `cancel` methods with actor/reason/idempotency arguments.

- [ ] **Step 1: Write RED transition-matrix tests** for allowed and forbidden actions across `DRAFT/CALCULATED/FINALIZED/CANCELLED`.
- [ ] **Step 2: Implement adjustment append/reverse and atomic line/batch total recomputation.**
- [ ] **Step 3: Write RED finalization tests** for every blocker, successful freeze and repeated/conflicting finalize requests.
- [ ] **Step 4: Implement locked finalization with source totals recheck, audit and post-commit realtime.**
- [ ] **Step 5: Write RED cancellation tests** for required reason, finalized-unpaid allowance, paid-batch rejection and preserved history.
- [ ] **Step 6: Implement cancellation transition and audit.**
- [ ] **Step 7: Write RED authorization/API tests** proving guest/CASHIER/KITCHEN cannot add/reverse adjustments, finalize or cancel, and proving every mutation reads `Idempotency-Key` where the contract requires it.
- [ ] **Step 8: Mount adjustment, reversal, finalize and cancel endpoints behind `authenticate` plus `authorize('ADMIN')`.**
- [ ] **Step 9: Run lifecycle unit/API tests and regression calculation tests.**
- [ ] **Step 10: Commit** `feat(payroll): add audited payroll lifecycle`.

### Task 7: Concurrency-safe payment ledger

**Files:**
- Create: `backend/src/modules/employee-payroll/employee-payroll.payment.service.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.controller.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.routes.ts`
- Test: `backend/src/modules/employee-payroll/employee-payroll.payment.service.spec.ts`
- Create: `backend/test/employee-payroll/employee-payroll-payment.api.spec.ts`

**Interfaces:**
- Produces `recordPayment(batchId, lineId, input, actor, idempotencyKey)`.
- Produces `reversePayment(batchId, lineId, paymentId, input, actor, idempotencyKey)`.

- [ ] **Step 1: Write RED unit tests** for finalized-only payment, exact/partial payment, overpayment, wrong line/batch relation and required reversal reason.
- [ ] **Step 2: Implement line lock, ledger append/reversal, derived line/batch totals and audit in one transaction.**
- [ ] **Step 3: Write RED idempotency tests** for same-key replay and same-key/different-payload rejection.
- [ ] **Step 4: Implement payment/reversal idempotency before business-state rejection where safe, while still requiring valid Admin identity.**
- [ ] **Step 5: Write RED TEST-DB concurrency test** with two payments whose sum exceeds remaining; expect only a valid subset to commit and totals never become negative.
- [ ] **Step 6: Write RED authorization/API tests** proving guest/CASHIER/KITCHEN cannot record or reverse payments and cannot infer payroll state through mutation errors.
- [ ] **Step 7: Mount payment and payment-reversal endpoints behind `authenticate` plus `authorize('ADMIN')`.**
- [ ] **Step 8: Run payment unit/API/concurrency tests and backend typecheck.**
- [ ] **Step 9: Commit** `feat(payroll): add payroll payment ledger`.

### Task 8: Frontend payroll API and view model

**Files:**
- Create: `frontend/src/api/employeePayroll.ts`
- Create: `frontend/src/api/employeePayroll.test.ts`
- Create: `frontend/src/features/admin/employeePayrollViewModel.ts`
- Create: `frontend/src/features/admin/employeePayrollViewModel.test.ts`
- Modify: `frontend/src/api/contracts.ts`

**Interfaces:**
- Produces typed DTOs and list/detail/create/recalculate/finalize/cancel/adjust/payment/export functions.
- Produces `previousCompletePayrollMonth`, status/basis/warning labels, VND/hour formatters, `sourceStale` presentation and expandable row projections.

- [ ] **Step 1: Write RED API tests** asserting paths, query encoding, auth header, `Idempotency-Key`, JSON bodies, blob export and server error preservation.
- [ ] **Step 2: Extend shared frontend `ErrorCode` contracts** with the payroll codes from Task 3.
- [ ] **Step 3: Implement the typed API client using existing fetch/error patterns.**
- [ ] **Step 4: Write RED view-model tests** for previous month across year boundary, labels, actual-minute formatting, blocker grouping and line/batch totals.
- [ ] **Step 5: Implement pure view-model functions.**
- [ ] **Step 6: Run focused frontend tests and typecheck.**
- [ ] **Step 7: Commit** `feat(payroll): add payroll client and view model`.

### Task 9: Payroll list, create modal and expanded detail UI

**Files:**
- Create: `frontend/src/features/admin/EmployeePayrollCreateModal.tsx`
- Create: `frontend/src/features/admin/EmployeePayrollCreateModal.test.tsx`
- Create: `frontend/src/features/admin/EmployeePayrollDetail.tsx`
- Create: `frontend/src/features/admin/EmployeePayrollDetail.test.tsx`
- Create: `frontend/src/features/admin/EmployeePayrollScreen.tsx`
- Create: `frontend/src/features/admin/EmployeePayrollScreen.test.tsx`

**Interfaces:**
- Consumes Task 8 API/view-model.
- Produces `EmployeePayrollScreen` for workspace integration.

- [ ] **Step 1: Write RED create-modal tests** for previous-month default, complete-month validation, all/custom employee scope, disabled/pending submit and input preservation after server failure.
- [ ] **Step 2: Implement responsive create modal with paged employee selection and one-shot save.**
- [ ] **Step 3: Write RED list tests** for screenshot-aligned columns, status/frequency filters, debounced search, pagination, full-result summary and web export.
- [ ] **Step 4: Implement list/sidebar/toolbar using existing theme/UI primitives; make filters collapsible and table horizontally scrollable on compact screens.**
- [ ] **Step 5: Write RED detail tests** for row expansion, employee-line expansion, actual versus planned labels, blocker/informational warnings and action visibility by state.
- [ ] **Step 6: Implement detail actions with reason/payment forms, pending guards, refetch after success and error preservation.**
- [ ] **Step 7: Run all new UI tests serially and frontend typecheck/lint on touched files.**
- [ ] **Step 8: Commit** `feat(payroll): add payroll management interface`.

### Task 10: Employee workspace and realtime synchronization

**Files:**
- Create: `frontend/src/lib/employeePayrollRealtime.ts`
- Create: `frontend/src/lib/employeePayrollRealtime.test.ts`
- Modify: `frontend/src/contexts/RestaurantContext.tsx`
- Modify: `frontend/src/features/admin/EmployeeWorkspaceScreen.tsx`
- Modify: `frontend/src/features/admin/employeeWorkspaceScreen.test.tsx`
- Modify: `frontend/src/features/admin/EmployeePayrollScreen.tsx`

**Interfaces:**
- Produces `employeePayrollRevision` in `RestaurantContext`.
- Adds `payroll` workspace section labeled `Bảng lương` after attendance.

- [ ] **Step 1: Write RED realtime guard tests** for accepted event shape, malformed payload rejection and monotonically increasing invalidation revision.
- [ ] **Step 2: Implement socket subscription/cleanup and context revision.**
- [ ] **Step 3: Write RED workspace test** proving existing default directory and schedule/attendance tabs remain intact while payroll switches correctly.
- [ ] **Step 4: Integrate payroll tab/icon/screen.**
- [ ] **Step 5: Write RED screen tests** proving payroll events refetch list/detail without closing an open modal, while employee-compensation or attendance revisions refetch non-finalized detail and expose stale-source state without losing unsaved form data.
- [ ] **Step 6: Implement payroll/employee/attendance revision-driven refetch and focus/visibility refresh using the existing workforce pattern.**
- [ ] **Step 7: Run focused and full serial frontend suites.**
- [ ] **Step 8: Commit** `feat(payroll): integrate payroll realtime workspace`.

### Task 11: Acceptance verification and rollout handoff

**Files:**
- Modify only if verification exposes a payroll defect; every fix must begin with a failing regression test.
- Update: `task_plan.md`, `findings.md`, `progress.md` (ignored working records).

**Interfaces:**
- Produces verified commits and a rollout report; does not automatically mutate DEV.

- [ ] **Step 1: Verify TEST migration status** and inspect expected payroll tables/indexes without exposing credentials.
- [ ] **Step 2: Run backend payroll domain/unit/API/concurrency suites** with `--fileParallelism=false`; require zero failures.
- [ ] **Step 3: Run employee, schedule and attendance regression suites**; require zero failures.
- [ ] **Step 4: Run full frontend suite serially** using `npm test -- --fileParallelism=false`; require zero failures.
- [ ] **Step 5: Run backend/frontend typecheck, lint and production builds.** Record pre-existing warnings separately; no new payroll warning is allowed.
- [ ] **Step 6: Run `git diff --check`, secret scan and requirement-by-requirement audit against the spec.**
- [ ] **Step 7: Review task commits and working tree; do not include `.env`, generated exports or real bank data.**
- [ ] **Step 8: Present TEST evidence and request explicit authorization before applying the payroll migration to `DATABASE_URL`.**
- [ ] **Step 9: After authorized DEV migration, verify Prisma status, MAIN branch, payroll API health and UI smoke flow; never reset/seed/drop.**
- [ ] **Step 10: Push only when explicitly requested, then verify remote branch SHA.**

## Completion definition

- Every task has completed RED/GREEN/refactor cycles and its listed commit.
- TEST migration, integration and concurrency tests pass.
- Payroll calculations and finalized snapshots match the approved formulas.
- UI list, create modal, expanded details, actions, export and realtime work without breaking existing workforce modules.
- DEV remains untouched until the explicit rollout gate in Task 11.
