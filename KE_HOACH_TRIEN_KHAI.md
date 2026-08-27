# KE HOACH TRIEN KHAI CRISPY BITE THEO MODULE

> Day la ban ke hoach tieng Viet de thuc thi theo thu tu. Nguon contract ky thuat chi tiet la `docs/superpowers/specs/2026-08-28-build-sequencing-design.md`; checklist chi tiet goc la `BUILD_PLAN.md`. Neu co mau thuan, Foundation Contracts uu tien.

## Muc tieu va quy tac

- Thuc hien tung task theo dung thu tu 1 -> 14; khong bo qua task co dependency.
- Moi task bat dau bang test that bai, sau do code toi thieu, chay lai test, cap nhat checklist va `PROJECT_PROGRESS.md`.
- Backend la nguon du lieu chuan. Frontend khong tu tinh gia, VAT, role hoac status order.
- Khong dung mock data cho luong da co API that.
- Khong mo module ke tiep khi Definition of Done cua module hien tai chua dat.
- Sau moi task hoan tat: Thao tac Git chuan chi (`git status`, `git diff`, `git add` file lien quan), commit message bang tieng Viet chuyen nghiep theo Conventional Commits (VD: `feat(...): ...`, `test(...): ...`, `chore(...): ...`).

## Ban do module

| Thu tu | Module | Task | Ket qua co the kiem tra |
| --- | --- | --- | --- |
| M-1 | Planning Gate | 1 | Tat ca tai lieu va contract thong nhat |
| M0 | Nen tang local | 2-4 | Moi truong, MySQL, backend/frontend chay duoc |
| M1 | Du lieu va contract | 5-6 | Schema, seed, API error/DTO chuan |
| M2 | Xac thuc va RBAC | 7 | Login JWT va man hinh theo role |
| M3 | Menu va modifier | 8 | POS doc menu that, validate modifier |
| M4 | POS, ban va order | 9 | Tao order atomic, tinh tien server-side |
| M5 | KDS real-time | 10 | Kitchen nhan/cap nhat order qua Socket |
| M6 | Van hanh nha hang | 11 | Ban, 86'd va void co audit |
| M7 | Quan tri va bao cao | 12-13 | Quan ly menu, report, receipt PDF |
| M8 | Kiem thu va demo | 14 | E2E web/mobile va huong dan demo |

---

## Module M-1: Khoa ke hoach

**Trang thai:** Hoan thanh.

- [x] Task 1: Dong bo schema, event Socket, role, VAT, lifecycle va test isolation giua cac tai lieu.
- [x] Xac nhan event duy nhat: `order:new`, `order:statusChanged`, `menu:itemSoldOutChanged`, `table:statusChanged`.
- [x] Xac nhan Socket order chi den room `restaurant:kds`; Cashier khong nhan `OrderDto`.
- [x] Xac nhan DTO, idempotency hash, payment demo, report timezone va table lifecycle.

**Diem bat dau thuc te:** Task 2.

## Module M0: Nen tang phat trien local

### Task 2 - Khoi tao Git va toolchain

**Muc tieu:** khoa runtime va nguyen tac commit truoc khi tao source.

- [x] Kiem tra Node `24.19.0` va npm `11.17.0`.
- [x] Chay `git init`; tao `.gitignore` cho `.env`, dependency, coverage va Expo artifact.
- [x] Tao `.nvmrc`, `.npmrc` va root `package.json` workspaces `backend`, `frontend`.
- [x] Kiem tra khong co secret/generate file duoc track.
- [x] Commit theo quy chuan Tieng Viet khong dau: `chore(toolchain): khoi tao repository va khoa toolchain moi truong local`.

**Dat khi:** moi may phat trien biet chinh xac Node/npm va khong the commit secret vo tinh.

### Task 3 - MySQL development va test tach biet

**Muc tieu:** khong bao gio de test xoa database development.

- [ ] Tao `docker-compose.yml`, `.env.example`, `scripts/verify-database.ps1` va huong dan native MySQL 8.4 fallback.
- [ ] Tao hai database: `crispy_bite_dev` va `crispy_bite_test`; app user la `crispy_bite`, khong dung root.
- [ ] Them `DATABASE_URL` va `TEST_DATABASE_URL`; script fail khi hai URL trung nhau.
- [ ] Docker dung `mysql:8.4`, named volume, healthcheck `mysqladmin ping`; hoac native MySQL 8.4 tuong duong.
- [ ] Kiem tra database cho ca dev va test, sau do commit.

