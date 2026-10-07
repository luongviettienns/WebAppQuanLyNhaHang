# 🧪 KỊCH BẢN KIỂM THỬ TOÀN DIỆN HỆ THỐNG CRISPY BITE QSR (FULL TEST SCENARIOS & UAT PLAYBOOK)

> **Hệ Thống**: CRISPY BITE - Fast Food & Smart Dine-in Enterprise QSR Ecosystem  
> **Kiến trúc**: Full-Stack Monorepo (React Native / Expo SDK 54 + Node.js Express + Prisma ORM + MySQL 8.4 + Socket.io)  
> **Mục đích**: Tài liệu kịch bản kiểm nghiệm toàn diện chức năng (Functionality), luồng vận hành liên thông (End-to-End Business Workflows), các ca kiểm thử biên (Edge Cases) và kiểm thử chấp nhận người dùng (User Acceptance Testing - UAT) phục vụ đánh giá, nghiệm thu và bảo vệ đồ án tốt nghiệp.  
> **Phiên bản**: v2.0 - Kiểm thử Chuyên sâu 15 Phân Hệ & 50+ Kịch Bản Chi Tiết.  
> **Ngày phê duyệt**: 2026-10-07.  

---

## 📑 MỤC LỤC KỊCH BẢN KIỂM THỬ

