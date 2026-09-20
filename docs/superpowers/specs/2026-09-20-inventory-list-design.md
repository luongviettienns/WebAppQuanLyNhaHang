# Spec thiết kế: Danh sách kho hàng hợp nhất

- **Ngày:** 2026-09-20
- **Trạng thái:** Đã được người dùng xác nhận phương án, sẵn sàng lập implementation plan
- **Phạm vi:** Crispy Bite — Admin, danh sách kho hàng, realtime và điều hướng tới nghiệp vụ hiện có
- **Tài liệu tham chiếu giao diện:** ảnh KiotViet “Kho hàng” do người dùng cung cấp

## 1. Bối cảnh và mục tiêu

Menu “Kho hàng” sẽ có các chức năng con: Danh sách kho hàng, Kiểm kho, Xuất hủy, Nhập hàng, Hóa đơn đầu vào, Trả hàng nhập và Nhà cung cấp. Đợt này chỉ triển khai **Danh sách kho hàng**. Các chức năng còn lại không được dựng giả hoặc ghi dữ liệu mới; danh sách chỉ hiển thị dữ liệu tồn hiện có và điều hướng sang các nghiệp vụ hiện hữu khi có thể.

Repo hiện có hai nguồn tồn độc lập:

- `Ingredient.currentStock`, `costPerUnit`, `minThreshold` cho nguyên vật liệu.
- `MenuItem.stockQuantity`, `trackStock` cho món bán/topping.

`InventoryTransaction` hiện chỉ ghi giao dịch nguyên vật liệu, trong khi tồn món bán được cập nhật trong luồng đơn hàng. Mục tiêu là tạo một **read model hợp nhất**, không tạo nguồn tồn thứ ba và không làm thay đổi cách nhập/trừ tồn hiện tại.

## 2. Phạm vi

### Trong đợt này

- Màn hình Admin “Danh sách kho hàng” theo bố cục tham khảo: sidebar bộ lọc, bảng dữ liệu mật độ cao, tìm kiếm, tổng quan tồn, Import/Export và thao tác điều hướng.
- Hợp nhất hai nhóm dữ liệu đang có: `MATERIAL` từ `Ingredient` và `SELLABLE` từ `MenuItem`.
- Chuẩn hóa DTO chung cho mã hàng, tên hàng, đơn vị, giá vốn, tồn kho, định mức tồn, trạng thái và nguồn dữ liệu.
- Giá vốn món bán lấy từ tổng BOM hiện tại; món không có BOM hiển thị thiếu dữ liệu giá vốn, không suy đoán bằng giá bán.
- Tìm kiếm/lọc theo dữ liệu đang có: nhóm quản lý, nhóm món, loại món, tồn kho, vị trí, trạng thái kinh doanh.
- Tổng hợp giá trị tồn và cảnh báo sắp hết/bán âm.
- Điều hướng từng dòng tới chi tiết nguyên liệu/nhập kho hoặc màn hình thực đơn/điều chỉnh tồn hiện có.
- Export danh sách hợp nhất ở dạng CSV/XLSX.
- Socket realtime để danh sách tự làm mới khi tồn hoặc giá vốn thay đổi.

### Ngoài phạm vi

- Màn hình và quy trình riêng cho Kiểm kho, Xuất hủy, Nhập hàng, Hóa đơn đầu vào, Trả hàng nhập và Nhà cung cấp.
- Tạo hệ thống kho/chi nhánh nhiều kho.
- Ghi transaction tồn mới từ màn hình danh sách.
- Tạo nhóm “Công cụ dụng cụ” khi repo chưa có model và luồng nghiệp vụ tương ứng.
- Thay đổi cách backend trừ tồn khi bán món hoặc trừ tồn nguyên liệu theo BOM.

## 3. Nguyên tắc thiết kế

