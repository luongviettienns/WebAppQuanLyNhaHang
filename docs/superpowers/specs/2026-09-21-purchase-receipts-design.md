# Spec thiết kế: Phiếu nhập hàng

- **Ngày:** 2026-09-21
- **Trạng thái:** Đã duyệt phương án; sẵn sàng lập kế hoạch và triển khai Native
- **Phạm vi:** Crispy Bite — Admin, nhà cung cấp tối thiểu và phiếu nhập hàng
- **Tham chiếu giao diện:** Hai ảnh KiotViet do người dùng cung cấp; chúng là tham chiếu bố cục/luồng, không phải đặc tả dữ liệu hoặc quy tắc nghiệp vụ.

## 1. Mục tiêu

Xây dựng nghiệp vụ **Nhập hàng** theo mô hình chứng từ để người quản trị tạo, lưu nháp, hoàn thành, tra cứu và xuất phiếu nhập nguyên vật liệu. Khi hoàn thành, phiếu là nguồn chứng từ cho thay đổi tồn kho và giá vốn; danh sách kho hợp nhất, BOM, POS và các màn hình Admin đang mở nhận event invalidation rồi tải lại từ nguồn dữ liệu chuẩn.

Đợt này không xây dựng sổ quỹ, phiếu chi, thanh toán nhiều đợt, trả hàng nhập, hóa đơn đầu vào độc lập, lô/hạn dùng hoặc quản lý nhiều kho.

## 2. Bối cảnh hiện có

- `Ingredient.currentStock` và `Ingredient.costPerUnit` là nguồn tồn/gía vốn của nguyên vật liệu.
- `InventoryTransaction` là ledger nguyên vật liệu; hiện có `STOCK_IN`, `AUTO_DEDUCT`, `KITCHEN_WASTE`, `MANUAL_ADJUST`, `VOID_RESTORE`.
- `POST /api/inventory/stock-in` và Excel commit hiện cập nhật tồn theo từng nguyên liệu hoặc batch nhưng chưa có chứng từ/nhà cung cấp.
- `InventoryCatalogService` chỉ đọc hợp nhất tồn và lắng nghe `inventory:changed` qua `RestaurantContext`.

Phiếu nhập mới không tạo một nguồn tồn thứ ba. Nó bổ sung source document cho `InventoryTransaction` và tái sử dụng hàm giá vốn bình quân hiện tại.

## 3. Phạm vi chức năng

### 3.1. Nhà cung cấp tối thiểu

Admin có thể tạo, sửa, tìm và chọn nhà cung cấp. Không xóa cứng nhà cung cấp đã có phiếu; chỉ cho ngừng hoạt động.

Trường dữ liệu:

| Trường | Quy tắc |
|---|---|
| `code` | Tự sinh `NCC000001`; cho phép nhập thủ công khi tạo, duy nhất không phân biệt hoa/thường |
| `name` | Bắt buộc, 2–120 ký tự |
| `phone`, `email`, `address`, `taxCode`, `note` | Không bắt buộc |
| `isActive` | Mặc định `true`; chỉ nhà cung cấp hoạt động được chọn cho phiếu mới |

### 3.2. Phiếu nhập hàng

Mỗi phiếu có mã tự sinh `PN000001`, không tái sử dụng sau hủy. Phiếu nháp có thể chưa chọn nhà cung cấp hoặc chưa có dòng; phiếu hoàn thành phải thuộc đúng một nhà cung cấp và có ít nhất một dòng.

| Trường | Quy tắc |
|---|---|
| `receiptCode` | Duy nhất, tự sinh bởi server; không để client quyết định khi tạo |
| `supplierId` | Có thể trống khi lưu nháp; bắt buộc khi hoàn thành và nhà cung cấp phải hoạt động |
| `receivedAt` | Mặc định thời điểm tạo; Admin có thể đổi |
| `invoiceNumber`, `invoiceDate` | Metadata tùy chọn, chưa tạo nghiệp vụ hóa đơn đầu vào |
| `status` | `DRAFT`, `POSTED`, `CANCELLED` |
| `discountAmount` | Số nguyên VND, không âm và không vượt tổng tiền hàng |
| `paidAmount` | Số nguyên VND, không âm và không vượt số phải trả |
| `payableAmount` | Server tính `subtotalAmount - discountAmount` |
| `outstandingAmount` | Server tính `payableAmount - paidAmount`; không lưu bản sao |
| `note` | Tùy chọn, tối đa 1.000 ký tự |

