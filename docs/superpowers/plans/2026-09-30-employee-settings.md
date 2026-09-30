# Employee Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng workspace Thiết lập nhân viên theo branch với policy có phiên bản, snapshot attendance/payroll, lịch làm-nghỉ, audit và realtime mà không làm thay đổi dữ liệu lịch sử.

**Architecture:** Thêm module `employee-settings` làm nguồn chính sách có kiểu dữ liệu, chọn phiên bản theo business date và phát invalidation sau commit. Attendance snapshot policy khi mở phiên, schedule chỉ dùng workweek/holiday để cảnh báo, payroll snapshot metadata khi tạo/tính lại; frontend đọc cùng API capability để hiển thị truthful MVP.

**Tech Stack:** TypeScript, Express, Prisma/MySQL, Zod, Vitest/Supertest, Socket.IO, React Native Web/Expo, React Test Renderer.

**Spec:** `docs/superpowers/specs/2026-09-30-employee-settings-design.md`

## Global Constraints

- Business date luôn dùng `Asia/Ho_Chi_Minh`.
- Policy theo `branchId`, tạo phiên bản theo `effectiveFrom`; MVP không tạo phiên bản trong quá khứ và không update/delete policy lịch sử.
- Baseline `1970-01-01` là ngoại lệ chỉ dành cho migration/backfill và phải được tạo cho mọi branch đã tồn tại; runtime API không được dùng ngoại lệ này.
- Attendance actual và schedule snapshot không bị policy sửa; check-out dùng snapshot của check-in.
- Payroll `FINALIZED` bất biến; batch mở chỉ nhận policy mới khi Admin chủ động recalculate.
- Workweek/holiday chỉ cảnh báo và snapshot metadata; không tự sửa lịch, tạo absence, cộng hệ số hoặc khấu trừ.
- Kiosk mã chấm công vẫn là nguồn tự chấm công chính; không tự tạo actual attendance.
- Route settings chỉ dành cho Admin. Do MVP chưa có grant user–branch, server chỉ cho phép branch `MAIN`; branch khác trả `403 BRANCH_ACCESS_DENIED`. Mutation, audit và revision update cùng transaction; realtime chỉ sau commit.
- Capability chưa hỗ trợ không được persist và phải disabled ở UI.
- Migration cộng thêm, không reset/truncate/seed; chạy trên `TEST_DATABASE_URL` trước khi backup và migrate DEV.
- Không thêm dependency mới nếu chức năng đã được hỗ trợ bởi Prisma, Zod, Socket.IO và UI primitives hiện có.

## Review Focus

- Revision được tách theo bốn area attendance/payroll/workweek/holiday. Hai mutation cùng area và cùng expected revision chỉ có một commit; hai area khác nhau không xung đột. Task 3 thêm integration tests cạnh tranh.
- Check-in sát ranh giới threshold và check-out sau khi policy đổi: actual/delta phải giữ nguyên, classification dùng snapshot cũ. Task 4 thêm boundary và lifecycle tests.
- Weekly schedule phải cảnh báo theo mọi occurrence thực sự bị ảnh hưởng, kể cả ngày giữa kỳ; resubmit/retry cùng `Idempotency-Key` chỉ tạo đúng một batch. Task 5 thêm domain/service/API tests cho create và import.
- Payroll mở chỉ stale khi projection settings đúng branch/kỳ và các revision thực sự được dùng thay đổi; policy tương lai và holiday ngoài kỳ không gây stale, finalized payroll không đổi. Task 6 thêm scope và snapshot immutability tests.
- Holiday đã bắt đầu/đã qua khóa date range và archive; chỉ cho sửa name/note có reason. Schedule/payroll lịch sử đọc snapshot, không bị catalog hiện tại ghi đè. Task 3, 5 và 6 thêm tests.
- UI nhận event realtime trong lúc form đang mở hoặc gặp revision conflict: dữ liệu authority phải refetch nhưng draft chưa submit không bị ghi đè im lặng. Task 7 và 8 thêm tests.

---

### Task 1: Domain policy và validation thuần

**Files:**
- Create: `backend/src/modules/employee-settings/employee-settings.domain.ts`
- Create: `backend/src/modules/employee-settings/employee-settings.domain.spec.ts`

**Interfaces:**
- Consumes: `businessDateAt()` và timezone contract từ `employee-attendance/attendance-domain.ts`.
- Produces: `selectEffectiveVersion<T>()`, `validateAttendancePolicy()`, `validatePayrollPolicy()`, `validateWorkweekPolicy()`, `validateHolidayPeriod()`, `dateRangesOverlap()` và các type policy dùng ở Tasks 2–6.

- [ ] **Step 1: Viết test RED cho lựa chọn version và boundary validation**

Test names và assertions:

