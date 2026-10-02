# Đặc tả kiến trúc — Sổ quỹ

> **Bản sửa đổi 2026-10-01.** Tài liệu này thay thế các giả định tích hợp ngày 2026-09-23. Không dùng nhánh `codex/cashbook-native` hoặc kế hoạch cũ làm tiêu chuẩn nghiệm thu nếu chưa đối chiếu bản sửa đổi này với source hiện tại.

## 1. Mục tiêu

Xây dựng phân hệ quản trị responsive trên Expo Web `Sổ quỹ` làm nguồn thật duy nhất cho biến động tiền từ ngày kích hoạt, gồm:

- danh sách và tổng hợp số dư quỹ;
- phiếu thu, phiếu chi theo `Tiền mặt`, `Tài khoản ngân hàng`, `Ví điện tử`;
- nhiều tài khoản ngân hàng và ví điện tử, một quỹ tiền mặt mặc định;
- số dư đầu kỳ tại ngày triển khai, không hồi tố chứng từ cũ;
- ghi sổ tự động từ tiền cọc/hoàn cọc, từng giao dịch thanh toán bán hàng, trả hàng bán, nhập hàng, thanh toán công nợ nhà cung cấp, trả hàng nhập và chi lương;
- hủy bằng chứng từ đảo, audit, realtime và xuất dữ liệu.

Ảnh người dùng cung cấp là tham chiếu bố cục và trường dữ liệu. Có tám ảnh nhưng sáu biểu mẫu duy nhất: ảnh phiếu chi tiền mặt và phiếu thu ví điện tử bị lặp.

## 2. Phạm vi MVP

### Trong phạm vi

1. Thiết lập tài khoản tiền và số dư đầu kỳ.
2. Danh sách giao dịch với bộ lọc, phân trang và tổng hợp.
3. Tạo phiếu thu/chi thủ công cho ba loại tài khoản với khóa idempotency do client giữ nguyên khi retry.
4. `Lưu` và `Lưu & In`; Expo Web mở luồng in/tải file sau khi lưu thành công, còn chia sẻ Native chỉ là đường tương thích phụ.
5. Hủy phiếu bằng bút toán đảo, không sửa/xóa chứng từ đã ghi sổ.
6. Tạo phiếu tự động trong cùng transaction với giao dịch tiền nguồn bất biến; một chứng từ nghiệp vụ có thể có nhiều giao dịch tiền.
7. Xuất CSV/XLSX theo bộ lọc hiện tại.
8. Phân quyền ADMIN/CASHIER, AuditLog và `cashbook:changed` realtime.
9. Ghi nhận đúng tiền cọc, phần tiền khách trả thêm, hoàn cọc, thanh toán công nợ và chi/đảo chi lương.

### Ngoài phạm vi

- Hồi tố toàn bộ hóa đơn/chứng từ trước ngày kích hoạt.
- Đối soát sao kê ngân hàng hoặc ví qua API nhà cung cấp.
- Chuyển tiền giữa hai tài khoản, khóa sổ theo kỳ, đối soát ngân hàng và quy trình duyệt nhiều cấp.
- Hạch toán kế toán kép, tài khoản kế toán hoặc thay thế báo cáo doanh thu hiện tại.
- Sửa một chứng từ đã ghi sổ; nghiệp vụ sửa phải hủy và lập phiếu mới.
- Quỹ theo chi nhánh. MVP vận hành một sổ quỹ dùng chung cho một nhà hàng vì POS, Order và Inventory hiện chưa có `branchId`; mở rộng đa chi nhánh phải là migration xuyên các domain nguồn, không chỉ thêm `branchId` vào Cashbook.

## 3. Quyết định kiến trúc

### Phương án được chọn: chứng từ thống nhất và sổ tiền bất biến

Dùng một mô hình `CashVoucher` cho cả thu và chi, liên kết một `FinancialAccount`. Sáu biểu mẫu chỉ là sáu cấu hình của cùng một composer. Phiếu thủ công và phiếu tự động đi qua cùng một posting service để dùng chung validation, mã chứng từ, idempotency, audit và realtime.