Mỗi dòng phiếu gồm nguyên liệu, snapshot mã/tên/đơn vị, số lượng dương, đơn giá VND không âm, giảm giá dòng VND không âm và thành tiền. Một nguyên liệu chỉ xuất hiện một lần trên mỗi phiếu; UI gộp vào dòng có sẵn thay vì tạo bản sao.

`subtotalAmount` là tổng thành tiền sau giảm giá từng dòng. `payableAmount` là `subtotalAmount - discountAmount`. `paidAmount` và `outstandingAmount` chỉ ghi nhận nghĩa vụ phải trả trên phiếu; **không** sinh tiền mặt, bút toán quỹ hoặc giao dịch công nợ ngoài chứng từ.

Quy tắc tính tiền Task 1: nhân số lượng thập phân với đơn giá nguyên VND, làm tròn từng dòng theo half-up (0,5 đồng lên 1 đồng) trước khi trừ giảm giá. Tránh sai số nhân floating-point ở biên như `1,005 × 100 = 100,5`, phải ra 101 đồng. Số lượng phải hữu hạn và dương; các giá trị tiền, thành tiền dòng và tổng phiếu nằm trong khoảng 0–2.147.483.647 VND tương ứng MySQL `Int`. Hàm tính trả cả `payableAmount` và `outstandingAmount` nhưng database chỉ lưu `subtotalAmount`, `discountAmount`, `paidAmount`. Các cột ghi chú dùng `VARCHAR(1000)` và địa chỉ supplier dùng `VARCHAR(255)` theo giới hạn nghiệp vụ.

### 3.3. Vòng đời

```text
Tạo phiếu -> DRAFT --Hoàn thành--> POSTED
                 |
                 +--Hủy--> CANCELLED
```

- `DRAFT`: có thể rỗng, được thêm/sửa/xóa dòng, sửa metadata, lưu tạm hoặc hủy; không làm thay đổi tồn và giá vốn.
- `POSTED`: bất biến; không cho sửa, hủy hoặc hoàn thành lần hai. Nghiệp vụ trả hàng nhập phase sau sẽ tạo chứng từ ngược riêng.
- `CANCELLED`: bất biến; không làm thay đổi tồn và giá vốn.

### 3.4. Hoàn thành phiếu và đồng bộ

Lệnh hoàn thành chạy trong **một Prisma transaction**:

1. Đọc phiếu `DRAFT` và toàn bộ dòng trong transaction.
2. Kiểm tra đã có nhà cung cấp hoạt động, có dòng hàng, nguyên liệu còn tồn tại/đang hoạt động và dữ liệu tiền hợp lệ.
3. Với từng dòng, tính tồn mới và giá vốn bình quân bằng `calculateNewWeightedAverageCost`.
4. Cập nhật `Ingredient.currentStock`, `Ingredient.costPerUnit`.
5. Tạo `InventoryTransaction` loại `STOCK_IN`, số lượng dương, giá trị theo giá sau giảm dòng, kèm `purchaseReceiptId`.
6. Chốt tổng tiền, đổi trạng thái sang `POSTED`, lưu `postedAt` và người thực hiện.
7. Ghi audit log cho tạo/cập nhật/hoàn thành/hủy phiếu và nhà cung cấp.

Sau commit mới phát `inventory:changed` với `reason: PURCHASE_RECEIPT_POSTED` và toàn bộ `ingredientId` bị ảnh hưởng. Frontend tăng `inventoryRevision`; catalog, BOM và các view phụ thuộc giá vốn/tồn tự tải lại. Giá bán/bảng giá không bị sửa vì phiếu nhập chỉ thay đổi giá vốn hiện hành.

Lệnh POST phải idempotent theo trạng thái: POSTED lần hai trả lỗi xung đột, không tạo ledger hay tăng tồn lần nữa.

