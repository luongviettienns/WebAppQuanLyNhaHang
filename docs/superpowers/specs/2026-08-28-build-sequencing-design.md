# Thiết Kế Kế Hoạch Triển Khai Tuần Tự

## 1. Mục tiêu

Xây dựng một nguồn công việc thực thi duy nhất để triển khai CRISPY BITE theo các vertical slice. Mỗi slice chỉ được đánh dấu hoàn thành khi backend, frontend, contract tích hợp và kiểm thử của luồng nghiệp vụ đó đều hoàn thành.

Mục tiêu là loại bỏ việc frontend và backend phát triển lệch nhau, giảm mock data kéo dài, và phát hiện sai khác API hoặc sự kiện thời gian thực ngay trong milestone đầu tiên liên quan.

## 2. Tài liệu nguồn

| Tài liệu | Vai trò | Quy tắc sử dụng |
| --- | --- | --- |
| `IMPLEMENTATION_PLAN.md` | Kiến trúc hệ thống, mô hình dữ liệu và yêu cầu nghiệp vụ gốc | Không dùng làm checklist thực thi hằng ngày. Cập nhật khi quyết định kiến trúc thay đổi. |
| `BUILD_PLAN.md` | Nguồn công việc tuần tự duy nhất cho đội triển khai | Mọi công việc code, test, migration hoặc tài liệu vận hành phải được thực hiện theo thứ tự trong file này. |
| `PROJECT_PROGRESS.md` | Báo cáo trạng thái và lịch sử công việc | Cập nhật sau mỗi công việc, thay đổi checklist hoặc chuyển phase. Không thay thế `BUILD_PLAN.md`. |

Không tạo plan frontend và backend độc lập. Công việc của hai bên nằm trong cùng một milestone nếu chúng dùng chung API, schema hoặc Socket event.

## 3. Nguyên tắc thực thi

1. Làm theo vertical slice: triển khai một luồng người dùng hoàn chỉnh từ database đến UI, không làm toàn bộ backend trước hoặc toàn bộ frontend trước.
2. Contract-first: trước khi code một slice, chốt endpoint, quyền truy cập, request, response, lỗi chuẩn và Socket payload trong chính mục contract của slice đó.
3. TDD: mỗi thay đổi nghiệp vụ bắt đầu bằng test thất bại; test đơn vị, test API và test luồng UI được thêm theo mức rủi ro của slice.
4. Không dùng mock data thay cho luồng đã có API thật. Mock chỉ được phép trong test cô lập hoặc trạng thái loading/error không thể tái tạo ổn định.
5. Không mở milestone sau khi milestone trước chưa đạt tiêu chí nghiệm thu.
6. Migration, seed data và thay đổi schema là một phần của slice liên quan, không để dồn vào cuối dự án.

## 4. Cấu trúc bắt buộc của một milestone trong BUILD_PLAN

Mỗi milestone phải có các phần sau:

1. Mục tiêu và luồng người dùng có thể trình diễn.
2. Phụ thuộc và quyết định cần khóa trước khi bắt đầu.
3. Contract chung: HTTP endpoint, request/response, mã lỗi, Socket event, quyền role.
4. Checklist theo thứ tự thực hiện, trộn backend/frontend theo phụ thuộc thực tế.
5. Test cần viết trước và lệnh xác minh cần chạy.
6. Definition of Done: dữ liệu tồn tại đúng, UI thể hiện đúng, phân quyền đúng, sự kiện real-time đúng, và tài liệu tiến độ đã cập nhật.

## 5. Trình tự milestone

### M0 - Nền tảng phát triển cục bộ

Thiết lập workspace frontend/backend, Docker Compose cho MySQL, biến môi trường mẫu, scripts chạy local, lint/test nền tảng và health check backend. Không bắt đầu nghiệp vụ khi môi trường chưa tái lập được trên máy khác.

### M1 - Contract lõi và dữ liệu khởi tạo