Mọi biến động tự động phải tham chiếu một **giao dịch tiền bất biến** như `ReservationDepositTransaction`, `OrderPaymentTransaction`, `SupplierPayment` hoặc `EmployeePayrollPayment`; không dùng riêng ID chứng từ cha làm khóa nguồn. Việc áp cọc vào hóa đơn hoặc giảm công nợ không phải là tiền mới đi vào/ra và không tạo voucher.

Phương án này được chọn thay cho:

- sáu bảng/màn hình riêng: nhiều mã trùng và dễ lệch quy tắc;
- hai bảng phiếu thu/phiếu chi: vẫn lặp logic và khó tổng hợp số dư;
- event sourcing toàn hệ thống: đúng về học thuật nhưng quá lớn cho phạm vi hiện tại.

## 4. Mô hình dữ liệu

### Enum

- `FinancialAccountType`: `CASH`, `BANK`, `E_WALLET`.
- `CashVoucherDirection`: `RECEIPT`, `PAYMENT`.
- `CashVoucherStatus`: `POSTED`, `CANCELLED`.
- `CashVoucherSourceType`: `MANUAL`, `RESERVATION_DEPOSIT`, `RESERVATION_REFUND`, `ORDER_PAYMENT`, `SALES_RETURN_REFUND`, `PURCHASE_RECEIPT_PAYMENT`, `SUPPLIER_PAYMENT`, `PURCHASE_RETURN_REFUND`, `PAYROLL_PAYMENT`, `REVERSAL`.
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
- `sourceType`, `sourceTransactionId` nullable, `sourceCode` nullable, `sourceKey` duy nhất. `sourceTransactionId` là ID giao dịch tiền bất biến, không phải ID Order/Reservation/Payroll cha.
- `clientRequestId` nullable; bắt buộc và duy nhất theo actor đối với phiếu thủ công để replay cùng request trả lại cùng kết quả.
- `linkedPurchaseReceiptId`, `sourceInvoiceNumber`, `sourceInvoiceDate` nullable cho liên kết hóa đơn đầu vào; số/ngày là snapshot để lịch sử không đổi khi chứng từ nguồn được cập nhật.
- `reversalOfId` nullable và duy nhất; `cancelledAt`, `cancelledByUserId`, `cancelReason` trên phiếu gốc.
- `createdByUserId`, timestamps.
- `amount` luôn là số nguyên VND dương, tối đa 2 tỷ đồng.

`sourceKey` là khóa idempotency do server tạo từ giao dịch tiền, ví dụ `ORDER_PAYMENT_TRANSACTION:123`, `RESERVATION_DEPOSIT_TRANSACTION:51`, `PAYROLL_PAYMENT:88`. Phiếu thủ công dùng `MANUAL:{actorId}:{clientRequestId}` với `clientRequestId` do client sinh một lần và giữ nguyên cho mọi retry.

## 5. Bất biến nghiệp vụ

