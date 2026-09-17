# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN: CRISPY BITE QSR FAST FOOD SYSTEM

> **Hệ Thống Đa Nền Tảng Đặt Món & Quản Lý Nhà Hàng Fast Food "CRISPY BITE"**  
> **Kiến trúc**: Full-Stack Monorepo (React Native / Expo SDK 54 + Node.js / Express / Prisma / MySQL + Real-time Socket.io)  
> **Trạng thái**: Đã hoàn thiện 100% các Module nghiệp vụ từ M1 đến M8; Full Quality Gate PASS.  
> **Cập nhật lần cuối**: 2026-09-17 16:25:00

---

## 📈 1. TỔNG QUAN TIẾN ĐỘ (OVERALL PROGRESS)

```
[████████████████████] 100% HOÀN THÀNH (Phase 0 đến Phase 8; Đạt chuẩn nghiệp vụ nhà hàng QSR thực tế)
```

### 🧪 Bằng chứng kiểm chứng chất lượng (Verification Metrics)
- **Backend Test Suite (Vitest)**: 22/22 test files passed (159/159 tests pass 100% - bao gồm Inventory Math, Excel Parsing/Export, Inventory Service, Inventory API, BOM Deduct on Paid & Download Auth Regressions).
- **Frontend Test Suite (Vitest)**: 7/7 test files passed (33/33 tests pass 100% - bao gồm menu management filters, notification helper & theme coordinator).
- **Playwright E2E Suite**: 3/3 spec files (`cashier-kitchen-flow`, `admin-operations-flow`, `ui-consistency`).
- **Tổng Unit / Integration Tests**: 192/192 tests passed 100% (159 backend + 33 frontend).
- **Monorepo Typecheck (TypeScript)**: `npm run typecheck` $\rightarrow$ 0 lỗi biên dịch trên toàn bộ workspaces.
- **ESLint**: `npm run lint` $\rightarrow$ 0 errors trên toàn bộ workspaces.
- **Expo Framework Doctor**: `expo-doctor` $\rightarrow$ 18/18 checks passed 100%.
- **Release Gate (`npm run check`)**: PASS 100% (Typecheck + Doctor + Backend Tests).
- **Production Web & Node Build**: `npm run build` $\rightarrow$ Biên dịch thành công web bundles (`frontend/dist`) & backend dist.
- **Database Migrations**: 6 migrations đồng bộ nhất quán trên cả `crispy_bite_dev` và `crispy_bite_test`.

### 🗂️ Tiến độ theo Giai đoạn (Phase Summary)
| Giai đoạn | Mục tiêu cốt lõi | Trạng thái |
| :--- | :--- | :---: |
| **Phase 0: Khảo sát & Kiến trúc** | Đặc tả 8 quy chuẩn QSR, Schema Prisma quan hệ, WebSocket Gateway | **HOÀN TẤT** (100%) |
| **Phase 1: Nền tảng Monorepo** | Expo SDK 54, Express + Prisma + MySQL dev/test cô lập | **HOÀN TẤT** (100%) |
| **Phase 2: Auth & RBAC (M1-M2)** | Đăng nhập JWT, phân quyền Cashier/Kitchen/Admin, Seed 21+ món, 12 bàn | **HOÀN TẤT** (100%) |
| **Phase 3: POS & KDS Bếp (M3-M5)** | Lưới món, Modifier bắt buộc, Idempotency, FSM Bếp (Pending $\rightarrow$ Ready) | **HOÀN TẤT** (100%) |
| **Phase 4: Sơ đồ Bàn & Void (M6)** | Sơ đồ 12 bàn, Báo hết món 86'd, Hủy đơn kiểm toán (Admin Void) | **HOÀN TẤT** (100%) |
| **Phase 5: Menu, Báo cáo & PDF (M7)** | Quản lý menu Admin, Doanh thu múi giờ VN (UTC+7), SOS, Hóa đơn PDF | **HOÀN TẤT** (100%) |
| **Phase 6: E2E & Nghiệm Thu (M8)** | Playwright E2E Desktop & Mobile layout, xử lý rate-limit 429 | **HOÀN TẤT** (100%) |
| **Phase 7: UI/UX Redesign QSR** | Design tokens, Phông Barlow/Inter, UI Primitives, điều phối Theme vai trò | **HOÀN TẤT** (100%) |
| **Phase 8: Vận hành Thực tế** | QR Token bảo mật, LAN auto-detect, Virtual Buzzer, Menu KiotViet, Auto-Cancel | **HOÀN TẤT** (100%) |
| **Phase 9: Kho & BOM & COGS** | Tồn kho thực tế, Định lượng BOM món, Giá vốn bình quân, Báo cáo lãi gộp, Nhập/Xuất Excel | **HOÀN TẤT** (100%) |