**Dat khi:** mot trong hai cach Docker/native MySQL chay duoc va database test tach biet hoan toan.

### Task 4 - Workspace va health check

**Muc tieu:** co Express, Expo va bo test nen tang.

- [ ] Viet health test that bai cho `GET /health` tra `{ data: { status: "ok" } }`.
- [ ] Tao TypeScript workspace: Express, Prisma, Socket.io, Vitest/Supertest; Expo SDK 54, React Navigation, Axios, Socket client va test frontend.
- [ ] Tao `env.ts` validate environment; `server.ts` bind port `4000`; HTTP/Socket CORS dung `CORS_ORIGIN`.
- [ ] Implement health endpoint toi thieu, chay test pass va type-check frontend.
- [ ] Kiem tra Expo Go dung LAN IP, khong dung `localhost` tren dien thoai; commit.

**Dat khi:** backend/frontend khoi dong, MySQL healthy, health test pass.

## Module M1: Schema, seed va API contract

### Task 5 - Prisma schema, migration va test reset

**Muc tieu:** chot data model truoc khi lam nghiep vu.

- [ ] Viet test seed that bai: 3 user, 20+ mon, 12 ban, modifier bat buoc.
- [ ] Tao enum role/order/table/payment va schema Order co creator, voider, `requestHash`, idempotency key, payment, timestamps.
- [ ] Tao migration; dung `prisma migrate deploy` cho test DB va truncate fixture sau moi test.
- [ ] Seed idempotent dung `SEED_CASHIER_PASSWORD`, `SEED_KITCHEN_PASSWORD`, `SEED_ADMIN_PASSWORD`, bcrypt cost 12.
- [ ] Chay migration/seed/test DB, sau do commit.

**Dat khi:** schema tai tao duoc, seed lap lai khong tao duplicate, test khong cham dev DB.

### Task 6 - Error envelope, role va DTO

**Muc tieu:** frontend/backend dung cung ngon ngu contract.

