# Spec thiết kế: Bảng giá chung đồng bộ toàn hệ thống

- **Ngày:** 2026-09-20
- **Trạng thái:** Đề xuất đã chốt phạm vi, chờ review trước implementation plan
- **Phạm vi:** Crispy Bite — Admin, POS, khách QR, đơn hàng, báo cáo và realtime
- **Tài liệu tham chiếu giao diện:** ảnh KiotViet do người dùng cung cấp

## 1. Bối cảnh và mục tiêu

Hiện tại giá bán nằm trực tiếp trên `MenuItem.basePrice`. POS, khách QR và backend tạo đơn đều sử dụng giá này. Cách làm đó phù hợp với một bảng giá duy nhất nhưng không tạo được lịch sử, không có nơi quản lý giá tập trung và khiến việc mở rộng theo chi nhánh/kênh bán sau này khó khăn.

Mục tiêu của thiết kế là xây dựng trang **Bảng giá chung** theo tinh thần giao diện tham khảo: sidebar bộ lọc, bảng dữ liệu mật độ cao, sửa giá trực tiếp, so sánh với giá vốn, import/export và cập nhật realtime. Giá phải được resolve thống nhất ở backend cho mọi kênh bán; hóa đơn cũ phải giữ nguyên giá tại thời điểm đặt món.

## 2. Phạm vi

### Trong đợt này

- Tạo một bảng giá mặc định duy nhất có mã `GENERAL` và tên “Bảng giá chung”.
- Chuyển dữ liệu hiện có từ `MenuItem.basePrice` vào bảng giá chung.
- Trang Admin xem, tìm kiếm, lọc, sửa giá trực tiếp và cập nhật hàng loạt.
- Import preview/commit và export CSV/XLSX cho bảng giá chung.
- Hiển thị giá vốn BOM nếu món có định lượng; không suy đoán giá vốn khi thiếu dữ liệu.
- POS và khách QR nhận giá mới qua API và Socket.io.
- Backend xác thực giá hiệu lực khi tạo đơn và snapshot vào `OrderItem.unitPrice`.
- Audit log cho thay đổi giá thủ công, hàng loạt và import.
- Thiết kế scope để có thể thêm chi nhánh, kênh bán hoặc nhóm khách sau này.

### Ngoài phạm vi

- UI quản lý chi nhánh, kênh bán hoặc nhóm khách.
- Nhiều bảng giá hoạt động đồng thời.
- Giá dịch vụ tính giờ hoặc logic “vắt khung”.
- Thay đổi phân quyền thành viên; MVP giữ quyền quản lý bảng giá cho `ADMIN`.
- Xóa `MenuItem.basePrice` ngay trong đợt đầu.

## 3. Nguyên tắc thiết kế

1. **Một nguồn sự thật:** `PriceListItem.salePrice` là giá niêm yết; `MenuItem.basePrice` chỉ là mirror tương thích trong giai đoạn chuyển tiếp.
2. **Backend là nơi quyết định giá:** client chỉ hiển thị giá và gửi mã món; client không được quyết định giá cuối của đơn.
3. **Không hồi tố:** mọi `OrderItem` lưu giá snapshot; đổi bảng giá không sửa đơn cũ.
4. **Mở rộng có kiểm soát:** schema có scope và bảng giá, nhưng MVP chỉ bật scope `GLOBAL`.
5. **Thay đổi tài chính phải truy vết:** các thao tác giá đều ghi `AuditLog`.
6. **Giữ tương thích:** DTO menu tiếp tục trả field `basePrice` để POS/QR hiện hữu không phải đổi toàn bộ trong một bước.

## 4. Mô hình dữ liệu

### 4.1. Enum và model mới

Định nghĩa Prisma dự kiến:

```prisma
enum PriceListType {
  GENERAL
  CUSTOM
}

enum PriceListScopeType {
  GLOBAL
  BRANCH
  CHANNEL
  CUSTOMER_GROUP
}

model PriceList {
  id              Int                 @id @default(autoincrement())
  code            String              @unique
  name            String
  type            PriceListType      @default(GENERAL)
  scopeType       PriceListScopeType @default(GLOBAL)
  scopeKey        String?
  isDefault       Boolean             @default(false)
  isActive        Boolean             @default(true)
  effectiveFrom   DateTime?
  effectiveTo     DateTime?
  createdByUserId Int?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  items           PriceListItem[]
  orders          Order[]

  @@index([scopeType, scopeKey])
  @@index([isDefault, isActive])
  @@index([effectiveFrom, effectiveTo])
}

model PriceListItem {
  id          Int       @id @default(autoincrement())
  priceListId Int
  menuItemId  Int
  salePrice   Int
  version     Int       @default(1)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  priceList   PriceList @relation(fields: [priceListId], references: [id], onDelete: Cascade)
  menuItem    MenuItem  @relation(fields: [menuItemId], references: [id], onDelete: Restrict)

  @@unique([priceListId, menuItemId])
  @@index([menuItemId])
}
```

Thay đổi liên quan:

- `MenuItem` thêm relation `priceListItems`.
- `Order` thêm `priceListId Int?` và relation tới `PriceList`.
- `MenuItem.basePrice` giữ nguyên trong MVP như giá mirror/fallback.
- `PriceListItem.salePrice` bắt buộc là số nguyên VND dương.
- `version` dùng để chống ghi đè khi hai màn hình cùng sửa một dòng.

### 4.2. Seed và chuyển đổi dữ liệu

Migration phải thực hiện trong transaction hoặc theo các bước idempotent:

1. Tạo `PriceList(code = GENERAL, name = Bảng giá chung, type = GENERAL, scopeType = GLOBAL, isDefault = true, isActive = true)` nếu chưa tồn tại.
2. Tạo một `PriceListItem` cho mỗi `MenuItem`, lấy `salePrice = basePrice`.
3. Không ghi đè `PriceListItem` đã tồn tại nếu migration được chạy lại.
4. Kiểm tra số lượng item và tổng giá trị trước/sau migration.
5. Giữ `basePrice` để các client cũ vẫn hoạt động trong thời gian chuyển tiếp.

### 4.3. Quy tắc resolve giá

Tạo service dùng chung `PriceService.resolveEffectivePrice(menuItemId, context)`.

Ở MVP, resolver:

1. Chọn `PriceList` mặc định đang active, `scopeType = GLOBAL`.
2. Kiểm tra `effectiveFrom/effectiveTo` nếu có.
3. Lấy `PriceListItem.salePrice`.
4. Nếu bảng giá hoặc dòng giá bị thiếu, fallback về `MenuItem.basePrice` và ghi warning log.

Trong tương lai, `context` có thể nhận `branchKey`, `channelKey`, `customerGroupKey`; thứ tự ưu tiên dự kiến là scope cụ thể nhất → `GLOBAL`. MVP không cho phép tạo hoặc chọn scope khác `GLOBAL` từ UI.

## 5. API và backend

### 5.1. Router

Tạo module `backend/src/modules/price-lists/` gồm schema, controller, service, routes và test.

Dự kiến endpoint:

| Method | Endpoint | Quyền | Mục đích |
|---|---|---|---|
| GET | `/api/price-lists/general` | ADMIN | Metadata và các dòng giá chung |
| PATCH | `/api/price-lists/:priceListId/items/:menuItemId` | ADMIN | Sửa một giá |
| PATCH | `/api/price-lists/:priceListId/items/bulk` | ADMIN | Sửa nhiều giá/công thức |
| POST | `/api/price-lists/:priceListId/import/preview` | ADMIN | Kiểm tra file import |
| POST | `/api/price-lists/:priceListId/import/commit` | ADMIN | Ghi file import hợp lệ |
| GET | `/api/price-lists/:priceListId/export` | ADMIN | Xuất CSV/XLSX |

### 5.2. Cập nhật một dòng

Payload:

```json
{
  "salePrice": 30000,
  "expectedVersion": 4
}
```

Service phải:

- validate giá dương;
- kiểm tra `PriceListItem.version = expectedVersion`;
- cập nhật `salePrice`, tăng `version` và cập nhật mirror `MenuItem.basePrice` trong cùng transaction;
- ghi audit với giá cũ, giá mới, menu item và price list;
- phát socket event sau khi transaction thành công;
- trả dòng giá mới cùng `version`.

