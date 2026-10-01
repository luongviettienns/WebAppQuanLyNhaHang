# Employee Payroll Design

Date: 2026-09-30
Status: Draft for user review
Scope: Employee workspace — `Bảng lương`

## 1. Objective

Build an Admin-only payroll workspace that creates monthly payroll batches from effective-dated employee compensation and actual attendance, preserves an immutable calculation snapshot, supports auditable adjustments and payments, and stays synchronized with the existing employee, schedule, attendance, audit and realtime architecture.

The supplied screenshots are layout references only. Example codes, dates, amounts and labels do not define business policy. Screenshot 2 represents the create-payroll modal; expanded-row details are defined by this specification.

## 2. MVP boundaries

Included:

- Monthly payroll batches for one branch.
- All working employees or an explicit employee selection.
- `MONTHLY`, `HOURLY` and `PER_SHIFT` compensation terms.
- Actual completed attendance sessions as the source for hourly/shift calculations.
- Frozen employee, compensation, attendance and calculation snapshots.
- Batch calculation/recalculation, finalization and cancellation.
- Reasoned bonus/deduction adjustments.
- Append-only payment history and payment reversal.
- List, filter, expandable detail, export, audit and realtime invalidation.

Excluded:

- Tax, insurance, statutory deductions and payslip filing.
- Automatic overtime approval or overtime multipliers.
- Commission calculation; that remains a separate future module.
- Automatic absence deductions without a configured standard-work policy.
- Automatic posting to cashbook/accounting. Payroll payments remain an auditable payroll ledger in MVP; future integration may add an optional financial transaction reference.
- Employee self-service payslips and approval workflows.
- Multi-currency and non-VND rounding.

## 3. Core invariants

1. A payroll line is a frozen financial snapshot. Later edits to employee profiles, compensation terms, schedules or attendance do not mutate a finalized line.
2. Actual attendance remains distinct from planned schedules. Planned times may be displayed for context but never replace missing actual timestamps.
3. Missing checkout, `NEEDS_REVIEW`, invalid duration or missing compensation blocks finalization for the affected batch.
4. A non-cancelled employee payroll line cannot overlap another non-cancelled batch for the same branch and work period.
5. Batch creation, line creation and calculation are atomic. Any employee failure rolls back the whole operation.
6. Recalculation is allowed only before finalization and atomically replaces computed snapshots for the whole batch while preserving explicit adjustments.
7. Finalized and cancelled batches cannot be recalculated or edited. Cancellation does not delete history.
8. Payments are append-only ledger entries. Paid and remaining totals are derived from successful payments minus reversals; they are not freely editable counters.
9. Payments cannot exceed the employee line’s remaining amount. Concurrent payment requests are serialized in a transaction.
10. Realtime events are emitted only after commit and are invalidation signals; the API/database remains the source of truth.

## 4. Business date and work-period rules

- All work dates use `Asia/Ho_Chi_Minh`.
- MVP pay frequency is `MONTHLY`.
- `periodStart` and `periodEnd` are inclusive dates and must describe exactly one calendar month: first day through last day of that month.
- A session belongs to the payroll period by the business date of its server-recorded `checkInAt`. Overnight checkout remains in the check-in business date.
- Employee eligibility intersects the payroll period with `Employee.startDate` and `Employee.endDate`. A resigned employee may still be included for the portion of the period in which employment was active.
- The create modal defaults to the previous complete calendar month and permits another complete calendar month.

## 5. Calculation policy

### 5.1 Effective compensation

For each payable date/session, select the latest `EmployeeCompensation` whose `effectiveFrom` is on or before that business date. Effective-dated changes inside a month are supported and frozen in the source snapshot.

If no applicable compensation term exists for a payable segment/session, the line receives `COMPENSATION_MISSING`; calculation may be previewed, but the batch cannot be finalized.

### 5.2 Monthly basis

- Allocate monthly pay per active calendar day.
- Daily component = `baseRate / numberOfCalendarDaysInThatMonth`.
- Sum daily components for dates where the employee relationship is active and the compensation term is `MONTHLY`.
- A full-month employee with a single unchanged monthly term receives exactly `baseRate`.
- Confirmed absence is displayed but does not automatically deduct pay in MVP.

