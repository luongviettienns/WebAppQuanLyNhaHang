# Đặc tả kiến trúc — Sổ quỹ

## 1. Mục tiêu

Xây dựng phân hệ Native `Sổ quỹ` làm nguồn thật duy nhất cho biến động tiền từ ngày kích hoạt, gồm:

- danh sách và tổng hợp số dư quỹ;
- phiếu thu, phiếu chi theo `Tiền mặt`, `Tài khoản ngân hàng`, `Ví điện tử`;
- nhiều tài khoản ngân hàng và ví điện tử, một quỹ tiền mặt mặc định;
- số dư đầu kỳ tại ngày triển khai, không hồi tố chứng từ cũ;
- ghi sổ tự động từ thanh toán bán hàng, trả hàng bán, nhập hàng và trả hàng nhập;
- hủy bằng chứng từ đảo, audit, realtime và xuất dữ liệu.

Ảnh người dùng cung cấp là tham chiếu bố cục và trường dữ liệu. Có tám ảnh nhưng sáu biểu mẫu duy nhất: ảnh phiếu chi tiền mặt và phiếu thu ví điện tử bị lặp.

## 2. Phạm vi MVP

### Trong phạm vi

1. Thiết lập tài khoản tiền và số dư đầu kỳ.
2. Danh sách giao dịch với bộ lọc, phân trang và tổng hợp.
3. Tạo phiếu thu/chi thủ công cho ba loại tài khoản.
4. `Lưu` và `Lưu & In`; thao tác in dùng PDF/chia sẻ Native sau khi lưu thành công.
5. Hủy phiếu bằng bút toán đảo, không sửa/xóa chứng từ đã ghi sổ.
6. Tạo phiếu tự động trong cùng transaction với nghiệp vụ nguồn.
7. Xuất CSV/XLSX theo bộ lọc hiện tại.
8. Phân quyền ADMIN/CASHIER, AuditLog và `cashbook:changed` realtime.

### Ngoài phạm vi

- Hồi tố toàn bộ hóa đơn/chứng từ trước ngày kích hoạt.
- Đối soát sao kê ngân hàng hoặc ví qua API nhà cung cấp.
- Chuyển tiền giữa hai tài khoản, khóa sổ theo kỳ và quy trình duyệt nhiều cấp.
- Hạch toán kế toán kép, tài khoản kế toán hoặc thay thế báo cáo doanh thu hiện tại.
- Sửa một chứng từ đã ghi sổ; nghiệp vụ sửa phải hủy và lập phiếu mới.

## 3. Quyết định kiến trúc

### Phương án được chọn: chứng từ thống nhất và sổ tiền bất biến

Dùng một mô hình `CashVoucher` cho cả thu và chi, liên kết một `FinancialAccount`. Sáu biểu mẫu chỉ là sáu cấu hình của cùng một composer. Phiếu thủ công và phiếu tự động đi qua cùng một posting service để dùng chung validation, mã chứng từ, idempotency, audit và realtime.

Phương án này được chọn thay cho:

- sáu bảng/màn hình riêng: nhiều mã trùng và dễ lệch quy tắc;
- hai bảng phiếu thu/phiếu chi: vẫn lặp logic và khó tổng hợp số dư;
- event sourcing toàn hệ thống: đúng về học thuật nhưng quá lớn cho phạm vi hiện tại.

## 4. Mô hình dữ liệu

### Enum

- `FinancialAccountType`: `CASH`, `BANK`, `E_WALLET`.
- `CashVoucherDirection`: `RECEIPT`, `PAYMENT`.
- `CashVoucherStatus`: `POSTED`, `CANCELLED`.
- `CashVoucherSourceType`: `MANUAL`, `ORDER_PAYMENT`, `SALES_RETURN`, `PURCHASE_RECEIPT`, `PURCHASE_RETURN`, `REVERSAL`.
- Mở rộng `PaymentMethod` thêm `E_WALLET`; giữ `CASH`, `BANK_TRANSFER`, `CREDIT_CARD`.

### `FinancialAccount`

- `id`, `code`, `name`, `type`.
- `openingBalance`, `openingAt`.
- `bankName`, `accountNumber`, `walletProvider`, `walletIdentifier` dạng nullable.
- `isDefault`, `isActive`, timestamps.
- Chỉ một tài khoản mặc định đang hoạt động trên mỗi `type`; service khóa các account cùng loại và áp dụng quy tắc này trong transaction.
- Migration tạo một tài khoản `Tiền mặt` mặc định; ADMIN tạo thêm ngân hàng/ví.
- Số dư đầu kỳ không được tính vào thu/chi hoặc kết quả kinh doanh.
- Có thể sửa số dư đầu kỳ trước khi phát sinh phiếu POSTED đầu tiên; sau đó bị khóa.