Hoàn thiện Prisma schema ban đầu, migration, seed data và convention response/error. Chốt role matrix, route naming, lifecycle order, naming Socket events và dữ liệu snapshot của order item.

### M2 - Xác thực và phiên làm việc

Seed user, đăng nhập JWT, middleware xác thực/phân quyền, lưu và khôi phục phiên phía client, điều hướng màn hình theo role. Thành công khi Cashier, Kitchen và Admin chỉ nhìn thấy đúng phạm vi của mình.

### M3 - Menu và modifier từ dữ liệu thật

Tạo API menu, UI POS đọc dữ liệu thật, validate modifier bắt buộc và hiển thị trạng thái sold-out. Thành công khi món, giá và modifier không còn hardcode trong ứng dụng.

### M4 - Tạo đơn và thanh toán cơ bản

Hoàn thiện giỏ hàng, dine-in/take-away, chọn bàn, buzzer, tính subtotal/VAT/total ở backend, tạo order và order item bằng transaction. Thành công khi một đơn hợp lệ được lưu và trả lại với tổng tiền do server tính.

### M5 - KDS real-time và vòng đời đơn

Kết nối Socket.io cho `order:new` và `order:statusChanged`, KDS nhận đơn, chuyển PENDING -> PREPARING -> READY -> COMPLETED và tính prep time. Thành công khi POS/KDS đồng bộ mà không reload, kể cả khi order có buzzer và ghi chú.

### M6 - Vận hành nhà hàng

Đồng bộ trạng thái bàn, tính năng 86'd real-time, void đơn chỉ cho Admin với lý do và audit fields. Thành công khi các quyền bị từ chối đúng và POS không thể đặt món đã hết.

### M7 - Quản trị, báo cáo và hóa đơn

Hoàn thiện CRUD menu được phân quyền, báo cáo doanh thu/top seller/SOS và preview/xuất PDF hóa đơn. Thành công khi dashboard tính từ dữ liệu đơn đã hoàn tất, không từ mock data.

### M8 - Chất lượng phát hành và demo

Kiểm thử end-to-end các luồng role chính, responsive Expo Web/mobile, trạng thái lỗi/loading, seed demo lặp lại được và kịch bản demo. Thành công khi môi trường có thể khởi động theo tài liệu và toàn bộ acceptance test chạy qua.

## 6. Điểm kiểm soát liên milestone

- M2 không bắt đầu trước khi M0 và M1 cung cấp database, contract response/error và role matrix.
- M3 và M4 có thể được lập kế hoạch gần nhau nhưng M4 chỉ dùng endpoint menu đã được M3 xác minh.
- M5 phụ thuộc M4 vì Socket event phải mang order đã được persist và server là nguồn trạng thái chuẩn.
- M6 phụ thuộc M3/M4/M5 vì sold-out, table status và void thay đổi các luồng đang hoạt động.
- M7 chỉ tính KPI từ order status và timestamp đã được M5 chuẩn hóa.
- M8 xác minh toàn bộ các milestone trước, không thêm nghiệp vụ mới.

## 7. Quyết định kỹ thuật được khóa trong plan

- Runtime nền là Node.js `24.19.0` và npm `11.17.0`; mọi máy phát triển dùng cùng major version Node qua `.nvmrc`.
- MySQL local ưu tiên Docker Desktop với image `mysql:8.4`; nếu không có Docker Desktop thì cài native MySQL `8.4` với cùng database/user/password được mô tả tại M0. Không tạo source trước khi một trong hai cách này chạy được.
- Backend là nguồn dữ liệu chuẩn. Client cache dữ liệu API và cập nhật nó bằng Socket event đã xác thực từ server.
- Mọi số tiền lưu bằng VND nguyên (`Int`); giá/order modifier được snapshot lúc tạo đơn.
- Không cho phép client tự tính hoặc tự áp dụng trạng thái đơn, VAT hoặc quyền thao tác.
- `prepTimeSec` phải dựa trên timestamp trạng thái rõ ràng (ít nhất `preparingAt` và `readyAt`), không suy ra chỉ từ `updatedAt`.
- Void cần user Admin định danh, lý do bắt buộc và lưu vết đủ để báo cáo/audit.