### 3.5. Import Excel

Trong form tạo phiếu, người dùng có thể import Excel để **điền các dòng nháp**. Endpoint preview dùng parser SKU hiện có nhưng không gọi commit tồn. File hợp lệ chỉ chứa SKU nguyên liệu, số lượng, đơn giá và ghi chú dòng tùy chọn; mã không tồn tại, số lượng không dương và đơn giá âm được trả trong danh sách lỗi. Người dùng xem preview, xác nhận thêm các dòng hợp lệ vào draft rồi mới tự chọn “Hoàn thành”.

Import không được tạo `InventoryTransaction`, không được thay đổi `Ingredient`, và không được tự hoàn thành phiếu.

## 4. Mô hình dữ liệu

```prisma
enum PurchaseReceiptStatus {
  DRAFT
  POSTED
  CANCELLED
}

model Supplier {
  id        Int      @id @default(autoincrement())
  code      String   @unique
  name      String
  phone     String?
  email     String?
  address   String?
  taxCode   String?
  note      String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  purchaseReceipts PurchaseReceipt[]
  @@index([name])
  @@index([isActive])
}

model PurchaseReceipt {
  id             Int                   @id @default(autoincrement())
  receiptCode    String                @unique
  supplierId     Int?
  receivedAt     DateTime
  invoiceNumber  String?
  invoiceDate    DateTime?
  status         PurchaseReceiptStatus @default(DRAFT)
  subtotalAmount Int                   @default(0)
  discountAmount Int                   @default(0)
  paidAmount     Int                   @default(0)
  note           String?
  createdByUserId Int?
  postedByUserId  Int?
  postedAt        DateTime?
  cancelledByUserId Int?
  cancelledAt      DateTime?
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  supplier              Supplier?                @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  lines                 PurchaseReceiptLine[]
  inventoryTransactions InventoryTransaction[]
  @@index([supplierId, receivedAt])
  @@index([status, receivedAt])
}

model PurchaseReceiptLine {
  id                Int             @id @default(autoincrement())
  purchaseReceiptId Int
  ingredientId      Int
  ingredientSku     String
  ingredientName    String
  unit              String
  quantity          Float
  unitCost          Int
  discountAmount    Int             @default(0)
  note              String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  purchaseReceipt PurchaseReceipt @relation(fields: [purchaseReceiptId], references: [id], onDelete: Cascade)
  ingredient      Ingredient      @relation(fields: [ingredientId], references: [id], onDelete: Restrict)
  @@unique([purchaseReceiptId, ingredientId])
  @@index([ingredientId])
}
```

`InventoryTransaction.purchaseReceiptId` là nullable để bảo toàn toàn bộ ledger cũ và các thao tác nhập kho thủ công. Quan hệ là `onDelete: Restrict` để chứng từ đã có ledger không bị xóa.

## 5. API

Mọi endpoint dưới đây yêu cầu `ADMIN`.

### Nhà cung cấp

```text
GET    /api/inventory/suppliers?search=&isActive=true&page=1&pageSize=50
POST   /api/inventory/suppliers
PATCH  /api/inventory/suppliers/:id
```

### Phiếu nhập

```text
GET    /api/inventory/purchase-receipts?search=&statuses=DRAFT,POSTED,CANCELLED&from=&to=&page=&pageSize=
GET    /api/inventory/purchase-receipts/:id
POST   /api/inventory/purchase-receipts
PATCH  /api/inventory/purchase-receipts/:id
POST   /api/inventory/purchase-receipts/:id/post
POST   /api/inventory/purchase-receipts/:id/cancel
GET    /api/inventory/purchase-receipts/export?…&format=csv|xlsx
POST   /api/inventory/purchase-receipts/import/preview
```

`POST` và `PATCH` chỉ tạo/cập nhật draft, do đó cho phép `supplierId` null và `lines` rỗng. Payload line dùng `ingredientId`, `quantity`, `unitCost`, `discountAmount?`, `note?`; snapshot được lấy từ DB, không tin sku/tên/đơn vị do client gửi. Endpoint post mới buộc supplier và ít nhất một dòng.

