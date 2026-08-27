# KẾ HOẠCH KIẾN TRÚC & PHÁT TRIỂN TOÀN DIỆN (FULL-STACK)
# HỆ THỐNG ĐA NỀN TẢNG ĐẶT MÓN & QUẢN LÝ NHÀ HÀNG FAST FOOD "CRISPY BITE"

> **Mô hình kiến trúc**: Full-Stack hoàn chỉnh (Frontend React Native/Expo SDK 54 + Backend Node.js/Express/Prisma/MySQL + Real-time Socket.io)  
> **Phiên bản tài liệu**: 2.0 (Cập nhật kiến trúc Backend thực tế, Role-Based Access, Real-time KDS và 8 quy chuẩn nghiệp vụ QSR chuyên sâu)  
> **Cập nhật ngày**: 2026-08-28

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (FULL-STACK ARCHITECTURE)

Hệ thống **CRISPY BITE** được thiết kế theo mô hình Client-Server phân tán, liên thông thời gian thực giữa quầy bán hàng (Front-of-House) và bếp chế biến (Back-of-House):

```
+-----------------------------------------------------------------------------------+
|                        CLIENT: REACT NATIVE (EXPO SDK 54)                         |
|  - Chạy đa nền tảng: Mobile App (Expo Go QR Code) & Web Browser Dashboard        |
|  - Role-Based Access Control (RBAC): CASHIER | KITCHEN | ADMIN                   |
|  - UI State: RestaurantContext (Lớp gọi API Axios + Lắng nghe Socket.io Cache)   |
+------------------------------------------^----------------------------------------+
                                           |
                                  REST API | WebSocket (Socket.io)
                                           |
+------------------------------------------v----------------------------------------+
|                   BACKEND SERVER: NODE.JS + EXPRESS + SOCKET.IO                   |
|  - Authentication & Authorization: JWT Token + Role Middleware                    |
|  - Real-time Gateway (Socket.io): Bắn order:new, order:statusChanged, menu:itemSoldOutChanged |
|  - Services Layer: Xử lý nghiệp vụ (Tính tiền, Validation Modifier, Void/Refund)  |
|  - ORM Layer: Prisma ORM với Type-safety                                          |
+------------------------------------------^----------------------------------------+
                                           | Prisma Client
+------------------------------------------v----------------------------------------+
|                          DATABASE: MYSQL (RELATIONAL DB)                          |
|  - Lưu trữ: Users, Categories, MenuItems, Modifiers, Tables, Orders, OrderItems   |
+-----------------------------------------------------------------------------------+
```

---

## 2. THIẾT KẾ BACKEND (NODE.JS + EXPRESS + PRISMA + MYSQL)

### 2.1. Cấu trúc Thư mục Backend (`backend/`)
```
backend/
├── prisma/
│   ├── schema.prisma          # Định nghĩa Database Models, Enums & Relations
│   ├── seed.ts                # Script tạo sẵn 20+ món, 12 bàn, tài khoản mẫu
│   └── migrations/            # Lịch sử migration cơ sở dữ liệu
├── src/
│   ├── config/
│   │   ├── db.ts              # Khởi tạo Prisma Client
│   │   ├── socket.ts          # Khởi tạo Socket.io Server instance
│   │   └── env.ts             # Đọc và validate biến môi trường .env
│   ├── modules/
│   │   ├── auth/              # Route, controller, service, schema đăng nhập/JWT
│   │   ├── menu/              # Menu, modifier và 86'd
│   │   ├── orders/            # Tạo đơn, lifecycle, void và Socket events
│   │   ├── tables/            # Đọc/chuyển trạng thái bàn
│   │   └── reports/           # Doanh thu, SOS và top seller
│   ├── middlewares/
│   │   ├── authenticate.ts    # Xác thực JWT Token từ Header Bearer
│   │   ├── authorize.ts       # Phân quyền truy cập (CASHIER, KITCHEN, ADMIN)
│   │   └── error-handler.ts   # Bắt lỗi toàn cục và trả về JSON chuẩn
│   ├── app.ts                 # Khởi tạo Express App, gắn CORS và routes
│   └── server.ts              # HTTP server + Socket.io bootstrap
├── .env                       # DATABASE_URL, JWT_SECRET, PORT
└── package.json
```