1. **Danh sách là read model:** mọi con số lấy từ nguồn nghiệp vụ hiện tại, không lưu bản sao tồn kho.
2. **Không hồi tố dữ liệu:** thay đổi giá vốn hoặc tồn chỉ phản ánh trạng thái hiện tại; lịch sử thuộc transaction/order hiện có.
3. **Giá vốn có nguồn rõ ràng:** nguyên liệu dùng giá vốn bình quân; món có BOM dùng tổng chi phí BOM; thiếu BOM hiển thị “Chưa có dữ liệu”.
4. **Không giả lập chức năng tương lai:** menu con chưa làm không có nút commit hoặc endpoint ghi dữ liệu.
5. **Mở rộng bằng source identity:** mỗi dòng có `sourceType` và `sourceId`, để sau này thêm công cụ, kho, lô hàng hoặc nhà cung cấp.
6. **Backend là nguồn lọc chính:** filter và summary chạy server-side, không chỉ lọc mảng client khi dữ liệu lớn.

## 4. Mô hình dữ liệu và read model

### 4.1. Không thêm bảng tồn mới trong MVP

MVP không tạo `InventoryItem` hoặc `InventoryBalance` mới. Service đọc hợp nhất từ `Ingredient`, `MenuItem` và `MenuItemIngredient`.

Việc chuẩn hóa thành ledger chung cần bao phủ cả Kiểm kho, Nhập hàng, Xuất hủy và Trả hàng nhập. Làm một phần ở đợt này sẽ tạo hai nguồn sự thật khó đối soát, nên được để cho một spec riêng.

### 4.2. DTO chuẩn

```ts
type InventorySourceType = 'INGREDIENT' | 'MENU_ITEM' | 'TOOL';
type InventoryManagementGroup = 'MATERIAL' | 'SELLABLE' | 'TOOL';
type InventoryStockStatus = 'NORMAL' | 'LOW' | 'NEGATIVE' | 'NOT_TRACKED';

interface InventoryCatalogRowDto {
  sourceType: InventorySourceType;
  sourceId: number;
  sku: string;
  name: string;
  managementGroup: InventoryManagementGroup;
  categoryId?: number | null;
  categoryName?: string | null;
  menuType?: string | null;
  unit: string;
  costPrice: number | null;
  stockQuantity: number | null;
  minStock: number | null;
  maxStock?: number | null;
  stockStatus: InventoryStockStatus;
  trackStock: boolean;
  isActive: boolean;
  position?: string | null;
  brand?: string | null;
  attributes?: Record<string, string> | null;
  updatedAt: string;
}

interface InventoryCatalogSummaryDto {
  totalRows: number;
  trackedRows: number;
  lowStockRows: number;
  negativeStockRows: number;
  totalStockValue: number;
}

interface InventoryCatalogDataDto {
  rows: InventoryCatalogRowDto[];
  summary: InventoryCatalogSummaryDto;
}
```

Quy tắc chuyển đổi:

| Nguồn | Nhóm | Giá vốn | Tồn | Định mức | Trạng thái |
|---|---|---|---|---|---|
| `Ingredient` | `MATERIAL` | `costPerUnit` | `currentStock` | `minThreshold` | theo tồn/định mức |
| `MenuItem` có theo dõi tồn | `SELLABLE` | tổng BOM | `stockQuantity` | `0` trong MVP | theo tồn |
| `MenuItem` không theo dõi tồn | `SELLABLE` | tổng BOM hoặc null | null | null | `NOT_TRACKED` |
| `TOOL` | `TOOL` | chưa có | chưa có | chưa có | chưa có dữ liệu |

Món không có BOM phải trả `costPrice = null`. Không dùng `basePrice` hoặc `salePrice` thay cho giá vốn.

## 5. API và backend

### 5.1. Endpoint danh sách

```text
GET /api/inventory/catalog
```

Query params:

```text
search
managementGroup=MATERIAL|SELLABLE|TOOL
categoryId
menuType
stockStatus=ALL|NORMAL|LOW|NEGATIVE|NOT_TRACKED
position
isActive=true|false
page
pageSize
sortBy=sku|name|costPrice|stockQuantity|updatedAt
sortOrder=asc|desc
```

Response dùng envelope hiện tại:

```json
{
  "data": {
    "rows": [],
    "summary": {
      "totalRows": 0,
      "trackedRows": 0,
      "lowStockRows": 0,
      "negativeStockRows": 0,
      "totalStockValue": 0
    }
  }
}
```

Quyền truy cập: `ADMIN`, cùng chính sách hiện tại của module inventory.

### 5.2. Truy vấn và tính toán

- Query nguyên vật liệu theo `Ingredient.isActive` và filter search/SKU.
- Query món bán theo trạng thái được yêu cầu, include category và BOM ingredients trong batch.
- Tính cost BOM bằng batch query hoặc aggregate trong service; không thực hiện N+1 query.
- Map hai tập dữ liệu thành `InventoryCatalogRowDto`, sort và paginate deterministic.
- `totalStockValue` chỉ cộng dòng có `stockQuantity` và `costPrice` hợp lệ.
- `NEGATIVE` ưu tiên hơn `LOW`; `NOT_TRACKED` không tham gia low/negative count.

### 5.3. Điều hướng và hành động dòng

- `INGREDIENT`: mở detail nguyên liệu; nút “Nhập kho” gọi `POST /api/inventory/stock-in` hiện tại.
- `MENU_ITEM`: mở `MenuManagementScreen`; điều chỉnh tồn dùng API menu bulk hiện có.
- `TOOL`: không xuất hiện trong MVP vì chưa có nguồn dữ liệu.

Danh sách không gọi endpoint transaction mới.

### 5.4. Export và Import

- Export tạo snapshot từ chính catalog với các cột mã, tên, nhóm, đơn vị, giá vốn, tồn, định mức và trạng thái.
- Import trên màn hình danh sách chỉ điều hướng đến import hiện có của nguyên liệu hoặc menu; không cho file import thay đổi tồn trực tiếp.
- Khi triển khai “Nhập hàng” sau này, import tồn phải trở thành phiếu nhập và transaction có audit.

## 6. Realtime và đồng bộ

### 6.1. Event

```ts
interface InventoryChangedPayload {
  sourceType: 'INGREDIENT' | 'MENU_ITEM';
  sourceIds: number[];
  reason: 'STOCK_IN' | 'ORDER_PAID' | 'ORDER_VOIDED' | 'MANUAL_ADJUST' | 'RECIPE_UPDATED';
  updatedAt: string;
}
```

Phát sau khi transaction thành công khi nhập kho, thanh toán/hoàn đơn, điều chỉnh tồn món bán hoặc cập nhật BOM. Event là tín hiệu invalidation; frontend gọi lại catalog với filter hiện tại để summary/pagination không lệch.

### 6.2. Tương thích hệ thống hiện tại

- POS/QR tiếp tục dùng `MenuItemDto.basePrice` và `stockQuantity`.
- Bảng giá chung dùng `PriceListItem.salePrice`; giá vốn của bảng giá và kho dùng cùng hàm tính BOM.
- Đơn hàng vẫn là snapshot giá; danh sách kho không sửa `OrderItem`.
- KDS chỉ nhận trạng thái đơn, không đọc/ghi tồn trực tiếp.

## 7. Thiết kế Native UI

### 7.1. Khu vực menu Kho hàng

```text
Kho hàng
├── Danh sách kho hàng       (enabled — đợt này)
├── Kiểm kho                 (reserved)
├── Xuất hủy                 (reserved)
├── Nhập hàng                (reserved)
├── Hóa đơn đầu vào          (reserved)
├── Trả hàng nhập            (reserved)
└── Nhà cung cấp             (reserved)
```

Mục `reserved` chỉ là định hướng, không tạo screen giả hoặc route ghi dữ liệu.

### 7.2. Bố cục danh sách