### `CashFlowCategory`

- `id`, `code`, `name`, `direction`, `affectsBusinessResultDefault`, `isSystem`, `isActive`, timestamps.
- Seed nhóm hệ thống: khách thanh toán, nhà cung cấp hoàn tiền, thu khác, trả nhà cung cấp, hoàn tiền khách, chi phí vận hành, chi khác.
- Category hệ thống không xóa; có thể ngừng hoạt động nếu không phải category dùng cho đồng bộ tự động.

### `FinancialParty`

- `id`, `name`, `phone`, `note`, `isActive`, timestamps.
- Dùng cho đối tượng `Khác` được tạo nhanh và tìm lại ở các phiếu sau.
- Nhà cung cấp, đối tác giao hàng và nhân viên không sao chép sang bảng này; API tìm đối tượng tổng hợp từ các bảng nguồn.

### `CashVoucher`

- `id`, `code`, `direction`, `status`, `occurredAt`, `amount`.
- `accountId`, `categoryId`, `paymentMethod` nullable.
- `handlerUserId`, `handlerName` snapshot.
- `counterpartyType`, `counterpartyId` nullable, `counterpartyName` snapshot.
- `note`, `affectsBusinessResult`.
- `sourceType`, `sourceId` nullable, `sourceCode` nullable, `sourceKey` duy nhất.
- `linkedPurchaseReceiptId`, `sourceInvoiceNumber`, `sourceInvoiceDate` nullable cho liên kết hóa đơn đầu vào; số/ngày là snapshot để lịch sử không đổi khi chứng từ nguồn được cập nhật.
- `reversalOfId` nullable và duy nhất; `cancelledAt`, `cancelledByUserId`, `cancelReason` trên phiếu gốc.
- `createdByUserId`, timestamps.
- `amount` luôn là số nguyên VND dương, tối đa 2 tỷ đồng.

`sourceKey` là khóa idempotency do server tạo, ví dụ `ORDER_PAYMENT:123`, `SALES_RETURN:51`. Phiếu thủ công dùng UUID. Unique index này ngăn hai request đồng thời ghi tiền hai lần.

## 5. Bất biến nghiệp vụ

1. Mọi phiếu POSTED có đúng một account đang hoạt động và một category cùng chiều thu/chi.
2. Tiền mặt luôn dùng account CASH mặc định; client không được giả mạo account khác loại.
3. Phiếu ngân hàng bắt buộc account BANK và phương thức `BANK_TRANSFER` hoặc `CREDIT_CARD`.
4. Phiếu ví bắt buộc account E_WALLET và phương thức `E_WALLET`.
5. Không cho phiếu chi làm số dư tài khoản âm. Service khóa account và tính số dư khả dụng trong transaction trước khi ghi.
6. Chứng từ tự động được tạo trong cùng database transaction với nghiệp vụ nguồn. Nếu ghi sổ thất bại, nghiệp vụ nguồn rollback.
7. Phiếu tự động không sửa trực tiếp và không hủy độc lập với chứng từ nguồn.
8. Hủy phiếu thủ công tạo một phiếu `REVERSAL` đối chiều, cùng account và amount; phiếu gốc chuyển `CANCELLED`. Tổng số dư dựa trên tất cả bút toán POSTED, gồm bút toán đảo.
9. Không xóa vật lý account, category, party hoặc voucher đã được tham chiếu.
10. Event và thao tác in chỉ chạy sau commit.
11. Báo cáo doanh thu hiện tại tiếp tục lấy từ Order; cờ `affectsBusinessResult` chỉ phục vụ lọc/tổng hợp Sổ quỹ trong MVP, tránh cộng doanh thu hai lần.

## 6. Cutover và số dư đầu kỳ

- `CashbookSetting` có một record gồm `activatedAt`, `activatedByUserId`.
- Khi migration chạy, hệ thống tạo account CASH mặc định nhưng chưa hồi tố dữ liệu.
- ADMIN nhập số dư đầu kỳ cho các account và kích hoạt Sổ quỹ.
- Posting tự động chỉ áp dụng cho nghiệp vụ hoàn tất tại hoặc sau `activatedAt`.
- Các chứng từ trước thời điểm kích hoạt không sinh phiếu. Khi cần đối chiếu, người dùng xem tại module nguồn.
- Kích hoạt là thao tác một lần và được ghi AuditLog.