### 2.2. Prisma Database Schema (`schema.prisma`)
```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  CASHIER   // Thu ngân tại quầy POS
  KITCHEN   // Đầu bếp theo dõi KDS
  ADMIN     // Quản lý nhà hàng, báo cáo, hủy đơn
}

enum OrderType {
  DINE_IN    // Ăn tại quán (kèm số bàn và số thẻ rung buzzer)
  TAKE_AWAY  // Mang về (gọi theo mã đơn)
}

enum OrderStatus {
  PENDING    // Đơn mới nhận từ quầy, chờ bếp làm
  PREPARING  // Bếp đang chế biến; bắt đầu đo prepTimeSec (KDS wait timer tính từ createdAt)
  READY      // Bếp đã làm xong, sẵn sàng phát cho khách
  COMPLETED  // Đã giao cho khách / hoàn tất
  CANCELLED  // Đã bị hủy / Void bởi quản lý
}

enum TableStatus {
  AVAILABLE  // Bàn trống, sẵn sàng đón khách
  OCCUPIED   // Bàn đang có khách ngồi dùng bữa
  DIRTY      // Khách đã về, đang chờ nhân viên dọn dẹp
}

enum PaymentMethod {
  CASH
  QR
}

enum PaymentStatus {
  PAID
  VOIDED
}

model User {
  id           Int      @id @default(autoincrement())
  name         String
  role         Role     @default(CASHIER)
  username     String   @unique
  password     String   // Mã hóa bcrypt
  createdOrders Order[] @relation("OrderCreatedBy")
  voidedOrders  Order[] @relation("OrderVoidedBy")
  createdAt     DateTime @default(now())
}

model Category {
  id       Int        @id @default(autoincrement())
  name     String
  slug     String     @unique
  orderNum Int        @default(0)
  items    MenuItem[]
}

model MenuItem {
  id          Int             @id @default(autoincrement())
  name        String
  price       Int             // Số tiền VND (số nguyên, không lưu số thập phân)
  image       String?         // URL ảnh món ăn
  description String?         @db.Text
  isSoldOut   Boolean         @default(false) // Trạng thái 86'd (hết món)
  category    Category        @relation(fields: [categoryId], references: [id])
  categoryId  Int
  modifiers   ModifierGroup[]
  orderItems  OrderItem[]
}

model ModifierGroup {
  id         Int              @id @default(autoincrement())
  name       String           // VD: "Chọn size nước", "Độ cay", "Chọn sốt chấm"
  isRequired Boolean          @default(false) // BẮT BUỘC PHẢI CHỌN (VD: Size combo)
  minSelect  Int              @default(0)
  maxSelect  Int              @default(1)
  options    ModifierOption[]
  menuItem   MenuItem         @relation(fields: [menuItemId], references: [id])
  menuItemId Int
}

model ModifierOption {
  id              Int           @id @default(autoincrement())
  label           String        // VD: "Size L (+8.000đ)", "Cay nồng"
  extraPrice      Int           @default(0) // Giá cộng thêm (VND)
  group           ModifierGroup @relation(fields: [modifierGroupId], references: [id])
  modifierGroupId Int
}

model DiningTable {
  id        Int         @id @default(autoincrement())
  number    Int         @unique // Số bàn (1 -> 12...)
  floor     Int         @default(1) // Tầng 1, Tầng 2
  capacity  Int         @default(4) // Số ghế
  status    TableStatus @default(AVAILABLE)
  orders    Order[]
}

model Order {
  id                Int         @id @default(autoincrement())
  code              String      @unique // Mã đơn hiển thị (VD: "CB-101", "CB-102")
  type              OrderType   @default(DINE_IN)
  status            OrderStatus @default(PENDING)
  table             DiningTable? @relation(fields: [tableId], references: [id])
  tableId           Int?
  createdBy         User        @relation("OrderCreatedBy", fields: [createdByUserId], references: [id])
  createdByUserId   Int
  buzzerNumber      Int?        // Số thẻ rung giao cho khách ăn tại bàn
  idempotencyKey    String
  requestHash       String
  items             OrderItem[]
  subtotal          Int         // Tạm tính
  vat               Int         // VAT snapshot tại thời điểm đặt
  total             Int         // Tổng thu
  paymentMethod     PaymentMethod
  paymentStatus     PaymentStatus @default(PAID)
  paidAt            DateTime    @default(now())
  preparingAt       DateTime?
  readyAt           DateTime?
  completedAt       DateTime?
  cancelledAt       DateTime?
  prepTimeSec       Int?        // PREPARING -> READY (giây)
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  voidReason        String?     // Lý do hủy đơn (nếu bị void)
  voidedBy          User?       @relation("OrderVoidedBy", fields: [voidedByUserId], references: [id])
  voidedByUserId    Int?
  voidedAt          DateTime?

  @@unique([createdByUserId, idempotencyKey])
}

model OrderItem {
  id                Int      @id @default(autoincrement())
  order             Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderId           Int
  menuItem          MenuItem @relation(fields: [menuItemId], references: [id])
  menuItemId        Int
  quantity          Int      @default(1)
  unitPrice         Int      // Giá tại thời điểm đặt
  note              String?  // Ghi chú (VD: "Không lấy tương cà, ít đá")
  selectedModifiers Json     // Snapshot danh sách modifier đã chọn tại thời điểm đặt
}
```

