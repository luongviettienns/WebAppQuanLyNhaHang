# Phiếu xuất hủy — Design Specification

## Mục tiêu

Thêm nghiệp vụ xuất hủy nguyên liệu theo chứng từ, cho phép lưu tạm, hoàn thành hoặc hủy. Khi hoàn thành, hệ thống giảm tồn kho một cách nguyên tử, ghi `KITCHEN_WASTE` vào sổ giao dịch, cập nhật báo cáo chi phí, lưu audit và thông báo realtime cho các màn hình đang xem tồn kho.

## Phạm vi

MVP bao gồm danh sách phiếu, composer Native, tìm/chọn nguyên liệu, import Excel, export CSV/XLSX, lưu tạm, hoàn thành và hủy phiếu. Chỉ người dùng `ADMIN` có quyền thao tác.

Không thêm chi nhánh/kho vật lý vì schema hiện không có thực thể đó. Nhãn chi nhánh trong ảnh tham chiếu không được lưu hoặc hiển thị như một dữ liệu thật. Không triển khai trả hàng nhà cung cấp, hóa đơn đầu vào hoặc điều chỉnh tồn tổng quát trong phạm vi này.

## Phương án được chọn

Dùng chứng từ riêng `InventoryWaste` với `InventoryWasteLine`, thay vì gọi trực tiếp thao tác trừ tồn.

Lý do: phiếu riêng giữ được draft, lịch sử, người tạo/người hoàn thành, snapshot giá vốn/hàng hóa, export, audit và đối soát với giao dịch ledger. `InventoryTransactionType.KITCHEN_WASTE` đã tồn tại và báo cáo hiện đã cộng loại giao dịch này vào giá vốn.

## Mô hình dữ liệu

Thêm enum:

```prisma
enum InventoryWasteStatus {
  DRAFT
  COMPLETED
  CANCELLED
}
```

Thêm `InventoryWaste`:

```prisma
model InventoryWaste {
  id                  Int                  @id @default(autoincrement())
  wasteCode           String               @unique
  status              InventoryWasteStatus @default(DRAFT)
  wastedAt            DateTime             @default(now())
  completedAt         DateTime?
  note                String?              @db.VarChar(1000)
  totalValue          Int                  @default(0)
  createdByUserId     Int?
  completedByUserId   Int?
  cancelledByUserId   Int?
  cancelledAt         DateTime?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  lines                 InventoryWasteLine[]
  inventoryTransactions InventoryTransaction[]

  @@index([status, wastedAt])
  @@index([wastedAt])
}
```

Thêm `InventoryWasteLine`:

```prisma
model InventoryWasteLine {
  id               Int      @id @default(autoincrement())
  inventoryWasteId Int
  ingredientId     Int
  ingredientSku    String
  ingredientName   String
  unit             String
  systemQuantity   Float
  quantity         Float
  costPerUnit      Int
  lineValue        Int
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  inventoryWaste InventoryWaste @relation(fields: [inventoryWasteId], references: [id], onDelete: Cascade)
  ingredient     Ingredient     @relation(fields: [ingredientId], references: [id], onDelete: Restrict)

  @@unique([inventoryWasteId, ingredientId])
  @@index([ingredientId])
}
```

Mở rộng `InventoryTransaction` với `inventoryWasteId Int?`, relation `inventoryWaste`, và index `[inventoryWasteId]`. `Ingredient` có relation `inventoryWasteLines`.

`totalValue` và `lineValue` được lưu số dương để thể hiện giá trị hàng bị hủy. Ledger dùng `quantity` và `costAmount` âm, là nguồn số liệu cho báo cáo.

## Quy tắc nghiệp vụ

### Draft

- Mã phiếu có dạng `XH000001`, tạo tự động, unique và retry khi trùng mã.
- Có thể tạo phiếu rỗng, thêm/sửa/xóa dòng và ghi chú khi trạng thái `DRAFT`.
- Một nguyên liệu chỉ xuất hiện một lần; số lượng hủy phải hữu hạn và lớn hơn 0.
- Khi tạo hoặc thay thế dòng, server snapshot SKU, tên, đơn vị, tồn hiện tại và giá vốn hiện tại từ nguyên liệu đang active.

### Hoàn thành

- Chỉ `DRAFT` được hoàn thành; phiếu cần ít nhất một dòng và ghi chú không rỗng để có lý do truy vết.
- Trong một Prisma transaction, lấy lock `FOR UPDATE` cho tất cả nguyên liệu theo ID tăng dần.
- Đọc lại tồn sau lock. Nếu bất kỳ `quantity > currentStock`, rollback toàn bộ và trả `409 CONFLICT`; không ghi ledger, không cập nhật phiếu hoặc tồn.
- Đọc giá vốn hiện tại trong transaction. Trước khi hoàn thành, cập nhật snapshot `systemQuantity`, `costPerUnit`, `lineValue` theo dữ liệu hiện tại để giá trị hủy phản ánh giá vốn bình quân hiệu lực lúc xuất hủy.
- Với từng dòng: `Ingredient.currentStock -= quantity`; tạo `InventoryTransaction` với `type = KITCHEN_WASTE`, `quantity = -quantity`, `costAmount = -lineValue`, `inventoryWasteId`, người tạo và note `Xuất hủy <wasteCode>`.
- Ghi tổng giá trị dương, `COMPLETED`, `completedAt`, `completedByUserId` trên chứng từ.
- Sau commit: ghi audit `INVENTORY_WASTE_COMPLETED`, phát `inventory:changed` với reason `KITCHEN_WASTE` và các ingredient ID đã đổi.

### Hủy và bất biến