Nếu version không khớp, trả `409 CONFLICT` kèm giá hiện tại để frontend hiển thị lựa chọn tải lại.

### 5.3. Cập nhật hàng loạt

MVP hỗ trợ:

- giá cố định;
- cộng/trừ số tiền;
- tăng/giảm theo phần trăm;
- làm tròn tùy chọn đến 100, 1.000 hoặc 10.000 VND.

Backend phải tính và validate toàn bộ dòng trước khi ghi. Nếu có dòng không hợp lệ, toàn bộ transaction bị hủy để tránh bảng giá ở trạng thái nửa chừng.

### 5.4. Tích hợp menu và tạo đơn

- `MenuService.getFullMenu()` lấy giá từ `PriceService` và tiếp tục map ra field `basePrice`.
- Tạo/sửa món và `commitMenuImport` phải tạo hoặc cập nhật dòng giá chung tương ứng.
- `orders.service` phải resolve giá trong transaction tạo đơn, không dùng giá client gửi lên.
- `Order.priceListId` lưu bảng giá đã áp dụng.
- `OrderItem.unitPrice` lưu `salePrice + modifierDelta` tại thời điểm tạo đơn.
- Báo cáo doanh thu và lợi nhuận tiếp tục đọc snapshot từ order/order item.

`getFullMenu()` phải tải các `PriceListItem` của bảng giá chung theo một truy vấn batch/map, không resolve từng món bằng N+1 query.

## 6. Realtime và frontend state

### 6.1. Socket events

Thêm các event trong room `restaurant:main`:

```ts
type PriceListItemChangedPayload = {
  priceListId: number;
  menuItemId: number;
  salePrice: number;
  version: number;
  updatedAt: string;
};

type PriceListBulkChangedPayload = {
  priceListId: number;
  menuItemIds: number[];
  updatedAt: string;
};
```

Frontend cập nhật `categories`, `filteredMenuItems` và các `CartItem` có cùng `menuItemId`. Khi socket reconnect, gọi lại `fetchMenu()` và tải lại bảng giá nếu đang ở màn hình quản trị.

### 6.2. Context

Mở rộng `RestaurantContext` với:

- `fetchGeneralPriceList()`;
- `updateGeneralPrice()`;
- `bulkUpdateGeneralPrices()`;
- `importGeneralPrices()`;
- `exportGeneralPrices()`.

`addToCart` vẫn tính tổng tạm thời để giao diện phản hồi ngay, nhưng giá này chỉ là hiển thị; backend vẫn là nguồn quyết định khi tạo đơn.

## 7. Thiết kế giao diện

### 7.1. Bố cục desktop

```text
┌────────────── Khu vực quản trị ──────────────┐
│ Báo cáo │ Thực đơn │ Bảng giá │ Kho │ Bàn ... │
└──────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│ Bảng giá chung                 Import  Xuất   │
│ Giá mặc định cho toàn bộ kênh bán             │
├──────────────┬────────────────────────────────┤
│ Bộ lọc       │ Mã món | Tên món | Giá vốn     │
│ Nhóm món     │ Giá bán chung | Biên lợi nhuận│
│ Tìm mã/tên   │────────────────────────────────│
│ So sánh giá  │ SP000025  ...          30.000  │
└──────────────┴────────────────────────────────┘
```

### 7.2. Thành phần và hành vi

- `PriceListScreen`: container dữ liệu và trạng thái lưu.
- `PriceListFilters`: nhóm món, tìm mã/tên, điều kiện so sánh với giá vốn.
- `PriceListTable`: bảng mật độ cao, input sửa trực tiếp, trạng thái version.
- `PriceFormulaModal`: công thức hàng loạt và preview số dòng ảnh hưởng.
- `PriceImportModal`: tái sử dụng pattern preview/commit của menu import.
- `PriceChangeBar`: thanh cuối vùng làm việc, hiển thị số dòng thay đổi và thao tác lưu.

Header bảng gồm: mã món, tên món, giá vốn BOM, giá bán chung, biên lợi nhuận và trạng thái. Món chưa có BOM hiển thị “Chưa có dữ liệu” ở giá vốn.