## 8. Ngoài phạm vi base

Các nội dung sau không thuộc milestone nền tảng trừ khi được yêu cầu sau: thanh toán cổng thật, in nhiệt trực tiếp, đa chi nhánh, quản lý tồn kho, push notification phần cứng và đăng ký tài khoản tự do cho nhân viên.

## 9. Tiêu chí thành công của kế hoạch

`BUILD_PLAN.md` được coi là đạt khi một người chưa biết dự án vẫn có thể làm theo từ M0 đến M8, biết file nào cần tạo/sửa, test nào chạy trước, điều kiện nào cho phép chuyển milestone, và cách cập nhật `PROJECT_PROGRESS.md`.

## 10. Foundation Contracts Bắt Buộc

Các contract sau được khóa trước khi tạo thư mục ứng dụng hoặc source code. `IMPLEMENTATION_PLAN.md` là nguồn schema nghiệp vụ; các phần dưới đây là nguồn chuẩn cho môi trường, API, Socket, bảo mật và kiểm thử.

### 10.1. Môi trường local

| Thành phần | Giá trị khóa | Quy tắc |
| --- | --- | --- |
| Node.js | `24.19.0` | Ghi đúng version vào `.nvmrc`; không dùng global dependency làm nguồn chạy dự án. |
| npm | `11.17.0` | Dùng lockfile npm duy nhất. |
| MySQL | `8.4` | Có database riêng `crispy_bite_dev` và `crispy_bite_test`; application user không dùng root. |
| Backend port | `4000` | Health endpoint là `GET /health`. |
| Expo Web | `8081` mặc định | CORS chỉ cho origin đã khai báo. |

`.env.example` phải mô tả chính xác các biến sau, không chứa secret thật:

```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL=mysql://crispy_bite:crispy_bite_dev@127.0.0.1:3306/crispy_bite_dev
TEST_DATABASE_URL=mysql://crispy_bite:crispy_bite_test@127.0.0.1:3306/crispy_bite_test
JWT_SECRET=replace-with-at-least-32-random-characters
JWT_EXPIRES_IN=8h
JWT_ISSUER=crispy-bite-api
JWT_AUDIENCE=crispy-bite-client
CORS_ORIGIN=http://localhost:8081
EXPO_PUBLIC_API_URL=http://LAN-IP-OF-DEVELOPMENT-MACHINE:4000
EXPO_PUBLIC_SOCKET_URL=http://LAN-IP-OF-DEVELOPMENT-MACHINE:4000
VAT_RATE_BPS=800
BUSINESS_TIMEZONE=Asia/Ho_Chi_Minh
SEED_CASHIER_PASSWORD=change-me-cashier
SEED_KITCHEN_PASSWORD=change-me-kitchen
SEED_ADMIN_PASSWORD=change-me-admin
```

`localhost` chỉ dùng cho Expo Web trên cùng máy. Expo Go trên điện thoại phải dùng LAN IPv4 của máy phát triển; firewall Windows cho phép TCP port `4000` trên private network. Docker Compose phải chạy MySQL `8.4`, map port `3306`, dùng named volume, tạo hai database trên, và có healthcheck `mysqladmin ping`.

### 10.2. Database, migration và test isolation

- `DATABASE_URL` và `TEST_DATABASE_URL` phải khác nhau; test khởi động sẽ từ chối chạy nếu hai chuỗi này trùng nhau hoặc `NODE_ENV` khác `test`.
- Mọi test integration dùng `TEST_DATABASE_URL`, chạy migration vào database test trước suite, truncate theo thứ tự foreign-key sau từng test, và seed fixture tối thiểu trong `beforeEach`.
- `prisma migrate dev` chỉ dùng để tạo migration trong local development. CI/test tái lập schema bằng `prisma migrate deploy` vào database test rồi chạy test.
- Seed demo phải idempotent; fixture test không được dùng lại seed demo để tránh test phụ thuộc dữ liệu ngầm.
- Order audit schema khóa các field `createdByUserId`, `idempotencyKey`, `requestHash`, `preparingAt`, `readyAt`, `completedAt`, `cancelledAt`, `voidedByUserId`, `voidedAt`, `paymentMethod`, `paymentStatus`, `paidAt` và composite unique `(createdByUserId, idempotencyKey)`.