1. Mọi phiếu POSTED có đúng một account đang hoạt động và một category cùng chiều thu/chi.
2. Tiền mặt luôn dùng account CASH mặc định; client không được giả mạo account khác loại.
3. Phiếu ngân hàng bắt buộc account BANK và phương thức `BANK_TRANSFER` hoặc `CREDIT_CARD`.
4. Phiếu ví bắt buộc account E_WALLET và phương thức `E_WALLET`.
5. Không cho bất kỳ posting hoặc reversal nào làm số dư âm tại `occurredAt` hoặc tại bất kỳ mốc voucher nào về sau. Service khóa account, đọc ledger theo thứ tự `occurredAt, id` và kiểm tra running balance trong transaction.
6. Chứng từ tự động được tạo trong cùng database transaction với nghiệp vụ nguồn. Nếu ghi sổ thất bại, nghiệp vụ nguồn rollback.
7. Phiếu tự động không sửa trực tiếp và không hủy độc lập với giao dịch tiền nguồn.
8. Hủy phiếu thủ công tạo một phiếu `REVERSAL` đối chiều, cùng account và amount; phiếu gốc chuyển `CANCELLED`. Nếu reversal của phiếu thu làm âm running balance ở hiện tại hoặc bất kỳ mốc sau `occurredAt`, yêu cầu bị từ chối. MVP không có quyền ép âm quỹ; ADMIN phải xử lý giao dịch phụ thuộc hoặc bổ sung nguồn tiền hợp lệ trước khi hủy.
9. Không xóa vật lý account, category, party hoặc voucher đã được tham chiếu.
10. Event và thao tác in chỉ chạy sau commit.
11. Báo cáo doanh thu hiện tại tiếp tục lấy từ Order; cờ `affectsBusinessResult` chỉ phục vụ lọc/tổng hợp Sổ quỹ trong MVP, tránh cộng doanh thu hai lần.
12. Category hệ thống dành cho auto-posting không được dùng cho phiếu thủ công. `affectsBusinessResult` lấy mặc định từ category; chỉ ADMIN được override kèm lý do audit.
13. Đơn `PAID` hoặc `COMPLETED` không được void. Hoàn tiền phải đi qua Sales Return/Refund và tạo giao dịch tiền riêng.
14. CASHIER dùng giờ server và không được backdate. ADMIN được backdate từ `activatedAt` đến hiện tại khi có lý do, nhưng vẫn phải qua kiểm tra running balance.

## 6. Cutover và số dư đầu kỳ

- `CashbookSetting` có một record gồm `activatedAt`, `activatedByUserId`.
- Khi migration chạy, hệ thống tạo account CASH mặc định nhưng chưa hồi tố dữ liệu.
- ADMIN nhập số dư đầu kỳ cho các account và kích hoạt Sổ quỹ.
- Posting tự động chỉ áp dụng cho nghiệp vụ hoàn tất tại hoặc sau `activatedAt`.
- Các chứng từ trước thời điểm kích hoạt không sinh phiếu. Khi cần đối chiếu, người dùng xem tại module nguồn.
- Kích hoạt là thao tác một lần và được ghi AuditLog.
- Không cho posting tương lai; thời điểm nguồn là `confirmedAt`/`paidAt` do server ghi.
- Với backdate của ADMIN, opening balance chỉ tham gia từ `openingAt`; khoảng báo cáo chứa `openingAt` phải đưa opening balance vào closing balance đúng một lần.
- Số dư thực của quỹ tại thời điểm `T` bằng opening balance đã có hiệu lực cộng toàn bộ voucher/reversal có `occurredAt <= T`, không phụ thuộc filter category, creator hoặc tìm kiếm.

## 7. Đồng bộ nghiệp vụ nguồn

Mỗi dòng dưới đây là contract bắt buộc. `Không tạo voucher` nghĩa là chỉ thay đổi quyền lợi hoặc công nợ nội bộ, không có tiền mới đi qua tài khoản.

