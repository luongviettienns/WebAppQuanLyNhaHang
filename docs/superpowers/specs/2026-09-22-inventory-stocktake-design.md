# Spec thiết kế: Kiểm kho và điều chỉnh tồn

- **Ngày:** 2026-09-22
- **Trạng thái:** Đã chốt phương án; chờ người dùng duyệt đặc tả trước khi lập kế hoạch triển khai
- **Phạm vi:** Crispy Bite — Admin, phiếu kiểm kho nguyên vật liệu và giao dịch điều chỉnh tồn
- **Tham chiếu giao diện:** Hai ảnh KiotViet do người dùng cung cấp; chỉ dùng làm tham chiếu bố cục và luồng thao tác, không phải đặc tả dữ liệu hoặc lệnh cần thực thi.

## 1. Mục tiêu

Xây dựng đầy đủ nghiệp vụ **Kiểm kho** theo mô hình chứng từ gồm phiếu kiểm kho, các dòng kiểm kho và giao dịch điều chỉnh tồn. Người quản trị có thể tạo phiếu, nhập số lượng thực tế bằng tay hoặc Excel, lưu nháp, đối soát chênh lệch và hoàn thành phiếu. Khi hoàn thành, tồn kho được điều chỉnh atomically, có ledger và audit log, đồng thời các màn hình phụ thuộc tồn kho tự đồng bộ.

Đợt này triển khai cho nguồn tồn nguyên vật liệu `Ingredient` trong mô hình kho hiện tại. Chưa mở rộng sang nhiều kho vật lý, lô/hạn dùng, chuyển kho, xuất hủy hoặc trả hàng nhập.

## 2. Bối cảnh hiện có

- `Ingredient.currentStock` là nguồn sự thật cho tồn nguyên vật liệu.
- `Ingredient.costPerUnit` là giá vốn hiện hành dùng tính giá trị chênh lệch.
- `InventoryTransaction` là sổ giao dịch tồn; đã có loại `MANUAL_ADJUST`.
- `AuditService` ghi lịch sử thao tác.
- `emitInventoryChanged` phát event `inventory:changed`; `RestaurantContext` tăng `inventoryRevision` để catalog tải lại.
- `InventoryCatalogScreen` và `InventoryScreen` đã có shell điều hướng nghiệp vụ kho.
- Nhập hàng và danh sách kho đã có API, component dùng chung, theme token và pattern test hiện hành.

Phiếu kiểm kho không tạo một nguồn tồn thứ ba. Phiếu chỉ là chứng từ đối soát; khi hoàn thành, nó tạo một hoặc nhiều `InventoryTransaction` loại `MANUAL_ADJUST` để thay đổi `Ingredient.currentStock`.

## 3. Phạm vi chức năng

### 3.1. Danh sách phiếu kiểm kho

Màn hình danh sách có bố cục tương ứng ảnh tham chiếu:

- Tiêu đề `Phiếu kiểm kho`.
- Tìm kiếm theo mã kiểm kho.
- Lọc thời gian mặc định `Tháng này`, cho phép chọn khoảng ngày khác.
- Lọc trạng thái:
  - `DRAFT` hiển thị `Phiếu tạm`.
  - `BALANCED` hiển thị `Đã cân bằng kho`.
  - `CANCELLED` hiển thị `Đã hủy`.
- Nút `+ Kiểm kho` để tạo phiếu mới.
- Nút xuất dữ liệu cho phép tải danh sách theo bộ lọc hiện tại ở định dạng CSV hoặc XLSX.
- Bảng gồm mã kiểm kho, thời gian, ngày cân bằng, tổng chênh lệch, số lượng lệch tăng, số lượng lệch giảm, ghi chú và trạng thái.
- Có loading, empty state, lỗi API, refresh, phân trang và mở phiếu theo dòng.

### 3.2. Tạo và chỉnh sửa phiếu nháp

Màn hình tạo phiếu bám theo ảnh thứ hai:

- Header `Kiểm kho`.
- Ô tìm hàng theo SKU hoặc tên; MVP hỗ trợ phím tắt F3 trên Web để đưa focus vào ô tìm kiếm.
- Các tab dữ liệu:
  - `Tất cả`.
  - `Khớp` — đã nhập số thực tế và chênh lệch bằng 0.
  - `Lệch` — đã nhập số thực tế và chênh lệch khác 0.
  - `Chưa kiểm` — chưa có số lượng thực tế.