### 5.3 Hourly basis

- Include completed attendance sessions whose business date falls in the period and whose link status is not `NEEDS_REVIEW`.
- Actual minutes = `checkOutAt - checkInAt`; the duration must be positive.
- Hourly component = `baseRate × actualMinutes / 60` using the term effective on that session’s business date.
- Scheduled and unscheduled completed sessions are both actual work and are included. Unscheduled sessions remain visibly marked in the snapshot.

### 5.4 Per-shift basis

- Each completed, valid attendance session counts as one actual shift.
- Shift component = the effective `baseRate` for that session’s business date.
- Planned occurrences without an actual completed session do not produce pay automatically.
- Multiple valid sessions on the same day are separate work sessions and are counted separately.

### 5.5 Mixed terms and rounding

- If the compensation basis changes inside the month, calculate each date/session under the term effective on that date and sum all components.
- Accumulate components with decimal precision and round once to the nearest VND at employee-line level.
- `grossAmount` is the rounded calculated amount before explicit adjustments.
- `netAmount = max(0, grossAmount + bonusAmount - deductionAmount)`.
- A deduction cannot make the payable amount negative.

### 5.6 Warnings and finalization blockers

Snapshot and expose at least:

- `COMPENSATION_MISSING`
- `MISSING_CHECK_OUT`
- `ATTENDANCE_NEEDS_REVIEW`
- `INVALID_ATTENDANCE_DURATION`
- `UNSCHEDULED_ATTENDANCE`
- `CONFIRMED_ABSENCE`

The first four block finalization. Unscheduled attendance and confirmed absence are informational under the approved MVP policy.

## 6. Data model

### 6.1 Enums

`PayrollFrequency`: `MONTHLY`

`PayrollBatchStatus`: `DRAFT | CALCULATED | FINALIZED | CANCELLED`

`PayrollAdjustmentType`: `BONUS | DEDUCTION`

`PayrollPaymentMethod`: `CASH | BANK_TRANSFER | OTHER`
`PayrollPaymentStatus`: `SUCCESS | REVERSED`

### 6.2 PayrollBatch

- `id`
- `code` — generated unique code, format `BLyyyyMMnnn`
- `name` — default `Bảng lương tháng M/yyyy`
- `branchId`
- `frequency`
- `periodStart`, `periodEnd`
- `status`
- denormalized totals: `totalGrossAmount`, `totalAdjustmentAmount`, `totalNetAmount`, `totalPaidAmount`, `totalRemainingAmount`
- `createdByUserId`, `createdAt`, `updatedAt`
- `calculatedByUserId?`, `calculatedAt?`
- `finalizedByUserId?`, `finalizedAt?`
- `cancelledByUserId?`, `cancelledAt?`, `cancelReason?`
- optimistic `version`

### 6.3 PayrollLine

- `id`, `payrollBatchId`, `employeeId`
- employee snapshot: code, name, department, job title, bank name/account fields
- employment snapshot: start/end dates
- calculated summary: active calendar days, period calendar days, scheduled shifts, completed sessions, actual minutes, confirmed absences, missing checkouts and review-required count
- financial summary: gross, bonus, deduction, net, paid and remaining
- `calculationStatus`: `READY | REVIEW_REQUIRED`
- `warningCodes` JSON
- `sourceSnapshot` JSON containing the selected compensation terms, attendance session IDs and frozen actual timestamps/link status, and relevant absence/schedule identifiers
- `calculatedAt`

Unique constraint: one line per employee per batch.

### 6.4 PayrollAdjustment

- `id`, `payrollLineId`, `type`, `amount`, `reason`
- `createdByUserId`, `createdAt`
- `reversedAt?`, `reversedByUserId?`, `reverseReason?`

Adjustments are appended/reversed, never silently overwritten. Active totals exclude reversed adjustments.

### 6.5 PayrollPayment