| Sự kiện tiền | Chứng từ/giao dịch nguồn | Voucher | Số tiền |
|---|---|---|---:|
| Xác nhận đã nhận cọc | `ReservationDepositTransaction(DEPOSIT, SUCCESS)` | `RECEIPT / RESERVATION_DEPOSIT` | Số thực nhận |
| Áp cọc vào hóa đơn | `ReservationDepositTransaction(APPLY_TO_BILL, SUCCESS)` | Không tạo voucher | 0 |
| Hoàn cọc thành công | `ReservationDepositTransaction(REFUND/PARTIAL_REFUND, SUCCESS)` | `PAYMENT / RESERVATION_REFUND` | Số thực hoàn |
| Khách thanh toán thêm cho đơn | một `OrderPaymentTransaction(SUCCESS)` cho mỗi lần/phương thức | `RECEIPT / ORDER_PAYMENT` | Số thực nhận thêm sau cọc/tín dụng |
| Đơn được thanh toán hoàn toàn bằng cọc | `APPLY_TO_BILL` không kèm tiền mới | Không tạo voucher | 0 |
| Hoàn tiền trả hàng bán | giao dịch refund bất biến gắn `OrderReturn` | `PAYMENT / SALES_RETURN_REFUND` | `refundedAmount` thực trả |
| Trả ngay khi ghi nhận phiếu nhập | `SupplierPayment(SUCCESS)` gắn `PurchaseReceipt` | `PAYMENT / PURCHASE_RECEIPT_PAYMENT` | `paidAmount` thực trả |
| Trả công nợ nhà cung cấp sau đó | `SupplierPayment(SUCCESS)` | `PAYMENT / SUPPLIER_PAYMENT` | Số thực trả |
| Giảm công nợ do trả hàng nhập nhưng chưa nhận tiền | `PurchaseReturn` debt reduction | Không tạo voucher | 0 |
| Nhận tiền hoàn từ nhà cung cấp | giao dịch refund bất biến gắn `PurchaseReturn` | `RECEIPT / PURCHASE_RETURN_REFUND` | `refundAmount` thực nhận |
| Chi lương | `EmployeePayrollPayment(SUCCESS)` | `PAYMENT / PAYROLL_PAYMENT` | Số thực chi |
| Đảo chi lương | `EmployeePayrollPayment(REVERSED)` | Reversal của voucher nguồn | Số đã đảo |

Mọi row nguồn và `CashVoucher` phải được tạo/cập nhật trong cùng database transaction. Nếu posting thất bại, toàn bộ nghiệp vụ nguồn rollback. Một Order, Reservation, PurchaseReceipt hoặc PayrollLine có thể có nhiều giao dịch tiền; mỗi giao dịch có `sourceKey` riêng.

## 8. API

Tất cả endpoint yêu cầu JWT. ADMIN có toàn quyền; CASHIER được xem, tạo phiếu thủ công và in nhưng không quản lý account, category, số dư đầu kỳ hoặc kích hoạt.

### Dashboard và voucher

- `GET /api/cashbook`: query `search`, `accountTypes`, `accountIds`, `from`, `to`, `directions`, `categoryIds`, `statuses`, `affectsBusinessResult`, `createdByUserIds`, `page`, `pageSize`.
- Response tách `balanceSummary` (`openingBalance`, `closingBalance`, tính theo account + thời gian, gồm reversal) và `filteredSummary` (`rowCount`, `totalReceipts`, `totalPayments`, `netMovement`, áp dụng toàn bộ filter hiện tại). Reversal xuất hiện như một dòng có liên kết tới phiếu gốc.
- `POST /api/cashbook/vouchers`: tạo phiếu thủ công POSTED; bắt buộc header `Idempotency-Key`, replay cùng actor/request trả cùng voucher.
- `GET /api/cashbook/vouchers/:id`: chi tiết.
- `POST /api/cashbook/vouchers/:id/cancel`: ADMIN-only, lý do hủy và expected version; server tạo reversal sau khi kiểm tra running balance ở mọi mốc sau đó.
- `GET /api/cashbook/export?format=csv|xlsx`: bỏ pagination nhưng giữ bộ lọc.
- `GET /api/cashbook/vouchers/:id/print`: trả dữ liệu in/PDF phù hợp môi trường.

### Thiết lập

- `GET/POST/PATCH /api/cashbook/accounts[/:id]`.
- `GET/POST/PATCH /api/cashbook/categories[/:id]`.
- `GET/POST /api/cashbook/parties` để tìm/tạo đối tượng Khác.
- `GET /api/cashbook/counterparties` để tìm tổng hợp Supplier, DeliveryPartner, Employee và FinancialParty.
- `GET /api/cashbook/purchase-invoices` để chọn `invoiceNumber`/`invoiceDate` từ PurchaseReceipt đã POSTED.
- `GET /api/cashbook/settings`, `POST /api/cashbook/activate`.
- API nội bộ posting nhận `sourceType + sourceTransactionId`; controller nguồn không được tự dựng `sourceKey` từ Order/Reservation cha.