### 10.3. HTTP envelope, lỗi và role matrix

Mọi API dùng envelope:

```ts
type ApiSuccess<T> = { data: T };
type ApiFailure = {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
};
```

| HTTP | Code | Khi dùng |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Body/query/header không hợp lệ. |
| 401 | `UNAUTHENTICATED` | Thiếu, hết hạn hoặc JWT không hợp lệ. |
| 403 | `FORBIDDEN` | Role không có quyền. |
| 404 | `NOT_FOUND` | Resource không tồn tại. |
| 409 | `CONFLICT` | Idempotency key reuse với payload khác, table conflict, hoặc sold-out race. |
| 409 | `ORDER_STATE_INVALID` | Chuyển trạng thái order không hợp lệ. |
| 429 | `RATE_LIMITED` | Quá 5 yêu cầu login trong một phút từ cùng IP; trả header `Retry-After`. |
| 500 | `INTERNAL_ERROR` | Lỗi bất ngờ; không trả stack trace. |

| Khả năng | CASHIER | KITCHEN | ADMIN |
| --- | :---: | :---: | :---: |
| Đăng nhập, đọc menu, đọc bàn | Yes | Yes | Yes |
| Tạo order | Yes | No | Yes |
| Đọc KDS và cập nhật status | No | Yes | Yes |
| 86'd món | No | Yes | Yes |
| Chuyển DIRTY -> AVAILABLE | Yes | No | Yes |
| Void order | No | No | Yes |
| CRUD menu, báo cáo | No | No | Yes |

Demo Bar không được đổi role trên client. Nó chỉ điền nhanh tài khoản demo rồi thực hiện login JWT mới.

### 10.4. REST contract tối thiểu

| Endpoint | Role | Request | Response `data` |
| --- | --- | --- | --- |
| `POST /api/auth/login` | Public | `{ username, password }` | `{ token, user: { id, name, role } }` |
| `GET /api/menu` | Authenticated | none | `CategoryDto[]`, mỗi item gồm menu item, `isSoldOut`, modifier groups/options |
| `PATCH /api/menu/:id/sold-out` | Kitchen/Admin | `{ isSoldOut }` | `MenuItemDto` |
| `POST /api/menu` | Admin | `MenuItemUpsertDto` | `MenuItemDto` |
| `PATCH /api/menu/:id` | Admin | `MenuItemUpsertDto` | `MenuItemDto` |
| `POST /api/orders` | Cashier/Admin | Body OrderCreateDto; header `Idempotency-Key` UUID | `OrderDto` persisted |
| `GET /api/orders?status=PENDING,PREPARING,READY` | Kitchen/Admin | status list | `OrderDto[]` cho lần tải KDS đầu tiên/reconnect |
| `PATCH /api/orders/:id/status` | Kitchen/Admin | `{ status }` | `OrderDto` sau transition |
| `PATCH /api/orders/:id/void` | Admin | `{ reason }` | `OrderDto` `CANCELLED` |
| `GET /api/tables` | Authenticated | none | `DiningTableDto[]` |
| `PATCH /api/tables/:id/status` | Cashier/Admin | `{ status: "DIRTY" \| "AVAILABLE" }` | `DiningTableDto` |
| `GET /api/reports/daily?date=YYYY-MM-DD` | Admin | ISO date | `{ revenue, orderCount, topItems, avgPrepTimeSec }` |

`OrderCreateDto` là:

```ts
type OrderCreateDto = {
  type: 'DINE_IN' | 'TAKE_AWAY';
  tableId?: number;
  buzzerNumber?: number;
  paymentMethod: 'CASH' | 'QR';
  items: Array<{
    menuItemId: number;
    quantity: number;
    note?: string;
    modifierOptionIds: number[];
  }>;
};
```

Với `DINE_IN`, `tableId` và `buzzerNumber` 1-50 là bắt buộc. Với `TAKE_AWAY`, cả hai field phải rỗng. `paymentMethod` (`CASH` hoặc `QR`) là bắt buộc; trong demo, confirm checkout tạo order với payment status `PAID`, không gọi cổng thanh toán bên ngoài. Server tái đọc toàn bộ menu/modifier, kiểm tra sold-out/min-max modifier và tự tính tiền. Một table hoặc buzzer không thể nhận thêm dine-in order khi đã có order `PENDING`, `PREPARING` hoặc `READY`; conflict trả `409 CONFLICT`.

Server canonicalize `OrderCreateDto` bằng cách sort `items` theo input index và `modifierOptionIds` tăng dần, serialize JSON ổn định rồi SHA-256 thành `requestHash`. Cùng `(createdByUserId, Idempotency-Key)` và cùng `requestHash` trả lại `OrderDto` đã tồn tại; khác hash trả `409 CONFLICT`. Nếu hai request đồng thời gặp unique constraint, request thắng transaction được đọc lại theo key rồi áp dụng so sánh hash trước khi response; không tạo order thứ hai.

`OrderDto.selectedModifiers` lưu snapshot:

```ts
type SelectedModifiersSnapshot = {
  menuItemName: string;
  baseUnitPrice: number;
  selections: Array<{
    groupId: number;
    groupName: string;
    optionId: number;
    optionLabel: string;
    extraPrice: number;
  }>;
  unitPrice: number;
};
```

VAT luôn lấy từ `VAT_RATE_BPS=800`; `vat = Math.round(subtotal * 800 / 10_000)` và `total = subtotal + vat`. Values được snapshot trên Order, không tính lại khi config/menu thay đổi.

Các DTO response được khóa như sau; DateTime luôn là ISO 8601 UTC string, tiền là integer VND, và không DTO nào trả password/hash/JWT secret.

```ts
type ModifierOptionDto = { id: number; label: string; extraPrice: number };
type ModifierGroupDto = { id: number; name: string; isRequired: boolean; minSelect: number; maxSelect: number; options: ModifierOptionDto[] };
type MenuItemDto = { id: number; name: string; price: number; image: string | null; description: string | null; isSoldOut: boolean; categoryId: number; modifiers: ModifierGroupDto[] };
type CategoryDto = { id: number; name: string; slug: string; orderNum: number; items: MenuItemDto[] };
type DiningTableDto = { id: number; number: number; floor: number; capacity: number; status: 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' };
type OrderItemDto = { id: number; menuItemId: number; quantity: number; unitPrice: number; note: string | null; selectedModifiers: SelectedModifiersSnapshot };
type OrderDto = {
  id: number; code: string; type: 'DINE_IN' | 'TAKE_AWAY';
  status: 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  table: DiningTableDto | null; buzzerNumber: number | null; items: OrderItemDto[];
  subtotal: number; vat: number; total: number;
  paymentMethod: 'CASH' | 'QR'; paymentStatus: 'PAID' | 'VOIDED'; prepTimeSec: number | null;
  createdAt: string; preparingAt: string | null; readyAt: string | null;
  completedAt: string | null; cancelledAt: string | null; voidReason: string | null;
};
type TopItemDto = { menuItemId: number; name: string; quantity: number; revenue: number };
type DailyReportDto = { revenue: number; orderCount: number; topItems: TopItemDto[]; avgPrepTimeSec: number | null };
```

### 10.5. Order và table lifecycle