- `id`, `payrollBatchId`, `payrollLineId`, `employeeId`
- `amount`, `method`, `externalReference?`, `note?`
- `status`
- `paidAt`, `createdByUserId`, `createdAt`
- `reversedAt?`, `reversedByUserId?`, `reverseReason?`
- future optional `financialTransactionId?` is not created in MVP unless a real cashbook model exists.

Payments are accepted only for finalized batches and cannot exceed the locked line balance.

## 7. Lifecycle

### Create and calculate

1. Admin selects monthly period and all/custom employees.
2. Backend validates branch, employee existence/eligibility, complete calendar-month period and overlap rules.
3. Backend locks the relevant employee rows in stable ID order.
4. In one transaction, create batch, calculate all employee lines, persist source snapshots, totals and audit records.
5. Result is `CALCULATED` when no blocking warning exists. If at least one line has a blocker, persist the complete atomic snapshot as `DRAFT` so Admin can resolve the source data and explicitly recalculate; no partial employee subset is accepted.
6. Emit `employee-payroll:changed` only after commit.

### Recalculate

- Allowed for `DRAFT`/`CALCULATED` only.
- Re-read current compensation and attendance, replace computed source snapshots atomically, then reapply active adjustments.
- Transition to `CALCULATED` only when all blockers are cleared; otherwise remain `DRAFT` with the refreshed blocker list.
- Payments cannot exist before finalization.

### Finalize

- Admin-only and reason confirmation is not required for a normal finalize action.
- Reject if any line has a finalization blocker or invalid totals.
- Lock batch/lines, recalculate aggregate totals, write finalize audit and transition once to `FINALIZED`.
- Finalization is idempotent only when using the same explicit request identity; otherwise a repeated transition returns a stable conflict.

### Cancel

- Allowed from `DRAFT`, `CALCULATED`, or a not-yet-paid `FINALIZED` batch.
- Allowed only before any successful non-reversed payment.
- Requires a reason and audit.
- Does not delete batch, lines, snapshots or adjustments.

### Pay and reverse payment

- Payment is allowed only on `FINALIZED` lines.
- Lock line and active payments, verify remaining amount and write payment plus updated batch totals atomically.
- Reversal requires a reason and preserves the original entry.
- Emit realtime only after commit.

### Adjustments

- Add/reverse adjustments only while the batch is `DRAFT` or `CALCULATED`.
- Finalization freezes the active adjustment set together with calculated sources.

## 8. API surface

All management endpoints require `ADMIN`.

- `GET /api/employee-payrolls` — search, frequency/status/period filters and pagination.
- `GET /api/employee-payrolls/:id` — batch with lines, warnings, adjustments and payments.
- `POST /api/employee-payrolls` — atomic create/calculate for all or selected employees.
- `POST /api/employee-payrolls/:id/recalculate`
- `POST /api/employee-payrolls/:id/finalize`
- `POST /api/employee-payrolls/:id/cancel`
- `POST /api/employee-payrolls/:id/lines/:lineId/adjustments`
- `POST /api/employee-payrolls/:id/lines/:lineId/adjustments/:adjustmentId/reverse`
- `POST /api/employee-payrolls/:id/lines/:lineId/payments`
- `POST /api/employee-payrolls/:id/lines/:lineId/payments/:paymentId/reverse`
- `GET /api/employee-payrolls/:id/export?format=csv|xlsx`

Stable error codes include period invalid, employee not found, compensation missing, attendance unresolved, overlapping payroll, invalid transition, payment exceeds remaining and concurrency conflict.

## 9. UI design

### Payroll list

- Add `Bảng lương` to the employee workspace after attendance.
- Toolbar: title, search by code/name, create payroll, export selected/current result and density/list action.
- Left filters: pay frequency and the four statuses.
- Columns: selection, code, name, frequency, work period, total salary, paid, remaining and status.
- Summary row is calculated over the full filtered result, not only the current page.
- Responsive layout keeps filters collapsible and the data region horizontally scrollable on small screens.

### Create modal

