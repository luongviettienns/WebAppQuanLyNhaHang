# Đặc tả thiết kế — Đơn hàng / Trả hàng

## 1. Mục tiêu và phạm vi

Xây dựng luồng Native `Đơn hàng > Trả hàng` theo hai ảnh tham chiếu: danh sách phiếu trả hàng và hộp thoại chọn hóa đơn của nhân viên thu ngân. Chức năng dùng chung dữ liệu đơn hàng, thanh toán, tồn kho, audit và realtime hiện có.

MVP gồm danh sách phiếu trả hàng; tìm kiếm mã, ngày, trạng thái và phòng/bàn; hộp thoại chọn hóa đơn đã thanh toán; chọn số lượng từng dòng món; chọn phương thức hoàn tiền; hoàn tất; xem chi tiết; transaction đồng bộ hoàn tiền, tồn BOM, tồn món bán, ledger, audit và event.

Không nằm trong MVP: tạo CRM/giao hàng/chi nhánh/kênh bán mới; trả số tiền khác với số tiền hệ thống tính; hủy phiếu đã hoàn tất và đảo ledger; tạo bảng `Invoice` mới hoặc sửa trạng thái thanh toán gốc của Order. Ảnh chỉ là visual reference, các chuỗi placeholder lỗi không phải contract.

## 2. Mô hình dữ liệu

Thêm `OrderReturn` và `OrderReturnLine`:

- `OrderReturn`: mã phiếu, Order nguồn, thời gian, trạng thái `COMPLETED/CANCELLED`, tổng cần trả, tổng đã trả, phương thức, ghi chú, actor và timestamps.
- `OrderReturnLine`: OrderItem nguồn, snapshot món/SKU/tên, số lượng trả, đơn giá snapshot và thành tiền.
- `InventoryTransaction.orderReturnId` + type `SALES_RETURN` để truy vết tăng tồn nguyên liệu.

`Order` vẫn giữ `PAID/COMPLETED`; chứng từ trả hàng là nghiệp vụ phát sinh sau bán, không hồi tố hóa đơn.

## 3. Bất biến nghiệp vụ

1. Chỉ `Order.status=COMPLETED` và `paymentStatus=PAID` được chọn trả.
2. Tổng số lượng các phiếu `COMPLETED` trước đó cộng số lượng mới không vượt `OrderItem.quantity`.
3. Mỗi OrderItem chỉ xuất hiện một lần trong một phiếu.
4. `quantity` trả là số nguyên dương; phiếu phải có ít nhất một dòng.
5. `lineAmount = quantity * floor(OrderItem.subtotal / OrderItem.quantity)`; không đọc giá MenuItem hiện tại.
6. `totalRefundDue` là tổng các dòng; `refundedAmount` mặc định bằng tổng cần trả và phải bằng tổng cần trả trong MVP.
7. Transaction khóa Order và các OrderItem/Inventory rows liên quan để hai nhân viên không trả vượt số lượng.
8. Tồn nguyên liệu tăng theo BOM tại thời điểm trả; ledger `SALES_RETURN` có quantity dương và costAmount theo `Ingredient.costPerUnit` hiện tại.
9. Món có `trackStock=true` được tăng `MenuItem.stockQuantity` theo số lượng trả.
10. Event chỉ phát sau commit.

## 4. API contract

Tất cả endpoint yêu cầu JWT và role `CASHIER` hoặc `ADMIN`.

### `GET /api/orders/returns`

Query: `search`, `from`, `to`, `statuses=COMPLETED,CANCELLED`, `tableId`, `page`, `pageSize`. Trả `{ items, pagination, summary }`; item gồm `returnCode`, `returnedAt`, `sourceOrderCode`, `customerName:null`, `tableNumber`, `totalRefundDue`, `refundedAmount`, `status`.

### `GET /api/orders/returns/candidates`

Query: `search`, `from`, `to`, `tableId`, `page`, `pageSize`. Chỉ trả Order PAID/COMPLETED còn ít nhất một dòng có thể trả, cùng `remainingItems` gồm id, SKU, tên, sold quantity, returned quantity, remaining quantity, unit price, subtotal.

### `GET /api/orders/returns/:id`

Trả header phiếu và snapshot các dòng trả.

### `POST /api/orders/returns`

Body:

```json
{
  "orderId": 1,
  "lines": [{ "orderItemId": 10, "quantity": 1 }],
  "refundMethod": "CASH",
  "refundedAmount": 108000,
  "note": "Khách trả món"
}
```

Server tự tính số tiền, tự tạo mã `THD...`, không tin giá/amount từ client. Response là chứng từ đã `COMPLETED`.

## 5. Native UI

- Giữ tab Đơn hàng hiện có; subnav `Hóa đơn | Trả hàng`, Trả hàng active khi chọn.
- List header: `Phiếu trả hàng`, search `Theo mã phiếu trả`, `+ Trả hàng`, export CSV/XLSX.
- Sidebar: toàn thời gian/custom date, checkbox Đã trả/Đã hủy, chọn phòng/bàn.
- Bảng: mã trả hàng, thời gian, khách hàng, cần trả khách, đã trả khách, trạng thái.
- Nút `+ Trả hàng` mở modal chọn hóa đơn: tìm mã, date range, table, bảng hóa đơn có nút `Chọn`, pagination.
- Sau khi chọn: composer hiển thị hóa đơn nguồn, món, số lượng bán/còn được trả, input số lượng trả, tổng tiền, phương thức, ghi chú và `Hoàn thành`.
- Empty state theo design tokens Native hiện có; không dữ liệu mẫu.

## 6. Quyền, realtime và kiểm thử

- CASHIER/ADMIN được đọc và tạo trả hàng; KITCHEN/guest bị từ chối.
- Sau hoàn tất phát `inventory:changed`, `menu:stockChanged` và `order:returnCompleted` để màn hình refetch.
- Backend test: quyền, candidates, partial return, over-return conflict, concurrent return, inventory/BOM/menu stock, audit và errors.
- Frontend test: query serialization, quantity validation/amount calculation, list/composer state.