---

## 📋 2. CÁC TÍNH NĂNG VẬN HÀNH CHÍNH (KEY HIGHLIGHTS)

### 1. Phân hệ Bán hàng POS & Sơ đồ Bàn (Cashier)
- **POS Gọi món**: Lưới thực đơn kèm bộ lọc danh mục, popup chọn Modifier bắt buộc (Size, Vị, Topping).
- **Phân luồng đơn hàng**: Modal xác nhận phân tách rõ Tại bàn (`DINE_IN`) và Mang về (`TAKE_AWAY`).
- **Sơ đồ 12 Bàn ăn**: Hiển thị trực quan trạng thái bàn (`AVAILABLE`, `OCCUPIED`, `DIRTY`). Hỗ trợ bàn có nhiều đơn hàng chưa thanh toán và gộp tổng nợ.
- **Thanh toán & Hóa đơn**: Phân quyền chỉ Thu ngân/Admin, chống double-pay, xuất hóa đơn in nhiệt và tải file PDF.

### 2. Phân hệ Màn hình Bếp KDS (Kitchen)
- **Quản lý vé đơn hàng**: Giao diện Dark OLED chuyên dụng cho nhà bếp, thẻ vé phân loại trực quan theo trạng thái.
- **Vòng đời FSM chuẩn**: Chuyển trạng thái `PENDING` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `COMPLETED` một chiều, chặn nhảy cóc.
- **Bộ đếm thời gian Prep Timer**: Tự động đổi màu cảnh báo trễ đơn (Xanh $< 3$p, Vàng $3-5$p, Đỏ nhấp nháy $> 5$p).
- **Báo hết món (86'd)**: Bếp bật/tắt hết món tức thì, tự động phát Socket cập nhật đến POS và Khách.

### 3. Phân hệ Khách hàng Gọi món tại bàn (Customer QR Experience)
- **Bảo mật mã QR**: Khách vãng lai gọi món bắt buộc có `qrCodeToken` khớp với bàn vật lý, ngăn chặn đơn ảo từ xa.
- **Cơ chế phục hồi 2 tầng**: Hỗ trợ mở qua QR có token hoặc gõ số bàn `?table=X`, server tự cấp context an toàn qua `GET /api/tables/by-number/:tableNumber`.
- **Theo dõi đa đợt gọi món**: Hiển thị thanh chuyển đổi đợt gọi món (`#ORD-001`, `#ORD-002`), hỗ trợ cuộn ngang mượt mà trên Web PC bằng chuột (`onWheel` + nút mũi tên điều hướng).
- **Quản lý Giỏ hàng (Customer Cart Modal) & Chi tiết Tùy chọn (Modifier)**: Cho phép khách xem chi tiết giỏ hàng, tăng/giảm số lượng (+/-), xóa món, nhập ghi chú cho bếp và đối soát tổng tiền có thuế VAT 8% trước khi bấm gửi bếp. Giao diện khách hàng được chuẩn hóa tinh gọn (chỉ hiển thị chi tiết đợt món và mã VietQR thanh toán, loại bỏ các nút in/xuất hóa đơn vốn thuộc vai trò thu ngân POS).
- **Thẻ rung ảo (Virtual Buzzer)**: Rung điện thoại dồn dập 2.6s kèm chuông báo khi món sẵn sàng (`READY`), hộp thoại xin quyền Web Notification.
- **Thanh toán VietQR**: Tự động sinh mã QR chuyển khoản ngân hàng chứa đúng số tiền tổng bill cả bàn và nội dung giao dịch.

### 4. Phân hệ Quản trị & Báo cáo Doanh thu (Admin)
- **Giao diện Menu phong cách KiotViet**: Sidebar lọc danh mục/trạng thái bên trái, Command search bar, bảng dữ liệu mật độ cao, tự động sinh mã SKU hệ thống (`SP000001`).
- **Báo cáo chuẩn giờ Việt Nam (`Asia/Ho_Chi_Minh` UTC+7)**: Doanh thu thuần chỉ tính đơn `COMPLETED`, tính chỉ số thời gian phục vụ trung bình (SOS), Top 5 món bán chạy nhất.
- **Hủy đơn kiểm toán (Admin Void)**: Chỉ Admin có quyền hủy đơn, bắt buộc nhập lý do void $\ge 3$ ký tự, ghi nhận audit trail (`voidedByUserId`, `voidReason`, `voidedAt`).
- **Tự động hủy đơn quá hạn (Auto-Cancel Scheduler)**: Quét ngầm mỗi 60s, tự động hủy các đơn `PENDING` quá 1 tiếng và giải phóng bàn ăn nếu không còn đơn nợ khác.

### 5. Phân hệ Quản lý Kho & Định Lượng BOM (Admin Inventory & BOM)
- **Quản lý Nguyên vật liệu (NVL)**: Bảng dữ liệu mật độ cao hiển thị đầy đủ SKU (`ING-*`), tên nguyên liệu, đơn vị tính, mức tồn hiện tại, ngưỡng tồn tối thiểu, đơn giá vốn bình quân gia quyền và tổng giá trị kho.
- **Định lượng Món ăn (BOM Recipe)**: Cấu hình nguyên liệu trọng yếu tiêu hao cho từng món ăn. Tính toán tự động tổng giá vốn BOM và tỷ suất lợi nhuận gộp thời gian thực ngay trên giao diện.
- **Trừ kho tự động theo Giao dịch (Transactional Stock Deduction)**: Trừ kho ngay lập tức khi đơn hàng chuyển sang trạng thái `PAID` (trong Prisma Interactive Transaction). Ghi log kiểm toán `ORDER_DEDUCT` kèm mã đơn.
- **Xử lý Tồn âm Thông minh**: Cho phép bán âm khi hết hàng và cảnh báo đỏ; áp dụng thuật toán bù trừ net-positive khi nhập hàng mới để không làm biến dạng công thức bình quân gia quyền.
- **Quy trình Nhập/Xuất Excel chuẩn chỉnh**: Tải file mẫu 6 cột (`Mã NVL | Tên NVL | Đơn vị | Số lượng | Đơn giá | Ghi chú`), hỗ trợ kiểm tra trước (Preview Modal), nhập từng phần (Partial Import) các dòng hợp lệ mà không chặn đứng cả tệp; xuất báo cáo tồn kho kèm cột kiểm kê đối soát thực tế.
- **Bóc tách Lợi nhuận Gộp trên Dashboard**: Tự động tính tổng giá vốn hàng bán (`totalCogs`), lợi nhuận gộp (`grossProfit`), và tỷ suất biên lời (`grossMargin`) bóc tách riêng trong báo cáo tài chính ngày.

---

## 📝 3. NHẬT KÝ MỐC PHÁT TRIỂN CHÍNH (MILESTONE RELEASES)

| Mốc / Ngày | Hạng mục cốt lõi | Kết quả / Đóng góp |
| :--- | :--- | :--- |
| **M1 - M4 (08/29)** | Nền tảng Monorepo, Auth RBAC, POS & Sơ đồ bàn | Hoàn thiện khung Full-Stack, CSDL MySQL cô lập, 29/29 tests pass |
| **M5 - M6 (09/09)** | Real-time KDS Bếp, Vòng đời FSM, Admin Void | Ticket KDS đổi màu, quản lý trạng thái DIRTY, 90/90 tests pass |
| **M7 - M8 (09/09)** | Admin Menu, Báo cáo Doanh thu & Playwright E2E | Quản trị menu, Báo cáo UTC+7, E2E đa nền tảng, 115/115 tests pass |
| **UI/UX QSR (09/13)** | Tích hợp Design Tokens & Dual Theme từ `pKhanh` | Bảng màu Brick/Charcoal, phông Barlow/Inter, UI Primitives, 123 tests |
| **Buzzer & UX (09/14)** | Virtual Buzzer, Theo dõi đa đơn & Polling tự phục hồi | Chuỗi rung 2.6s, nút Gọi thêm món, Deduplication Ref chống spam |
| **Vận hành (09/17)** | Mã SKU tự động, Menu KiotViet, Migration Toolchain | SKU tự sinh, bố cục KiotViet, script `apply-migration.js`, 151 tests |
| **Tối ưu Bàn (09/17)** | Web Horizontal Scroll & Auto-Cancel Timeout 1h | Cuộn chuột `onWheel`, nút mũi tên `<` `>`, hủy đơn quá hạn, 151 tests |
| **Bảo mật QR (09/17)** | Đồng bộ QR Token & Public Table Endpoint | Endpoint `/by-number/:tableNumber`, nâng cấp `qr.html`, 153 tests |
| **Giỏ Khách & UI (09/17)** | Modal Giỏ hàng Khách & Tinh gọn Giao diện Bàn | `CustomerCartModal` chỉnh sửa món/ghi chú, phân định rõ vai trò POS/Khách, 100% tests |
| **Biểu Đồ Doanh Thu (09/17)** | Tích hợp react-native-gifted-charts BarChart | Biểu đồ cột Top 5 món bán chạy, tương tác chọn cột, 100% tests & bundle |
| **Chuẩn Hóa Phân Quyền (09/17)** | Gỡ bỏ Tab Khách QR khỏi Admin/Thu Ngân & Rà soát Nghiệp vụ | Khách truy cập qua QR bàn độc lập không cần login, Nhân viên chỉ thấy đúng nghiệp vụ nội bộ, 100% E2E tests pass |
| **Tập Trung Quản Trị (09/17)** | Tinh Gọn Vai Trò Quản Lý (Admin Focused Governance) | Loại bỏ POS Bán hàng và KDS Bếp khỏi Admin; Admin tập trung 100% vào Quản trị & Giám sát bàn; 100% E2E tests pass |
| **Phẳng Hóa Điều Hướng (09/17)** | Tách nhỏ Trung tâm quản trị ra Khu vực làm việc | Đưa Báo cáo, Thực đơn, Bàn thành các tab trực tiếp trên sidebar (xóa bỏ lồng 2 tầng tab); 100% E2E tests pass |
| **Upload Ảnh Món Ăn (09/17)** | Cho phép Admin tải ảnh từ máy tính lên server | Button "Tải ảnh từ máy tính" + FileReader base64 → POST /api/menu/upload-image (ADMIN only) → lưu vào `uploads/` → URL tương đối `/uploads/menu_*.jpg`; `resolveImageUrl()` fix thumbnail trên Metro; 17/17 tests pass; typecheck 0 lỗi |
| **Audit Log Hệ Thống (09/17)** | Thêm Nhật ký kiểm toán thao tác quản trị (AuditLog) | Bảng `AuditLog` + Prisma migration; API `GET /api/audit` phân quyền ADMIN only; tự động ghi nhận 5 hành động (`MENU_ITEM_CREATED`, `MENU_ITEM_UPDATED`, `MENU_ITEM_AVAILABILITY_CHANGED`, `MENU_IMAGE_UPLOADED`, `ORDER_VOIDED`); màn hình `AuditLogScreen` timeline UI, phân loại icon/tone, bộ lọc, load-more; tab "Nhật ký" trong sidebar Admin; 18/18 test files (133/133 tests) pass 100%; typecheck 0 lỗi |
| **Tối Ưu Trải Nghiệm Admin (09/17)** | Tối ưu trải nghiệm quản lý | Thẻ xem trước thực tế (Live Preview Card) ngay trong modal tạo/sửa món; Mẫu tùy chọn 1 chạm (Presets: Kích cỡ, Độ cay, Topping); Toast thông báo tức thì khi mở bán/hết hàng/lưu món; 100% typecheck pass, 33/33 tests frontend pass |
| **Nâng Cấp UI Báo Cáo (09/17)** | Tối ưu trải nghiệm quản lý: Tái cấu trúc Dashboard & Modal chọn ngày | 4 Thẻ KPI chuẩn hóa đồng đều, Bố cục 2 cột cân bằng (Cột trái: Tỷ lệ kết quả đơn + Đối soát hóa đơn; Cột phải: Top 5 món bán chạy + BarChart + Spotlight card); Modal chọn ngày trực quan (`DatePickerModal`: Chọn nhanh Hôm nay, Hôm qua, 3 ngày, 7 ngày, Đầu tháng + Lưới lịch tháng); 100% typecheck pass, 33/33 tests pass |
| **Đối Soát Chốt Két (09/17)** | Phân bổ Doanh thu theo Tiền mặt vs Chuyển khoản QR | TDD backend tính toán `paymentBreakdown` (CASH, BANK_TRANSFER, OTHER); cập nhật `DailyReportDto`; Card trực quan "Phân bổ thanh toán & Chốt két" trên Dashboard (Thanh tỷ trọng, số tiền, số đơn, % doanh thu phục vụ kiểm két); 18/18 test files backend (133 tests) pass 100%, 7/7 test files frontend (33 tests) pass 100%, typecheck 0 lỗi |
| **Đóng Băng Nghiệp Vụ Kho (09/17)** | Hoàn tất Discovery & Chốt Kiến trúc Quản lý Kho, Định lượng (BOM), Giá vốn (COGS) & Excel | Hoàn thành `INVENTORY_DISCOVERY.md`; chốt 5 quyết định nghiệp vụ (Bình quân gia quyền, trừ kho khi PAID, cho phép bán âm kèm thuật toán bù trừ net positive không méo mó giá vốn, BOM nguyên liệu trọng yếu ≥2% hoặc ≥20k, cuốn chiếu Phase 1 cho Món chính); chốt quy trình Nhập hàng Excel (Template cố định, Parse/Validate dòng, Preview modal, Non-blocking partial import) & Xuất Excel tồn kho |
| **Kho & BOM Toàn Diện (09/17)** | Hoàn thành trọn vẹn Phân hệ Quản lý Kho, BOM, Giá vốn COGS & Excel | Schema 3 bảng mới (`Ingredient`, `MenuItemIngredient`, `InventoryTransaction`), migration áp dụng dev/test; Backend Service & Controller 11 API endpoints; Tích hợp trừ kho tự động khi PAID; Báo cáo Dashboard tích hợp COGS & Gross Profit; Giao diện 2 tab Kho & BOM đẹp mắt chuẩn QSR, 3 modal (Tạo NVL, Nhập nhanh, Preview Excel); 22 test files backend (157 tests), 7 test files frontend (33 tests) pass 100%; `npm run check` PASS 100% |

---

---


## 🧠 4. QUY TẮC KIẾN TRÚC & BÀI HỌC KINH NGHIỆM CỐT LÕI

### 🔒 Nhóm 1: Bảo Mật, Phân Quyền & Xác Thực (Security & RBAC)
1. **Bảo mật mã QR bàn ăn (Table QR Token Authorization)**: Khách vãng lai (`DINE_IN`) bắt buộc phải có `qrCodeToken` khớp với CSDL để chống đơn ảo từ xa. Cung cấp route công khai có giới hạn `/api/tables/by-number/:tableNumber` để hỗ trợ link cũ và phòng ngừa sự cố.
2. **Tách biệt tuyệt đối giữa Khách hàng, Vận hành và Quản trị (Strict Separation of Duties)**: Thực khách tại bàn tự phục vụ qua QR (`TableOrderScreen`). Nhân sự vận hành gồm: Thu ngân (`CASHIER`) phụ trách Bán hàng POS & Sơ đồ bàn; Đầu bếp (`KITCHEN`) phụ trách Màn hình vé KDS. Quản lý (`ADMIN`) tập trung 100% vào điều hành: Trung tâm quản trị (Thực đơn, Báo cáo doanh thu & KPI) và Giám sát bàn ăn (Duyệt Hủy đơn kiểm toán Void Order). Tuyệt đối không để Quản lý vừa tạo đơn bán hàng vừa duyệt hủy đơn nhằm triệt tiêu rủi ro gian lận nội bộ.
3. **Nguyên tắc Security by Default**: Mọi thao tác tài chính, đổi menu, hoặc tra cứu danh sách bàn mặc định yêu cầu `authenticate` và `authorize`. Phân định rõ: `CASHIER`/`ADMIN` xem bàn; `KITCHEN`/`ADMIN` xem KDS; chỉ `ADMIN` được hủy đơn (Void) và chỉnh sửa menu.
4. **Reset Rate-Limit khi đăng nhập đúng**: Bộ đếm brute-force theo IP chỉ khóa khi nhập sai mật khẩu liên tiếp. Khi đăng nhập thành công, lập tức xóa cache IP để không gây lỗi `429 RATE_LIMITED` giả cho người dùng hợp lệ.
5. **Role-Aware Fetch Guards ở Context**: Không bao giờ gọi API không có thẩm quyền trong `useEffect` toàn cục. Bếp (`KITCHEN`) không gọi `/api/tables`, Thu ngân (`CASHIER`) không gọi KDS endpoints.

### 💾 Nhóm 2: CSDL, Giao Dịch & Nhất Quán Dữ Liệu (Database Integrity)
5. **Ràng buộc duy nhất với giá trị NULL trong MySQL**: Chuẩn SQL quy định `NULL != NULL`. Với mã giao dịch duy nhất (như `idempotencyKey`), phải đặt `@unique` trực tiếp lên cột, không dựa vào composite key có chứa trường nullable.
6. **Tuyệt đối không tin giá tiền từ Client**: Payload tạo đơn chỉ gửi ID tham chiếu `{ modifierGroupId, optionId }`. Backend bắt buộc query DB để lấy giá gốc, phụ phí `priceDelta`, kiểm tra món còn bán (`isAvailable`) và min/max selection.
7. **Khóa dòng CSDL & Nhất quán đa đơn trên cùng bàn**: Dùng `SELECT ... FOR UPDATE` khi tạo đơn hoặc thanh toán. Bàn ăn chỉ chuyển về `AVAILABLE` khi không còn bất kỳ đơn `UNPAID` nào khác.
8. **Chuẩn hóa Idempotency đa tầng**: Băm payload thành `requestHash` kết hợp với `idempotencyScope` (`guest` hoặc `staff:{id}`). Cùng hash $\rightarrow$ trả về kết quả cũ (retry an toàn); khác hash $\rightarrow$ chặn lỗi `409 CONFLICT`.
9. **Bắt buộc Audit Trail khi Hủy đơn (Admin Void)**: Phải lưu `voidReason` ($\ge 3$ ký tự), `voidedByUserId`, `voidedAt` và chuyển `paymentStatus: VOIDED`. Không cho phép void đơn đã `COMPLETED`.

### ⚡ Nhóm 3: Real-Time, Trải Nghiệm Khách Hàng & Giao Diện (Real-Time & UI/UX)
10. **Đồng bộ Socket.io LAN tuyệt đối**: URL Socket client phải luôn đồng bộ theo kết quả `getApiBaseUrl()` (host và port 4000) để không bị kẹt IP cũ khi đổi Wi-Fi. Payload sự kiện bàn bắt buộc gửi kèm `tableId` và `tableNumber`.
11. **Chống bão thông báo bằng Ref Deduplication**: Dùng `lastNotifiedStatusKeyRef` lưu `${orderId}_${status}` để đảm bảo mỗi lần đổi trạng thái chỉ rung/chuông/toast đúng 1 lần duy nhất, tránh vòng lặp kích hoạt lại từ `fetchTables` polling.
12. **Cuộn ngang danh sách đơn trên Web**: `ScrollView` ngang lồng trong dọc trên React Native Web không tự nhận diện lăn chuột. Bắt buộc can thiệp `onWheel` chuyển đổi `deltaY` sang `scrollLeft`, đồng thời gắn `flexShrink: 0` và cung cấp nút mũi tên `<` `>` điều hướng trực quan.
13. **Báo cáo chuẩn giờ địa phương (`Asia/Ho_Chi_Minh` UTC+7)**: Khóa offset `+07:00` tường minh khi query CSDL để ranh giới ngày không bị lệch múi giờ so với UTC. Doanh thu thuần chỉ tính từ đơn `COMPLETED`.
14. **Snapshot hóa đơn bất biến (Immutable Receipts)**: Hóa đơn thanh toán phải lưu và đọc giá trị snapshot tại thời điểm mua (`unitPrice`, `priceDelta`, `taxAmount`, `finalAmount`), không query lại bảng món ăn tránh sai lệch khi đổi giá tương lai.

### ⚙️ Nhóm 4: Tự Động Hóa Vận Hành & Khắc Phục Lỗi (Automation & Reliability)
15. **Tự động hủy đơn quá giờ an toàn (Auto-Cancel Scheduler)**: Chỉ quét các đơn thỏa mãn đồng thời: `status === 'PENDING'`, `paymentStatus !== 'PAID'` và `createdAt <= now - 60 phút`. Giữ nguyên các đơn đang nấu (`PREPARING`) hoặc đã xong (`READY`). Sử dụng `timer.unref()` để không rò rỉ Event Loop khi test.
16. **Độc lập hóa kiểm thử (Test Isolation)**: Mọi integration test phải gọi `truncateAllTables()` trong `beforeAll` trước khi seed lại DB. Tách biệt hoàn toàn giữa database dev và test.

### 🖼️ Nhóm 5: Lưu Trữ Tệp & Đường Dẫn Ảnh (File Storage & Image URLs)
17. **Không lưu base64 vào cột VARCHAR của MySQL**: Chuỗi base64 ảnh PNG/JPEG ≥ 10KB sẽ vượt giới hạn `VARCHAR(191)` và gây crash `Data too long for column`. Quy trình đúng: Backend nhận base64, giải mã, ghi ra file `.jpg/.png` trong `uploads/`, trả về URL tương đối `/uploads/menu_*.jpg` (≤ 35 ký tự).
18. **`resolveImageUrl()` bắt buộc cho mọi `<Image source={{ uri }}>` khi dùng `/uploads/`**: Trong dev, Metro chạy port 8081 khác backend port 4000. Ảnh tương đối `/uploads/...` sẽ 404 nếu không prefix `getApiBaseUrl()`. Hàm `resolveImageUrl()` xử lý toàn bộ: prefix URL tương đối, giữ nguyên `http://`, `https://`, `data:`. Áp dụng cho: `MenuItemCard`, `MenuManagementScreen` (thumbnail bảng, mobile card, form preview).
19. **Dùng `document.createElement('input')` thay vì JSX `<input>` cho file picker trên Web**: React Native không có `<input type="file">` native. Tạo element DOM trực tiếp qua `document.createElement('input')`, trigger `.click()`, đọc kết quả qua `FileReader`. Bảo vệ bằng `if (Platform.OS !== 'web') return;` để không crash trên mobile.

### 📜 Nhóm 6: Nhật Ký Kiểm Toán & Khả Năng Quan Sát (Audit Logging & Observability)
20. **Ghi nhận Audit Log không chặn luồng chính (Non-blocking Audit Logging)**: Bọc hàm ghi log trong try/catch an toàn để sự cố phát sinh từ ghi log không làm gián đoạn giao dịch nghiệp vụ cốt lõi (tạo món, cập nhật giá, hủy đơn).
21. **Snapshot tên người thao tác (Actor Snapshot)**: CSDL lưu cả `actorId` và `actorName` tại thời điểm thực hiện thao tác để đảm bảo khi tài khoản nhân viên bị vô hiệu hóa hoặc xóa thì lịch sử kiểm toán vẫn bảo lưu chính xác danh tính người thực hiện.
22. **Đầy đủ bộ lọc và dọn dẹp Test Isolation cho bảng Log**: Khi bổ sung bảng kiểm toán mới, bắt buộc bổ sung vào danh sách bảng cần TRUNCATE trong test helper (`truncateAllTables()`) để tránh rò rỉ dữ liệu log qua các test suite khác.

### 📦 Nhóm 7: Quản Lý Kho, BOM & Giá Vốn (Inventory, BOM & COGS Management)
23. **Xử lý Tồn âm trong Bình quân gia quyền (Weighted Average with Negative Stock)**: Khi kho hàng rơi vào trạng thái tồn âm (do nhà hàng linh hoạt cho phép bán âm để phục vụ khách kịp giờ cao điểm), tuyệt đối KHÔNG đưa số lượng âm vào công thức nhân bình quân gia quyền vì sẽ làm biến dạng và méo mó giá vốn. Thuật toán chuẩn: Lô hàng mới nhập sẽ dùng để bù đắp phần âm trước; chỉ phần dư thực dương còn lại mới lấy theo đơn giá của lô hàng mới nhập.
24. **Trừ kho đồng bộ trong Giao dịch thanh toán (Transactional Stock Deduction)**: Trừ kho nguyên liệu theo BOM được kích hoạt tự động ngay khi đơn hàng chuyển sang trạng thái `PAID`. Thao tác này bắt buộc đặt trong cùng một Interactive Transaction (`prisma.$transaction`) với lệnh thanh toán, sử dụng `increment: -qty` để tránh race condition khi nhiều thu ngân thanh toán đồng thời. Đồng thời ghi log giao dịch kho loại `ORDER_DEDUCT` kèm theo `orderId` đối soát.
25. **Quy trình Nhập Excel An Toàn (Non-blocking Partial Import & Preview Modal)**: Người dùng bắt buộc được xem trước bản phân tích dữ liệu (Preview Modal) hiển thị chi tiết số dòng hợp lệ, số dòng lỗi và số lượng NVL mới sẽ tạo. Áp dụng cơ chế nhập từng phần (Partial Import) để các dòng hợp lệ vẫn được nhập kho thành công mà không bị chặn đứng bởi 1 dòng lỗi chính tả, mang lại trải nghiệm mượt mà và thực tế.
26. **Giải phóng File Lock trên Windows khi Prisma Generate**: Khi dev server backend (`ts-node-dev`) đang chạy, tiến trình Node giữ file lock trên `query_engine-windows.dll.node`. Phải tạm dừng dev server trước khi thực thi `prisma generate` hoặc migrate schema để tránh lỗi `EPERM / EBUSY`.
27. **Tải tệp đính kèm & Xác thực Trình duyệt (File Downloads & Dual Authentication Strategy)**:
    - *Nguyên nhân gốc rễ (RCA)*: Trình duyệt mở liên kết trực tiếp (qua `window.open`, thẻ `<a>`, hoặc thanh URL) không đính kèm header `Authorization: Bearer <token>` từ bộ nhớ ứng dụng.
    - *Khóa lỗi bằng Regression Test*: Đã bổ sung 2 regression test cases trong `test/inventory/inventory.api.spec.ts` kiểm chứng: (1) Route template tải về `200 OK` không cần token; (2) Route export tải về `200 OK` khi truyền `?token=...` qua query param và chặn `401` khi thiếu token.
    - *Quét phòng ngừa toàn diện (Horizontal Scan)*: Rà soát toàn bộ dự án, xác nhận `/uploads` đã cấu hình static public đúng chuẩn; `/excel/template` chuyển public; `/excel/export` bảo vệ chặt chẽ bằng Dual-Channel Authentication (Header + Query).
    - *Quy tắc phòng ngừa lâu dài*: (1) File mẫu không dữ liệu nhạy cảm phải mở public; (2) File xuất dữ liệu nhạy cảm hỗ trợ song song Header và `?token=`; (3) Frontend tải file qua `fetch` Blob in-memory để không mở tab trắng rỗng.

---
*Tệp tiến độ được tối ưu hóa tinh gọn, lưu trữ các quy chuẩn kiến trúc và tiến độ cập nhật phục vụ phát triển liên tục.*