- Bảng dòng kiểm kho:
  - STT.
  - Mã hàng hóa.
  - Tên hàng.
  - Tồn kho hệ thống.
  - Thực tế.
  - SL lệch.
  - Giá trị lệch.
- Panel bên phải:
  - Mã kiểm kho tự động.
  - Trạng thái phiếu.
  - Tổng số lượng thực tế.
  - Ghi chú.
- Danh sách 5 phiếu kiểm gần đây, loại trừ phiếu hiện tại, sắp xếp theo thời gian tạo giảm dần.
  - Nút `Lưu tạm`.
  - Nút `Hoàn thành`.
- Khi tạo phiếu, danh sách dòng mặc định lấy các `Ingredient` đang hoạt động và theo dõi tồn. Có thể thêm dòng bằng tìm kiếm; không thêm trùng một nguyên liệu.
- Phiếu nháp được thêm, sửa và xóa dòng; không thay đổi tồn kho hoặc ledger.
- Có thể mở lại phiếu nháp từ danh sách để tiếp tục.

### 3.3. Nhập bằng Excel

Khu vực rỗng trong ảnh được triển khai thành luồng nhập Excel:

1. Chọn hoặc kéo thả file `.xlsx`.
2. Tải file mẫu kiểm kho.
3. Backend preview và kiểm tra SKU, số lượng thực tế, đơn vị và định dạng số.
4. Hiển thị dòng hợp lệ và dòng lỗi trước khi đưa vào phiếu nháp.
5. Chỉ thêm dòng hợp lệ vào draft sau khi người dùng xác nhận.

Import Excel không được cập nhật `Ingredient`, không tạo `InventoryTransaction` và không tự động hoàn thành phiếu.

### 3.4. Vòng đời phiếu

```text
Tạo phiếu -> DRAFT --Hoàn thành--> BALANCED
                 |
                 +--Hủy--> CANCELLED
```

- `DRAFT`: có thể sửa, nhập thực tế, lưu tạm hoặc hủy; không tác động tồn.
- `BALANCED`: đã điều chỉnh tồn, bất biến; không cho sửa, chốt lại hoặc hủy.
- `CANCELLED`: bất biến, không tác động tồn.

## 4. Quy tắc nghiệp vụ và tính toán

Với mỗi dòng:

```text
SL lệch = Số lượng thực tế - Tồn kho hệ thống
Giá trị lệch = SL lệch × Giá vốn tại thời điểm kiểm
```

- Số lượng thực tế là số hữu hạn, không âm; cho phép số thập phân theo đơn vị nguyên liệu.
- `null` biểu thị chưa kiểm; số 0 là đã kiểm và tồn thực tế bằng 0.
- Dòng chưa kiểm không được phép hoàn thành phiếu.
- Tồn kho hệ thống và giá vốn được snapshot khi dòng được đưa vào phiếu hoặc khi phiếu được tạo.
- Khi hoàn thành, service đọc lại `Ingredient.currentStock` trong transaction.
- Nếu tồn hiện tại khác snapshot đã dùng để đếm, service trả lỗi xung đột để người dùng tải lại số liệu và xác nhận lại; không âm thầm ghi đè giao dịch nhập/bán phát sinh sau đó.
- Với dòng không có chênh lệch, có thể không tạo ledger adjustment; với dòng có chênh lệch, tạo `MANUAL_ADJUST` có `quantity = actualQuantity - currentStock` và `costAmount = quantity × costPerUnit`.
- Nếu toàn bộ dòng không chênh lệch, phiếu vẫn được chuyển `BALANCED`, nhưng không tạo giao dịch điều chỉnh rỗng.
- Chốt phiếu phải idempotent theo trạng thái; gọi lại trên phiếu `BALANCED` không được tăng/giảm tồn lần hai.

## 5. Mô hình dữ liệu