1. [MA TRẬN KIỂM THỬ TỔNG QUAN (TEST MATRIX)](#1-ma-trận-kiểm-thử-tổng-quan)
2. [PHÂN HỆ 1: XÁC THỰC, PHÂN QUYỀN RBAC & QUẢN LÝ PHIÊN (AUTH)](#phân-hệ-1-xác-thực-phân-quyền-rbac--quản-lý-phiên)
3. [PHÂN HỆ 2: KHÁCH HÀNG QUÉT QR GỌI MÓN TẠI BÀN & LIVE TRACKER (CUSTOMER QR)](#phân-hệ-2-khách-hàng-quét-qr-gọi-món-tại-bàn--live-tracker)
4. [PHÂN HỆ 3: THU NGÂN POS & BÁN HÀNG ĐA KÊNH (POS CASHIER)](#phân-hệ-3-thu-ngân-pos--bán-hàng-đa-kênh)
5. [PHÂN HỆ 4: NHÀ BẾP KDS DARK MODE THỜI GIAN THỰC (KITCHEN KDS)](#phân-hệ-4-nhà-bếp-kds-dark-mode-thời-gian-thực)
6. [PHÂN HỆ 5: SƠ ĐỒ PHÒNG BÀN, CHUYỂN BÀN & VÒNG ĐỜI DỌN DẸP (TABLE OPERATIONS)](#phân-hệ-5-sơ-đồ-phòng-bàn-chuyển-bàn--vòng-đời-dọn-dẹp)
7. [PHÂN HỆ 6: QUẢN LÝ MENU, MODIFIERS & BẢNG GIÁ ĐA KÊNH (MENU & PRICING)](#phân-hệ-6-quản-lý-menu-modifiers--bảng-giá-đa-kênh)
8. [PHÂN HỆ 7: KHO NGUYÊN LIỆU, ĐỊNH LƯỢNG BOM & GIÁ VỐN WAC (INVENTORY & BOM)](#phân-hệ-7-kho-nguyên-liệu-định-lượng-bom--giá-vốn-wac)
9. [PHÂN HỆ 8: CHUỖI CUNG ỨNG & QUẢN LÝ NHÀ CUNG CẤP (SUPPLY CHAIN)](#phân-hệ-8-chuỗi-cung-ứng--quản-lý-nhà-cung-cấp)
10. [PHÂN HỆ 9: HỦY ĐƠN KIỂM TOÁN, HỦY MÓN & ĐỔI TRẢ HÀNG BÁN (VOID & RETURN)](#phân-hệ-9-hủy-đơn-kiểm-toán-hủy-món--đổi-trả-hàng-bán)
11. [PHÂN HỆ 10: ĐẶT BÀN TRƯỚC & QUẢN LÝ KHÁCH HÀNG THÀNH VIÊN (RESERVATIONS & CRM)](#phân-hệ-10-đặt-bàn-trước--quản-lý-khách-hàng-thành-viên)
12. [PHÂN HỆ 11: QUẢN TRỊ NHÂN SỰ & XẾP LỊCH CA KÍP (HRM & SCHEDULES)](#phân-hệ-11-quản-trị-nhân-sự--xếp-lịch-ca-kíp)
13. [PHÂN HỆ 12: KIOSK CHẤM CÔNG ĐỘC LẬP & DEBOUNCE 60S (ATTENDANCE KIOSK)](#phân-hệ-12-kiosk-chấm-công-độc-lập--debounce-60s)
14. [PHÂN HỆ 13: BẢNG LƯƠNG & ĐỘNG CƠ TÍNH HOA HỒNG NHÂN VIÊN (PAYROLL & COMMISSIONS)](#phân-hệ-13-bảng-lương--động-cơ-tính-hoa-hồng-nhân-viên)
15. [PHÂN HỆ 14: SỔ QUỸ TÀI CHÍNH & DÒNG TIỀN DOANH NGHIỆP (CASHBOOK LEDGER)](#phân-hệ-14-sổ-quỹ-tài-chính--dòng-tiền-doanh-nghiệp)
16. [PHÂN HỆ 15: BÁO CÁO CUỐI NGÀY TOÀN DIỆN & XUẤT BẢN PDF/EXCEL (END-OF-DAY REPORTS)](#phân-hệ-15-báo-cáo-cuối-ngày-toàn-diện--xuất-bản-pdfexcel)
17. [KỊCH BẢN KIỂM THỬ LIÊN THÔNG ĐA THIẾT BỊ REAL-TIME (E2E LIVE DEMO WORKFLOW)](#17-kịch-bản-kiểm-thử-liên-thông-đa-thiết-bị-real-time)

---

## 1. MA TRẬN KIỂM THỬ TỔNG QUAN

| Mã Nhóm | Phân hệ kiểm thử | Số kịch bản | Mức độ rủi ro | Môi trường kiểm thử |
| :--- | :--- | :---: | :---: | :---: |
| **SEC** | 1. Xác thực, RBAC & Quản lý phiên | 4 | Nghiêm ngặt (High) | Web Desktop / Mobile |
| **CUST** | 2. Khách hàng QR & Live Tracker | 4 | Cao (High) | Mobile Viewport / Tab ẩn danh |
| **POS** | 3. Thu ngân POS & Bán hàng đa kênh | 5 | Nghiêm ngặt (High) | Tablet / Desktop |
| **KDS** | 4. Nhà bếp KDS thời gian thực | 4 | Cao (High) | Desktop Dark Mode |
| **TBL** | 5. Sơ đồ phòng bàn & Vòng đời bàn | 4 | Trung bình (Med) | Desktop / Tablet |
| **MENU** | 6. Quản lý Menu & Bảng giá đa kênh | 3 | Trung bình (Med) | Desktop Admin |
| **INV** | 7. Kho nguyên liệu, BOM & Giá vốn | 4 | Nghiêm ngặt (High) | Desktop Admin |
| **SUP** | 8. Chuỗi cung ứng & Nhà cung cấp | 3 | Trung bình (Med) | Desktop Admin |
| **VOID** | 9. Hủy đơn kiểm toán & Đổi trả bán | 4 | Nghiêm ngặt (High) | Desktop POS / Admin |
| **RES** | 10. Đặt bàn & Quản lý khách hàng CRM | 3 | Trung bình (Med) | Desktop Admin |
| **HRM** | 11. Quản trị nhân sự & Ca kíp | 3 | Trung bình (Med) | Desktop Admin |
| **PUNCH**| 12. Kiosk chấm công & Debounce 60s | 4 | Cao (High) | Kiosk Portrait Mode |
| **PAY** | 13. Lương & Động cơ hoa hồng NV | 3 | Nghiêm ngặt (High) | Desktop Admin |
| **CASH** | 14. Sổ quỹ tài chính & Dòng tiền | 4 | Nghiêm ngặt (High) | Desktop Admin |
| **EOD** | 15. Báo cáo cuối ngày & Xuất bản PDF | 4 | Nghiêm ngặt (High) | Desktop Admin |
| **LIVE** | 16. Kịch bản liên thông E2E Real-Time | 1 | Trọng yếu (Critical)| 3 Cửa sổ trình duyệt song song |

---

## PHÂN HỆ 1: XÁC THỰC, PHÂN QUYỀN RBAC & QUẢN LÝ PHIÊN

### 📌 TC-SEC-01: Đăng nhập thành công phân quyền đúng vai trò (Admin / Cashier / Kitchen)
- **Tiền điều kiện**: Hệ thống đang chạy tại `http://localhost:8081`, dữ liệu đã seed mặc định (`npm run db:reset`).
- **Các bước thực hiện**:
  1. Mở trình duyệt, truy cập `http://localhost:8081`.
  2. Nhập tài khoản **"Thu ngân"** (`cashier` / `cashier123` - tra cứu tại [TAI_KHOAN_DANG_NHAP.md](file:///c:/Users/ASUS/Desktop/WebAppQuanLyNhaHang/TAI_KHOAN_DANG_NHAP.md)).
  3. Bấm nút **"Đăng nhập"**.
  4. Đăng xuất. Lặp lại bước 2–3 lần lượt với **"Bếp"** (`kitchen` / `kitchen123`) và **"Quản trị"** (`admin` / `admin123`).
- **Kết quả mong đợi**:
  - `cashier`: Đăng nhập thành công, chuyển hướng đến tab **POS**, giao diện sáng (Light Theme). Thấy các tab: *POS, Bàn, Đơn hàng*.
  - `kitchen`: Đăng nhập thành công, chuyển hướng đến màn hình **Bếp KDS**, giao diện tối chuyên dụng (Dark Mode OLED).
  - `admin`: Đăng nhập thành công, thanh điều hướng hiển thị đầy đủ toàn bộ các chức năng: *POS, Bàn, Bếp, Menu, Kho NVL, Sổ quỹ, Nhân sự, Báo cáo*.

### 📌 TC-SEC-02: Chặn đăng nhập sai mật khẩu & bảo toàn Input
- **Tiền điều kiện**: Ở màn hình đăng nhập.
- **Các bước thực hiện**:
  1. Nhập username: `admin`.
  2. Nhập password sai: `sai_mat_khau_123`.
  3. Bấm **Đăng nhập**.
- **Kết quả mong đợi**:
  - Hiển thị thông báo lỗi màu đỏ: *"Đăng nhập không thành công. Vui lòng thử lại."*
  - **Ô nhập `username: admin` vẫn giữ nguyên giá trị** (không bị xóa trắng hay unmount form).

### 📌 TC-SEC-03: Bảo vệ API Endpoints (401 Unauthorized & 403 Forbidden)
- **Tiền điều kiện**: Công cụ gọi API (Postman / Thunder Client / cURL).
- **Các bước thực hiện**:
  1. Gửi request `GET http://localhost:4000/api/reports/daily` không kèm Header Authorization.
  2. Đăng nhập tài khoản `cashier`, lấy JWT token. Gửi request `GET http://localhost:4000/api/employees/payroll-batches` kèm Bearer token của Cashier.
- **Kết quả mong đợi**:
  - Bước 1 trả về HTTP **401 Unauthorized** (`{"success": false, "code": "UNAUTHORIZED"}`).
  - Bước 2 trả về HTTP **403 Forbidden** (`{"success": false, "code": "FORBIDDEN"}`) do Thu ngân không có quyền truy cập bảng lương.

### 📌 TC-SEC-04: Khôi phục phiên làm việc (Session Restore) khi F5 tải lại trang
- **Tiền điều kiện**: Đang đăng nhập tài khoản `admin`.
- **Các bước thực hiện**:
  1. Đang đứng ở màn hình *Kho & Định lượng*.
  2. Nhấn phím `F5` (Refresh trình duyệt).
- **Kết quả mong đợi**:
  - Không bị văng ra màn hình đăng nhập. Phiên làm việc được khôi phục tự động qua token lưu trong bộ nhớ client, tiếp tục ở lại màn hình ứng dụng.

---

## PHÂN HỆ 2: KHÁCH HÀNG QUÉT QR GỌI MÓN TẠI BÀN & LIVE TRACKER

### 📌 TC-CUST-01: Quét mã QR nhận diện đúng thông tin bàn ăn
- **Tiền điều kiện**: Bàn 01 (`tableNumber: 1`) đang ở trạng thái trống `AVAILABLE`.
- **Các bước thực hiện**:
  1. Mở tab trình duyệt mới (mô phỏng camera điện thoại quét QR): `http://localhost:8081/?table=1`.
- **Kết quả mong đợi**:
  - Màn hình khách hàng hiển thị: Tiêu đề quán **CRISPY BITE**, huy hiệu bàn **"Bàn 01 - Khu Tầng 1"**.
  - Hiển thị toàn bộ thực đơn theo nhóm danh mục: Combo, Gà rán, Burger, Đồ uống.

### 📌 TC-CUST-02: Chọn món ăn kèm Modifier bắt buộc & tùy chọn
- **Tiền điều kiện**: Đang ở màn hình thực đơn bàn 01.
- **Các bước thực hiện**:
  1. Chọn món **"Combo Gà Giòn Sốt Cay"**.
  2. Modal cấu hình món mở ra:
     - Chọn Size: **Size L** (+10.000đ).
     - Chọn Độ cay: **Cay vừa**.
     - Chọn Topping thêm: **Phô mai kéo sợi** (+15.000đ).
  3. Bấm **"Thêm vào giỏ hàng"**.
- **Kết quả mong đợi**:
  - Giá món tính chính xác: Giá gốc + phụ thu Modifier.
  - Giỏ hàng nổi góc dưới hiển thị số lượng 1 món và tổng tiền tương ứng.

### 📌 TC-CUST-03: Áp dụng mã Voucher giảm giá & bóc tách Gross VAT 8%
- **Tiền điều kiện**: Giỏ hàng có món giá trị 160.000đ.
- **Các bước thực hiện**:
  1. Mở modal giỏ hàng.
  2. Tại ô "Mã khuyến mãi", nhập mã: `CRISPY10` (Giảm 10%).
  3. Bấm **"Áp dụng"**.
- **Kết quả mong đợi**:
  - Tiền giảm giá: `-16.000đ`.
  - Tổng thanh toán: `144.000đ` (Khớp chính xác giá niêm yết sau khi giảm).
  - Thuế VAT 8% bóc tách ngược hiển thị minh bạch: `144.000 * 8 / 108 = 10.667đ`. Không cộng thêm 8% vào tổng thanh toán làm đội giá bill.

### 📌 TC-CUST-04: Khách vãng lai quét QR gửi đơn trực tiếp không cần đặt bàn trước & Live Tracker
- **Tiền điều kiện**: Khách vãng lai đến quán, ngồi vào bàn và quét mã QR bàn (`http://localhost:8081/?table=1` hoặc kèm mã `?qr=...`). Giỏ hàng đã có món. Không có mã đặt chỗ trước (`reservationAccessToken`).
- **Các bước thực hiện**:
  1. Bấm nút **"Gửi yêu cầu gọi món"**.
- **Kết quả mong đợi**:
  - **Không bị chặn** bởi thông báo *"Đặt bàn cần được nhân viên check-in trước khi gọi món"*.
  - Hệ thống tự động xác thực mã QR bàn (`qrCodeToken`), tạo đơn hàng thành công với trạng thái `status: PENDING`, `paymentStatus: UNPAID`.
  - Bàn chuyển sang màu đỏ `OCCUPIED` trên sơ đồ bàn của thu ngân.
  - Bếp KDS lập tức nhận được thông báo chuông đơn mới qua WebSocket `restaurant:kds`.
  - Màn hình khách tự động chuyển sang **Live Tracker**:
    - Bước 1: 🕒 *Chờ tiếp nhận (PENDING)*.
    - Khi bếp bấm chế biến $\rightarrow$ Tự động nhảy sang 🍳 *Đang chuẩn bị (PREPARING)* mà không cần F5.
    - Khi bếp nấu xong $\rightarrow$ Nhảy sang 🔔 *Món đã sẵn sàng (READY)*.

### 📌 TC-CUST-05: Khách có đặt bàn trước (Reservation Prepayment & Deposit)
- **Tiền điều kiện**: Khách đã đặt bàn trước, đã check-in và có `reservationAccessToken`.
- **Các bước thực hiện**:
  1. Khách quét mã bàn vào link kèm mã truy cập đặt chỗ.
  2. Chọn món và bấm **"Gửi yêu cầu gọi món"**.
- **Kết quả mong đợi**:
  - Hệ thống kiểm tra số dư tiền cọc:
    - Nếu tiền cọc đủ thanh toán: Đơn chuyển sang bếp KDS ngay lập tức.
    - Nếu chưa đủ cọc: Đơn ở trạng thái chờ thanh toán phần còn thiếu, thu ngân nhận thông báo xác nhận thanh toán trước khi bếp chuẩn bị.

### 📌 TC-CUST-06: Chặn gian lận gọi món khi thiếu hoặc sai mã QR bàn (QR Security Guard)
- **Tiền điều kiện**: Gọi API `POST /api/orders` với vai trò khách vãng lai.
- **Các bước thực hiện**:
  1. Gửi request tạo đơn bàn ăn `DINE_IN` chỉ truyền `tableId` mà không có `qrCodeToken`.
  2. Gửi request kèm `qrCodeToken: "invalid-qr-fake-999"`.
- **Kết quả mong đợi**:
  - Bước 1 bị từ chối với HTTP **400 Validation Error** (*"Khách gọi món tại bàn cần có mã QR hợp lệ"*), ngăn chặn việc khách tự bịa số bàn gọi món từ xa.
  - Bước 2 bị từ chối với HTTP **404 Not Found** (*"Mã QR bàn không hợp lệ hoặc đã hết hạn"*).

---

## PHÂN HỆ 3: THU NGÂN POS & BÁN HÀNG ĐA KÊNH

### 📌 TC-POS-01: Tạo đơn bán mang đi (Take-away) thanh toán tiền mặt Numpad
- **Tiền điều kiện**: Đăng nhập tài khoản `cashier`. Đang ở tab **POS**.
- **Các bước thực hiện**:
  1. Chọn 1 **Burger Bò Phô Mai** (55.000đ) và 1 **Coca-Cola** (20.000đ). Tổng: `75.000đ`.
  2. Chọn phương thức: **"Mang về (Take-away)"**.
  3. Bấm **"Thanh toán"**.
  4. Tại màn hình tính tiền, chọn phương thức **Tiền mặt (CASH)**.
  5. Bấm phím gợi ý `100.000đ` trên Numpad.
- **Kết quả mong đợi**:
  - Tiền khách đưa: `100.000đ`.
  - Tiền thối lại tự động tính: `25.000đ`.
  - Bấm **"Xác nhận thanh toán"** $\rightarrow$ Đơn chuyển sang `PAID`, hiển thị popup hóa đơn in.

### 📌 TC-POS-02: Tạo đơn bán tại bàn (Dine-in) trả sau
- **Tiền điều kiện**: Đăng nhập `cashier`. Bàn 02 đang trống.
- **Các bước thực hiện**:
  1. Chọn món ăn vào giỏ.
  2. Chọn loại đơn: **"Tại bàn (Dine-in)"**, chọn **Bàn 02**.
  3. Bấm **"Gửi bếp (Chưa thanh toán)"**.
- **Kết quả mong đợi**:
  - Đơn tạo thành công với `paymentStatus: UNPAID`.
  - Sơ đồ bàn: Bàn 02 chuyển từ màu Xanh (`AVAILABLE`) sang màu Đỏ (`OCCUPIED`).
  - Màn hình bếp KDS lập tức nhận vé của Bàn 02.

### 📌 TC-POS-03: Thanh toán đơn bàn ăn & Bảo toàn vòng đời `PAID_AWAITING_SERVE`
- **Tiền điều kiện**: Bàn 03 đang có đơn hàng đang nấu ở bếp (`PREPARING`). Khách ra quầy xin thanh toán trước.
- **Các bước thực hiện**:
  1. Thu ngân vào tab **Bàn**, bấm vào Bàn 03.
  2. Bấm nút **"Thanh toán"** $\rightarrow$ Chọn Chuyển khoản QR ngân hàng $\rightarrow$ Xác nhận thành công.
- **Kết quả mong đợi**:
  - Đơn hàng chuyển sang `paymentStatus: PAID`.
  - **Bàn 03 KHÔNG bị reset về trống và KHÔNG chuyển sang `NEED_CLEANING`**.
  - Bàn 03 tiếp tục giữ trạng thái **Đang phục vụ (`OCCUPIED` / `PAID_AWAITING_SERVE`)** và giữ nguyên `currentOrderId` để khách tiếp tục xem Live Tracker.
  - POS hiển thị thông báo: *"Món ăn đang được chế biến, bàn tiếp tục phục vụ"*.

### 📌 TC-POS-04: Tự động chuyển `NEED_CLEANING` khi món cuối cùng hoàn tất
- **Tiền điều kiện**: Tiếp nối `TC-POS-03`, đơn bàn 03 đã trả tiền (`PAID`) nhưng món đang ở bếp.
- **Các bước thực hiện**:
  1. Tại màn hình Bếp/Phục vụ, bấm hoàn tất món ăn chuyển sang `COMPLETED`.
- **Kết quả mong đợi**:
  - Server tự động kiểm tra: Đơn hàng đã `PAID` và mọi món đã `COMPLETED`.
  - Bàn 03 lập tức chuyển sang màu Vàng **"Chờ dọn dẹp" (`NEED_CLEANING`)**.
  - Live Tracker của khách đóng phiên an toàn.

### 📌 TC-POS-05: Đơn hàng giao đối tác (Delivery Partner - GrabFood / ShopeeFood)
- **Tiền điều kiện**: Đang ở màn hình POS.
- **Các bước thực hiện**:
  1. Chọn món. Chọn kênh **"Giao hàng (Delivery)"**.
  2. Chọn đối tác: **GrabFood**, nhập mã vận đơn tài xế.
  3. Bấm tạo đơn.
- **Kết quả mong đợi**:
  - Phí giao hàng được tính riêng (không chịu VAT).
  - Đơn hàng ghi nhận đối tác giao hàng, sẵn sàng cho khâu đối soát công nợ chiết khấu nền tảng.

---

## PHÂN HỆ 4: NHÀ BẾP KDS DARK MODE THỜI GIAN THỰC

### 📌 TC-KDS-01: Nhận vé đơn hàng mới qua WebSocket thời gian thực
- **Tiền điều kiện**: Mở cửa sổ 1 (Thu ngân), mở cửa sổ 2 (Bếp KDS).
- **Các bước thực hiện**:
  1. Tại cửa sổ Thu ngân: Bấm tạo 1 đơn hàng mới cho Bàn 04.
  2. Quan sát cửa sổ Bếp KDS (không thực hiện thao tác F5).
- **Kết quả mong đợi**:
  - Trong vòng **< 500ms**, thẻ vé mới tự động xuất hiện trên màn hình Bếp.
  - Thẻ vé hiển thị: Số bàn (Bàn 04), Mã đơn, Danh sách món kèm đầy đủ Modifier (Size, Cay), bộ đếm thời gian (Prep Timer) bắt đầu đếm từ 00:00.

### 📌 TC-KDS-02: Vòng đời FSM Bếp: Pending $\rightarrow$ Preparing $\rightarrow$ Ready
- **Tiền điều kiện**: Thẻ vé đang ở trạng thái `PENDING`.
- **Các bước thực hiện**:
  1. Bếp bấm nút **"Bắt đầu nấu"** $\rightarrow$ Trạng thái chuyển sang `PREPARING` (Màu Cam).
  2. Bếp nấu xong, bấm nút **"Sẵn sàng ra món"** $\rightarrow$ Chuyển sang `READY` (Màu Xanh lá).
- **Kết quả mong đợi**:
  - Trạng thái chuyển mượt mà, đồng bộ lập tức sang máy Thu ngân và điện thoại khách hàng.
  - Server chặn tuyệt đối nhảy cóc trạng thái (ví dụ từ PENDING nhảy cóc sang COMPLETED sẽ bị từ chối 409 Conflict).

### 📌 TC-KDS-03: Hoàn tác trạng thái Bếp (Undo FSM trong 10 giây)
- **Tiền điều kiện**: Bếp vừa vô tình bấm nhầm nút "Sẵn sàng" (`READY`).
- **Các bước thực hiện**:
  1. Ngay khi bấm `READY`, nút **"Hoàn tác (Undo - 10s)"** xuất hiện với thanh đếm ngược.
  2. Trong vòng 5 giây, bấm vào nút **"Hoàn tác"**.
- **Kết quả mong đợi**:
  - Vé bếp lập tức quay trở lại trạng thái `PREPARING`.
  - Socket phát thông báo cập nhật lại trạng thái cho toàn hệ thống.
  - Sau 60 giây, server tự động khóa cứng guard timeout, không cho phép hoàn tác nữa.

### 📌 TC-KDS-04: Báo hết món tức thì (86'd Sold-out Toggle)
- **Tiền điều kiện**: Món "Gà Giòn Cay" trong bếp vừa hết nguyên liệu.
- **Các bước thực hiện**:
  1. Bếp trưởng vào menu phụ KDS, tìm món "Gà Giòn Cay".
  2. Gạt nút **"Báo hết món (86'd)"**.
- **Kết quả mong đợi**:
  - Món ăn ngay lập tức hiển thị nhãn `TẠM HẾT HÀNG` mờ đi trên màn hình POS của Thu ngân và màn hình gọi món của Khách.
  - Thu ngân và khách hàng không thể thêm món này vào giỏ hàng nữa.

---

## PHÂN HỆ 5: SƠ ĐỒ PHÒNG BÀN, CHUYỂN BÀN & VÒNG ĐỜI DỌN DẸP

### 📌 TC-TBL-01: Chuyển bàn thông minh (Table Transfer 🔀)
- **Tiền điều kiện**: Bàn 01 đang có khách ngồi (`OCCUPIED`) với đơn hàng 250.000đ. Khách yêu cầu chuyển sang Bàn 05 (đang `AVAILABLE`).
- **Các bước thực hiện**:
  1. Tại tab **Bàn**, chọn Bàn 01.
  2. Bấm nút **"Chuyển bàn"**.
  3. Chọn bàn đích: **Bàn 05**. Bấm **"Xác nhận chuyển"**.
- **Kết quả mong đợi**:
  - Toàn bộ đơn hàng chưa thanh toán từ Bàn 01 được chuyển sang Bàn 05 nguyên tử.
  - Bàn 05 chuyển sang trạng thái `OCCUPIED`.
  - Bàn 01 chuyển về trạng thái `AVAILABLE`.
  - Ghi nhận lịch sử kiểm toán trong `AuditLog`.

### 📌 TC-TBL-02: Quy trình Dọn bàn (Vệ sinh an toàn thực phẩm)
- **Tiền điều kiện**: Bàn 06 đang ở trạng thái màu Vàng `NEED_CLEANING`.
- **Các bước thực hiện**:
  1. Nhân viên phục vụ dọn bàn xong, mở tab **Bàn**.
  2. Nhấp vào Bàn 06 $\rightarrow$ Bấm nút **"Đã dọn bàn xong"**.
- **Kết quả mong đợi**:
  - Bàn 06 chuyển từ màu Vàng sang màu Xanh (`AVAILABLE`).
  - Sẵn sàng đón lượt khách tiếp theo.

### 📌 TC-TBL-03: Quản lý khu vực & Bàn ăn Admin
- **Tiền điều kiện**: Đăng nhập `admin`. Vào mục **Quản lý Bàn**.
- **Các bước thực hiện**:
  1. Thêm khu vực mới: "Sân Thượng (Rooftop)".
  2. Thêm bàn mới: Bàn ST-01, sức chứa 4 người thuộc khu vực Sân Thượng.
- **Kết quả mong đợi**:
  - Bàn mới xuất hiện trên sơ đồ bàn của cả POS và Quản trị.

---

## PHÂN HỆ 6: QUẢN LÝ MENU, MODIFIERS & BẢNG GIÁ ĐA KÊNH

### 📌 TC-MENU-01: Tạo món ăn mới & Nhóm Topping bắt buộc
- **Tiền điều kiện**: Đăng nhập `admin`. Vào **Quản lý Thực đơn**.
- **Các bước thực hiện**:
  1. Bấm **"Thêm món mới"**.
  2. Nhập thông tin: Tên: *Trà Sữa Trân Châu Crispy*, Giá niêm yết: *35.000đ*, Danh mục: *Đồ uống*.
  3. Tạo nhóm lựa chọn bắt buộc: *Đường đá* (100% đường, 50% đường).
  4. Tạo nhóm lựa chọn tùy chọn: *Topping* (Trân châu đen +5k, Thạch dừa +5k).
  5. Bấm **"Lưu món ăn"**.
- **Kết quả mong đợi**:
  - Món mới xuất hiện ngay lập tức trên POS và Khách hàng QR với đầy đủ tùy chọn Modifier.

### 📌 TC-MENU-02: Thiết lập Bảng giá đa kênh (Price List)
- **Tiền điều kiện**: Đăng nhập `admin`. Vào **Bảng giá**.
- **Các bước thực hiện**:
  1. Tạo bảng giá: "Giá Bán Đêm (Kênh GrabFood)".
  2. Cấu hình phụ thu: Tăng 10% cho toàn bộ nhóm Đồ uống.
  3. Áp dụng cho kênh Delivery.
- **Kết quả mong đợi**:
  - Khi tạo đơn kênh GrabFood, giá món tự động áp dụng giá theo bảng giá chuyên biệt.

### 📌 TC-MENU-03: Xuất & Nhập thực đơn hàng loạt từ Excel
- **Tiền điều kiện**: Đang ở màn hình Quản lý Menu.
- **Các bước thực hiện**:
  1. Bấm **"Xuất Excel"** $\rightarrow$ Tải về tệp `.xlsx` danh sách món.
  2. Mở file, sửa giá 1 món ăn, lưu lại.
  3. Bấm **"Nhập từ Excel"**, tải file vừa sửa lên.
- **Kết quả mong đợi**:
  - Hệ thống cập nhật chính xác thông tin món từ Excel, thông báo số lượng bản ghi cập nhật thành công.

---

## PHÂN HỆ 7: KHO NGUYÊN LIỆU, ĐỊNH LƯỢNG BOM & GIÁ VỐN WAC

### 📌 TC-INV-01: Định lượng công thức món ăn (BOM - Bill of Materials)
- **Tiền điều kiện**: Đăng nhập `admin`. Vào **Kho & Định lượng**.
- **Các bước thực hiện**:
  1. Chọn món "Burger Bò Phô Mai".
  2. Thiết lập định lượng:
     - 1 Vỏ bánh Burger (`01 cái`)
     - Thịt bò xay (`120 gram`)
     - Phô mai lát (`01 miếng`)
  3. Bấm **"Lưu công thức BOM"**.
- **Kết quả mong đợi**:
  - Giá vốn định mức (Standard Cost) của món tự động tính toán bằng tổng chi phí các nguyên liệu cấu thành.

### 📌 TC-INV-02: Tự động trừ kho nguyên liệu khi đơn hàng thanh toán (`PAID`)
- **Tiền điều kiện**: Nguyên liệu "Thịt bò xay" đang có tồn kho 1.000 gram.
- **Các bước thực hiện**:
  1. Thu ngân tạo đơn bán 2 chiếc "Burger Bò Phô Mai".
  2. Bấm thanh toán thành công (`PAID`).
- **Kết quả mong đợi**:
  - Hệ thống tự động kích hoạt giao dịch kho `AUTO_DEDUCT`.
  - Tồn kho "Thịt bò xay" giảm chính xác: $1.000 - (120 \times 2) = 760\text{ gram}$.
  - Ghi nhận biến động trong thẻ kho nguyên liệu.

### 📌 TC-INV-03: Cảnh báo nguyên liệu chạm ngưỡng tồn kho tối thiểu
- **Tiền điều kiện**: Nguyên liệu "Tương cà" có tồn tối thiểu cấu hình là 5 chai. Tồn hiện tại là 6 chai.
- **Các bước thực hiện**:
  1. Xuất kho 2 chai tương cà (tồn còn 4 chai).
- **Kết quả mong đợi**:
  - Thẻ nguyên liệu đổi sang trạng thái màu Đỏ kèm badge **"Cảnh báo tồn thấp"**.
  - Ticker cảnh báo trên KDS hiển thị thông báo thiếu hụt.

### 📌 TC-INV-04: Báo hủy phế phẩm bếp (Kitchen Waste 1 chạm)
- **Tiền điều kiện**: Đầu bếp làm cháy 1 miếng gà rán.
- **Các bước thực hiện**:
  1. Tại KDS, bấm vào icon thùng rác **"Báo hủy món"**.
  2. Chọn món "Gà Rán Cay", số lượng 1, lý do "Cháy khét khi chiên".
  3. Bấm xác nhận.
- **Kết quả mong đợi**:
  - Kho tự động trừ NVL thịt gà và bột chiên tương ứng.
  - Chi phí hủy được hạch toán vào mục `kitchenWasteCost` trong báo cáo lãi gộp cuối ngày.

---

## PHÂN HỆ 8: CHUỖI CUNG ỨNG & QUẢN LÝ NHÀ CUNG CẤP

### 📌 TC-SUP-01: Tạo phiếu nhập kho mua hàng (Purchase Receipt)
- **Tiền điều kiện**: Đăng nhập `admin`. Vào **Nhập hàng**.
- **Các bước thực hiện**:
  1. Chọn Nhà cung cấp: *Công ty Thực Phẩm CP*.
  2. Thêm mặt hàng nhập: *Thịt gà tươi* (50 kg, đơn giá 60.000đ/kg). Tổng: `3.000.000đ`.
  3. Chọn phương thức thanh toán: *Chuyển khoản ngay từ tài khoản Ngân hàng*.
  4. Bấm **"Hoàn thành phiếu nhập"**.
- **Kết quả mong đợi**:
  - Tồn kho thịt gà tăng thêm 50 kg.
  - Giá vốn bình quân (WAC) được cập nhật lại theo công thức bình quân gia quyền.
  - **Sổ quỹ tự động sinh Phiếu chi tiền (`CashVoucher`) 3.000.000đ** trừ số dư tài khoản Ngân hàng.

### 📌 TC-SUP-02: Phiếu trả hàng cho nhà cung cấp (Purchase Return)
- **Tiền điều kiện**: Phát hiện 5 kg thịt gà bị hỏng từ phiếu nhập trên.
- **Các bước thực hiện**:
  1. Tạo phiếu trả hàng: Chọn phiếu nhập CP, nhập số lượng trả 5 kg (300.000đ).
  2. NCC hoàn tiền mặt. Bấm hoàn tất.
- **Kết quả mong đợi**:
  - Kho giảm trừ 5 kg thịt gà.
  - Sổ quỹ tự động sinh Phiếu thu tiền mặt 300.000đ.

### 📌 TC-SUP-03: Kiểm kê kho & Cân bằng tồn thực tế
- **Tiền điều kiện**: Kiểm kho định kỳ cuối tuần.
- **Các bước thực hiện**:
  1. Vào **Kiểm kho** $\rightarrow$ Tạo phiếu kiểm.
  2. Nhập số lượng đếm thực tế (ví dụ: Sổ sách 50 gói phô mai, thực tế đếm 48 gói).
  3. Bấm **"Cân bằng kho"**.
- **Kết quả mong đợi**:
  - Hệ thống sinh giao dịch điều chỉnh `MANUAL_ADJUST` trừ 2 gói phô mai, ghi nhận chi phí hao hụt kiểm kê.

---

## PHÂN HỆ 9: HỦY ĐƠN KIỂM TOÁN, HỦY MÓN & ĐỔI TRẢ HÀNG BÁN

### 📌 TC-VOID-01: Hủy đơn hàng có kiểm toán (Admin Audited Void)
- **Tiền điều kiện**: Một đơn hàng 300.000đ đã thanh toán tiền mặt nhưng khách có việc đột xuất xin hủy đơn lúc món còn đang `PENDING`.
- **Các bước thực hiện**:
  1. Thu ngân yêu cầu Quản lý hủy đơn.
  2. Quản lý đăng nhập popup Void, nhập mật khẩu Admin và lý do: *"Khách bận đột xuất xin hủy trước khi chế biến"*.
  3. Bấm **"Xác nhận Hủy đơn (Void)"**.
- **Kết quả mong đợi**:
  - Trạng thái đơn chuyển sang `VOIDED`.
  - Món chưa nấu $\rightarrow$ Toàn bộ nguyên liệu hoàn trả về kho (`VOID_RESTORE`).
  - Lượt sử dụng voucher (nếu có) được hoàn trả.
  - **Sổ quỹ tự động sinh Phiếu chi hoàn tiền 300.000đ** cho khách.

### 📌 TC-VOID-02: Chặn hủy đơn khi thiếu lý do hoặc lý do < 3 ký tự
- **Các bước thực hiện**:
  1. Tại popup Void đơn, để trống lý do hoặc chỉ gõ "Ko". Bấm Xác nhận.
- **Kết quả mong đợi**:
  - Bị chặn lại với thông báo lỗi: *"Lý do hủy đơn phải có ít nhất 3 ký tự"*.

### 📌 TC-VOID-03: Hủy đơn sau khi món đã nấu xong (`PREPARING` / `READY`)
- **Tiền điều kiện**: Đơn hàng đã nấu xong `READY` nhưng khách bỏ về không lấy.
- **Các bước thực hiện**:
  1. Thực hiện Admin Void cho đơn hàng.
- **Kết quả mong đợi**:
  - Đơn chuyển sang `VOIDED`.
  - **Kho KHÔNG hoàn trả nguyên liệu** (vì món đã chế biến thành phẩm bị hỏng), hệ thống ghi nhận vào chi phí hao hụt phế phẩm `SPOILAGE_WASTE`.

### 📌 TC-VOID-04: Đổi trả hàng bán (Sales Return)
- **Tiền điều kiện**: Khách mua mang về 2 lon nước ngọt, mang quay lại quầy xin đổi 1 lon vì chọn nhầm vị.
- **Các bước thực hiện**:
  1. Vào lịch sử đơn hàng $\rightarrow$ Bấm **"Đổi trả món"**.
  2. Chọn trả 1 lon Coca-Cola (20.000đ).
- **Kết quả mong đợi**:
  - Hệ thống sinh chứng từ `OrderReturn`, hoàn kho 1 lon nước ngọt và hoàn tiền mặt tương ứng.

---

## PHÂN HỆ 10: ĐẶT BÀN TRƯỚC & QUẢN LÝ KHÁCH HÀNG THÀNH VIÊN

### 📌 TC-RES-01: Đặt bàn tiệc kèm đặt cọc tiền trước (Reservation with Deposit)
- **Tiền điều kiện**: Khách đặt bàn tiệc sinh nhật 10 người cho tối mai.
- **Các bước thực hiện**:
  1. Vào phân hệ **Đặt bàn** $\rightarrow$ Bấm **"Tạo đặt bàn mới"**.
  2. Nhập: Tên khách: *Anh Hoàng*, SĐT: *0912345678*, Số khách: *10*, Giờ đến: *19:00 ngày mai*.
  3. Bàn được gán: Bàn 11 + Bàn 12.
  4. Thu tiền cọc: `500.000đ` (Chuyển khoản). Bấm xác nhận.
- **Kết quả mong đợi**:
  - Phiếu đặt bàn chuyển sang trạng thái `CONFIRMED`.
  - Sổ quỹ ghi nhận phiếu thu tiền cọc đặt bàn 500.000đ.
  - Sơ đồ bàn: Bàn 11 và 12 hiển thị badge đặt trước (`RESERVED`) trong khung giờ đã định.

### 📌 TC-RES-02: Chính sách hủy đặt bàn & Hoàn cọc tự động
- **Tiền điều kiện**: Khách gọi điện xin hủy bàn trước giờ hẹn 4 tiếng (Quy định: Hủy trước 2 tiếng hoàn 100% cọc).
- **Các bước thực hiện**:
  1. Chọn phiếu đặt bàn của Anh Hoàng $\rightarrow$ Bấm **"Hủy đặt bàn"**.
- **Kết quả mong đợi**:
  - Trạng thái chuyển sang `CANCELLED`.
  - Hệ thống tính toán hoàn cọc 100% (`500.000đ`) và tự động tạo phiếu chi hoàn cọc trong sổ quỹ.

### 📌 TC-RES-03: Tích điểm & Thăng hạng khách hàng thân thiết (VIP CRM)
- **Tiền điều kiện**: Khách hàng Nguyễn Văn A có số điểm tích lũy 950 điểm (Hạng Bạc). Hạng Vàng yêu cầu 1.000 điểm.
- **Các bước thực hiện**:
  1. Khách mua đơn hàng 600.000đ, thu ngân chọn số điện thoại khách Nguyễn Văn A.
  2. Thanh toán đơn hàng thành công.
- **Kết quả mong đợi**:
  - Khách được cộng thêm 60 điểm $\rightarrow$ Tổng 1.010 điểm.
  - Hệ thống tự động nâng hạng khách lên **Hạng Vàng (VIP Gold)**, các lần mua sau được tự động chiết khấu 5%.

---

## PHÂN HỆ 11: QUẢN TRỊ NHÂN SỰ & XẾP LỊCH CA KÍP

### 📌 TC-HRM-01: Tạo hồ sơ nhân viên mới & Cấu hình mức lương
- **Tiền điều kiện**: Đăng nhập `admin`. Vào **Nhân sự**.
- **Các bước thực hiện**:
  1. Bấm **"Thêm nhân viên"**.
  2. Nhập: Mã NV: `NV010`, Họ tên: *Trần Thị Lan*, Chức danh: *Thu ngân*, Loại lương: *Lương theo giờ* (30.000đ/giờ), Mã PIN Kiosk: `2026`.
  3. Bấm **"Lưu hồ sơ"**.
- **Kết quả mong đợi**:
  - Nhân viên mới xuất hiện trong danh sách, sẵn sàng cho việc phân ca và chấm công.

### 📌 TC-HRM-02: Lập lịch làm việc tuần cho nhân viên (Weekly Schedule)
- **Tiền điều kiện**: Đầu tuần mới.
- **Các bước thực hiện**:
  1. Vào **Lịch làm việc**. Chọn tuần hiện tại.
  2. Phân ca: Gán nhân viên `NV010` vào Ca Sáng (07:00 - 15:00) các ngày Thứ 2, 4, 6.
  3. Bấm **"Xuất bản lịch tuần"**.
- **Kết quả mong đợi**:
  - Lịch ca kíp được lưu trữ, làm căn cứ đối soát ca làm việc thực tế của Kiosk chấm công.

---

## PHÂN HỆ 12: KIOSK CHẤM CÔNG ĐỘC LẬP & DEBOUNCE 60S

### 📌 TC-PUNCH-01: Nhân viên Check-in đầu ca bằng mã PIN
- **Tiền điều kiện**: Mở ứng dụng Kiosk Chấm công tại `http://localhost:8081` (Chọn màn hình Kiosk).
- **Các bước thực hiện**:
  1. Chọn mã nhân viên: `cashier_01` (Lê Thu Ngân).
  2. Nhập mã PIN 4 số trên màn hình cảm ứng Kiosk.
  3. Bấm **"Xác nhận Chấm công (CHECK_IN)"**.
- **Kết quả mong đợi**:
  - Màn hình hiển thị thẻ xanh thông báo: *"Chấm công VÀO CA thành công cho Lê Thu Ngân lúc 07:02"*.
  - Hệ thống ghi nhận phiên chấm công `EmployeeAttendanceSession`.

### 📌 TC-PUNCH-02: Chặn bấm đúp chấm công liên tiếp (Debounce Guard 60 Giây)
- **Tiền điều kiện**: Nhân viên vừa Check-in xong ở bước trên.
- **Các bước thực hiện**:
  1. Ngay lập tức (trong vòng 10 giây sau), nhân viên vô tình bấm chấm công lại lần nữa.
- **Kết quả mong đợi**:
  - Server lập tức chặn lại và trả về HTTP **429 Too Many Requests** (`ATTENDANCE_PUNCH_DEBOUNCED`).
  - Màn hình Kiosk hiển thị cảnh báo thân thiện: *"Bạn vừa chấm công, vui lòng chờ 50 giây nữa để tiếp tục"*.
  - Không tạo ra phiên chấm công rác hay bị Check-out nhầm.

### 📌 TC-PUNCH-03: Nhân viên Check-out kết thúc ca sau > 60 giây
- **Tiền điều kiện**: Đã trôi qua hơn 60 giây kể từ lần Check-in.
- **Các bước thực hiện**:
  1. Nhân viên nhập lại mã PIN và bấm Chấm công.
- **Kết quả mong đợi**:
  - Hệ thống tự động nhận diện đây là hành động **RA CA (CHECK_OUT)**.
  - Phiên làm việc được đóng lại, tính toán chính xác tổng số phút làm việc thực tế.

### 📌 TC-PUNCH-04: Quản lý điều chỉnh công thủ công (Admin Punch Correction)
- **Tiền điều kiện**: Nhân viên quên bấm Check-out lúc về.
- **Các bước thực hiện**:
  1. Quản lý vào phân hệ **Chấm công** của Admin.
  2. Tìm phiên làm việc quên check-out của nhân viên, nhập giờ về bổ sung và lý do điều chỉnh.
  3. Bấm phê duyệt.
- **Kết quả mong đợi**:
  - Phiên làm việc cập nhật lại giờ về, gắn cờ `IS_CORRECTED` kèm tên Quản lý phê duyệt để phục vụ tính lương.

---

## PHÂN HỆ 13: BẢNG LƯƠNG & ĐỘNG CƠ TÍNH HOA HỒNG NHÂN VIÊN

### 📌 TC-PAY-01: Gán nhân viên tư vấn dòng món & Tính hoa hồng tự động
- **Tiền điều kiện**: Cấu hình quy tắc hoa hồng: Món "Combo Gà Đặc Biệt" được hoa hồng 5.000đ/phần cho nhân viên tư vấn.
- **Các bước thực hiện**:
  1. Thu ngân tạo đơn hàng bán 2 phần "Combo Gà Đặc Biệt", tại ô "Nhân viên tư vấn", chọn `NV010 (Lê Thu Ngân)`.
  2. Thanh toán đơn hàng thành công.
- **Kết quả mong đợi**:
  - Hệ thống Commission Engine tự động sinh bản ghi hoa hồng: $2 \times 5.000 = 10.000\text{đ}$ cho `NV010`.

### 📌 TC-PAY-02: Tạo bảng lương tháng & Tích hợp giờ công + Hoa hồng
- **Tiền điều kiện**: Kết thúc kỳ lương tháng.
- **Các bước thực hiện**:
  1. Vào **Bảng lương** $\rightarrow$ Bấm **"Tạo kỳ lương mới"** (Tháng 10/2026).
  2. Bấm **"Tổng hợp dữ liệu tự động"**.
- **Kết quả mong đợi**:
  - Hệ thống tự động quét toàn bộ giờ công từ phân hệ Chấm công và toàn bộ hoa hồng đã ghi nhận.
  - Bảng lương hiển thị chi tiết từng dòng: Lương ca kíp + Lương hoa hồng món - Các khoản giảm trừ = Thực lĩnh.

### 📌 TC-PAY-03: Chốt bảng lương & Chi lương qua Sổ quỹ
- **Các bước thực hiện**:
  1. Quản lý duyệt bảng lương tháng $\rightarrow$ Bấm **"Chốt kỳ lương & Chi trả"**.
  2. Chọn chi từ tài khoản Ngân hàng.
- **Kết quả mong đợi**:
  - Kỳ lương chuyển sang trạng thái `PAID`.
  - **Sổ quỹ tài chính tự động sinh Phiếu chi lương** trừ số dư tài khoản ngân hàng tương ứng.

---

## PHÂN HỆ 14: SỔ QUỸ TÀI CHÍNH & DÒNG TIỀN DOANH NGHIỆP

### 📌 TC-CASH-01: Kiểm tra Số dư Tài khoản Tiền mặt & Ngân hàng
- **Tiền điều kiện**: Đăng nhập `admin`. Vào **Sổ quỹ**.
- **Các bước thực hiện**:
  1. Quan sát thẻ tổng quan số dư đầu màn hình.
- **Kết quả mong đợi**:
  - Hiển thị trực quan: Số dư Két tiền mặt (Cash in Register) và Số dư Tài khoản Ngân hàng (Bank Account).
  - Khớp 100% với tổng các dòng tiền phát sinh thực tế.

### 📌 TC-CASH-02: Lập phiếu chi tiền ngoài luồng bán hàng (Chi tiền đá, rau, điện nước)
- **Tiền điều kiện**: Cửa hàng cần mua thêm 5 bao đá viên lẻ (100.000đ).
- **Các bước thực hiện**:
  1. Bấm **"Tạo phiếu chi"**.
  2. Chọn: Loại phiếu: *Chi phí vận hành*, Số tiền: `100.000đ`, Tài khoản: *Két tiền mặt*, Lý do: *"Mua đá viên ca sáng"*.
  3. Bấm **"Lập phiếu chi"**.
- **Kết quả mong đợi**:
  - Sinh mã phiếu chi `PC-XXXXX`.
  - Két tiền mặt tự động giảm 100.000đ ngay tức thì.

### 📌 TC-CASH-03: Đối soát dòng tiền liên thông tự động từ Bán hàng & Nhập kho
- **Các bước thực hiện**:
  1. Lọc sổ quỹ theo nguồn gốc: `ORDER_PAYMENT` (Thu tiền bán) và `PURCHASE_RECEIPT` (Chi tiền nhập hàng).
- **Kết quả mong đợi**:
  - Toàn bộ các đơn hàng đã thanh toán và phiếu nhập hàng đều xuất hiện tương ứng, không bị sót bất kỳ giao dịch nào.

---

## PHÂN HỆ 15: BÁO CÁO CUỐI NGÀY TOÀN DIỆN & XUẤT BẢN PDF/EXCEL

### 📌 TC-EOD-01: Truy cập Báo cáo Cuối ngày & 4 Adapters chuyên sâu
- **Tiền điều kiện**: Đăng nhập `admin`. Vào tab **Báo cáo** $\rightarrow$ Chọn **"Báo cáo Cuối ngày"**.
- **Các bước thực hiện**:
  1. Chọn ngày xem báo cáo (mặc định hôm nay).
  2. Bấm chuyển đổi giữa 4 nhóm quan tâm:
     - 📈 **Doanh thu bán hàng (SALES)**
     - 💰 **Dòng tiền & Sổ quỹ (CASHFLOW)**
     - 📦 **Giá vốn & Hàng hóa (GOODS)**
     - 🚫 **Lịch sử hủy món kiểm toán (CANCELLED_ITEMS)**
- **Kết quả mong đợi**:
  - Số liệu hiển thị tức thì, phân loại chi tiết doanh thu gộp, giảm giá, doanh thu thuần, tiền mặt vs chuyển khoản, giá vốn xuất bán, chi phí hủy món.

### 📌 TC-EOD-02: Kiểm tra tính Nhất quán Dữ liệu (Consistent Repeatable-Read Snapshot)
- **Tiền điều kiện**: Trong lúc Quản lý đang xem Báo cáo Tổng hợp cuối ngày, Thu ngân ở quầy vẫn phát sinh đơn hàng mới.
- **Các bước thực hiện**:
  1. Thu ngân tạo và thanh toán 1 đơn hàng mới.
  2. Quản lý lật qua các trang 1, 2, 3 của bảng chi tiết báo cáo.
- **Kết quả mong đợi**:
  - Số liệu trên báo cáo của Quản lý được khóa nhất quán trong snapshot giao dịch `RepeatableRead`, không bị nhảy lệch tổng tiền giữa các trang hay bị duplicate dòng dữ liệu.

### 📌 TC-EOD-03: In Báo cáo Cuối ngày ra PDF Khổ Ngang A4
- **Tiền điều kiện**: Đang ở màn hình Báo cáo Cuối ngày.
- **Các bước thực hiện**:
  1. Bấm nút **"In báo cáo" (Print Report)**.
  2. Cửa sổ Print Preview của trình duyệt xuất hiện.
- **Kết quả mong đợi**:
  - Định dạng chuẩn A4 Khổ ngang (Landscape).
  - Đầy đủ 10 cột dữ liệu nằm gọn gàng trên trang giấy, không bị tràn viền.
  - Tiêu đề cột bảng được **lặp lại đầy đủ ở đầu mỗi trang PDF** khi báo cáo dài nhiều trang.
  - Hiển thị logo thương hiệu Crispy Bite đen trắng trang trọng.

### 📌 TC-EOD-04: Xuất file Excel báo cáo chi tiết
- **Các bước thực hiện**:
  1. Bấm nút **"Xuất Excel (Export Workbook)"**.
- **Kết quả mong đợi**:
  - Trình duyệt tải về tệp `.xlsx`.
  - Mở tệp: Có đầy đủ các sheet tương ứng với số liệu thực tế trên hệ thống.

---

## 17. KỊCH BẢN KIỂM THỬ LIÊN THÔNG ĐA THIẾT BỊ REAL-TIME

> **Mục tiêu**: Đây là kịch bản biểu diễn thực tế (Live Demo) hoàn hảo nhất để báo cáo với Hội đồng chấm đồ án, chứng minh tính đồng bộ thời gian thực 100% giữa Khách hàng, Thu ngân và Nhà bếp.

### 🎬 Chuẩn bị 3 Cửa sổ Trình duyệt Song Song:
- **Cửa sổ A (Khách hàng)**: Mở tab ẩn danh hoặc mobile view: `http://localhost:8081/?table=1`
- **Cửa sổ B (Thu ngân POS)**: Mở tab thường, đăng nhập `cashier`: `http://localhost:8081`
- **Cửa sổ C (Đầu bếp KDS)**: Mở tab thường khác, đăng nhập `kitchen`: `http://localhost:8081`

```
+------------------------------------------------------------------------------------------------+
| CỬA SỔ A: KHÁCH BÀN 01          CỬA SỔ B: THU NGÂN POS            CỬA SỔ C: BẾP KDS           |
|                                                                                                |
| [1] Khách chọn 2 Combo Gà                                                                      |
| [2] Áp mã 'CRISPY10'                                                                           |
| [3] Bấm "Gửi gọi món" --------> [4] POS rung chuông thông báo                                  |
|                                 [5] Bàn 01 chuyển ĐỎ (OCCUPIED) -> [6] Bếp KDS nhận vé tức thì |
|                                                                                                |
|                                                                   [7] Bếp bấm "Bắt đầu nấu"    |
| [8] Live Tracker nhảy 🍳                                                                      |
|     "Đang chế biến" <-------------------------------------------------------------------------+ |
|                                                                                                |
|                                 [9] Khách ra quầy trả tiền                                     |
|                                 [10] Thu ngân bấm "Thanh toán"                                 |
|                                 (Bàn giữ PAID_AWAITING_SERVE)                                  |
|                                                                                                |
|                                                                   [11] Bếp bấm "Xong món"      |
| [12] Live Tracker nhảy 🔔 <---------------------------------------+                             |
|      "Món đã sẵn sàng"                                                                         |
|                                                                                                |
|                                 [13] Runner giao món COMPLETED                                 |
|                                 [14] Bàn tự động sang VÀNG                                     |
|                                      (NEED_CLEANING)                                           |
|                                 [15] Thu ngân bấm "Đã dọn"                                     |
|                                 [16] Bàn chuyển XANH (AVAILABLE)                               |
+------------------------------------------------------------------------------------------------+
```

### 📋 Các bước diễn tiến & Kết quả quan sát:
1. **Tại Cửa sổ A (Khách)**: Chọn 2 Combo Gà Giòn, chọn vị Cay, áp mã `CRISPY10`. Bấm **"Gửi gọi món"**.
   - *Quan sát Cửa sổ B*: Âm thanh thông báo vang lên, góc thông báo hiện đơn mới của Bàn 01. Sơ đồ bàn Bàn 01 đổi từ Xanh sang Đỏ (`OCCUPIED`).
   - *Quan sát Cửa sổ C*: Vé bếp Bàn 01 xuất hiện ngay lập tức kèm thời gian đếm giây.
2. **Tại Cửa sổ C (Bếp)**: Bếp trưởng bấm nút **"Bắt đầu nấu"**.
   - *Quan sát Cửa sổ A*: Màn hình Live Tracker của khách tự động đổi sang icon chảo lửa đang nấu mà khách không cần bấm tải lại trang.
3. **Tại Cửa sổ B (Thu ngân)**: Khách đến quầy thanh toán tiền trước bằng chuyển khoản. Thu ngân bấm xác nhận thanh toán.
   - *Quan sát*: Đơn chuyển `PAID`. Nhưng Bàn 01 **vẫn duy trì trạng thái phục vụ**, Cửa sổ A vẫn xem được Live Tracker bình thường.
4. **Tại Cửa sổ C (Bếp)**: Bếp hoàn tất, bấm **"Sẵn sàng"** $\rightarrow$ Nhân viên bưng món chuyển **"Hoàn tất (COMPLETED)"**.
   - *Quan sát*: Bàn 01 trên POS tự động chuyển sang màu Vàng **"Chờ dọn dẹp" (`NEED_CLEANING`)**.
5. **Tại Cửa sổ B (Thu ngân)**: Nhân viên bấm **"Đã dọn dẹp xong"**.
   - *Quan sát*: Bàn 01 chuyển về màu Xanh (`AVAILABLE`), hoàn thành chu trình phục vụ chuẩn mực 100%.

---

## 🏁 BẢNG KÝ TÊN & BIÊN BẢN NGHIỆM THU

| Vai trò | Họ và tên | Chữ ký | Đánh giá kết quả |
| :--- | :--- | :---: | :---: |
| **Người thực hiện kiểm thử** | Phan Văn Khánh | ____________ | Đạt yêu cầu 100% |
| **Trưởng nhóm phát triển** | Lương Viết Tiến | ____________ | Đạt yêu cầu 100% |
| **Giảng viên hướng dẫn** | ____________________ | ____________ | ________________ |