Order chỉ chuyển `PENDING -> PREPARING -> READY -> COMPLETED`; Admin có thể chuyển `PENDING`, `PREPARING` hoặc `READY` sang `CANCELLED` qua void có reason. Void đổi `paymentStatus` thành `VOIDED`; demo không hỗ trợ refund gateway. Không void order `COMPLETED` hay `CANCELLED`. `preparingAt` chỉ set ở transition đầu tiên sang `PREPARING`, `readyAt` ở `READY`, và `prepTimeSec` là số giây chênh lệch giữa hai timestamp đó. KDS live timer bắt đầu tại `createdAt` (thời gian khách chờ), kể cả khi order còn `PENDING`; `prepTimeSec` vẫn chỉ là thời gian chế biến thực tế.

Table lifecycle là độc lập có chủ đích với kitchen lifecycle:

1. Dine-in order được persist: `AVAILABLE -> OCCUPIED` trong cùng transaction.
2. KDS chuyển `READY` hoặc `COMPLETED`: table vẫn `OCCUPIED`, vì khách có thể tiếp tục dùng bàn.
3. Cashier/Admin xác nhận khách rời bàn: `OCCUPIED -> DIRTY` qua API table status.
4. Cashier/Admin xác nhận đã dọn: `DIRTY -> AVAILABLE`.
5. Void dine-in order chỉ tự trả `OCCUPIED -> AVAILABLE` nếu đó là order hoạt động duy nhất của table; nếu không, trạng thái table không thay đổi.

### 10.6. Socket contract và reconnect

Socket handshake dùng `auth: { token: JWT }`, kiểm tra issuer/audience/HS256 giống REST. Mọi authenticated user join `restaurant:main`; chỉ `KITCHEN` và `ADMIN` join thêm `restaurant:kds`. CORS Socket dùng cùng allowlist với HTTP. Client nhận `connect_error` thì xóa session khi code là `UNAUTHENTICATED`; với lỗi mạng thì hiển thị trạng thái offline và tự reconnect.

| Event | Server phát sau khi transaction commit | Payload |
| --- | --- | --- |
| `order:new` | Order được tạo, chỉ room `restaurant:kds` | `OrderDto` |
| `order:statusChanged` | Order transition hoặc void, chỉ room `restaurant:kds` | `OrderDto` |
| `menu:itemSoldOutChanged` | 86'd thay đổi, room `restaurant:main` | `{ itemId: number, isSoldOut: boolean }` |
| `table:statusChanged` | Status table đổi, room `restaurant:main` | `DiningTableDto` |

REST là nguồn khởi tạo và đồng bộ lại: KDS tải `GET /api/orders` trước khi subscribe; sau mỗi reconnect, các screen có dữ liệu live refetch REST rồi mới dùng event cho delta. Event không dùng để xác nhận thao tác người dùng; response REST mới là kết quả canonical.

### 10.7. Authentication và client storage

JWT dùng `HS256`, expiry `8h`, issuer `crispy-bite-api`, audience `crispy-bite-client`; backend fail-fast nếu `JWT_SECRET` dưới 32 ký tự hoặc environment variables không hợp lệ. Login luôn trả `INVALID_CREDENTIALS` chung cho username/password sai và bị giới hạn 5 request/phút/IP. Password seed chỉ sống trong `.env` local không commit; hash bằng bcrypt với cost 12.

Mobile dùng Expo SecureStore. Expo Web dùng `localStorage` chỉ cho demo được đánh dấu rõ; logout xóa token, cache nhạy cảm và socket connection. Axios nhận `401` thì thực hiện cùng flow logout đó.

### 10.8. Quy tắc báo cáo theo ngày

`date` trong báo cáo là ngày lịch tại `BUSINESS_TIMEZONE=Asia/Ho_Chi_Minh`. Backend chuyển `YYYY-MM-DD` thành start/end-exclusive timezone-aware rồi query `completedAt`; không dùng ngày UTC của client. Revenue, top seller và SOS chỉ gồm `COMPLETED`; SOS còn yêu cầu có cả `preparingAt` và `readyAt`.
