# CRISPY BITE Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng nền tảng full-stack cho CRISPY BITE bằng các vertical slice có thể chạy và kiểm thử từ database đến giao diện.

**Architecture:** Backend Express/Prisma là nguồn dữ liệu chuẩn; frontend Expo chỉ cache API và nhận cập nhật Socket.io từ server. Mỗi milestone hoàn thành một luồng nghiệp vụ xuyên suốt, gồm database, API/Socket contract, UI và test, trước khi chuyển sang milestone sau.

**Tech Stack:** TypeScript, Expo SDK 54 + React Navigation, Node.js + Express, Prisma + MySQL, Socket.io, Vitest/Supertest, Jest/React Native Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-28-build-sequencing-design.md`

## Global Constraints

- Dùng Expo SDK 54, React Navigation, Express, Prisma/MySQL và Socket.io như kiến trúc đã chốt.
- Dùng TypeScript cho frontend và backend; tiền tệ là VND nguyên (`Int`).
- Mọi giá trị environment, schema, API, Socket, role, lifecycle và test database phải tuân theo "Foundation Contracts" trong spec; không tự chọn lại trong lúc code.
- Backend tính và xác nhận giá, VAT, quyền role, chuyển trạng thái order; frontend không tự coi dữ liệu cục bộ là nguồn chuẩn.
- Bất kỳ thay đổi nghiệp vụ nào bắt đầu bằng test thất bại, sau đó là code tối thiểu để test qua.
- Không dùng mock data cho luồng đã có API thật; chỉ dùng fixture cho test cô lập.
- Chỉ mở milestone kế tiếp khi Definition of Done của milestone hiện tại đạt và `PROJECT_PROGRESS.md` đã được cập nhật.

---

## File structure to establish

```text
backend/
  prisma/schema.prisma                  # Models, enums, migration, seed
  src/app.ts                            # Express app and middleware registration
  src/server.ts                         # HTTP and Socket.io bootstrap
  src/config/{env,prisma,socket}.ts     # Runtime configuration and singletons
  src/lib/{api-error,order-code}.ts     # Shared server utilities
  src/middlewares/{authenticate,authorize,error-handler}.ts
  src/modules/{auth,menu,orders,tables,reports}/
    *.routes.ts, *.controller.ts, *.service.ts, *.schemas.ts
  test/{helpers,auth,menu,orders,tables,reports}/
frontend/
  App.tsx                               # Navigation and provider composition
  src/api/{client,contracts}.ts         # Axios client and shared DTOs
  src/navigation/{RootNavigator,RoleTabs}.tsx
  src/contexts/{AuthContext,RestaurantContext}.tsx
  src/features/{auth,pos,kds,tables,admin,reports}/
  src/components/{Button,Card,Badge,Modal,ScreenState}.tsx
  src/theme/{colors,spacing,typography}.ts
  __tests__/{auth,pos,kds}/