```ts
it('selects the latest policy effective on the business date')
it('rejects an effective date before the current business date')
it.each([59, 1441])('rejects standard day minutes %s')
it.each([-1, 721])('rejects attendance threshold %s')
it('requires at least one workweek day')
it('rejects invalid and overlapping holiday ranges')
it('accepts only MONTHLY day 1 and ACTUAL_ATTENDANCE payroll policy')
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `npm test --workspace=backend -- src/modules/employee-settings/employee-settings.domain.spec.ts`

Expected: FAIL vì module/functions chưa tồn tại.

- [ ] **Step 3: Cài đặt API domain tối thiểu**

Signatures:

```ts
selectEffectiveVersion<T extends { effectiveFrom: string; revision: number }>(versions: T[], businessDate: string): T
validateAttendancePolicy(input: AttendancePolicyValues): AttendancePolicyValues
validatePayrollPolicy(input: PayrollPolicyValues): PayrollPolicyValues
validateWorkweekPolicy(input: WorkweekPolicyValues): WorkweekPolicyValues
validateHolidayPeriod(input: HolidayPeriodValues): HolidayPeriodValues
dateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean
assertEffectiveDateAllowed(effectiveFrom: string, currentBusinessDate: string): void
```

Domain errors phải mang stable code đúng spec; không import Prisma/Express.

- [ ] **Step 4: Chạy test GREEN và typecheck backend**

Run: `npm test --workspace=backend -- src/modules/employee-settings/employee-settings.domain.spec.ts && npm run typecheck --workspace=backend`

Expected: domain tests PASS và TypeScript exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/employee-settings/employee-settings.domain.ts backend/src/modules/employee-settings/employee-settings.domain.spec.ts
git commit -m "feat(employee-settings): add versioned policy domain"
```

### Task 2: Prisma schema, migration cộng thêm và baseline

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260930160000_employee_settings/migration.sql`
- Create: `backend/src/modules/employee-settings/employee-settings.schema.spec.ts`
- Create: `backend/test/employee-settings/employee-settings-schema.api.spec.ts`
- Modify: `backend/test/helpers/database.ts` only if truncate order requires the new tables.

**Interfaces:**
- Consumes: policy types/ranges from Task 1 and existing `Branch`, `User`, `EmployeeAttendanceSession` relations.
- Produces: Prisma delegates `branchAttendancePolicyVersion`, `branchPayrollPolicyVersion`, `branchWorkweekPolicyVersion`, `branchHolidayPeriod`, `branchEmployeeSettingsRevision`, `employeeScheduleIdempotency`; attendance snapshot columns và `EmployeeScheduleRule.calendarWarningSnapshot`.

- [ ] **Step 1: Viết schema contract test RED**

Assert model names, per-area revision counters, unique `(branchId, effectiveFrom)` và `(branchId, revision)`, idempotency unique `(actorId, operation, idempotencyKey)`, restrictive foreign keys, holiday archive fields, `calendarWarningSnapshot` và five attendance snapshot fields. Assert migration contains additive DDL, baseline `1970-01-01` plus revision row for every existing branch and no `DROP/TRUNCATE`.

- [ ] **Step 2: Chạy schema test RED**

Run: `npm test --workspace=backend -- src/modules/employee-settings/employee-settings.schema.spec.ts`

Expected: FAIL vì models/migration chưa tồn tại.

- [ ] **Step 3: Thêm Prisma models và migration**

Use enum names:

```ts
EmployeeAttendanceMode = SHIFT
EmployeePayrollFrequency = MONTHLY
EmployeePayrollHourlySource = ACTUAL_ATTENDANCE
```

Attendance snapshot defaults cho backfill: 480, 0, 0, true; relation policy ID nullable để tương thích dữ liệu cũ nhưng migration gán baseline ID khi có branch phù hợp. `1970-01-01` chỉ được xuất hiện trong migration/backfill; schema/API runtime không mở đường tạo policy quá khứ.

- [ ] **Step 4: Generate Prisma và chạy migration TEST**

Run: `npm run prisma:generate --workspace=backend && npm run prisma:migrate:test --workspace=backend`

Expected: test guard xác nhận DB chuyên dụng, migration deploy thành công; không kết nối `DATABASE_URL`.

- [ ] **Step 5: Viết/running integration test cho baseline/backfill**

Migration harness đưa TEST DB tới migration ngay trước target, tạo ít nhất hai branch rồi mới deploy target migration. Test xác minh mỗi branch có đúng một revision row và một baseline cho từng loại, không chỉ `MAIN`; tạo một attendance session dùng defaults mới và xác nhận actual timestamp/schedule snapshot được lưu nguyên vẹn. Contract test ở Step 1 xác minh câu lệnh SQL backfill dữ liệu tiền migration và runtime parser vẫn reject effective date quá khứ.

Run: `npm test --workspace=backend -- test/employee-settings/employee-settings-schema.api.spec.ts`

Expected: PASS.

- [ ] **Step 6: Chạy schema + typecheck GREEN**

Run: `npm test --workspace=backend -- src/modules/employee-settings/employee-settings.schema.spec.ts test/employee-settings/employee-settings-schema.api.spec.ts && npm run typecheck --workspace=backend`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend/src/modules/employee-settings/employee-settings.schema.spec.ts backend/test/employee-settings backend/test/helpers/database.ts
git commit -m "feat(employee-settings): add policy persistence foundation"
```

