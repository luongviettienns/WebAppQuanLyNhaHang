# 📋 DANH SÁCH TÀI KHOẢN MẪU ĐĂNG NHẬP (CRISPY BITE QSR)

> **Hệ Thống Đặt Món & Quản Lý Nhà Hàng Fast Food "CRISPY BITE"**  
> Địa chỉ Web App: [http://localhost:4000](http://localhost:4000) (hoặc [http://localhost:8081](http://localhost:8081))  
> Swagger API: [http://localhost:4000/api-docs](http://localhost:4000/api-docs)

---

## 🔑 1. Tài Khoản Chính Theo Vai Trò (Core Accounts)

Ba tài khoản cốt lõi đại diện cho 3 phân hệ vận hành chính của nhà hàng:

| STT | Vai trò (Role) | Tên đăng nhập (`username`) | Mật khẩu (`password`) | Quyền hạn & Phân hệ truy cập |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Quản trị viên (ADMIN)** | `admin` | `admin123` | **Toàn quyền hệ thống**: Quản lý Thực đơn, Báo cáo Doanh thu & 8 phân hệ báo cáo, Sổ quỹ, Kho & BOM, Quản trị nhân sự, Cài đặt hệ thống, Phê duyệt hủy đơn (Void). |
| **2** | **Thu ngân quầy (CASHIER)** | `cashier` | `cashier123` | **Phân hệ POS & Sơ đồ bàn**: Tạo đơn mang về / tại bàn, chọn món & tùy biến combo, gán nhân viên hưởng hoa hồng, thanh toán tiền mặt / QR chuyển khoản, in hóa đơn tạm tính & biên lai. |
| **3** | **Bếp trưởng (KITCHEN)** | `kitchen` | `kitchen123` | **Phân hệ KDS (Giao diện tối chuyên dụng)**: Tiếp nhận vé chế biến thời gian thực qua WebSocket, cập nhật trạng thái đơn (*Chờ chế biến* $\rightarrow$ *Đang nấu* $\rightarrow$ *Sẵn sàng trả khách*), báo hết món (86'd), theo dõi thời gian SOS. |

---

## 👥 2. Danh Sách Tài Khoản Nhân Viên Chi Tiết (Full Staff Accounts)

Tất cả các tài khoản nhân viên theo ca dưới đây đều có mật khẩu mặc định là: **`role123`**

### 🏢 Quản lý & Giám sát ca (Role: `ADMIN`)
| Tên hiển thị | Tên đăng nhập | Mật khẩu | Vị trí công việc |
| :--- | :--- | :--- | :--- |
| Nguyễn Văn Quản Lý | `manager_01` | `role123` | Quản lý nhà hàng |
| Trần Thị Giám Sát | `manager_02` | `role123` | Giám sát ca vận hành |

---

### 💳 Nhân viên Thu ngân / Phục vụ quầy (Role: `CASHIER`)
| Tên hiển thị | Tên đăng nhập | Mật khẩu | Ca làm việc / Ghi chú |
| :--- | :--- | :--- | :--- |
| Lê Thu Ngân | `cashier_01` | `role123` | Thu ngân ca sáng (06:00 - 14:00) |
| Phạm Thu Ngân | `cashier_02` | `role123` | Thu ngân ca chiều (14:00 - 22:00) |
| Hoàng Thu Ngân | `cashier_03` | `role123` | Thu ngân ca tối (22:00 - 06:00) |
| Đặng Thị Mai | `cashier_04` | `role123` | Nhân viên order & thu ngân quầy 1 |
| Vũ Văn Tuấn | `cashier_05` | `role123` | Nhân viên order & thu ngân quầy 2 |
| Nông Thị Hoa | `cashier_06` | `role123` | Thu ngân quầy takeaway |
| Bùi Văn Hùng | `cashier_07` | `role123` | Nhân viên phục vụ & thu ngân |
| Đỗ Thị Linh | `cashier_08` | `role123` | Thu ngân xoay ca |
| Hồ Văn Nam | `cashier_09` | `role123` | Thu ngân thực tập |
| Ngô Thị Kim | `cashier_10` | `role123` | Thu ngân bán thời gian |

---

### 👨‍🍳 Đội ngũ Bếp & Sơ chế (Role: `KITCHEN`)
| Tên hiển thị | Tên đăng nhập | Mật khẩu | Vị trí bếp |
| :--- | :--- | :--- | :--- |
| Nguyễn Bếp Chính | `kitchen_01` | `role123` | Bếp chính chiên gà & burger |
| Trần Phụ Bếp 1 | `kitchen_02` | `role123` | Phụ bếp chiên khoai & đồ ăn kèm |
| Lê Phụ Bếp 2 | `kitchen_03` | `role123` | Phụ trách đóng gói & kiểm soát chất lượng |
| Phạm Sơ Chế | `kitchen_04` | `role123` | Sơ chế nguyên vật liệu & tẩm ướp |
| Hoàng Đóng Gói | `kitchen_05` | `role123` | Đóng gói combo & ra đồ KDS |

---

## 💡 3. Hướng Dẫn Đăng Nhập & Kiểm Tra

1. Mở trình duyệt và truy cập [http://localhost:4000](http://localhost:4000).
2. Nhập **Tên đăng nhập** và **Mật khẩu** tương ứng từ bảng trên.
3. Bấm nút **Đăng nhập**.
4. Khi chuyển ca hoặc đổi tài khoản:
   - Bấm nút **Đăng xuất** ở góc trên thanh điều hướng.
   - Nhập thông tin tài khoản mới để tiếp tục.

> ⚠️ **Lưu ý bảo mật & Môi trường**:
> - Dữ liệu mẫu trên được nạp tự động qua lệnh: `npm run db:reset` hoặc `npm run prisma:seed`.
> - Các biến môi trường quy định mật khẩu seed được lưu trong tệp `.env` (`SEED_ADMIN_PASSWORD`, `SEED_CASHIER_PASSWORD`, `SEED_KITCHEN_PASSWORD`).
