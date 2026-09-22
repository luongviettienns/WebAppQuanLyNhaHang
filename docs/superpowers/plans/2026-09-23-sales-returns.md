# Implementation Plan — Đơn hàng / Trả hàng Native

## Status

Tasks 1–4 đã triển khai; Task 5 đang xác minh. Backend return focused suite 3/3 và frontend focused suite 9/9 pass. Frontend typecheck còn lỗi nền có sẵn trong PriceList.

## Task 1 — Schema và TDD RED

1. [x] Generate Prisma client sau khi thêm `OrderReturn`, `OrderReturnLine`, `SALES_RETURN` và migration.
2. [x] Viết integration tests cho candidates/list/detail/create, chưa viết service trước test.
3. [x] Chạy test mới, xác nhận RED vì routes/service chưa tồn tại.

## Task 2 — Backend service/API GREEN

1. [x] Thêm schemas query/create và DTO types.
2. [x] Implement candidates, list/summary, detail và create transaction; khóa Order/lines/ingredient/menu rows.
3. [x] Ghi ledger/audit, phát socket và inventory events sau commit.
4. [x] Thêm routes `/returns`, `/returns/candidates`, `/returns/:id` trước route động khác.
5. [x] Chạy focused tests và backend typecheck.

## Task 3 — Frontend API/view-model TDD

1. [x] Thêm contracts/API helpers cho list, candidates, detail, create/export.
2. [x] Viết test query serialization và return quantity/amount view model, chạy RED.
3. [x] Implement helpers/view-model, chạy GREEN.

## Task 4 — Native list + selection/composer

1. [x] Tách phần Trả hàng thành Native screen theo tokens: list/filter/table, selection modal và composer modal.
2. [x] Nối subnav Hóa đơn/Trả hàng trong `OrdersScreen` nhưng giữ Hóa đơn hiện tại ổn định.
3. [x] Refresh sau thao tác hoàn tất và thay đổi trạng thái Order.
4. [x] Chạy focused frontend tests và typecheck.

## Task 5 — Verification/handoff

1. Chạy backend return tests, typecheck và Order regression.
2. Chạy frontend focused tests; ghi nhận typecheck lỗi nền nếu vẫn tồn tại.
3. Rà soát transaction/invariants/diff, commit và báo cáo; chỉ push nếu user yêu cầu.