### Task 3: Settings API, checklist, audit và concurrency

**Files:**
- Create: `backend/src/modules/employee-settings/employee-settings.schemas.ts`
- Create: `backend/src/modules/employee-settings/employee-settings.schemas.spec.ts`
- Create: `backend/src/modules/employee-settings/employee-settings.policy-reader.ts`
- Create: `backend/src/modules/employee-settings/employee-settings.query.service.ts`
- Create: `backend/src/modules/employee-settings/employee-settings.mutation.service.ts`
- Create: `backend/src/modules/employee-settings/employee-settings.controller.ts`
- Create: `backend/src/modules/employee-settings/employee-settings.routes.ts`
- Create: `backend/test/employee-settings/employee-settings.api.spec.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: Prisma delegates from Task 2 and domain validators from Task 1.
- Produces:
  - `getEffectiveAttendancePolicy(client, branchId, businessDate)`
  - `getEffectivePayrollPolicy(client, branchId, businessDate)`
  - `getEffectiveWorkweekPolicy(client, branchId, businessDate)`
  - `getHolidayPeriods(client, branchId, from, through)`
  - `/api/employee-settings` Admin API, four per-area revisions và `employee-settings:changed` payload.

- [ ] **Step 1: Viết schema tests RED**

Assert strict payloads, current/future ISO dates, ranges, policy `expectedAreaRevision`, holiday `expectedHolidayRevision`/`expectedRowRevision`, unsupported fields rejection và error codes. Assert migration-only baseline date is rejected by runtime parsers.

- [ ] **Step 2: Chạy schemas test RED**

Run: `npm test --workspace=backend -- src/modules/employee-settings/employee-settings.schemas.spec.ts`

Expected: FAIL vì parser chưa tồn tại.

- [ ] **Step 3: Cài đặt Zod parsers**

Signatures:

```ts
parseEmployeeSettingsQuery(value: unknown): { branchId: number }
parseAttendancePolicyCreateInput(value: unknown): AttendancePolicyCreateInput
parsePayrollPolicyCreateInput(value: unknown): PayrollPolicyCreateInput
parseWorkweekPolicyCreateInput(value: unknown): WorkweekPolicyCreateInput
parseHolidayCreateInput(value: unknown): HolidayCreateInput
parseHolidayUpdateInput(value: unknown): HolidayUpdateInput
parseHolidayArchiveInput(value: unknown): HolidayArchiveInput
parseHolidayListQuery(value: unknown): HolidayListQuery
```

- [ ] **Step 4: Viết API integration tests RED**

Cover:

```ts
it('returns effective policies, truthful capabilities and a derived five-step checklist')
it('allows Admin and rejects Cashier, Kitchen and kiosk credentials')
it('allows settings only for MAIN and rejects another branch server-side')
it('creates a future policy with audit then emits only after commit')
it('rolls back policy and audit on validation/storage failure')
it('serializes two writes in one area with the same expected area revision')
it('allows concurrent writes in different settings areas')
it('rejects past and duplicate effective dates')
it('creates, updates and archives holidays without hard delete')
it('rejects overlapping holidays including concurrent requests')
it('locks date and archive for started holidays but allows audited name or note correction')
```

- [ ] **Step 5: Chạy API tests RED**

Run: `npm test --workspace=backend -- test/employee-settings/employee-settings.api.spec.ts`

Expected: 404/module missing failures.

- [ ] **Step 6: Cài đặt query, mutation, controller và routes**

`EmployeeSettingsQueryService.getWorkspace(branchId, now)` trả effective policy, history, active holidays, checklist, capabilities và bốn area revisions. Controller resolve branch bằng server rule `MAIN`, không tin quyền branch từ client. Mutation lock `BranchEmployeeSettingsRevision` row `FOR UPDATE`, chỉ so sánh/tăng counter đúng area, ghi version/holiday + AuditLog cùng transaction, rồi gọi `emitToAll('employee-settings:changed', payload)` sau commit. Holiday update/archive còn compare-and-set `expectedRowRevision`; started/past holiday không được đổi date range hoặc archive, correction name/note bắt buộc reason.

- [ ] **Step 7: Chạy Task 3 GREEN**

Run: `npm test --workspace=backend -- src/modules/employee-settings test/employee-settings/employee-settings.api.spec.ts && npm run typecheck --workspace=backend`

Expected: tất cả PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/app.ts backend/src/modules/employee-settings backend/test/employee-settings/employee-settings.api.spec.ts
git commit -m "feat(employee-settings): expose audited settings API"
```

### Task 4: Attendance policy snapshot và classification threshold

