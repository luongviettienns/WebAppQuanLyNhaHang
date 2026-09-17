# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN: CRISPY BITE QSR FAST FOOD SYSTEM

> **Hệ Thống Đa Nền Tảng Đặt Món & Quản Lý Nhà Hàng Fast Food "CRISPY BITE"**  
> **Kiến trúc**: Full-Stack Monorepo (React Native / Expo SDK 54 + Node.js / Express / Prisma / MySQL + Real-time Socket.io)  
> **Trạng thái**: Đã hoàn thiện 100% các Module nghiệp vụ từ M1 đến M8; Full Quality Gate PASS.  
> **Cập nhật lần cuối**: 2026-09-17 14:55:00

---

## 📈 1. TỔNG QUAN TIẾN ĐỘ (OVERALL PROGRESS)

```
[████████████████████] 100% HOÀN THÀNH (Phase 0 đến Phase 8; Đạt chuẩn nghiệp vụ nhà hàng QSR thực tế)
```

### 🧪 Bằng chứng kiểm chứng chất lượng (Verification Metrics)
- **Backend Test Suite (Vitest)**: 17/17 test files passed (120/120 tests pass 100% - bao gồm SKU, FSM, Idempotency, Menu Admin, Auto-Cancel Timeout & Public Table QR).
- **Frontend Test Suite (Vitest)**: 7/7 test files passed (33/33 tests pass 100% - bao gồm menu management filters, notification helper & theme coordinator).
- **Playwright E2E Suite**: 3/3 spec files (`cashier-kitchen-flow`, `admin-operations-flow`, `ui-consistency`).
- **Tổng Unit / Integration Tests**: 153/153 tests passed 100% (120 backend + 33 frontend).
- **Monorepo Typecheck (TypeScript)**: `npm run typecheck` $\rightarrow$ 0 lỗi biên dịch trên toàn bộ workspaces.
- **ESLint**: `npm run lint` $\rightarrow$ 0 errors, 0 warnings.
- **Expo Framework Doctor**: `expo-doctor` $\rightarrow$ 18/18 checks passed 100%.
- **Production Web & Node Build**: `npm run build` $\rightarrow$ Biên dịch thành công web bundles (`frontend/dist`) & backend dist.
- **Database Migrations**: 4 migrations đồng bộ nhất quán trên cả `crispy_bite_dev` và `crispy_bite_test`.

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
- **Thẻ rung ảo (Virtual Buzzer)**: Rung điện thoại dồn dập 2.6s kèm chuông báo khi món sẵn sàng (`READY`), hộp thoại xin quyền Web Notification.
- **Thanh toán VietQR**: Tự động sinh mã QR chuyển khoản ngân hàng chứa đúng số tiền tổng bill cả bàn và nội dung giao dịch.

### 4. Phân hệ Quản trị & Báo cáo Doanh thu (Admin)
- **Giao diện Menu phong cách KiotViet**: Sidebar lọc danh mục/trạng thái bên trái, Command search bar, bảng dữ liệu mật độ cao, tự động sinh mã SKU hệ thống (`SP000001`).
- **Báo cáo chuẩn giờ Việt Nam (`Asia/Ho_Chi_Minh` UTC+7)**: Doanh thu thuần chỉ tính đơn `COMPLETED`, tính chỉ số thời gian phục vụ trung bình (SOS), Top 5 món bán chạy nhất.
- **Hủy đơn kiểm toán (Admin Void)**: Chỉ Admin có quyền hủy đơn, bắt buộc nhập lý do void $\ge 3$ ký tự, ghi nhận audit trail (`voidedByUserId`, `voidReason`, `voidedAt`).
- **Tự động hủy đơn quá hạn (Auto-Cancel Scheduler)**: Quét ngầm mỗi 60s, tự động hủy các đơn `PENDING` quá 1 tiếng và giải phóng bàn ăn nếu không còn đơn nợ khác.

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

---

## 🧠 4. QUY TẮC KIẾN TRÚC & BÀI HỌC KINH NGHIỆM CỐT LÕI

### 🔒 Nhóm 1: Bảo Mật, Phân Quyền & Xác Thực (Security & RBAC)
1. **Bảo mật mã QR bàn ăn (Table QR Token Authorization)**: Khách vãng lai (`DINE_IN`) bắt buộc phải có `qrCodeToken` khớp với CSDL để chống đơn ảo từ xa. Cung cấp route công khai có giới hạn `/api/tables/by-number/:tableNumber` để hỗ trợ link cũ và phòng ngừa sự cố.
2. **Nguyên tắc Security by Default**: Mọi thao tác tài chính, đổi menu, hoặc tra cứu danh sách bàn mặc định yêu cầu `authenticate` và `authorize`. Phân định rõ: `CASHIER`/`ADMIN` xem bàn; `KITCHEN`/`ADMIN` xem KDS; chỉ `ADMIN` được hủy đơn (Void) và chỉnh sửa menu.
3. **Reset Rate-Limit khi đăng nhập đúng**: Bộ đếm brute-force theo IP chỉ khóa khi nhập sai mật khẩu liên tiếp. Khi đăng nhập thành công, lập tức xóa cache IP để không gây lỗi `429 RATE_LIMITED` giả cho người dùng hợp lệ.
4. **Role-Aware Fetch Guards ở Context**: Không bao giờ gọi API không có thẩm quyền trong `useEffect` toàn cục. Bếp (`KITCHEN`) không gọi `/api/tables`, Thu ngân (`CASHIER`) không gọi KDS endpoints.

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

---
*Tệp tiến độ được tối ưu hóa tinh gọn, lưu trữ các quy chuẩn kiến trúc và tiến độ cập nhật phục vụ phát triển liên tục.*