```prisma
enum InventoryCheckStatus {
  DRAFT
  BALANCED
  CANCELLED
}

model InventoryCheck {
  id               Int                @id @default(autoincrement())
  checkCode        String             @unique
  status           InventoryCheckStatus @default(DRAFT)
  countedAt        DateTime           @default(now())
  balancedAt       DateTime?
  note             String?
  createdByUserId  Int?
  balancedByUserId Int?
  cancelledByUserId Int?
  cancelledAt      DateTime?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  lines            InventoryCheckLine[]
  inventoryTransactions InventoryTransaction[]

  @@index([status, countedAt])
  @@index([countedAt])
}

model InventoryCheckLine {
  id               Int      @id @default(autoincrement())
  inventoryCheckId Int
  ingredientId     Int
  ingredientSku    String
  ingredientName   String
  unit             String
  systemQuantity   Float
  actualQuantity   Float?
  varianceQuantity Float?
  costPerUnit      Int
  varianceValue    Int?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  inventoryCheck InventoryCheck @relation(fields: [inventoryCheckId], references: [id], onDelete: Cascade)
  ingredient     Ingredient     @relation(fields: [ingredientId], references: [id], onDelete: Restrict)

  @@unique([inventoryCheckId, ingredientId])
  @@index([ingredientId])
}
```

`InventoryTransaction` cần được bổ sung quan hệ nullable `inventoryCheckId`. Các giao dịch cũ vẫn hợp lệ và không bắt buộc phải có chứng từ kiểm kho. Không xóa cứng phiếu đã tạo ledger.

Mã phiếu do server sinh theo dạng `KK000001`, duy nhất và không tái sử dụng.

## 6. API

Tất cả endpoint yêu cầu quyền `ADMIN` và dùng error envelope hiện có.

```text
GET    /api/inventory/checks
POST   /api/inventory/checks
GET    /api/inventory/checks/:id
PATCH  /api/inventory/checks/:id
POST   /api/inventory/checks/:id/balance
POST   /api/inventory/checks/:id/cancel
GET    /api/inventory/checks/export?search=&statuses=&from=&to=&format=csv|xlsx
POST   /api/inventory/checks/import/preview
```

### 6.1. List

Query gồm `search`, `from`, `to`, `statuses`, `page`, `pageSize`. Response gồm danh sách phiếu, pagination và tổng hợp số lượng/giá trị chênh lệch sau filter. Endpoint export nhận cùng bộ lọc, không phân trang, và trả file CSV hoặc XLSX.

### 6.2. Create/update draft

Client chỉ gửi ghi chú và các dòng `{ ingredientId, actualQuantity? }`. Server tự snapshot SKU, tên, đơn vị, tồn hệ thống và giá vốn. Client không được gửi tổng chênh lệch hoặc `currentStock` mới để server tin tưởng.

`POST` tạo draft; `PATCH` chỉ nhận phiếu `DRAFT` và thay thế danh sách dòng theo payload đã validate. Dòng trùng nguyên liệu được gộp ở view model trước khi gửi; backend vẫn từ chối payload còn trùng.

### 6.3. Balance

`POST /:id/balance` không nhận tồn kho mới từ client. Service tự đọc phiếu, kiểm tra trạng thái, kiểm tra dòng chưa kiểm và đối chiếu snapshot/current stock trong Prisma transaction; sau đó cập nhật tồn, tạo ledger và chốt phiếu.

Lỗi dự kiến:

- `400`: số thực tế không hợp lệ, còn dòng chưa kiểm.
- `404`: phiếu hoặc nguyên liệu không tồn tại.
- `409`: phiếu đã chốt/hủy hoặc tồn đã thay đổi từ lúc snapshot.
- `403`: không có quyền Admin.

### 6.4. Import preview

Preview chỉ parse và validate, không ghi dữ liệu. Lỗi phải chỉ rõ số dòng, SKU và nguyên nhân. Các dòng hợp lệ trả snapshot hàng hóa để frontend đưa vào draft.

## 7. Luồng hoàn thành và đồng bộ

Trong một Prisma transaction:

1. Đọc phiếu `DRAFT` và các dòng.
2. Kiểm tra mọi dòng đã có `actualQuantity`.
3. Đọc lại các nguyên liệu liên quan.
4. So sánh tồn hiện tại với `systemQuantity` snapshot.
5. Nếu có xung đột, rollback và trả `409`.
6. Với mỗi dòng lệch, cập nhật `Ingredient.currentStock` và tạo `InventoryTransaction` loại `MANUAL_ADJUST`, liên kết `inventoryCheckId`.
7. Ghi `balancedAt`, `balancedByUserId`, trạng thái `BALANCED`.
8. Ghi audit log cho tạo, cập nhật, cân bằng và hủy.