**Files:**
- Modify: `backend/src/modules/employee-attendance/attendance-domain.ts`
- Modify: `backend/src/modules/employee-attendance/attendance-domain.spec.ts`
- Modify: `backend/src/modules/employee-attendance/employee-attendance-punch.service.ts`
- Modify: `backend/src/modules/employee-attendance/employee-attendance-punch.service.spec.ts`
- Modify: `backend/src/modules/employee-attendance/employee-attendance-admin.service.ts`
- Modify: `backend/src/modules/employee-attendance/employee-attendance-admin.service.spec.ts`
- Modify: `backend/src/modules/employee-attendance/employee-attendance.service.ts`
- Modify: `backend/src/modules/employee-attendance/employee-attendance.schemas.ts`
- Modify: `backend/src/modules/employee-attendance/kiosk-session.service.ts`
- Modify: `backend/src/modules/employee-attendance/kiosk-session.service.spec.ts`
- Modify: `backend/test/employee-attendance/attendance-schema.api.spec.ts`

**Interfaces:**
- Consumes: `getEffectiveAttendancePolicy()` và snapshot columns từ Tasks 2–3.
- Produces: threshold-aware `classifyAttendanceSession()` và session API chứa `policySnapshot`; kiosk outside-schedule enforcement.

- [ ] **Step 1: Viết boundary tests RED cho classification**

Assert threshold 5: delta +5 `ON_TIME`, +6 `LATE`; checkout -5 `ON_TIME`, -6 `LEFT_EARLY`; delta trả nguyên giá trị. Assert missing snapshots fallback về migrated defaults only for legacy fixture.

- [ ] **Step 2: Chạy domain test RED**

Run: `npm test --workspace=backend -- src/modules/employee-attendance/attendance-domain.spec.ts`

Expected: FAIL vì function chưa nhận thresholds.

- [ ] **Step 3: Mở rộng classification signature**

```ts
classifyAttendanceSession(input: ExistingClassificationInput & {
  lateThresholdMinutes?: number;
  earlyLeaveThresholdMinutes?: number;
}): AttendanceClassification
```

Không thay đổi cách tính delta/checkInAfterShiftEnd/session status.

- [ ] **Step 4: Viết punch/admin lifecycle tests RED**

Assert check-in copies policy ID/values; policy change before checkout does not alter snapshots; false allow-unscheduled returns `ATTENDANCE_SCHEDULE_REQUIRED`; manual session chooses policy by check-in business date; update with `attendancePolicyVersionId` requires reason and server copies values/audits before-after. Assert kiosk create/revoke emits a post-commit checklist invalidation without exposing the secret.

- [ ] **Step 5: Chạy service tests RED**

Run: `npm test --workspace=backend -- src/modules/employee-attendance/employee-attendance-punch.service.spec.ts src/modules/employee-attendance/employee-attendance-admin.service.spec.ts`

Expected: FAIL on missing policy reads/snapshot writes.

- [ ] **Step 6: Cài đặt transaction integration**

Đọc effective policy trong cùng punch/manual transaction. Choice response đặt `allowOutsideSchedule` từ policy. Session projection luôn truyền snapshot thresholds vào classification. Admin correction nhận policy version ID thay vì raw threshold values.

- [ ] **Step 7: Chạy attendance regression GREEN**

Run: `npm test --workspace=backend -- src/modules/employee-attendance test/employee-attendance && npm run typecheck --workspace=backend`

Expected: PASS, gồm idempotency/concurrency hiện có.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/employee-attendance backend/test/employee-attendance
git commit -m "feat(attendance): snapshot effective attendance policies"
```

### Task 5: Workweek/holiday metadata và xác nhận cảnh báo lịch

**Files:**
- Modify: `backend/src/modules/employee-schedules/schedule-domain.ts`
- Modify: `backend/src/modules/employee-schedules/schedule-domain.spec.ts`
- Modify: `backend/src/modules/employee-schedules/employee-schedules.schemas.ts`
- Modify: `backend/src/modules/employee-schedules/employee-schedules.controller.ts`
- Modify: `backend/src/modules/employee-schedules/employee-schedules.service.ts`
- Modify: `backend/src/modules/employee-schedules/employee-schedule-transfer.service.ts`
- Modify: `backend/test/employee-schedules/employee-schedule-week.api.spec.ts`
- Modify: `backend/test/employee-schedules/employee-schedule-create.api.spec.ts`
- Modify: `backend/test/employee-schedules/employee-schedule-mutations.api.spec.ts`
- Modify: `backend/test/employee-schedules/employee-schedule-transfer.api.spec.ts`

**Interfaces:**
- Consumes: workweek/holiday readers từ Task 3.
- Produces: `ScheduleCalendarDay`, `ScheduleCalendarWarning`, `buildScheduleCalendarMetadata()`, `findScheduleOccurrenceWarnings()`; week API `calendarDays`; create/import confirmation handshake và idempotent commit.

- [ ] **Step 1: Viết domain tests RED**

Assert mỗi ngày tuần được đánh dấu working/non-working và chứa holiday labels. Cover `ONCE`, bounded `WEEKLY` có occurrence bị ảnh hưởng ở giữa kỳ, nhiều policy interval, holiday ở occurrence sau start date, và open-ended `WEEKLY` không enumerate vô hạn nhưng vẫn trả đúng source/revision, sample và `unbounded`.

- [ ] **Step 2: Chạy domain test RED**

Run: `npm test --workspace=backend -- src/modules/employee-schedules/schedule-domain.spec.ts`

Expected: FAIL vì calendar metadata chưa tồn tại.

- [ ] **Step 3: Cài đặt helper thuần**

```ts
buildScheduleCalendarMetadata(input: {
  weekStart: string;
  workweekVersions: WorkweekPolicyProjection[];
  holidays: HolidayProjection[];
}): ScheduleCalendarDay[]