## 7. Đồng bộ nghiệp vụ nguồn

### Thanh toán hóa đơn bán hàng

Trong `OrdersService.payOrder`:

- nhận thêm `financialAccountId`;
- `CASH` có thể bỏ qua account và dùng CASH mặc định;
- `BANK_TRANSFER`, `CREDIT_CARD`, `E_WALLET` yêu cầu account đúng loại;
- sau khi khóa Order và trước commit, tạo phiếu `RECEIPT`, category `ORDER_PAYMENT`, amount `finalAmount`, source key theo Order.
- nếu một Order đã thanh toán được void theo luồng hiện hữu, transaction void phải tạo phiếu đảo `PAYMENT` cho phiếu thu nguồn trước khi đổi trạng thái Order; không cho void lần hai.

### Trả hàng bán

Trong `SalesReturnService.create`:

- nhận `financialAccountId` tương ứng `refundMethod`;
- tạo phiếu `PAYMENT`, category `CUSTOMER_REFUND`, amount `refundedAmount` trong cùng transaction;
- nếu thiếu tiền thì toàn bộ trả hàng và hoàn kho rollback.

### Nhập hàng

Mở rộng PurchaseReceipt với `paymentMethod` và `financialAccountId` khi `paidAmount > 0`:

- lúc POSTED tạo phiếu `PAYMENT`, category `SUPPLIER_PAYMENT`, amount `paidAmount`;
- số công nợ còn lại không ghi quỹ cho tới khi có nghiệp vụ thanh toán công nợ riêng.

### Trả hàng nhập

Mở rộng PurchaseReturn với `financialAccountId`:

- nếu `refundAmount > 0`, lúc COMPLETED tạo phiếu `RECEIPT`, category `SUPPLIER_REFUND`;
- phần giảm công nợ nhưng chưa nhận tiền không ghi quỹ.

## 8. API

Tất cả endpoint yêu cầu JWT. ADMIN có toàn quyền; CASHIER được xem, tạo phiếu thủ công và in nhưng không quản lý account, category, số dư đầu kỳ hoặc kích hoạt.

### Dashboard và voucher

- `GET /api/cashbook`: query `search`, `accountTypes`, `accountIds`, `from`, `to`, `directions`, `categoryIds`, `statuses`, `affectsBusinessResult`, `createdByUserIds`, `page`, `pageSize`.
- Response: `items`, `pagination`, `summary` gồm `openingBalance`, `totalReceipts`, `totalPayments`, `closingBalance`.
- `POST /api/cashbook/vouchers`: tạo phiếu thủ công POSTED.
- `GET /api/cashbook/vouchers/:id`: chi tiết.
- `POST /api/cashbook/vouchers/:id/cancel`: lý do hủy và expected version; server tạo reversal.
- `GET /api/cashbook/export?format=csv|xlsx`: bỏ pagination nhưng giữ bộ lọc.
- `GET /api/cashbook/vouchers/:id/print`: trả dữ liệu in/PDF phù hợp môi trường.

### Thiết lập

- `GET/POST/PATCH /api/cashbook/accounts[/:id]`.
- `GET/POST/PATCH /api/cashbook/categories[/:id]`.
- `GET/POST /api/cashbook/parties` để tìm/tạo đối tượng Khác.
- `GET /api/cashbook/counterparties` để tìm tổng hợp Supplier, DeliveryPartner, User và FinancialParty.
- `GET /api/cashbook/purchase-invoices` để chọn `invoiceNumber`/`invoiceDate` từ PurchaseReceipt đã POSTED.
- `GET /api/cashbook/settings`, `POST /api/cashbook/activate`.

## 9. Native UI

### Màn hình chính

- Thêm tab ADMIN `Sổ quỹ`; CASHIER có quyền xem/tạo nếu được giữ theo role hiện tại.
- Desktop: rail bộ lọc bên trái, toolbar, dải tổng hợp bốn chỉ số và bảng giao dịch.
- Mobile: dải tổng hợp cuộn ngang, bộ lọc trong bottom sheet, danh sách dạng thẻ và nút hành động gọn.
- Bộ lọc: nhóm quỹ, thời gian, loại chứng từ, loại thu/chi, trạng thái, hạch toán KQKD và người tạo.
- Giá trị thu màu primary/xanh; chi màu danger/đỏ; tồn quỹ màu success/xanh lá. Không dùng màu làm tín hiệu duy nhất.

