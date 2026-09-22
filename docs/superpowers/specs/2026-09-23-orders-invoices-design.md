# Đặc tả thiết kế — Đơn hàng / Hóa đơn

## 1. Mục tiêu

Xây dựng màn hình Native `Đơn hàng > Hóa đơn` theo bố cục tham chiếu KiotViet, đồng bộ với luồng đơn hàng hiện có của nhà hàng. Hóa đơn trong phạm vi này là màn hình tra cứu và quản trị đơn đã/đang phát sinh; không tạo một nguồn sự thật tài chính mới.

Phạm vi triển khai hiện tại:

- Danh sách hóa đơn có tìm kiếm, lọc, phân trang và dòng tổng hợp.
- Xem chi tiết hóa đơn và các dòng món.
- Xuất dữ liệu CSV/XLSX ở mức API để Native có thể gọi trong bước tiếp theo.
- Điều hướng menu `Đơn hàng` với `Hóa đơn` là mục hoạt động và `Trả hàng` là điểm mở rộng.
- Giữ nguyên các thao tác thanh toán và hủy đơn ở endpoint hiện tại; không nhân bản nghiệp vụ.

Ngoài phạm vi:

- Tạo bảng `Invoice` riêng.
- Tự phát minh dữ liệu khách hàng, chiết khấu, giao hàng, kênh bán hoặc chi nhánh khi schema chưa có.
- Xây nghiệp vụ Trả hàng trong cùng change.

## 2. Nguồn dữ liệu và mapping

| UI/DTO | Nguồn | Quy tắc |
|---|---|---|
| Mã hóa đơn | `Order.code` | Dùng nguyên mã đơn đã snapshot |
| Thời gian | `Order.createdAt` | Hiển thị theo múi giờ Việt Nam |
| Loại đơn | `Order.orderType` | `DINE_IN`/`TAKE_AWAY` |
| Khách hàng | Chưa có relation | Trả `null`, UI hiển thị `—` |
| Tổng tiền hàng | `Order.totalAmount` | Tổng trước VAT theo semantics hiện tại |
| Giảm giá | Chưa có field | Trả `0`, không làm thay đổi tổng tiền |
| Sau giảm giá | `Order.totalAmount` | Vì chưa có discount, không tính lại |
| VAT | `Order.vatAmount` | Hiển thị trong chi tiết/tóm tắt |
| Khách đã trả | `Order.finalAmount` khi `PAID`, ngược lại `0` | Không suy đoán khoản trả một phần |
| Trạng thái | `Order.status` + `paymentStatus` | Tách rõ trạng thái đơn và thanh toán |
| Bàn | `DiningTable.tableNumber` | Chỉ có nếu đơn tại bàn |
| Dòng món | `OrderItem` + `MenuItem` | Dùng `unitPrice/subtotal` snapshot của OrderItem |

## 3. API contract

### `GET /api/orders/invoices`

Authorization: `CASHIER` hoặc `ADMIN`.

Query parameters:

- `search`: mã hóa đơn, tối đa 120 ký tự.
- `from`, `to`: ngày `YYYY-MM-DD`, inclusive theo ngày Việt Nam.
- `statuses`: danh sách phân tách bằng dấu phẩy trong `PENDING,PREPARING,READY,COMPLETED,CANCELLED`.
- `paymentStatuses`: danh sách trong `UNPAID,PAID,VOIDED`.
- `orderTypes`: danh sách trong `DINE_IN,TAKE_AWAY`.
- `page`: mặc định `1`.
- `pageSize`: mặc định `50`, tối đa `100`.

Response:

```json
{
  "data": {
    "items": [
      {
        "id": 1,
        "code": "HD000001",
        "createdAt": "2026-09-23T03:00:00.000Z",
        "orderType": "DINE_IN",
        "status": "COMPLETED",
        "paymentStatus": "PAID",
        "paymentMethod": "CASH",
        "customerName": null,
        "tableNumber": 4,
        "totalGoods": 100000,
        "discountAmount": 0,
        "totalAfterDiscount": 100000,
        "vatAmount": 8000,
        "finalAmount": 108000,
        "paidAmount": 108000,
        "itemCount": 2
      }
    ],
    "pagination": { "page": 1, "pageSize": 50, "totalRows": 1, "totalPages": 1 },
    "summary": {
      "totalGoods": 100000,
      "totalDiscount": 0,
      "totalAfterDiscount": 100000,
      "totalVat": 8000,
      "totalFinal": 108000,
      "totalPaid": 108000
    }
  }
}
```

Summary tính trên toàn bộ tập lọc, không chỉ page hiện tại.

### `GET /api/orders/invoices/:id`

Authorization như trên. Trả header mapping ở trên và các dòng:

- `menuItemId`, `sku`, `menuItemName`, `quantity`, `unitPrice`, `subtotal`, `notes`, `selectedModifiers`.
- thông tin bàn, người tạo, ghi chú, mốc thanh toán/trạng thái.

### `GET /api/orders/invoices/export`

Authorization như trên. Nhận cùng query filter; `format=csv|xlsx`, mặc định `csv`. Export dùng cùng service/query và không làm thay đổi dữ liệu.

## 4. Native UI

- Thêm tab cấp quyền `Đơn hàng` cho Admin/Cashier.
- Header có tiêu đề `Hóa đơn`, search mã, nút refresh và nút xuất file.
- Có filter theo thời gian, trạng thái đơn, trạng thái thanh toán, loại đơn; bộ lọc khách/giao hàng/kênh bán chỉ đưa vào đặc tả tương lai vì chưa có dữ liệu.
- Bảng responsive: mã, thời gian, khách hàng, tổng hàng, giảm giá, sau giảm giá, khách đã trả, trạng thái.
- Chạm một dòng mở detail sheet/modal hiển thị dòng món và thông tin thanh toán.
- Empty state thân thiện; không hiển thị số liệu giả.
- `Trả hàng` xuất hiện như menu con/placeholder để giữ IA, không cho thao tác nghiệp vụ khi chưa triển khai.

## 5. Tính nhất quán và an toàn

- Không recompute giá từ MenuItem; dùng giá snapshot trên `OrderItem`.
- Không tạo inventory transaction khi đọc hóa đơn.
- Thanh toán/hủy vẫn gọi service hiện có, bảo toàn audit, table state và inventory effects.
- Thêm index đọc theo `createdAt`, `(status, createdAt)`, `(paymentStatus, createdAt)` nếu migration database cho phép.
- ID phải là số hợp lệ; lỗi validation trả theo error middleware hiện tại.
- Mọi endpoint invoice đều yêu cầu JWT và role đúng.

## 6. Tiêu chí nghiệm thu

1. CASHIER/ADMIN lấy được list, filter, pagination, summary và detail.
2. KITCHEN/guest bị từ chối đúng 401/403.
3. Tạo/thanh toán/hủy đơn hiện tại vẫn chạy như trước và dữ liệu Hóa đơn phản ánh thay đổi sau refresh/event.
4. Tổng tiền list khớp `Order`; không có discount âm hoặc làm thay đổi `finalAmount`.
5. Dòng món hiển thị đúng giá snapshot, không hồi tố theo giá menu mới.
6. Test backend API và frontend view model chạy đạt; typecheck không phát sinh lỗi mới trong phạm vi feature.