---

## 3. CHUẨN HÓA 8 QUY CHUẨN NGHIỆP VỤ QSR THỰC CHIẾN

### 1. Luồng đặt món bắt buộc Modifier (`isRequired: true`)
- Trong Fast Food, khi chọn Combo hoặc Nước, khách **bắt buộc** phải chọn size hoặc loại nước đi kèm.
- **Tại POSScreen**: Nếu món có `ModifierGroup` với `isRequired: true`, popup Modifier sẽ tự động mở lên. Hệ thống validate: nếu chưa chọn đủ nhóm bắt buộc thì nút *"Thêm vào giỏ"* sẽ bị disable và cảnh báo rõ ràng.

### 2. Xử lý "Hết món" (86'd) Real-time qua WebSocket
- Bếp phát hiện hết thịt gà/bánh burger $\rightarrow$ Bấm nút "Hết món" trên KDS.
- Backend phát sự kiện `socket.emit('menu:itemSoldOutChanged', { itemId, isSoldOut: true })`.
- Mọi máy POS đang mở sẽ lập tức làm mờ/disable món ăn đó tức thì, không cho phép thu ngân bấm chọn thêm (loại bỏ lỗi thu ngân nhận đơn món đã hết).

### 3. Cảnh báo KDS theo Thời Gian Chuẩn Bị (Prep Time Alert)
- Thời gian chuẩn bị món tiêu chuẩn trong QSR: 5 phút.
- Thẻ KDS hiển thị badge thời gian nhảy giây liên tục kèm mã màu:
  - **Màu Xanh lá**: $0 \le t < 3$ phút (Đơn mới, tiến độ tốt).
  - **Màu Vàng cam**: $3 \le t < 5$ phút (Đang cận giờ chuẩn).
  - **Màu Đỏ nhấp nháy**: $t \ge 5$ phút (Trễ đơn! Cảnh báo ưu tiên làm trước để giảm phàn nàn của khách).

### 4. Quản lý Thẻ Rung Buzzer (Dine-in Calling)
- Với đơn **Ăn tại bàn (Dine-in)**: POS có ô nhập số thẻ rung `buzzerNumber` (1 -> 50).
- Thẻ đơn trên KDS hiển thị to rõ số buzzer: **`BUZZER #12`**.
- Khi bếp bấm "Xong" (Ready), hệ thống phát tín hiệu sẵn sàng để thu ngân gọi khách đến quầy nhận món.

### 5. Kiểm soát Hủy Đơn (Void Security)
- Thu ngân thông thường **không có quyền** xóa/hủy đơn đã bắn vào bếp (chống gian lận và thất thoát nguyên liệu).
- Muốn Void đơn: Phải đăng nhập hoặc xác thực tài khoản có quyền `ADMIN`, nhập `voidReason` (Lý do hủy) để lưu vết vào hệ thống. Demo không tích hợp cổng thanh toán hay hoàn tiền ngoài hệ thống; void đổi payment status thành `VOIDED` và loại order khỏi báo cáo doanh thu.

### 6. Xuất Hóa Đơn (Receipt Preview / PDF Export)
- Tránh phụ thuộc phần cứng máy in nhiệt trong đồ án demo.
- Sau khi bấm "Thanh toán thành công" $\rightarrow$ Bật Modal Hóa đơn điện tử thiết kế chuẩn hóa đơn nhà hàng (Logo Crispy Bite, Mã đơn, Ngày giờ, Chi tiết món + Modifiers, VAT, Tổng tiền, QR thanh toán).
- Tích hợp nút **"Xuất file PDF"** (sử dụng skill `pdf`) để lưu hoặc in trực tiếp nếu cần.

### 7. Upsell & Gợi Ý Combo Thông Minh
- Khi khách chọn Món lẻ (VD: Burger Bò Phô Mai) $\rightarrow$ POS hiển thị thanh gợi ý nhỏ: *"Thêm 25.000đ để nâng cấp thành Combo Khoai + Pepsi?"*.
- Giúp tăng giá trị đơn hàng trung bình (AOV) đúng nghiệp vụ thực tế.