List response trả `payableAmount` và `outstandingAmount` đã tính, supplier snapshot đủ hiển thị; detail response trả lines. API lỗi dùng envelope hiện có: `400` validation, `404` missing resource, `409` trạng thái xung đột hoặc duplicate line, `403` role.

## 6. Native UI

### 6.1. Điều hướng

Khu “Nghiệp vụ kho” trong `InventoryCatalogScreen` chuyển “Nhập hàng” từ reserved sang action mở `PurchaseReceiptListScreen`. Màn hình kho vẫn là root Admin hiện có, không thêm tab role mới.

### 6.2. Danh sách phiếu nhập

Theo ảnh tham chiếu:

- Tiêu đề “Phiếu nhập hàng”, ô tìm mã phiếu, nút “Nhập hàng”, export CSV/XLSX.
- Sidebar/filter: thời gian (all hoặc khoảng ngày), checkbox trạng thái `DRAFT`, `POSTED`, `CANCELLED`.
- Bảng: mã phiếu, thời gian, nhà cung cấp, cần trả nhà cung cấp, trạng thái; tổng phải trả của dữ liệu sau filter.
- Click dòng mở chi tiết read-only hoặc draft composer nếu phiếu còn nháp.
- Loading, empty, lỗi API, pagination và refresh rõ ràng; số tiền căn phải và định dạng VND.

### 6.3. Composer phiếu nhập

Theo bố cục ảnh tham chiếu, responsive theo Native Web/mobile:

- Bên trái: tìm SKU/tên, bảng STT/mã/tên/số lượng/đơn giá/giảm giá/thành tiền; nút thêm dòng và nhập Excel.
- Bên phải: trạng thái “Phiếu tạm”, chọn/tìm nhà cung cấp, mã phiếu, số/ngày hóa đơn, tổng tiền hàng, giảm giá, cần trả, tiền trả nhà cung cấp, tính vào công nợ, ghi chú.
- “Lưu tạm” chỉ persist draft. “Hoàn thành” yêu cầu xác nhận, gọi post, khóa form và quay về/list refresh thành công.
- `paidAmount` thay đổi trực tiếp `outstandingAmount`; không có nút/chứng từ quỹ.
- Các input số không được tự ép giá trị âm; thông báo lỗi gắn gần trường/dòng không hợp lệ.

## 7. Bảo mật, audit và khả năng tương thích

- Client không gửi mã phiếu, totals, stock, giá vốn mới hoặc snapshot ingredient để server tin tưởng.
- `POSTED` không được patch/cancel; không có xóa cứng phiếu.
- Service ghi audit cho `SUPPLIER_CREATED`, `SUPPLIER_UPDATED`, `PURCHASE_RECEIPT_CREATED`, `PURCHASE_RECEIPT_UPDATED`, `PURCHASE_RECEIPT_POSTED`, `PURCHASE_RECEIPT_CANCELLED`.
- Existing `/stock-in`, Excel inventory import, auto deduct order và catalog API tiếp tục hoạt động; chúng tạo ledger không có `purchaseReceiptId`.
- Chỉ `POSTED` mới thay đổi tồn, do đó một draft bị bỏ dở không ảnh hưởng order, BOM, POS hoặc báo cáo tồn.

## 8. Tiêu chí nghiệm thu

1. Admin tạo/sửa supplier hoạt động và chọn được supplier cho phiếu.
2. Draft rỗng hoặc nhiều dòng lưu lại đúng totals nhưng không đổi tồn/ledger.
3. Post cập nhật tất cả nguyên liệu, weighted cost và ledger atomically; một lỗi ở bất kỳ dòng nào rollback toàn bộ.
4. Post cùng phiếu hai lần không thể tăng tồn lần hai.
5. Catalog nhận event và hiển thị tồn/giá vốn mới sau post.
6. Không thể sửa/hủy phiếu POSTED; draft hủy không đổi tồn.
7. List lọc search/ngày/trạng thái, export snapshot đúng filter.
8. Import preview chỉ thêm dòng nháp sau xác nhận, không tự nhập kho.
9. Backend và frontend có test cho validation, lifecycle, rollback/idempotency, calculation, API client và UI state chính.
