# Phase 5 – Menu import/export design

## Mục tiêu

Cho phép ADMIN xuất toàn bộ menu ra CSV/XLSX và nhập lại menu qua quy trình preview → validate → commit. Dữ liệu lỗi phải được chỉ rõ theo dòng và không được ghi một phần vào database.

Phạm vi chỉ dành cho menu item/category. Không import modifier groups, không thay đổi nghiệp vụ POS/trừ kho của Phase 7.

## Quyết định kỹ thuật

- Tái sử dụng dependency `xlsx` đã có trong `backend/package.json`.
- CSV dùng UTF-8 BOM để Excel mở đúng tiếng Việt.
- XLSX đọc sheet đầu tiên và xuất một sheet `Menu`.
- Preview là stateless: backend trả về các dòng đã chuẩn hóa; commit nhận lại các dòng hợp lệ nhưng validate lại toàn bộ trước transaction. Không thêm bảng migration/session mới.
- Upsert theo `sku` khi SKU có giá trị. Dòng không có SKU tạo menu item mới và backend tự sinh SKU theo sequence hiện tại.
- Category được resolve theo tên đã trim, không phân biệt hoa thường. Category thiếu chỉ được tạo khi request bật `createMissingCategories=true`.
- Commit all-or-nothing: chỉ cần một lỗi validation hoặc conflict là toàn bộ request bị từ chối, không ghi dữ liệu.
- Import không nhận `modifierGroups`; các nhóm tùy chọn hiện có của item được giữ nguyên khi upsert.

## Format file

Header canonical:

```text
sku,name,categoryName,basePrice,menuType,itemType,isAvailable,trackStock,stockQuantity,position,description,imageUrl
```

Quy tắc:

- `sku`: tùy chọn khi tạo, bắt buộc duy nhất trong cùng file nếu có; nếu trùng SKU trong file thì dòng bị lỗi. SKU đang tồn tại trong DB là trường hợp upsert hợp lệ.
- `name`, `categoryName`, `basePrice`: bắt buộc.
- `basePrice`, `stockQuantity`: số nguyên; `basePrice > 0`, `stockQuantity >= 0`.
- `menuType`: `FOOD|DRINK|SERVICE|OTHER`.
- `itemType`: `REGULAR|TOPPING|COMBO|SERVICE`.
- Boolean chấp nhận `true/false`, `1/0`, `yes/no`, `co/khong`, `có/không`.
- Cột text được trim; cột rỗng tùy chọn trở thành `null`/giá trị mặc định theo contract hiện có.
- Dòng trống được bỏ qua; số dòng trong lỗi là số dòng thực tế trong file, tính header là dòng 1.

## Backend API

### Export

`GET /api/menu/export?format=csv|xlsx`

- Yêu cầu JWT và role ADMIN.
- Trả file attachment với content type và tên file tương ứng.
- Dữ liệu lấy từ menu hiện tại, gồm category name và toàn bộ field menu metadata.
- CSV có BOM; XLSX có header canonical và sheet `Menu`.

### Preview

`POST /api/menu/import/preview`

Body JSON:

```json
{
  "fileName": "menu.xlsx",
  "fileBase64": "...",
  "createMissingCategories": false
}
```

Response:

```json
{
  "data": {
    "fileName": "menu.xlsx",
    "totalRows": 12,
    "validRows": [],
    "errorRows": [],
    "canCommit": false
  }
}
```

`validRows` chứa dữ liệu đã parse/normalize và `errorRows` chứa `rowNumber`, các giá trị nhận diện dòng và message lỗi. Preview không ghi DB.

### Commit

`POST /api/menu/import/commit`

Body JSON:

```json
{
  "sourceFileName": "menu.xlsx",
  "createMissingCategories": false,
  "rows": []
}
```

- Validate lại rows trên server.
- Nếu có lỗi, trả `400 VALIDATION_ERROR` kèm lỗi theo dòng và không bắt đầu transaction ghi dữ liệu.
- Nếu hợp lệ, resolve/create categories trong transaction, sau đó upsert menu item theo SKU hoặc tạo item mới.
- Giữ nguyên modifier groups khi update theo SKU.
- Ghi audit log cho lần import và phát event menu changed sau commit thành công.

## Backend module boundaries

- `menu.import.ts`: parse CSV/XLSX, normalize headers/values, serialize CSV/XLSX.
- `menu.schemas.ts`: schemas cho preview, normalized import row và commit.
- `menu.service.ts`: export query, preview validation, transaction commit/upsert.
- `menu.controller.ts` và `menu.routes.ts`: ADMIN-only HTTP boundary.
- `menu-import.spec.ts`: parser, permission, preview validation, atomic commit và export header tests.

## Frontend flow

- `menuImportApi.ts` gọi preview/commit và tải export với token.
- `MenuManagementScreen` có nút `Import menu`, `Export CSV`, `Export Excel`.
- Modal import chỉ hỗ trợ chọn file trên web; nền tảng khác hiển thị hướng dẫn dùng bản web quản trị.
- Sau khi preview:
  - hiển thị tên file, tổng dòng, số hợp lệ và số lỗi;
  - hiển thị lỗi theo dòng;
  - chỉ bật commit khi có dòng hợp lệ và không có lỗi;
  - có tùy chọn `Tạo category còn thiếu`.
- Sau commit thành công, gọi lại `fetchMenu`, đóng modal và hiển thị số dòng tạo/cập nhật.
- Export dùng blob download trên web và thông báo rõ nếu môi trường không hỗ trợ tải file.

## Error handling và an toàn

- Giới hạn kích thước request/file ở mức 5 MB để tránh parse file quá lớn trong memory.
- Từ chối extension/format không hỗ trợ (chỉ nhận `.csv` và `.xlsx`); không thực thi công thức hay macro.
- Không log nội dung file hoặc base64.
- ADMIN middleware bảo vệ cả preview, commit và export.
- Lỗi category, enum, số, boolean, SKU trùng và duplicate row phải gắn số dòng.
- Commit không được dùng `updateMenuItem` hiện tại nếu flow đó có thể xóa modifier groups; import chỉ cập nhật field menu cơ bản và metadata.

## Kiểm thử và acceptance

Backend:

- Export CSV có BOM và header canonical.
- Export XLSX có sheet/header đúng.
- Preview parse được CSV/XLSX, normalize boolean/number/enum.
- Preview bắt lỗi required field, enum, số âm, duplicate SKU và category thiếu.
- CASHIER/KITCHEN/anonymous bị từ chối.
- Commit tạo item mới, update item theo SKU, tạo category thiếu khi được bật.
- Commit có một dòng lỗi không làm thay đổi database.

Frontend:

- API/helper map đúng preview/commit payload.
- Modal hiển thị lỗi theo dòng và khóa commit khi không hợp lệ.
- Sau commit gọi refresh menu.
- Frontend typecheck và full test suite đạt.

## Ngoài phạm vi

- Import/export modifier groups.
- Bulk actions Phase 6.
- Trừ kho khi đặt món và đồng bộ POS/customer Phase 7.
- Lưu import session lâu dài trong database.