- Frequency fixed to monthly for MVP.
- Month/work period selector defaults to previous complete month.
- Scope: all employees or explicit multi-select.
- Save remains disabled until inputs are valid; submit is single-shot while pending.

### Expandable batch detail

Selecting a row expands an inline detail area without navigating away. It shows:

- batch status/actions and blocker summary;
- employee lines with pay basis/rate snapshots, completed sessions, actual hours, absence/review warnings, gross, adjustment, net, paid and remaining;
- line expansion with frozen attendance sources, adjustments and payment history;
- actions appropriate to state: recalculate, finalize, cancel, add/reverse adjustment, pay/reverse payment and export.

The UI never presents planned hours as actual hours and clearly labels informational versus blocking warnings.

## 10. Audit and realtime

Audit actions include batch create/recalculate/finalize/cancel, adjustment add/reverse, payment add/reverse. Each mutation records actor, timestamps, reason where required, and before/after financial values or snapshot revision metadata.

Realtime event: `employee-payroll:changed` with batch ID, affected employee IDs, branch ID, period and event revision. Clients refetch; socket payloads are not trusted as complete state.

Changes to attendance or compensation do not mutate a payroll automatically. A non-finalized batch may display a stale-source indication and allow explicit recalculation. A finalized batch remains frozen.

## 11. Concurrency and security

- Generate batch codes transactionally with duplicate retry bounded to a small number.
- Lock employee rows in sorted order during batch creation to serialize overlapping-period checks.
- Lock batch/line rows for finalize, adjustment and payment mutations.
- Use idempotency keys for create, finalize and payment requests that may be retried.
- Never expose national ID or attendance code in payroll list/export.
- Bank account data appears only in Admin detail/export and follows the existing employee-profile masking policy where appropriate.
- Validate all totals server-side; client-submitted totals are ignored.

## 12. Migration and rollout safety

- Migration is additive only: new payroll tables/enums/relations/indexes.
- During implementation, validate/apply the migration only to the dedicated `TEST_DATABASE_URL` and run persistence/concurrency tests there.
- Do not reset, seed or drop development data.
- Apply to `DATABASE_URL` only after test acceptance and explicit rollout authorization.
- Rollout order: migration, backend, frontend. Older clients remain unaffected because existing workforce routes are unchanged.

## 13. Test strategy

### Domain/unit

- Month validation and business-date ownership.
- Full/partial monthly proration and mid-month rate changes.
- Hourly calculation and single final rounding.
- Per-shift calculation, unscheduled sessions and mixed bases.
- Missing compensation and attendance blocker classification.
- Adjustment/payment/reversal arithmetic.
- Lifecycle transition matrix.

### Database/API integration

- Admin authorization on every route.
- Atomic all/custom employee batch creation.
- Whole-batch rollback on one invalid employee.
- Frozen snapshot remains unchanged after source edits.
- Overlap prevention under concurrent create requests.
- Concurrent payment requests cannot overpay.
- Recalculation preserves active adjustments and replaces computed snapshots.
- Finalization rejects unresolved attendance.
- Cancellation/payment reversal audit integrity.
- Filter summary and export use the full result set.

### Frontend

- List/filter/search/pagination and accurate summary row.
- Create modal defaults and custom employee selection.
- Row and employee-line expansion.
- Action visibility by status.
- Blocking warnings and failed mutations preserve user input.
- Realtime invalidation refetches without discarding an open form.
- Responsive filter and table behavior.

### Regression

- Employee directory, schedules, attendance/kiosk, authentication, audit and full frontend suites.
- Backend/frontend typecheck, lint and production builds.

## 14. Acceptance criteria

- Admin can create an atomic monthly payroll for all or selected eligible employees.
- Calculations follow the approved snapshot formulas and expose warnings truthfully.
- A finalized payroll cannot be changed by later source edits or ordinary mutation endpoints.
- No unresolved attendance batch can be finalized.
- Paid/remaining totals match the append-only payment ledger under concurrent requests.
- Row expansion exposes employee calculations and histories without confusing planned and actual time.
- TEST migration and full verification pass before development rollout.