Trên mobile, bộ lọc mở bằng panel; bảng cuộn ngang và giữ cố định mã/tên món. Mọi thao tác chính có vùng chạm tối thiểu 44px.

### 7.3. Ngôn ngữ hình ảnh

- Giữ token hiện có: Inter, Barlow Condensed, `theme.primary`, `surfaceBase`, `surfaceCanvas`, `borderSubtle`.
- Dùng header bảng xanh nhạt như ảnh tham khảo nhưng không sao chép thanh điều hướng thương hiệu.
- Không thêm shadow/card không cần thiết; điểm nhấn là bảng dữ liệu và thanh trạng thái lưu.
- Hiển thị focus keyboard rõ ràng, tôn trọng `prefers-reduced-motion`.

## 8. Audit, quyền và lỗi

### Quyền

- `ADMIN`: xem, sửa, hàng loạt, import, export.
- `CASHIER`, `KITCHEN` và khách QR: chỉ nhận giá hiệu lực qua menu/order API; không thấy màn hình quản trị.

### Audit actions

- `PRICE_LIST_ITEM_UPDATED`
- `PRICE_LIST_ITEMS_BULK_UPDATED`
- `PRICE_LIST_ITEMS_IMPORTED`
- `PRICE_LIST_CREATED` cho dữ liệu mở rộng sau này

Metadata phải có price list, menu item IDs, giá trước/sau, loại thao tác, actor và source.

### Lỗi

- Giá không dương: `VALIDATION_ERROR`.
- Version xung đột: `CONFLICT`/HTTP 409.
- Không có quyền: `FORBIDDEN`.
- File import có dòng lỗi: preview hiển thị lỗi, không commit.
- Mất socket: refetch khi reconnect; thao tác lưu vẫn dựa trên REST.
- Giá thấp hơn giá vốn: cảnh báo không chặn lưu.

## 9. Kiểm thử và tiêu chí nghiệm thu

### Backend

- Migration tạo đúng bảng giá chung và backfill đủ món.
- Resolver ưu tiên `PriceListItem`, fallback đúng về `basePrice`.
- API GET/PATCH/bulk/import/export kiểm tra schema và quyền.
- Version conflict trả 409 và không ghi dữ liệu.
- Cập nhật giá đồng bộ mirror và ghi audit.
- Tạo đơn dùng giá mới nhất, lưu đúng `Order.priceListId` và `OrderItem.unitPrice`.
- Socket phát đúng payload sau commit thành công.

### Frontend

- Bộ lọc mã/tên/nhóm/giá vốn hoạt động đúng.
- Input tiền, validation và format VND đúng.
- Hiển thị pending/success/error khi lưu.
- Xử lý conflict bằng refetch dòng.
- Socket cập nhật menu và giỏ hàng.
- Responsive desktop/tablet/mobile không che thao tác chính.

### E2E

1. Admin mở Bảng giá chung và thấy toàn bộ món.
2. Admin sửa giá một món và nhận thông báo thành công.
3. POS/QR đang mở nhận giá mới mà không reload thủ công.
4. Tạo đơn sau khi đổi giá và kiểm tra snapshot `OrderItem.unitPrice`.
5. Đổi giá lần nữa và xác nhận đơn cũ không đổi.
6. Import preview, commit và export lại dữ liệu.

### Quality gates

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run build`

## 10. Rollout và rollback

Rollout theo thứ tự: migration → seed/backfill → backend resolver/API → socket/context → màn hình Admin → E2E. Trong giai đoạn chuyển tiếp, mọi thay đổi từ form menu cũ phải đi qua cùng transaction cập nhật bảng giá chung.

Rollback ứng dụng có thể quay về đọc `MenuItem.basePrice` vì mirror vẫn được duy trì. Không xóa dữ liệu bảng giá trong rollback; migration down không được dùng để xóa dữ liệu tài chính đã phát sinh.

## 11. Tiêu chí kết thúc thiết kế

Spec này được xem là đủ rõ khi người triển khai có thể xây migration, API, UI và test mà không cần thêm quyết định nghiệp vụ về nhiều chi nhánh/kênh bán. Các quyết định đó được giữ ngoài phạm vi MVP nhưng đã có chỗ mở rộng trong model và resolver context.