- Hủy chỉ được khi `DRAFT`; không làm thay đổi tồn hoặc ledger.
- `COMPLETED` và `CANCELLED` không thể sửa, hủy hay hoàn thành lại.
- Tạo/sửa/hủy cũng có audit: `INVENTORY_WASTE_CREATED`, `INVENTORY_WASTE_UPDATED`, `INVENTORY_WASTE_CANCELLED`.

## API

Tất cả endpoint nằm dưới `/api/inventory`, yêu cầu `authenticate` và `authorize('ADMIN')`.

| Method | Route | Hành vi |
| --- | --- | --- |
| `GET` | `/wastes` | Danh sách, lọc `statuses`, `from`, `to`, `search`, phân trang. |
| `POST` | `/wastes` | Tạo draft. |
| `GET` | `/wastes/export?format=csv|xlsx` | Export theo bộ lọc. |
| `POST` | `/wastes/import/preview` | Parse/đối soát Excel, không ghi dữ liệu. |
| `GET` | `/wastes/:id` | Chi tiết và năm phiếu gần đây. |
| `PATCH` | `/wastes/:id` | Cập nhật draft. |
| `POST` | `/wastes/:id/complete` | Hoàn thành atomically. |
| `POST` | `/wastes/:id/cancel` | Hủy draft. |

DTO danh sách có `totalValue` tổng theo filter; item chi tiết có tổng số lượng, tổng giá trị, dòng snapshot và metadata trạng thái.

## Excel và export

Template/import nhận các cột: `Mã nguyên liệu`, `Tên nguyên liệu`, `Đơn vị tính`, `Số lượng hủy`, `Ghi chú`.

Preview xác minh SKU active, đơn vị nếu có, số lượng dương, SKU không trùng và số lượng không vượt tồn tại thời điểm preview. Kiểm tra tồn ở preview chỉ để phản hồi sớm; kiểm tra quyết định vẫn chạy lại khi hoàn thành.

Export dùng các cột: `Mã xuất hủy`, `Thời gian`, `Người tạo`, `Tổng giá trị`, `Ghi chú`, `Trạng thái`.

## Native UI

### Danh sách

Màn `Phiếu xuất hủy` dùng `ScreenHeader`, `Surface`, `Button`, `StatusBadge` và token semantic hiện có. Trên desktop có panel lọc bên trái; màn hẹp đưa filter lên trên bảng.

- Tìm theo mã phiếu.
- Lọc thời gian và ba trạng thái: Phiếu tạm, Hoàn thành, Đã hủy.
- Export CSV/XLSX và nút `+ Xuất hủy`.
- Bảng: Mã xuất hủy, Thời gian, Người tạo, Tổng giá trị, Ghi chú, Trạng thái.
- Empty state giải thích bộ lọc và mời tạo phiếu, thay vì mô phỏng dữ liệu chi nhánh.

### Composer

Màn `Xuất hủy` có bảng bên trái và panel thông tin phiếu bên phải; ở màn hẹp chúng xếp dọc.

- Tìm nguyên liệu theo mã/tên, thêm từng dòng, xóa dòng và nhập số lượng hủy.
- Cột: STT, Mã hàng, Tên hàng, SL hủy, Giá vốn, Giá trị hủy.
- Khi chưa có dòng, hiển thị vùng import Excel lớn như ảnh tham chiếu cùng nút Chọn file (Web); chọn nguyên liệu vẫn là luồng Native chính.
- Panel bên phải: trạng thái, mã tự động, tổng giá trị hủy, ghi chú/lý do, kiểm gần đây và nút Lưu tạm/Hoàn thành.
- Sau hoàn thành, màn ở read-only và quay về danh sách để refetch theo `inventoryRevision`.

`InventoryCatalogScreen` đổi mục Xuất hủy từ reserved/disabled thành điểm vào hoạt động. `InventoryScreen` thêm sections list/composer tương tự Phiếu nhập hàng và Kiểm kho.

## Đồng bộ hệ thống

- `InventoryTransaction` mới có `KITCHEN_WASTE`; báo cáo COGS hiện đã đọc loại này nên không cần thay đổi công thức báo cáo.
- `inventory:changed` mở rộng union reason bằng `KITCHEN_WASTE`; `RestaurantContext` đã tăng `inventoryRevision` khi nhận event nên catalog, kiểm kho và các màn phụ thuộc sẽ reload.
- Không cập nhật giá vốn trung bình khi xuất hủy; chỉ giảm số lượng. Giá vốn hiện hành được dùng để tính giá trị hủy.

## Kiểm thử và tiêu chí chấp nhận

Backend cần unit test math/schema, persistence test relation, service test và API test cho:

1. Tạo/cập nhật draft snapshot mà không đổi tồn/ledger.
2. Hoàn thành trừ tồn và tạo đúng một `KITCHEN_WASTE` ledger âm cho mỗi dòng.
3. Rollback toàn bộ khi một dòng vượt tồn tại thời điểm complete.
4. Bắt buộc ghi chú và ít nhất một dòng khi complete.
5. Không hoàn thành hai lần hay sửa/hủy trạng thái terminal.
6. Import preview phân biệt dòng hợp lệ, trùng SKU, unit sai và vượt tồn.
7. Chỉ ADMIN được gọi command API; export/list tôn trọng filter.

Frontend cần test API helper, view-model tổng giá trị dương/status, Native composer không gọi complete khi thiếu ghi chú hoặc số lượng không hợp lệ, và điều hướng catalog → list → composer.

Chạy focused backend/frontend suites, backend typecheck, frontend lint/build. Khi chạy toàn repo, báo riêng mọi lỗi baseline có trước hoặc không thuộc module xuất hủy.