docker-compose.yml                      # Local MySQL only
.env.example                            # Safe environment variable template
```

## M-1 - Planning gate

### Task 1: Verify the approved contracts before source creation

**Files:** Read `IMPLEMENTATION_PLAN.md`, the linked spec, `BUILD_PLAN.md`, and `PROJECT_PROGRESS.md`; modify only those documents if an inconsistency is discovered.

**Interfaces:** Produces one reconciled decision set: Node `24.19.0`, npm `11.17.0`, MySQL `8.4`, development/test database URLs, REST/Socket event names, schema audit fields, and role matrix.

- [x] **Step 1: Compare schema fields.** Confirm `Order` includes explicit lifecycle timestamps, creator/voider user relations, and composite idempotency uniqueness.
- [x] **Step 2: Compare event names.** Confirm every document uses only `order:new`, `order:statusChanged`, `menu:itemSoldOutChanged`, and `table:statusChanged`.
- [x] **Step 3: Compare contracts.** Confirm endpoint permissions, error envelopes, VAT rate, order/table lifecycle, and test-database isolation match the Foundation Contracts section of the spec.
- [x] **Step 4: Record reconciliation.** Update `PROJECT_PROGRESS.md` with the exact documents checked and any resolved discrepancy.
- [x] **Step 5: Record planning verification.** Run a placeholder/consistency scan across the three documents and record the result in `PROJECT_PROGRESS.md`; the first commit occurs only after Task 2 initializes Git.

**Definition of Done:** No schema, event, role, or environment decision is represented differently in the three planning documents.

## M0 - Local foundation

### Task 2: Initialize version control and lock the local toolchain

**Files:** Create `.nvmrc`, `.npmrc`, root `package.json`, root `README.md`, `.gitignore`.

**Interfaces:** Produces a Git repository using Node `24.19.0`, npm `11.17.0`, a single `package-lock.json`, and root scripts that delegate to frontend/backend workspaces.

- [x] **Step 1: Verify runtime.** Run `node --version` and `npm --version`; stop if they are not `v24.19.0` and `11.17.0`.
- [x] **Step 2: Initialize Git.** Run `git init`, create `.gitignore` for `.env`, `node_modules`, Expo artifacts, coverage, and Prisma generated artifacts.
- [x] **Step 3: Lock package manager behavior.** Add `.nvmrc` containing `24.19.0`, `.npmrc` with `engine-strict=true`, and root `package.json` with `workspaces: ["backend", "frontend"]`, engines `{ "node": "24.19.0", "npm": "11.17.0" }` and delegating scripts.
- [x] **Step 4: Add initial verification.** Run `git status --short` and `npm --version`; confirm no secret or generated file is tracked.
- [x] **Step 5: Commit.** Commit `chore(toolchain): khoi tao repository va khoa local toolchain`.

**Definition of Done:** A new developer can identify the exact runtime and cannot accidentally commit environment secrets.

### Task 3: Provision isolated MySQL development and test databases

**Files:** Create `docker-compose.yml`, `.env.example`, `scripts/verify-database.ps1`, root `README.md` database section.

**Interfaces:** Produces healthy `crispy_bite_dev` and `crispy_bite_test` MySQL `8.4` databases, accessed by non-root `crispy_bite` user; application configuration has distinct `DATABASE_URL` and `TEST_DATABASE_URL`.

- [ ] **Step 1: Write a failing environment check.** Add `scripts/verify-database.ps1` that exits nonzero when either required URL is absent, URLs match, or server ping fails.
- [ ] **Step 2: Run it.** Run `pwsh scripts/verify-database.ps1`; expected result: failure because database configuration does not exist.
- [ ] **Step 3: Provision database runtime.** Use Docker Desktop with `mysql:8.4`, named volume, port `3306`, `mysqladmin ping` healthcheck, and init SQL creating both databases; document native MySQL 8.4 fallback with the same user/databases.
- [ ] **Step 4: Add safe config.** Create `.env.example` containing every Foundation Contract environment variable; verification requires distinct URLs and, when `NODE_ENV=test`, permits connection only through `TEST_DATABASE_URL`.
- [ ] **Step 5: Verify and commit.** Run the script against both local paths, confirm `mysqladmin ping`, and commit `chore: add isolated MySQL development and test environments`.

**Definition of Done:** Development and tests cannot share a database; either Docker or native MySQL path is documented and verified.

### Task 4: Create the reproducible application workspace

**Files:** Create `backend/package.json`, `backend/tsconfig.json`, `backend/src/{app,server}.ts`, `backend/src/config/env.ts`, `frontend/package.json`, `frontend/App.tsx`, root workspace scripts, and health tests.

**Interfaces:** Produces `npm run dev:backend`, `npm run dev:frontend`, `npm run test:backend`, `npm run test:frontend`, and a database health check independent of Docker/native MySQL choice.

- [ ] **Step 1: Create failing health-check test.** Add `backend/test/health/health.spec.ts` asserting `GET /health` returns `{ "data": { "status": "ok" } }`.
- [ ] **Step 2: Run the test.** Run `npm run test:backend -- health.spec.ts`; expected result: failure because the Express app does not exist.
- [ ] **Step 3: Create the minimum workspace.** Configure TypeScript, Vitest, Supertest, ESLint, Prettier, Expo SDK 54, React Navigation, Axios, Socket.io client/server. `env.ts` validates every required environment variable before server starts; `server.ts` binds port `4000` and configures HTTP/Socket CORS from `CORS_ORIGIN`.
- [ ] **Step 4: Implement `backend/src/app.ts`.** Register JSON parsing and `GET /health`:

```ts
app.get('/health', (_request, response) => {
  response.status(200).json({ data: { status: 'ok' } });
});
```

- [ ] **Step 5: Verify and commit.** Run database verification, backend health test, frontend type-check, and both dev scripts; commit `chore: create reproducible full-stack workspace`.

**Definition of Done:** A new developer can start MySQL and both applications using README commands; health test passes.

## M1 - Schema, seed, and HTTP contract

### Task 5: Define Prisma schema, migration, and test reset

**Files:** Create `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`, `backend/test/helpers/database.ts`, `backend/test/database/{migration,seed}.spec.ts`.

**Interfaces:** Produces enums `Role`, `OrderType`, `OrderStatus`, `TableStatus`, `PaymentMethod`, `PaymentStatus`; models in the architecture spec; order timestamps, payment fields, and request fingerprint.

- [ ] **Step 1: Write failing seed test.** Assert seed creates exactly three users, at least twenty menu items, twelve dining tables, and at least one required modifier group.
- [ ] **Step 2: Run the test.** Run `npm run test:backend -- seed.spec.ts`; expected result: failure because Prisma client/schema are absent.
- [ ] **Step 3: Implement schema and migration.** Add relations, unique `Order.code`, integer money fields, modifier JSON snapshot, creator/voider relations, lifecycle timestamps, `paymentMethod`, `paymentStatus`, `paidAt`, `requestHash`, and `@@unique([createdByUserId, idempotencyKey])`.
- [ ] **Step 4: Implement isolated test helper.** Refuse matching URLs, apply `prisma migrate deploy` to `TEST_DATABASE_URL`, truncate tables after each test, and create fixture data explicitly.
- [ ] **Step 5: Implement idempotent demo seed.** Require `SEED_CASHIER_PASSWORD`, `SEED_KITCHEN_PASSWORD`, and `SEED_ADMIN_PASSWORD` from copied local `.env`; upsert users, categories, menu/modifiers, and tables 1-12; hash passwords with bcrypt cost 12.
- [ ] **Step 6: Verify and commit.** Run local migration, test-database migration/reset, demo seed, and seed test; commit `feat: add isolated restaurant schema and deterministic seed`.

**Definition of Done:** Empty MySQL can be migrated and seeded repeatedly without duplicates; order timing and void audit data are representable.

### Task 6: Establish API envelopes, role matrix, and contract tests

**Files:** Create `backend/src/lib/api-error.ts`, `backend/src/middlewares/error-handler.ts`, `backend/src/modules/system/system.routes.ts`, `backend/test/contracts/error-envelope.spec.ts`, `frontend/src/api/contracts.ts`.

**Interfaces:** Success response is `{ data: T }`; error response is `{ error: { code: string; message: string; details?: Record<string, string> } }`.

- [ ] **Step 1: Write failing API contract tests.** Cover unknown route (`NOT_FOUND`), invalid body (`VALIDATION_ERROR`), missing token (`UNAUTHENTICATED`), forbidden role (`FORBIDDEN`), and conflict (`CONFLICT`/`ORDER_STATE_INVALID`).
- [ ] **Step 2: Run the tests.** Run `npm run test:backend -- error-envelope.spec.ts`; expected result: failure because errors are not normalized.
- [ ] **Step 3: Implement typed errors and routes contract.** Add `ApiError`, one global Express handler that never exposes stack traces in production, and tests that assert every endpoint in Foundation Contracts has its exact allowed role and envelope.
- [ ] **Step 4: Mirror DTOs in frontend.** Define every DTO exactly as specified (`CategoryDto`, `MenuItemDto`, `DiningTableDto`, `OrderCreateDto`, `OrderDto`, `DailyReportDto`) plus role-scoped Socket payload types in `frontend/src/api/contracts.ts`; configure Axios to surface `RATE_LIMITED` with `Retry-After` consistently.
- [ ] **Step 5: Verify and commit.** Run contract tests and both TypeScript checks; commit `feat: standardize API response and error contracts`.

**Definition of Done:** Every route returns the same success/error shape and the client can display a safe error message from it.

## M2 - Authentication and RBAC

### Task 7: Deliver login and role-gated navigation end-to-end

**Files:** Create `backend/src/modules/auth/{auth.routes,auth.controller,auth.service,auth.schemas}.ts`, authentication middlewares, `frontend/src/features/auth/LoginScreen.tsx`, `frontend/src/contexts/AuthContext.tsx`, navigation files, and auth tests.

**Interfaces:** `POST /api/auth/login` accepts `{ username, password }` and returns `{ data: { token, user: { id, name, role } } }`; roles are `CASHIER | KITCHEN | ADMIN`.

- [ ] **Step 1: Write failing API tests.** Test valid credentials, indistinguishable invalid username/password (`INVALID_CREDENTIALS`), five-per-minute IP limit returning `429 RATE_LIMITED` plus `Retry-After`, missing bearer token (`UNAUTHENTICATED`), and forbidden role (`FORBIDDEN`).
- [ ] **Step 2: Run API tests.** Run `npm run test:backend -- auth`; expected result: failure because `/api/auth/login` is absent.
- [ ] **Step 3: Implement server auth.** Validate with Zod, enforce a five-per-minute IP rate limit, compare bcrypt hash cost 12, sign HS256 JWT with 8h expiry/issuer/audience, fail startup for a secret shorter than 32 characters, and implement `authenticate`/`authorize(...roles)` middleware.
- [ ] **Step 4: Write failing UI tests.** Test successful Cashier login enters POS tab and Kitchen login enters only KDS tab.
- [ ] **Step 5: Implement client session.** Persist JWT with Expo SecureStore on mobile and documented demo-only localStorage on web; restore session on launch, attach bearer token with Axios interceptor, clear token/cache/socket on 401 or logout, and render routes from server role. Demo Bar performs a new login, never mutates role locally.
- [ ] **Step 6: Verify and commit.** Run backend auth tests and frontend auth tests; commit `feat: add JWT authentication and role-gated navigation`.

**Definition of Done:** Each seed account has the intended route access after app restart; unauthorized API access is rejected server-side.

## M3 - Menu and required modifiers

### Task 8: Display real menu data and enforce modifier selection

**Files:** Create `backend/src/modules/menu/*`, `frontend/src/features/pos/{POSScreen,MenuGrid,ModifierModal}.tsx`, `frontend/src/contexts/RestaurantContext.tsx`, menu tests.

**Interfaces:** `GET /api/menu` returns categories, items, `isSoldOut`, and modifier groups/options. `PATCH /api/menu/:id/sold-out` is Admin/Kitchen only and accepts `{ isSoldOut: boolean }`.

- [ ] **Step 1: Write failing server tests.** Test menu response excludes no data needed by POS and sold-out update rejects Cashier.
- [ ] **Step 2: Implement menu service/routes.** Query categories ordered by `orderNum`; validate ID/body; emit `menu:itemSoldOutChanged` only after DB update succeeds.
- [ ] **Step 3: Write failing POS tests.** Assert a required modifier disables “Thêm vào giỏ” until min/max selections are valid and sold-out item is disabled.
- [ ] **Step 4: Implement POS menu UI.** Fetch through `RestaurantContext`, display category filters, modifier modal, loading/empty/error states, and update cached item on Socket event.
- [ ] **Step 5: Verify and commit.** Run menu API/UI tests; commit `feat: add real menu and required modifier flow`.

**Definition of Done:** POS never adds a sold-out item or an item missing mandatory modifiers; no menu content is hardcoded in the UI.

## M4 - Cart and persisted orders

### Task 9: Create validated orders from POS to MySQL

**Files:** Create `backend/src/modules/orders/*`, read-only `backend/src/modules/tables/{tables.routes,tables.service}.ts`, `backend/src/lib/{order-code,request-hash}.ts`, `frontend/src/features/pos/{CartPanel,CheckoutModal}.tsx`, order/table/UI tests.

**Interfaces:** `GET /api/tables` gives POS real table data; `POST /api/orders` accepts exact `OrderCreateDto` including `paymentMethod` and mandatory UUID `Idempotency-Key`; server returns persisted `OrderDto` with payment/snapshot totals and `status: PENDING`.

- [ ] **Step 1: Write failing order/table tests.** Cover authenticated table list, required modifier missing, sold-out item, invalid dine-in/take-away fields, busy table/buzzer conflict, server-side modifier snapshot, 800 BPS VAT rounding, duplicate same-key/same-hash retry, same-key/different-hash conflict, and concurrent unique-key recovery.
- [ ] **Step 2: Run the tests.** Run `npm run test:backend -- orders`; expected result: failure because create-order service is absent.
- [ ] **Step 3: Implement read/transaction services.** Add authenticated `GET /api/tables`; canonicalize body and SHA-256 it; re-read menu/modifiers, validate payment/table/buzzer, calculate money at server, generate code, persist payment/snapshot/key/hash/order/table occupancy atomically, recover concurrent unique-key conflict by reading and comparing hash, and emit no Socket event before commit.
- [ ] **Step 4: Write failing Checkout UI test.** Assert POS chooses from `GET /api/tables`, sends only DTO IDs/quantity/note/payment method plus one UUID key per checkout attempt, clears cart only after success, and displays API error without losing cart.
- [ ] **Step 5: Implement cart and checkout.** Support dine-in table/buzzer and take-away, explicit CASH/QR demo confirmation, disabled busy table/buzzer choice, and display only server-returned payment/totals.
- [ ] **Step 6: Verify and commit.** Run order tests and a manual seed-to-order smoke test; commit `feat: create validated restaurant orders`.

**Definition of Done:** A valid order is persisted once with immutable price/modifier snapshots; invalid orders leave no partial rows.

## M5 - Real-time KDS and order lifecycle

### Task 10: Synchronize new orders and kitchen status changes

**Files:** Create `backend/src/config/socket.ts`, `backend/src/modules/orders/order.socket.ts`, KDS components, Socket helpers/tests.

**Interfaces:** KDS first calls `GET /api/orders?status=PENDING,PREPARING,READY`, then receives `order:new`/`order:statusChanged` only in JWT-protected `restaurant:kds`. `PATCH /api/orders/:id/status` accepts `{ status }`; valid transitions are `PENDING -> PREPARING -> READY -> COMPLETED`.

- [ ] **Step 1: Write failing lifecycle tests.** Reject skipped/reversed status transitions and assert PREPARING/READY timestamps are saved once.
- [ ] **Step 2: Implement lifecycle service.** Enforce Kitchen/Admin role, update in transaction, set timestamps, calculate `prepTimeSec` on READY, then emit `order:statusChanged`.
- [ ] **Step 3: Write failing Socket integration tests.** Assert Kitchen/Admin joins `restaurant:kds` and receives complete `order:new`; assert a Cashier never receives order events but receives allowed menu/table deltas; assert invalid JWT never joins a room.
- [ ] **Step 4: Implement Socket gateway and KDS UI.** Authenticate Socket handshake with the same JWT issuer/audience, apply HTTP CORS allowlist, join all users to `restaurant:main` and only Kitchen/Admin to `restaurant:kds`; emit order events only to KDS. Render REST bootstrap data first, refetch on reconnect, then apply event deltas. Render timer from `createdAt` green/yellow/red at 3/5 minutes while retaining `prepTimeSec` as PREPARING-to-READY duration.
- [ ] **Step 5: Verify and commit.** Run lifecycle/Socket/KDS tests; manually test two browser sessions; commit `feat: add real-time kitchen display and order lifecycle`.

**Definition of Done:** POS and KDS converge on one status without reload; `prepTimeSec` is derived from explicit state timestamps.

## M6 - Restaurant operations

### Task 11: Add tables, 86'd propagation, and audited void

**Files:** Extend existing `backend/src/modules/tables/*` from Task 9, extend void API in orders module, create table/menu admin UI and tests.

**Interfaces:** `GET /api/tables`; `PATCH /api/orders/:id/void` accepts `{ reason }`, requires Admin, and returns `CANCELLED`; table status is `AVAILABLE | OCCUPIED | DIRTY`.

- [ ] **Step 1: Write failing tests.** Cover `AVAILABLE -> OCCUPIED` during dine-in create, `OCCUPIED -> DIRTY -> AVAILABLE` by authorized staff, void of only active order returning availability, invalid void role/reason, and sold-out/table event propagation to a second POS client.
- [ ] **Step 2: Implement table and void services.** Keep table `OCCUPIED` through READY/COMPLETED, require authorized explicit departure/clean transitions, require non-empty void reason, set payment status `VOIDED`, save voiding user/time/reason, forbid voiding completed/cancelled orders, change table availability only when no other active order remains, and emit `table:statusChanged` after commit.
- [ ] **Step 3: Implement UI.** Render twelve DB-backed tables; enable Admin void confirmation; expose Kitchen/Admin sold-out switch with no optimistic state until server confirms.
- [ ] **Step 4: Verify and commit.** Run tables/order/menu integration tests; commit `feat: add table operations sold-out and audited void`.

**Definition of Done:** Cashier cannot void, sold-out reaches every connected POS, and table state matches active orders.

## M7 - Administration, reporting, and receipt

### Task 12: Deliver Admin menu management

**Files:** Extend `backend/src/modules/menu/*`; create `frontend/src/features/admin/MenuManagementScreen.tsx`; add menu API/UI tests.

**Interfaces:** `POST /api/menu` and `PATCH /api/menu/:id` are Admin-only and accept `MenuItemUpsertDto` (name, positive integer price, categoryId, description, image, modifier groups); response is complete `MenuItemDto`; every saved sold-out change emits `menu:itemSoldOutChanged` after commit.

- [ ] **Step 1: Write failing API tests.** Cover Admin create/update, Cashier/Kitchen forbidden behavior, invalid integer price, and invalid modifier min/max configuration.
- [ ] **Step 2: Implement validated Admin routes.** Use Zod to require positive VND integer price, existing category, `0 <= minSelect <= maxSelect`, and options count sufficient for `maxSelect`.
- [ ] **Step 3: Write failing UI tests.** Assert only Admin sees menu management, invalid form is blocked locally, and persisted update refreshes POS menu through REST/event.
- [ ] **Step 4: Implement management screen.** Add concise modal forms for create/edit and a sold-out switch whose state follows the server response.
- [ ] **Step 5: Verify and commit.** Run menu API/UI tests with two connected POS clients; commit `feat: add admin menu management`.

**Definition of Done:** Admin changes are validated server-side and connected POS clients converge on the saved menu state.

### Task 13: Deliver reporting and immutable receipt export

**Files:** Create `backend/src/modules/reports/*`, `frontend/src/features/reports/DashboardScreen.tsx`, `frontend/src/features/pos/ReceiptModal.tsx`, report/receipt tests.

**Interfaces:** `GET /api/reports/daily?date=YYYY-MM-DD` returns `DailyReportDto`; receipt renders only persisted paid `OrderDto` snapshots; only Admin can read reports. No external refund or payment-gateway behavior is implemented.

- [ ] **Step 1: Write failing report tests.** Build fixture orders straddling midnight in `Asia/Ho_Chi_Minh`; assert cancelled orders are excluded from revenue/SOS, completed orders count in revenue, and empty day returns zero-safe values.
- [ ] **Step 2: Implement report queries.** Convert validated ISO date to timezone-aware `Asia/Ho_Chi_Minh` bounds; aggregate completed orders for revenue/top sellers and orders with non-null `prepTimeSec` for SOS; return all money as integer VND.
- [ ] **Step 3: Write failing receipt/UI tests.** Assert Cashier cannot navigate to reports, receipt uses saved item/modifier/VAT/total snapshots, and exported document has order code/date/totals.
- [ ] **Step 4: Implement dashboard and receipt.** Add KPI cards/top-five list; render receipt from returned order; export exactly that rendered snapshot to PDF without recomputing menu prices.
- [ ] **Step 5: Verify and commit.** Run report/receipt tests and export one seeded completed order; commit `feat: add admin reporting and immutable receipt export`.

**Definition of Done:** Dashboard metrics are DB-derived and role-protected; receipt values cannot drift from the persisted order.

## M8 - Release quality and demo

### Task 14: Prove critical flows on web and mobile layouts

**Files:** Create Playwright config/specs, responsive styles, demo guide in `README.md`, and test data reset script.

**Interfaces:** End-to-end flows: Cashier login -> menu -> required modifier -> order -> Kitchen status -> POS update; Admin 86'd/void/report.

- [ ] **Step 1: Write failing Playwright test.** Script the Cashier-to-Kitchen lifecycle against local backend/MySQL.
- [ ] **Step 2: Run it.** Run `npm run test:e2e`; expected result: failure until all web flow dependencies are wired.
- [ ] **Step 3: Implement only fixes revealed by E2E.** Add stable `testID`/accessibility labels, error states, safe-area handling, and responsive constraints; do not add new business features.
- [ ] **Step 4: Verify complete matrix.** Run backend unit/integration tests, frontend tests, Playwright suite, `npm run lint`, and production type-check/build commands.
- [ ] **Step 5: Finalize documentation and commit.** Document setup, seed accounts, two-device Socket demo, reset command, and presentation script; commit `docs: add verified setup and demo guide`.

**Definition of Done:** A clean machine can reproduce the demo; all automated suites pass; mobile and web layouts keep controls usable without overlapping text.

## Completion gate

Before any milestone is marked complete: run its listed tests, inspect the actual output, update the related checkboxes in this file, then append the completed work and verification evidence to `PROJECT_PROGRESS.md`. Do not proceed on the basis of code review or expectation alone.