findScheduleOccurrenceWarnings(input: {
  rule: ScheduleRuleDraft;
  workweekVersions: WorkweekPolicyProjection[];
  holidays: HolidayProjection[];
}): ScheduleCalendarWarning[]
```

`ONCE` xét occurrence duy nhất. `WEEKLY` bounded xét toàn bộ occurrence thực tế trong khoảng. `WEEKLY` open-ended xét mọi occurrence thuộc holiday đã biết và occurrence đầu tiên trong từng workweek interval mà weekday bị tắt; interval cuối bị tắt trả `affectedCount=null` và `unbounded=true`. Mỗi warning có `kind`, `firstAffectedDate`, `affectedCount`, tối đa 20 `sampleDates`, `unbounded` và source ID/revision.

- [ ] **Step 4: Viết API tests RED cho warning handshake**

Week API trả 7 calendar days. First POST không acknowledgement trả 409 `SCHEDULE_CALENDAR_CONFIRMATION_REQUIRED`, không ghi rule/audit và không claim idempotency key. Confirmed POST với cùng `Idempotency-Key` tạo rule/audit/idempotency record trong một transaction; retry cùng key + digest replay response, key cũ + digest khác trả 409 `IDEMPOTENCY_KEY_REUSED`. Import preview đánh dấu warning theo từng occurrence/row; commit áp dụng cùng handshake/idempotency cho toàn batch. Existing overlap/atomic behavior giữ nguyên.

- [ ] **Step 5: Tích hợp service/schema**

`CreateScheduleBatchInput` và import commit input thêm `calendarWarningAcknowledged: boolean = false`; controller yêu cầu header `Idempotency-Key` cho commit. Đọc workweek/holiday trong transaction trước create, tính canonical request digest không phụ thuộc thứ tự object keys. Warning-only response không claim key. Confirmed transaction kiểm tra/insert `EmployeeScheduleIdempotency`, tạo toàn bộ schedule + audit và lưu `calendarWarningSnapshot` trên rule; duplicate-key race phải replay hoặc conflict theo digest. Import preview trả warning summary theo row; commit dùng cùng validation và không bỏ qua warning.

- [ ] **Step 6: Chạy schedule regression GREEN**

Run: `npm test --workspace=backend -- src/modules/employee-schedules test/employee-schedules && npm run typecheck --workspace=backend`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/employee-schedules backend/test/employee-schedules
git commit -m "feat(schedules): surface workweek and holiday warnings"
```

### Task 6: Payroll settings snapshot và stale-source detection

**Files:**
- Modify: `backend/src/modules/employee-payroll/employee-payroll.calculation.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.calculation.spec.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.mutation.service.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.mutation.service.spec.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.query.service.ts`
- Modify: `backend/src/modules/employee-payroll/employee-payroll.query.service.spec.ts`
- Modify: `backend/test/employee-payroll/employee-payroll-lifecycle.api.spec.ts`
- Modify: `backend/test/employee-payroll/employee-payroll-query.api.spec.ts`

**Interfaces:**
- Consumes: payroll/workweek/holiday readers Task 3 và attendance snapshot Task 4.
- Produces: `PayrollSettingsSnapshot` trong `sourceSnapshot.settings`; `buildPayrollSettingsProjection(branchId, periodStart, periodEnd, sourceSessions)` và scoped stale detection cho batch mở.

- [ ] **Step 1: Viết calculation tests RED**

Assert optional settings metadata được clone vào source snapshot nhưng không thay gross/net/actualMinutes/warnings. Legacy input không settings vẫn tính giống hiện tại.

- [ ] **Step 2: Chạy calculation test RED**

Run: `npm test --workspace=backend -- src/modules/employee-payroll/employee-payroll.calculation.spec.ts`

Expected: FAIL vì input/result chưa có settings.

- [ ] **Step 3: Mở rộng calculation contract**

```ts
interface PayrollSettingsSnapshot {
  payrollPolicy: PolicySnapshot;
  attendancePolicies: PolicySnapshot[];
  workweekPolicies: PolicySnapshot[];
  holidays: HolidaySnapshot[];
}

PayrollCalculationInput.settingsSnapshot?: PayrollSettingsSnapshot
PayrollCalculationResult.sourceSnapshot.settings?: PayrollSettingsSnapshot
```

Không sửa formula.

- [ ] **Step 4: Viết mutation/query tests RED**

Assert create/recalculate đọc metadata theo đúng branch/kỳ. Batch mở stale khi policy interval giao kỳ, attendance policy revision thực sự được source session dùng, workweek interval giao kỳ hoặc holiday giao kỳ thay đổi. Policy có `effectiveFrom > periodEnd`, holiday hoàn toàn ngoài kỳ và thay đổi area không thuộc projection không làm stale. Finalized batch giữ JSON cũ và không báo stale; holiday correction/catalog change không ghi đè snapshot đã lưu.

