# Phase 6 – Bulk actions cho menu item

## Mục tiêu

Cho phép ADMIN áp dụng một thao tác quản trị lên nhiều menu item trong một request atomic, đồng bộ lại màn quản trị sau khi thành công và không để dữ liệu cập nhật dở dang khi một phần request không hợp lệ.

Phạm vi chỉ gồm menu item/category metadata và tồn kho hiện tại. Không thay đổi nghiệp vụ trừ tồn khi tạo order của Phase 7.

## Quyết định nghiệp vụ

- Chỉ role `ADMIN` được gọi bulk API.
- Một request tối đa 200 item và không được chứa ID trùng lặp.
- Backend phải kiểm tra toàn bộ ID, action và payload trước khi mở transaction ghi.
- Nếu bất kỳ ID hoặc payload nào không hợp lệ, toàn bộ request bị từ chối và database không thay đổi.
- `delete` là soft delete: đặt `isAvailable=false`; không xóa cứng vì menu item có thể đã được tham chiếu bởi `OrderItem`.
- `adjustStock` nhận delta nguyên; tồn kho sau cập nhật không được âm và action không tự bật `trackStock`.
- Sau commit thành công ghi một audit log tổng hợp và phát event `menu:bulkChanged`.

## Backend API contract

```http
PATCH /api/menu/bulk
Authorization: Bearer <admin-token>
```

Body tổng quát:

```json
{
  "ids": [1, 2, 3],
  "action": "setAvailability",
  "payload": { "isAvailable": false }
}
```

Action và payload:

| Action | Payload | Hiệu ứng |
|---|---|---|
| `setAvailability` | `{ isAvailable: boolean }` | Cập nhật trạng thái bán |
| `setCategory` | `{ categoryId: number }` | Chuyển toàn bộ item sang category tồn tại |
| `setMenuType` | `{ menuType: FOOD\|DRINK\|SERVICE\|OTHER }` | Đổi loại thực đơn |
| `setItemType` | `{ itemType: REGULAR\|TOPPING\|COMBO\|SERVICE }` | Đổi loại món |
| `setTrackStock` | `{ trackStock: boolean }` | Bật/tắt theo dõi tồn |
| `adjustStock` | `{ delta: integer }` | Cộng/trừ tồn, không cho âm |
| `delete` | `{}` hoặc bỏ qua | Soft delete bằng `isAvailable=false` |

Response thành công:

```json
{
  "data": {
    "updatedCount": 3,
    "action": "setAvailability"
  }
}
```

Lỗi validation trả `400 VALIDATION_ERROR`, lỗi phân quyền trả `403 FORBIDDEN`, không tồn tại category trả `400 VALIDATION_ERROR`. Các lỗi này phải nêu rõ action/field hoặc ID gây lỗi.

## Transaction và side effects

Service sẽ:

1. Validate input bằng Zod.
2. Reject duplicate/missing IDs và resolve toàn bộ menu item.
3. Validate payload theo action; với `setCategory` kiểm tra category tồn tại, với `adjustStock` tính trước kết quả không âm.
4. Dùng một `prisma.$transaction` để update tất cả item.
5. Ghi một `MENU_ITEMS_BULK_UPDATED` audit log chứa action, số lượng và IDs.
6. Emit `menu:bulkChanged` với action, IDs và `updatedCount`.

Không gọi tuần tự các endpoint item hiện có, vì chúng không bảo đảm atomic và có thể xử lý modifier groups không phù hợp với bulk metadata.

## Frontend flow

- `RestaurantContext` thêm `bulkUpdateMenuItems(ids, action, payload)`.
- `MenuManagementScreen` hiển thị bulk toolbar khi `selectedItemIds.length > 0`.
- Toolbar có các action tương ứng; action nguy hiểm hoặc ảnh hưởng hàng loạt phải qua confirm modal.
- Sau success: gọi lại `fetchMenu`, clear selection, hiển thị số item đã cập nhật.
- Sau error: giữ selection, không tự sửa state cục bộ, hiển thị lỗi từ API.
- Mobile và desktop dùng cùng action model; toolbar có thể xếp dọc trên viewport hẹp.

## Kiểm thử

Backend:

- ADMIN bulk set availability thành công.
- Bulk đổi category/menuType/itemType/trackStock.
- Bulk adjust stock hợp lệ và reject kết quả tồn âm.
- Soft delete không xóa row.
- Reject unauthenticated/CASHIER/KITCHEN.
- Reject ID thiếu, ID trùng, quá 200 ID và category không tồn tại.
- Request nhiều item có một lỗi không được ghi một phần.

Frontend:

- API helper gửi đúng URL/method/body/auth và map lỗi.
- View-model chỉ hiển thị toolbar khi có selection và tạo đúng action/payload.
- Success clear selection/refetch; error giữ selection.

## Ngoài phạm vi

- Trừ tồn tự động khi tạo order, hoàn tồn khi cancel/void: Phase 7.
- Hard delete menu item.
- Thay đổi modifier groups.
- Sửa các file `task_plan.md`, `progress.md`, `findings.md`.