## 9. Expo Web admin UI

### Màn hình chính

- Mục tiêu nghiệm thu là màn hình quản trị responsive chạy trên Expo Web. Component dùng React Native primitives để có thể chạy Android/iOS, nhưng không dùng native-only behavior làm contract chính.
- Thêm tab ADMIN `Sổ quỹ`; CASHIER được xem và tạo phiếu thủ công tại thời gian server, không được backdate, hủy, quản lý account/category hoặc override KQKD.
- Desktop: rail bộ lọc bên trái, toolbar, dải tổng hợp bốn chỉ số và bảng giao dịch.
- Mobile: dải tổng hợp cuộn ngang, bộ lọc trong bottom sheet, danh sách dạng thẻ và nút hành động gọn.
- Bộ lọc: nhóm quỹ, thời gian, loại chứng từ, loại thu/chi, trạng thái, hạch toán KQKD và người tạo. UI ghi rõ thẻ nào là số dư thực và thẻ nào là tổng của tập dòng đang lọc.
- Giá trị thu màu primary/xanh; chi màu danger/đỏ; tồn quỹ màu success/xanh lá. Không dùng màu làm tín hiệu duy nhất.

### Sáu form từ một composer

Trường chung: mã tự động, thời gian, loại thu/chi, người thu/chi, loại đối tượng, tên người nộp/nhận, số tiền, ghi chú, hạch toán KQKD. CASHIER thấy thời gian server dạng read-only; ADMIN dùng date/time picker khi backdate và bắt buộc nhập lý do.

- Thu tiền mặt: không hiện phương thức/tài khoản.
- Thu ngân hàng: hiện phương thức và tài khoản nhận.
- Thu ví: hiện tài khoản ví nhận.
- Chi tiền mặt: thêm chọn hóa đơn đầu vào; không hiện phương thức/tài khoản.
- Chi ngân hàng: thêm hóa đơn, phương thức và tài khoản chi.
- Chi ví: thêm hóa đơn và tài khoản ví chi.

Modal rộng hai cột trên desktop/tablet, toàn màn hình trên mobile. Footer cố định gồm `Bỏ qua`, `Lưu & In`, `Lưu`. Form dùng keyboard số, thông báo lỗi cạnh trường, giữ cùng idempotency key khi retry và chỉ sinh key mới sau khi save thành công hoặc người dùng chủ động reset form.

### Quản lý account

Màn hình/overlay thiết lập nhỏ trong Sổ quỹ:

- CASH mặc định chỉ đổi tên hoặc ngừng khi không còn là mặc định và không có giao dịch mới;
- BANK nhập tên ngân hàng, tên tài khoản và số tài khoản;
- E_WALLET nhập nhà cung cấp ví và định danh ví;
- số tài khoản/định danh hiển thị dạng che bớt trong danh sách.
- tìm counterparties theo API có debounce/pagination; không giới hạn vào tám kết quả tải ban đầu;
- dòng reversal hiển thị mã phiếu gốc, lý do, người hủy và ảnh hưởng số dư; không ẩn khỏi list/export;
- bản in có tên/địa chỉ đơn vị, tên/số/ngày chứng từ, đối tượng, nội dung nghiệp vụ, số tiền bằng số và chữ, người lập/người duyệt/người nộp hoặc nhận và vùng chữ ký phù hợp cấu hình doanh nghiệp.

## 10. Realtime, audit và bảo mật

- Sau commit phát `cashbook:changed` với accountIds, voucherId, reason, updatedAt.
- `RestaurantContext` giữ `cashbookRevision`; màn hình đang mở refetch có debounce.
- Audit action: kích hoạt, account/category create/update/deactivate, voucher created, voucher auto-posted, voucher cancelled/reversed.
- Không ghi đầy đủ số tài khoản vào log hoặc error; API trả số đã che ngoài màn quản trị.
- Backend tự xác định actor từ JWT; không tin `handlerUserId` hoặc creator từ client.

