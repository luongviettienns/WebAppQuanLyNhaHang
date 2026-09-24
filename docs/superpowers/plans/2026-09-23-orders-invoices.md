# Implementation Plan — Đơn hàng / Hóa đơn Native

## Mục tiêu

Triển khai read model Hóa đơn trên `Order` hiện có, API có phân quyền và filter server-side, sau đó nối màn hình Native vào navigation hiện tại. Thực hiện TDD theo từng lớp: test fail trước, code tối thiểu để pass, rồi refactor.

## Task 1 — Backend contract và test RED

Files dự kiến:

- `backend/src/modules/orders/order-invoice.schemas.ts`
- `backend/src/modules/orders/order-invoice.service.ts`
- `backend/src/modules/orders/order-invoice.controller.ts`
- `backend/src/modules/orders/orders.routes.ts`
- `backend/test/orders/order-invoice.api.spec.ts`

Steps:

1. Viết test tạo các Order/OrderItem và kiểm tra list, filter ngày Việt Nam, summary toàn bộ, pagination, detail, auth và export.
2. Chạy test mới để xác nhận RED vì route/service chưa tồn tại.
3. Thêm Zod query schema, service query `Order` với include MenuItem/Table/User, mapping DTO rõ ràng.
4. Thêm route tĩnh `/invoices`, `/invoices/:id`, `/invoices/export` trước route động liên quan; authorize CASHIER/ADMIN.
5. Chạy lại test, sửa đến GREEN.

## Task 2 — Backend export, index và regression

1. Tách formatter dùng chung cho list/detail/export.
2. Thêm CSV UTF-8 BOM và XLSX theo helper hiện có nếu repository đã có thư viện; nếu không, giữ CSV API ổn định.
3. Thêm index Prisma additive và migration nếu schema/database test hỗ trợ.
4. Chạy test invoice + toàn bộ test orders liên quan + backend typecheck.
5. Kiểm tra không đụng semantics của KDS `GET /api/orders`, pay, void.

## Task 3 — Frontend contract/view model TDD

Files dự kiến:

- `frontend/src/api/contracts.ts`
- `frontend/src/api/orderInvoices.ts`
- `frontend/src/features/orders/invoiceViewModel.ts`
- `frontend/src/features/orders/__tests__/invoiceViewModel.test.ts`

Steps:

1. Viết test format tiền, nhãn trạng thái, query filters, empty values và summary.
2. Chạy test RED.
3. Thêm types/API client/view model dùng auth headers và `getApiBaseUrl`.
4. Chạy GREEN và typecheck phần liên quan.

## Task 4 — Native screen và navigation

Files dự kiến:

- `frontend/src/features/orders/OrdersScreen.tsx`
- `frontend/src/features/orders/InvoiceListScreen.tsx`
- `frontend/src/navigation/RoleTabs.tsx`
- test component nếu harness hiện tại hỗ trợ.

Steps:

1. Dựng layout theo tokens Native hiện có: header, filter sheet, list/table responsive, summary, empty state, detail modal.
2. Dùng API server-side, debounce search, refresh, loading/error/retry; không nhúng dữ liệu mẫu.
3. Nối tab Đơn hàng cho Admin/Cashier, giữ KDS/POS hiện tại không đổi.
4. Hiển thị mục Trả hàng dạng reserved/disabled để không hứa nghiệp vụ chưa có.
5. Chạy frontend focused tests và typecheck.

## Task 5 — Verification và bàn giao

1. Chạy backend invoice tests, backend typecheck, frontend focused tests/typecheck/build phù hợp.
2. Đối chiếu acceptance criteria với spec.
3. Rà soát diff, cập nhật progress/findings nếu có quyết định mới.
4. Chỉ commit khi verification có bằng chứng; không push remote nếu user chưa yêu cầu trong turn này.