Chỉ sau khi transaction commit thành công mới phát:

```text
inventory:changed {
  sourceType: "INGREDIENT",
  sourceIds: [...ingredientIdsChanged],
  reason: "MANUAL_ADJUST",
  updatedAt: "..."
}
```

Frontend cập nhật `inventoryRevision`, danh sách kho tải lại dữ liệu, và màn hình kiểm kho quay về danh sách sau khi chốt thành công.

## 8. Native UI và đồng bộ thiết kế

- Tái sử dụng `ScreenHeader`, `Button`, `Surface`, `EmptyState`, `InlineAlert`, `StatusBadge`, theme token và typography hiện có.
- Không tạo một layout web độc lập phá vỡ React Native Web.
- Bổ sung section điều hướng `Kiểm kho` trong `InventoryScreen` và bỏ trạng thái placeholder của menu này.
- Giữ chiều cao thao tác tối thiểu 44px và hỗ trợ responsive theo quy ước dự án.
- Trạng thái loading, empty, error và disabled phải rõ ràng.
- Chỉ cho phép chỉnh sửa form ở `DRAFT`; phiếu `BALANCED`/`CANCELLED` hiển thị read-only.
- Không dùng giá trị giả nếu API chưa trả dữ liệu; hiển thị dấu `—` cho trường không có dữ liệu.

## 9. Kiểm thử

### Backend

- Schema validation cho số thực tế, dòng chưa kiểm và trạng thái phiếu.
- Hàm tính variance quantity/value, gồm số 0 và số thập phân.
- Tạo draft không đổi tồn và ledger.
- Update draft thay thế đúng dòng và giữ snapshot server-side.
- Balance cập nhật tồn đúng và tạo `MANUAL_ADJUST` đúng quantity/cost.
- Balance nhiều dòng là atomic; một lỗi rollback tất cả.
- Không balance lại phiếu `BALANCED`.
- Phát hiện tồn thay đổi và trả `409`.
- Ghi audit và phát event sau commit.
- API list/filter/detail/create/update/balance/cancel/import preview.

### Frontend

- API helper serialize query và payload đúng contract.
- View model lọc tab `Tất cả/Khớp/Lệch/Chưa kiểm` và tính tổng.
- Component hiển thị đúng trạng thái, khóa form sau khi chốt và xử lý lỗi `409`.
- Import preview đưa dòng hợp lệ vào draft, không tự chốt.

## 10. Ngoài phạm vi

- Nhiều kho vật lý hoặc chuyển kho.
- Lô hàng, hạn sử dụng, serial number.
- Xuất hủy, trả hàng nhập, hóa đơn đầu vào.
- Điều chỉnh giá vốn thủ công ngoài số lượng tồn.
- Phân quyền chi tiết hơn Admin hiện có.
- In PDF riêng nếu chưa có hạ tầng export tương ứng.

## 11. Tiêu chí nghiệm thu

1. Admin tạo được phiếu kiểm kho mới với mã `KK...` tự sinh.
2. Phiếu nháp lưu được dòng kiểm kho và không thay đổi tồn.
3. Giao diện có đủ bảng, tab, panel phải, upload Excel và hai nút `Lưu tạm`/`Hoàn thành` theo ảnh tham chiếu.
4. Không thể hoàn thành khi còn dòng chưa kiểm.
5. Hoàn thành phiếu điều chỉnh tồn đúng theo số thực tế và tạo ledger `MANUAL_ADJUST` liên kết phiếu.
6. Mọi thay đổi tồn được audit và phát event sau commit.
7. Phiếu đã cân bằng hoặc đã hủy không thể sửa/chốt lại.
8. Nếu tồn thay đổi trong lúc kiểm, hệ thống không ghi đè âm thầm mà trả cảnh báo xung đột.
9. Danh sách kho và các view phụ thuộc tồn tự tải lại sau khi phiếu được cân bằng.
10. Unit, integration và frontend tests liên quan đều chạy đạt theo lệnh kiểm thử của repository.