## 11. Xử lý lỗi

- `400`: field hoặc account/category không đúng loại, thời gian tương lai hoặc backdate thiếu lý do.
- `403`: role không đủ quyền.
- `404`: account, category, source invoice hoặc voucher không tồn tại.
- `409`: source transaction đã ghi sổ, idempotency key được dùng với payload khác, running balance không đủ tại một mốc, version cũ, account ngừng hoạt động hoặc chứng từ đã hủy.
- Prisma unique conflict của `sourceKey` được chuyển thành 409 có thông báo nghiệp vụ.
- Client giữ dữ liệu form khi lỗi mạng/server và chỉ đóng modal sau response thành công.

## 12. Kiểm thử chấp nhận

### Backend

- Migration, seed account/category và cutover không hồi tố.
- CRUD account/category/party, quyền và validation theo loại.
- Tạo đủ sáu biến thể phiếu; tổng hợp số dư và bộ lọc đúng.
- Hai request cùng source transaction chỉ sinh một phiếu; hai giao dịch thanh toán khác nhau của cùng Order sinh hai phiếu.
- Retry phiếu thủ công với cùng actor/key/payload trả cùng voucher; cùng key khác payload trả 409.
- Phiếu chi/backdate/reversal làm âm running balance tại hiện tại hoặc một mốc sau đó bị 409 và không tạo voucher.
- Hủy tạo reversal đúng một lần; số dư phục hồi và có audit.
- Deposit/refund, từng OrderPaymentTransaction, SalesReturn refund, SupplierPayment, PurchaseReturn refund và PayrollPayment/reversal ghi quỹ atomic; APPLY_TO_BILL, debt reduction và order trả hoàn toàn bằng cọc không tạo voucher.
- Đơn PAID/COMPLETED tiếp tục bị chặn void; hoàn tiền chỉ qua Sales Return/Refund.
- `balanceSummary` đúng với account/time và không đổi khi lọc category/creator/search; `filteredSummary` khớp chính xác các dòng lọc, gồm reversal.
- Export CSV/XLSX mở được và đúng bộ lọc.

### Frontend

- API serialization và view model tính dấu/tổng hợp.
- Composer hiển thị đúng trường cho sáu cấu hình, giữ idempotency key khi retry và dùng date/time picker đúng quyền.
- Validation tài khoản/phương thức/số tiền, chống submit kép và giữ form khi lỗi.
- List/filter/hai loại summary responsive; reversal nhìn thấy và realtime revision refetch.
- `Lưu & In` chỉ gọi print/share sau khi save thành công.

### Regression

- Toàn bộ test Order, SalesReturn, PurchaseReceipt, PurchaseReturn, inventory và reports hiện có tiếp tục qua.
- Mọi source flow mới bắt buộc chọn/resolve account tương thích trước commit; không fallback âm thầm cho BANK/E_WALLET.

## 13. Tiêu chí hoàn thành

1. ADMIN cấu hình số dư đầu kỳ, account và kích hoạt một lần.
2. Người dùng tạo được sáu loại phiếu đúng giao diện và xem số dư cập nhật ngay.
3. Tất cả sự kiện trong bảng ánh xạ ghi tiền đúng một lần theo source transaction trong cùng transaction; sự kiện không có cash movement không tạo voucher.
4. Không có đường sửa/xóa làm mất lịch sử; hủy luôn có reversal và audit.
5. Balance tại mọi thời điểm không âm; báo cáo phân biệt số dư thật với tổng dòng lọc và hiển thị reversal để đối chiếu.
6. Expo Web build, backend/frontend typecheck, lint mục tiêu và toàn bộ test nguồn tài chính liên quan đều đạt; Android/iOS giữ tương thích component nhưng không phải acceptance gate chính.