- [ ] Viet contract test cho `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `ORDER_STATE_INVALID`, `RATE_LIMITED` va `INTERNAL_ERROR`.
- [ ] Implement `{ data }` va `{ error: { code, message, details? } }` tren tat ca route.
- [ ] Tao DTO dung spec: category, menu, table, order, report va Socket payload.
- [ ] Mirror DTO vao `frontend/src/api/contracts.ts`; Axios xu ly `429` va `Retry-After`.
- [ ] Chay contract test/type-check, sau do commit.

**Dat khi:** client khong phai doan response/error cua backend.

## Module M2: Authentication va RBAC

### Task 7 - Login JWT va navigation theo role

- [ ] Test login dung/sai, 5 request/phut/IP, `Retry-After`, bearer token thieu va role bi cam.
- [ ] Implement JWT HS256, expiry 8h, issuer/audience, secret >= 32 ky tu va bcrypt cost 12.
- [ ] Implement middleware `authenticate` va `authorize`.
- [ ] Frontend luu token: SecureStore mobile, localStorage demo web; 401/logout xoa token, cache va socket.
- [ ] Demo Bar chi dien nhanh tai khoan va login lai, khong doi role tren client.
- [ ] Chay backend/frontend auth tests, sau do commit.

**Dat khi:** Cashier chi thay POS/ban, Kitchen chi thay KDS, Admin thay toan bo pham vi.

## Module M3: Menu va modifier

### Task 8 - POS doc menu that

- [ ] Test `GET /api/menu`, 86'd bi cam voi Cashier va modifier min/max.
- [ ] Implement menu service/routes va `PATCH /api/menu/:id/sold-out` cho Kitchen/Admin.
- [ ] Emit `menu:itemSoldOutChanged` sau DB commit.
- [ ] Implement category filter, menu grid, modifier modal, loading/error/empty state tren POS.
- [ ] Test UI khong them mon het va khong them mon thieu modifier bat buoc; commit.

**Dat khi:** menu/gia/modifier khong con hardcode tren frontend.

## Module M4: POS, ban va tao order

### Task 9 - Checkout atomic voi payment demo

- [ ] Test `GET /api/tables` va POS chon ban tu du lieu that.
- [ ] Test order: modifier, sold-out, dine-in/take-away, ban/buzzer busy, VAT 800 BPS, snapshot modifier, idempotency retry/conflict.
- [ ] Implement `GET /api/tables`, `POST /api/orders`, hash SHA-256 cua request canonical va recovery khi concurrent unique conflict.
- [ ] Tao order transaction: re-read menu, tinh tien server-side, luu payment `CASH|QR` + `PAID`, order item snapshot, table occupancy.
- [ ] POS gui UUID `Idempotency-Key`, chi clear gio sau success, hien thi total/payment server tra ve.
- [ ] Chay order/UI tests va smoke test, sau do commit.

**Dat khi:** mot lan checkout tao dung mot order; retry khong tao trung; order sai khong de lai row dang do.

## Module M5: KDS va Socket real-time

### Task 10 - Kitchen lifecycle

- [ ] Test status `PENDING -> PREPARING -> READY -> COMPLETED`, cam skip/reverse va timestamp chi set mot lan.
- [ ] KDS bootstrap bang `GET /api/orders?status=PENDING,PREPARING,READY`.
- [ ] Socket JWT: tat ca role vao `restaurant:main`; chi Kitchen/Admin vao `restaurant:kds`.
- [ ] Test Kitchen/Admin nhan order event, Cashier khong nhan order event, invalid JWT khong vao room.
- [ ] KDS refetch sau reconnect; timer cho khach tinh tu `createdAt`, `prepTimeSec` tinh PREPARING -> READY.
- [ ] Chay lifecycle/Socket/KDS tests va test hai browser session, sau do commit.

**Dat khi:** POS/KDS dong bo khong reload, khong ro ri order cho Cashier.

## Module M6: Van hanh nha hang

### Task 11 - Ban, 86'd va void audit

- [ ] Test lifecycle ban `AVAILABLE -> OCCUPIED -> DIRTY -> AVAILABLE`.
- [ ] Test void chi Admin, reason bat buoc, cam void `COMPLETED/CANCELLED`, void cap nhat payment `VOIDED`.
- [ ] Implement table transition va chi tra ban AVAILABLE neu khong con active order.
- [ ] Emit `table:statusChanged`; 86'd emit den moi POS duoc phep.
- [ ] Implement UI ban, void confirmation va sold-out switch.
- [ ] Chay integration tests, sau do commit.

**Dat khi:** table state dung voi active order va moi thao tac nhay cam co audit.

## Module M7: Quan tri, bao cao va hoa don

### Task 12 - Quan ly menu Admin

- [ ] Test Admin create/update menu; cam Cashier/Kitchen; validate price/category/min-max modifier.
- [ ] Implement `POST /api/menu`, `PATCH /api/menu/:id` va `MenuItemUpsertDto`.
- [ ] Implement form create/edit va sold-out switch theo server response.
- [ ] Kiem tra POS dang mo cap nhat menu qua REST/event, sau do commit.

**Dat khi:** Admin cap nhat menu an toan, POS khac dong bo ngay.

### Task 13 - Bao cao va receipt snapshot

- [ ] Test report qua nua dem theo `Asia/Ho_Chi_Minh`, chi tinh `COMPLETED`, loai `CANCELLED`, empty day zero-safe.
- [ ] Implement `GET /api/reports/daily`, doanh thu/top seller/SOS tu DB.
- [ ] Test receipt dung snapshot item/modifier/VAT/total/payment, khong tinh lai gia menu hien tai.
- [ ] Implement dashboard, receipt preview va PDF; khong tich hop payment gateway/refund external.
- [ ] Chay report/receipt tests va export sample, sau do commit.

**Dat khi:** KPI va hoa don chi phan anh du lieu order da luu.

## Module M8: Kiem thu va demo

### Task 14 - E2E, responsive va tai lieu demo

- [ ] Viet Playwright flow: Cashier login -> modifier -> order -> Kitchen status -> POS update.
- [ ] Viet Playwright Admin flow: 86'd -> void -> report.
- [ ] Chi sua loi do E2E phat hien; them `testID`, accessibility label, safe area, responsive constraint.
- [ ] Chay backend test, frontend test, Playwright, lint, type-check va production build.
- [ ] Hoan thien README: setup, seed account, reset data, two-device Socket demo va kich ban trinh bay; commit.

**Dat khi:** moi truong sach tai tao demo duoc; web/mobile khong vo layout; toan bo automated suite pass.

## Quy tac ket thuc moi task

1. Chay test duoc liet ke va doc output that.
2. Chi danh dau checklist sau khi test pass.
3. Cap nhat `BUILD_PLAN.md` va `PROJECT_PROGRESS.md` voi bang chung kiem tra.
4. Commit theo message cua task.
5. Moi bat dau task ke tiep.