### Sáu form từ một composer

Trường chung: mã tự động, thời gian, loại thu/chi, người thu/chi, loại đối tượng, tên người nộp/nhận, số tiền, ghi chú, hạch toán KQKD.

- Thu tiền mặt: không hiện phương thức/tài khoản.
- Thu ngân hàng: hiện phương thức và tài khoản nhận.
- Thu ví: hiện tài khoản ví nhận.
- Chi tiền mặt: thêm chọn hóa đơn đầu vào; không hiện phương thức/tài khoản.
- Chi ngân hàng: thêm hóa đơn, phương thức và tài khoản chi.
- Chi ví: thêm hóa đơn và tài khoản ví chi.

Modal rộng hai cột trên desktop/tablet, toàn màn hình trên mobile. Footer cố định gồm `Bỏ qua`, `Lưu & In`, `Lưu`. Form dùng keyboard số, thông báo lỗi cạnh trường và chặn double submit.

### Quản lý account

Màn hình/overlay thiết lập nhỏ trong Sổ quỹ:

- CASH mặc định chỉ đổi tên hoặc ngừng khi không còn là mặc định và không có giao dịch mới;
- BANK nhập tên ngân hàng, tên tài khoản và số tài khoản;
- E_WALLET nhập nhà cung cấp ví và định danh ví;
- số tài khoản/định danh hiển thị dạng che bớt trong danh sách.

## 10. Realtime, audit và bảo mật

- Sau commit phát `cashbook:changed` với accountIds, voucherId, reason, updatedAt.
- `RestaurantContext` giữ `cashbookRevision`; màn hình đang mở refetch có debounce.
- Audit action: kích hoạt, account/category create/update/deactivate, voucher created, voucher auto-posted, voucher cancelled/reversed.
- Không ghi đầy đủ số tài khoản vào log hoặc error; API trả số đã che ngoài màn quản trị.
- Backend tự xác định actor từ JWT; không tin `handlerUserId` hoặc creator từ client.

## 11. Xử lý lỗi

- `400`: field hoặc account/category không đúng loại.
- `403`: role không đủ quyền.
- `404`: account, category, source invoice hoặc voucher không tồn tại.
- `409`: source đã ghi sổ, số dư không đủ, version cũ, account ngừng hoạt động hoặc chứng từ đã hủy.
- Prisma unique conflict của `sourceKey` được chuyển thành 409 có thông báo nghiệp vụ.
- Client giữ dữ liệu form khi lỗi mạng/server và chỉ đóng modal sau response thành công.

## 12. Kiểm thử chấp nhận

### Backend

- Migration, seed account/category và cutover không hồi tố.
- CRUD account/category/party, quyền và validation theo loại.
- Tạo đủ sáu biến thể phiếu; tổng hợp số dư và bộ lọc đúng.
- Hai request cùng source chỉ sinh một phiếu.
- Chi vượt số dư bị 409 và không tạo voucher.
- Hủy tạo reversal đúng một lần; số dư phục hồi và có audit.
- Thanh toán Order, SalesReturn, PurchaseReceipt, PurchaseReturn ghi quỹ atomic; lỗi ghi quỹ rollback toàn nghiệp vụ nguồn.
- Export CSV/XLSX mở được và đúng bộ lọc.

### Frontend

- API serialization và view model tính dấu/tổng hợp.
- Composer hiển thị đúng trường cho sáu cấu hình.
- Validation tài khoản/phương thức/số tiền, chống submit kép và giữ form khi lỗi.
- List/filter/summary responsive; realtime revision refetch.
- `Lưu & In` chỉ gọi print/share sau khi save thành công.

### Regression

- Toàn bộ test Order, SalesReturn, PurchaseReceipt, PurchaseReturn, inventory và reports hiện có tiếp tục qua.
- Thanh toán cũ không truyền account vẫn tương thích bằng account mặc định theo phương thức khi Sổ quỹ đã kích hoạt.

## 13. Tiêu chí hoàn thành

1. ADMIN cấu hình số dư đầu kỳ, account và kích hoạt một lần.
2. Người dùng tạo được sáu loại phiếu đúng giao diện và xem số dư cập nhật ngay.
3. Bốn nghiệp vụ nguồn ghi tiền đúng một lần trong cùng transaction.
4. Không có đường sửa/xóa làm mất lịch sử; hủy luôn có reversal và audit.
5. Web, Android và iOS dùng cùng component Native; build, typecheck, lint mục tiêu và test liên quan đều đạt.