- [ ] **Step 5: Tích hợp mutation/query**

Đọc settings một lần cho period/branch trong transaction tính batch, truyền normalized immutable projection cho từng line. Projection sắp xếp ổn định và chỉ chứa: payroll policy interval dùng trong kỳ; attendance policy ID/revision của source sessions; workweek versions có effective interval giao kỳ; holiday có date range giao kỳ với ID/revision/archive/name/range. Query `sourceStale` chỉ cho `DRAFT|CALCULATED` bằng cách dựng lại cùng projection và deep-compare canonical value; không so `updatedAt` toàn cục. `FINALIZED` luôn trả snapshot đã khóa và `sourceStale=false`.

- [ ] **Step 6: Chạy payroll regression GREEN**

Run: `npm test --workspace=backend -- src/modules/employee-payroll test/employee-payroll && npm run typecheck --workspace=backend`

Expected: PASS và totals cũ không đổi.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/employee-payroll backend/test/employee-payroll
git commit -m "feat(payroll): snapshot employee settings metadata"
```

### Task 7: Frontend API, realtime và view model

**Files:**
- Create: `frontend/src/api/employeeSettings.ts`
- Create: `frontend/src/api/employeeSettings.test.ts`
- Create: `frontend/src/lib/employeeSettingsRealtime.ts`
- Create: `frontend/src/lib/employeeSettingsRealtime.test.ts`
- Create: `frontend/src/features/admin/employeeSettingsViewModel.ts`
- Create: `frontend/src/features/admin/employeeSettingsViewModel.test.ts`

**Interfaces:**
- Consumes: Task 3 API DTO/error/event contract.
- Produces: typed settings API functions, `subscribeToEmployeeSettingsInvalidation()`, form/list display models dùng Task 8–9.

- [ ] **Step 1: Viết API tests RED**

Assert query encoding, auth, strict mutation bodies, four area revisions, `BRANCH_ACCESS_DENIED`, 409 conflict details và holiday create/update/archive payloads với collection + row revision.

- [ ] **Step 2: Chạy API tests RED**

Run: `npm test --workspace=frontend -- src/api/employeeSettings.test.ts`

Expected: FAIL vì module chưa tồn tại.

- [ ] **Step 3: Cài đặt DTO/client**

Exports tối thiểu:

```ts
fetchEmployeeSettingsApi(token, branchId)
createAttendancePolicyApi(token, input)
createPayrollPolicyApi(token, input)
createWorkweekPolicyApi(token, input)
fetchEmployeeHolidaysApi(token, query)
createEmployeeHolidayApi(token, input)
updateEmployeeHolidayApi(token, id, input)
archiveEmployeeHolidayApi(token, id, input)
```

- [ ] **Step 4: Viết realtime/view-model tests RED**

Assert invalid payload ignored, same-branch valid event invalidates, reconnect refetches. Workspace invalidation cũng nghe `employees:changed`, `employee-schedules:changed`, `employee-attendance:changed` và `employee-payroll:changed` để checklist cập nhật; progress/count/locked capability/date/minute labels và holiday duration tiếng Việt.

- [ ] **Step 5: Cài đặt realtime/view model**

Socket messages chỉ là invalidation. Export `subscribeToEmployeeSettingsInvalidation()` cho policy consumers và `subscribeToEmployeeSettingsWorkspaceInvalidation()` cho checklist đa nguồn; view model không chứa network/state mutations.

- [ ] **Step 6: Chạy Task 7 GREEN**

Run: `npm test --workspace=frontend -- src/api/employeeSettings.test.ts src/lib/employeeSettingsRealtime.test.ts src/features/admin/employeeSettingsViewModel.test.ts && npm run typecheck --workspace=frontend`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/employeeSettings* frontend/src/lib/employeeSettingsRealtime* frontend/src/features/admin/employeeSettingsViewModel*
git commit -m "feat(employee-settings): add frontend settings contracts"
```

### Task 8: Employee Settings responsive workspace

**Files:**
- Create: `frontend/src/features/admin/EmployeeSettingsScreen.tsx`
- Create: `frontend/src/features/admin/EmployeeSettingsScreen.test.tsx`
- Create: `frontend/src/features/admin/EmployeeSettingsInitializationPanel.tsx`
- Create: `frontend/src/features/admin/EmployeeAttendanceSettingsPanel.tsx`
- Create: `frontend/src/features/admin/EmployeePayrollSettingsPanel.tsx`
- Create: `frontend/src/features/admin/EmployeeCalendarSettingsPanel.tsx`
- Create: `frontend/src/features/admin/EmployeePolicyVersionModal.tsx`
- Create: `frontend/src/features/admin/EmployeeHolidayModal.tsx`

**Interfaces:**
- Consumes: API/realtime/view model Task 7.
- Produces: `EmployeeSettingsScreen({ onNavigate })`, four accessible panels và policy/holiday modal flows.