- Header: tiêu đề “Kho hàng”, tìm kiếm mã/tên, Thêm mới, Import, Xuất file.
- Sidebar desktop: nhóm quản lý, nhóm món, loại món, tồn kho, vị trí và trạng thái.
- Mobile: sidebar thành bottom sheet/panel; bảng cuộn ngang, cố định mã/tên nếu nền tảng hỗ trợ.
- Table header xanh nhạt, mật độ gần ảnh tham khảo, số liệu căn phải, mã hàng và trạng thái dùng design token hiện tại.
- Tổng quan hiển thị số mặt hàng, giá trị tồn, sắp hết và bán âm; không cộng số lượng khác đơn vị thành một số gây hiểu sai.
- Nút trên dòng chỉ điều hướng; không có xóa cứng hoặc chỉnh tồn trực tiếp.

### 7.3. Trạng thái UX

- Loading trong vùng bảng; empty state riêng cho không có dữ liệu và không có kết quả filter.
- Badge `Sắp hết`, `Bán âm`, `Không theo dõi`.
- Món thiếu BOM hiển thị `Chưa có giá vốn` và link sang quản lý BOM.
- Socket event làm mới dữ liệu nhưng giữ search/filter hiện tại.
- Vùng chạm tối thiểu 44px, keyboard focus rõ trên web và responsive theo design token.

## 8. Audit, quyền và bảo mật

- Chỉ `ADMIN` được xem danh sách kho theo chính sách inventory hiện tại.
- GET catalog không nhận `stockQuantity`, `costPrice` hoặc summary từ client; mọi giá trị do backend tính.
- Thao tác điều hướng sang nhập kho/điều chỉnh tồn dùng phân quyền và audit của endpoint đích.
- Event realtime không chứa thông tin nhạy cảm ngoài source type, IDs, lý do và thời gian cập nhật.

## 9. Kiểm thử và tiêu chí nghiệm thu

### Backend

- Catalog trả đúng `Ingredient` và `MenuItem` theo source type.
- Filter search, nhóm quản lý, nhóm món, loại món, stock status và trạng thái hoạt động deterministic.
- Giá vốn BOM tính đúng; món thiếu BOM trả null.
- Summary đúng với pagination và không tính dòng `NOT_TRACKED`.
- Không có N+1 query theo từng món.
- Phân quyền ADMIN/CASHIER/unauthenticated đúng.
- Sau nhập kho, thanh toán và void, catalog phản ánh dữ liệu mới.
- Export có header chuẩn và không thay đổi dữ liệu.

### Frontend

- Render đúng header, sidebar filter, summary và table theo tinh thần ảnh.
- Tìm kiếm/lọc không mất filter khi nhận socket event.
- Row action điều hướng đúng theo `sourceType`.
- Badge cảnh báo, `Không theo dõi` và `Chưa có giá vốn` đúng.
- Desktop/tablet/mobile không che thao tác chính.

### E2E

1. Admin mở Kho hàng → Danh sách kho hàng và thấy nguyên vật liệu cùng món bán.
2. Lọc `Món bán`, tìm theo SKU và xem đúng giá vốn BOM/tồn.
3. Nhập kho qua flow hiện có, quay lại danh sách và thấy tồn/giá trị cập nhật.
4. Thanh toán đơn có món theo dõi tồn, danh sách nhận tồn mới qua socket/refetch.
5. Click dòng nguyên vật liệu mở đúng chi tiết/nhập kho.
6. Export danh sách không tạo transaction và dữ liệu vẫn nguyên vẹn.

## 10. Rollout và rollback

Rollout: DTO/types → service catalog → API/filter/export → socket invalidation → Native screen/navigation → E2E.

MVP không cần migration dữ liệu bắt buộc. Nếu sau này triển khai ledger kho chung, phải có migration/backfill riêng và đối soát tồn trước khi chuyển nguồn sự thật.

Rollback an toàn bằng cách gỡ navigation/API catalog; các luồng `Ingredient`, `MenuItem`, `InventoryTransaction` và `Order` không bị xóa hoặc đổi cấu trúc.

## 11. Tiêu chí kết thúc thiết kế

Spec này đủ rõ để triển khai riêng “Danh sách kho hàng” mà không phải quyết định thêm về các menu kho chưa làm. Kiểm kho, Xuất hủy, Nhập hàng, Hóa đơn đầu vào, Trả hàng nhập và Nhà cung cấp sẽ có spec riêng khi bắt đầu.