### 8. Chỉ số Thời Gian Phục Vụ Trung Bình (Speed of Service - SOS) trên Dashboard
- Ngoài Doanh thu và Số đơn, Dashboard có chỉ số vàng của Fast Food: **Avg Prep Time (Thời gian làm món trung bình)** tính bằng phút/giây.
- Phản ánh tốc độ phục vụ của bếp và năng suất ca làm việc.

---

## 4. TÁI ĐỊNH NGHĨA VAI TRÒ FRONTEND & RESTAURANTCONTEXT

### 4.1. Vai trò mới của `RestaurantContext`
- **Không còn là nơi hardcode mock data**: State gốc được lưu tại MySQL Database trên Backend.
- **Nhiệm vụ của `RestaurantContext`**:
  1. Gửi HTTP Request (Axios) đến Backend API (`/api/menu`, `/api/orders`, `/api/tables`, `/api/reports`).
  2. Lắng nghe kết nối WebSocket qua `socket.io-client`:
     - Nhận sự kiện `order:new` $\rightarrow$ Thêm thẻ mới vào KDS.
     - Nhận sự kiện `order:statusChanged` $\rightarrow$ Cập nhật cột trạng thái đơn.
     - Nhận sự kiện `menu:itemSoldOutChanged` $\rightarrow$ Cập nhật menu POS tức thì.
  3. Quản lý phiên đăng nhập (Token JWT & Role của User hiện tại).

### 4.2. Phân quyền hiển thị theo Role (RBAC)
- **CASHIER**: Truy cập màn hình **POS Gọi món**, **Sơ đồ bàn**.
- **KITCHEN**: Truy cập toàn màn hình **KDS Bếp điều phối** (giao diện nền tối).
- **ADMIN**: Truy cập toàn quyền (POS, KDS, Sơ đồ bàn, **Quản lý Menu & Giá**, **Dashboard Báo cáo Doanh thu**).
- Có Demo Bar điền nhanh tài khoản mẫu; mỗi lần đổi vai trò phải thực hiện login JWT mới, không được đổi role trong client.

---

## 5. LỘ TRÌNH TRIỂN KHAI THEO CÁC PHASE (ROADMAP)

### 🔹 Phase 1: Khởi tạo Nền tảng Frontend & Backend
- **Frontend**: Khởi tạo Expo SDK 54, React Navigation, Theme Tokens Crispy Bite, Components UI dùng chung.
- **Backend**: Khởi tạo Express, Prisma, kết nối MySQL, migrate `schema.prisma`.

### 🔹 Phase 2: Xác thực & Phân quyền (Auth & RBAC) + Seed Data
- Viết seed script Prisma: Tạo 20+ món ăn thực tế kèm Modifiers, 12 bàn ăn, 3 tài khoản mẫu (cashier, kitchen, admin).
- Viết API đăng nhập JWT, phân quyền Route & gắn Context phía Client.

### 🔹 Phase 3: Phát triển Nghiệp vụ Lõi & Real-time WebSocket
- Xây dựng API & Màn hình POS (Lưới món, Modifier bắt buộc, Giỏ hàng, Buzzer, Chọn Bàn/Mang về).
- Tích hợp Socket.io: Bắn đơn tức thì xuống KDS.
- Xây dựng màn hình KDS Bếp (Kanban thẻ đơn, đổi trạng thái, đếm ngược Prep Time Xanh/Vàng/Đỏ, nút 86'd hết món).

### 🔹 Phase 4: Quản trị, Báo cáo & Bàn ăn
- Màn hình Sơ đồ 12 bàn (đồng bộ trạng thái DB: Trống / Có khách / Chờ dọn).
- Màn hình Quản lý Menu (Thêm món mới, chỉnh giá, toggle hết món).
- Dashboard Báo cáo Doanh thu, Top Seller & Chỉ số thời gian phục vụ trung bình (SOS).
- Modal Hóa đơn & Xuất PDF phiếu thanh toán.

### 🔹 Phase 5: Tối ưu UI/UX, Kiểm thử Toàn diện & Hướng dẫn Demo
- Tinh chỉnh giao diện theo `frontend-design` (Màu sắc giòn tan, touch ergonomics $\ge 48\text{px}$).
- Kiểm thử luồng liên hoàn qua Playwright (`webapp-testing`) hoặc chạy trực tiếp trên Expo Go và Web.
- Soạn hướng dẫn kịch bản demo chấm điểm cho giảng viên.