- [ ] **Step 1: Viết render/navigation tests RED**

Assert desktop sidebar, compact horizontal tabs, four section switches, loading/error/retry, progress x/5 và CTA calls `onNavigate(destination)`.

- [ ] **Step 2: Chạy screen test RED**

Run: `npm test --workspace=frontend -- src/features/admin/EmployeeSettingsScreen.test.tsx`

Expected: FAIL vì components chưa tồn tại.

- [ ] **Step 3: Cài đặt shell và Initialization panel**

Use `useWindowDimensions`, theme tokens, `ScrollView` và existing `AppIcon`; không copy global KiotViet header. Preserve current open panel/form draft when realtime invalidation arrives; show refresh notice if authority revision changed.

- [ ] **Step 4: Viết attendance/payroll panel tests RED**

Assert supported fields submit version with đúng `expectedAreaRevision`/effective date; attendance và payroll draft dùng counter độc lập; unsupported toggles disabled and absent from request; payroll fixed values/read-only banner and CTAs.

- [ ] **Step 5: Cài đặt Attendance/Payroll panels và version modal**

Form validation mirrors backend ranges; backend remains authority. Conflict 409 refetches and keeps unsaved draft with explicit message.

- [ ] **Step 6: Viết calendar/holiday tests RED**

Assert at least one weekday, workweek version submit, holiday create/edit/archive gửi đúng holiday collection/row revisions, overlap error, started/past holiday khóa date/archive nhưng cho correction name/note có reason, snapshot/history read-only và mobile card/list rendering.

- [ ] **Step 7: Cài đặt Calendar panel và Holiday modal**

Archive/correction requires reason; no delete control. UI dựa trên business date/capability từ server để khóa started/past holiday nhưng backend vẫn là authority. Use accessible switch/checkbox/modal states.

- [ ] **Step 8: Chạy Task 8 GREEN**

Run: `npm test --workspace=frontend -- src/features/admin/EmployeeSettingsScreen.test.tsx src/features/admin/employeeSettingsViewModel.test.ts && npm run typecheck --workspace=frontend`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/admin/Employee*Settings* frontend/src/features/admin/EmployeeHolidayModal.tsx
git commit -m "feat(employee-settings): build responsive settings workspace"
```

### Task 9: Workspace, schedule UI và cross-module realtime integration

**Files:**
- Modify: `frontend/src/features/admin/EmployeeWorkspaceScreen.tsx`
- Modify: `frontend/src/features/admin/employeeWorkspaceScreen.test.tsx`
- Modify: `frontend/src/api/employeeScheduleManagement.ts`
- Modify: `frontend/src/api/employeeScheduleManagement.test.ts`
- Modify: `frontend/src/features/admin/employeeScheduleViewModel.ts`
- Modify: `frontend/src/features/admin/employeeScheduleViewModel.test.ts`
- Modify: `frontend/src/features/admin/EmployeeScheduleScreen.tsx`
- Modify: `frontend/src/features/admin/EmployeeScheduleModal.tsx`
- Modify: `frontend/src/features/admin/employeeScheduleScreen.test.tsx`
- Modify: `frontend/src/features/admin/EmployeeScheduleImportModal.tsx`
- Modify: `frontend/src/features/admin/employeeScheduleImportModal.test.tsx`
- Modify: `frontend/src/features/admin/EmployeeAttendanceScreen.tsx`
- Modify: `frontend/src/features/admin/EmployeePayrollScreen.tsx`
- Modify: `frontend/src/features/admin/EmployeePayrollDetail.tsx`
- Modify: focused attendance/payroll tests where settings invalidation/snapshot metadata is asserted.

**Interfaces:**
- Consumes: `EmployeeSettingsScreen` Task 8, schedule API Task 5, settings realtime Task 7, payroll snapshot Task 6.
- Produces: end-to-end Admin navigation, warning confirmation UI và cross-module refetch behavior.

- [ ] **Step 1: Viết workspace integration test RED**

Assert `Thiết lập nhân viên` tab chỉ trong Admin workspace, settings CTA switches to directory/schedule/attendance/payroll without remounting global RoleTabs.

- [ ] **Step 2: Chạy workspace test RED**

Run: `npm test --workspace=frontend -- src/features/admin/employeeWorkspaceScreen.test.tsx`

Expected: FAIL vì settings section chưa được nối.

- [ ] **Step 3: Tích hợp workspace navigation**

Export `EmployeeWorkspaceSection`; giữ state ở workspace và truyền `onNavigate` cho settings.

- [ ] **Step 4: Viết schedule warning UI tests RED**

Assert week markers cho non-working/holiday; warning dialog hiển thị occurrence summary/sample dates thay vì chỉ start date. Mỗi save intent sinh một idempotency key, giữ nguyên key qua warning confirmation và network retry; confirmed replay không tạo lịch thứ hai, sửa draft/new intent sinh key mới. Import preview/commit áp dụng cùng quy tắc cho toàn batch.

- [ ] **Step 5: Tích hợp schedule API/view/UI**

API client gửi `Idempotency-Key`; modal giữ key trong state của save intent cho đến success/cancel/draft change. Render marker và occurrence warning có accessible label; giữ overlap/duplicate errors hiện có. Import modal không coi calendar warning là file error nhưng yêu cầu confirmation trước commit và reuse key khi retry. Settings event cho cùng branch refetch calendar metadata.

- [ ] **Step 6: Viết cross-module realtime/snapshot display tests RED**

Assert attendance và payroll screens refetch on relevant settings event; payroll detail renders read-only policy/holiday metadata; không tự gọi recalculate.

- [ ] **Step 7: Tích hợp attendance/payroll invalidation và detail**

Reuse one settings subscription helper per mounted screen; filter by branch/settingsArea; cleanup listeners on unmount.

- [ ] **Step 8: Chạy employee frontend regression GREEN**

Run: `npm test --workspace=frontend -- src/features/admin/employeeWorkspaceScreen.test.tsx src/features/admin/employeeScheduleScreen.test.tsx src/features/admin/employeeScheduleImportModal.test.tsx src/features/admin/EmployeeAttendanceScreen.test.tsx src/features/admin/EmployeePayrollScreen.test.tsx src/features/admin/EmployeePayrollDetail.test.tsx src/api/employeeScheduleManagement.test.ts src/lib/employeeSettingsRealtime.test.ts && npm run typecheck --workspace=frontend`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/admin frontend/src/api/employeeScheduleManagement* frontend/src/lib/employeeSettingsRealtime*
git commit -m "feat(employee-settings): integrate workforce policy consumers"
```

### Task 10: Full verification, DEV rollout và browser UAT

**Files:**
- Modify only if RED tests/UAT expose defects; every fix must add a reproducing test before code.
- Artifact: ignored DEV backup under `backend/uploads/database-backups/`.
- Artifact: ignored UAT export under `backend/uploads/uat-exports/`.

**Interfaces:**
- Consumes: Tasks 1–9 complete feature.
- Produces: verified migration on TEST and DEV, running services, UAT evidence and clean Git state.

- [ ] **Step 1: Chạy migration TEST và toàn bộ verification**

Run:

```bash
npm run prisma:migrate:test --workspace=backend
npm run typecheck
npm run lint --workspaces --if-present
npm run doctor --workspace=frontend
npm test
npm run build
```

Expected: tất cả exit 0; TEST database là target duy nhất của migrate test.

- [ ] **Step 2: Nếu có lỗi, sửa theo TDD và commit acceptance fixes**

Mỗi lỗi có test RED riêng, code tối thiểu, focused GREEN, full suite GREEN.

Commit khi cần:

```bash
git add <test-and-fix-files>
git commit -m "fix(employee-settings): complete acceptance flows"
```

- [ ] **Step 3: Xác minh `DATABASE_URL`, backup DEV và migrate additive**

Không in credential. Tạo backup timestamped; chạy migration deploy đã kiểm thử, không reset/seed. Xác minh policy/holiday/revision/idempotency tables, indexes, baseline + revision row cho mọi branch hiện có, attendance backfill và payroll cũ.

Expected: backup tồn tại; migration applied; dữ liệu UAT/payroll hiện có còn nguyên.

- [ ] **Step 4: Restart backend/frontend và smoke test API quyền**

Expected: `/health` 200; Admin settings 200; Cashier/Kitchen 403; kiosk settings route bị từ chối; existing kiosk punch route vẫn hoạt động.

- [ ] **Step 5: Browser UAT desktop/tablet/mobile và realtime hai cửa sổ**

Checklist:

- Tạo attendance policy version tương lai và thấy history/audit.
- Realtime update settings screen thứ hai; form draft không bị overwrite.
- Weekly rule cảnh báo đúng occurrence ở giữa kỳ; confirmation/network retry cùng idempotency key chỉ tạo một lịch, còn reuse key với payload khác bị từ chối.
- Kiosk session mới snapshot policy; đổi policy rồi checkout không đổi snapshot.
- Bảng lương mở chỉ stale với policy/holiday giao kỳ; policy tương lai và holiday ngoài kỳ không làm stale; recalculate refresh snapshot metadata, finalized `BL202608001` không đổi.
- Capability chưa hỗ trợ disabled.
- Holiday tương lai create/edit/archive tiếng Việt; holiday đã bắt đầu khóa date/archive và correction name/note yêu cầu lý do.
- Settings API chấp nhận Admin ở `MAIN`, từ chối branch khác phía server; hai area revision độc lập không conflict chéo.
- Responsive 390px, tablet và desktop; keyboard/accessibility labels.
- Export bảng lương vẫn tạo XLSX hợp lệ.

- [ ] **Step 6: Chạy final regression và kiểm tra Git**

Run: `npm test && npm run typecheck && git diff --check && git status --short --branch`

Expected: PASS; chỉ còn commit có chủ đích, không có secret/backup/export staged.

- [ ] **Step 7: Commit UAT-only fixes nếu có**

Không tạo commit rỗng. Không push nếu người dùng chưa yêu cầu.
