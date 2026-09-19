# 📦 ĐẶC TẢ CHI TIẾT: QUẢN LÝ KHO, ĐỊNH LƯỢNG (BOM), GIÁ VỐN (COGS) & EXCEL WORKFLOW
## HỆ THỐNG QUẢN LÝ NHÀ HÀNG FAST CASUAL "CRISPY BITE"

> **Trạng thái**: 🔒 ĐÃ ĐÓNG BĂNG NGHIỆP VỤ (FROZEN SPECIFICATION)  
> **Ngày phê duyệt**: 17/09/2026  
> **Căn cứ**: Phản hồi & Quyết định cuối cùng của Chủ nhà hàng / Product Owner  

---

## 🎯 1. QUYẾT ĐỊNH NGHIỆP VỤ CUỐI CÙNG (FROZEN DECISIONS)

| Vấn đề | Quyết định cuối cùng | Chi tiết triển khai & Thuật toán |
| :--- | :--- | :--- |
| **Q1. Phương pháp tính giá vốn** | **Bình quân gia quyền (Weighted Average)** | Tự động tính lại đơn giá vốn trung bình sau mỗi lần nhập kho. |
| **Q2. Thời điểm trừ kho** | **Trừ khi đơn chuyển `PAID`** | Thực hiện trừ kho và ghi sổ trong Prisma Atomic Transaction khi khách thanh toán thành công. |
| **Q3. Chính sách Tồn kho âm** | **Cho phép bán âm + Cảnh báo đỏ + Thuật toán bù trừ đặc biệt** | Không chặn khách đặt món. Khi nhập hàng vào kho đang có số tồn âm, **tuyệt đối không đưa số âm vào công thức bình quân gia quyền**. Chỉ tính giá vốn bình quân trên phần số lượng dương thực tế sau khi đã bù trừ hết phần âm. |
| **Q4. Độ chi tiết của BOM** | **Tập trung nguyên liệu trọng yếu** | Tiêu chuẩn đưa vào BOM: Nguyên liệu chiếm $\ge 2\%$ giá vốn món ăn HOẶC có đơn giá $\ge 20.000$đ/đơn vị tính. Gia vị/vật tư li ti gộp vào "chi phí phụ trợ" theo tỷ lệ % doanh thu. |
| **Q5. Phạm vi triển khai** | **Chiến lược Cuốn chiếu (Phased Rollout)** | **Phase 1**: Chỉ làm BOM cho Món chính (`MenuItem`).<br>**Phase 2**: Mở rộng BOM cho Tùy chọn (`ModifierOption`). |

---

## 📐 2. CÔNG THỨC TOÁN HỌC & THUẬT TOÁN TÍNH TOÁN

### 2.1. Thuật toán Xử lý Tồn kho âm khi Nhập hàng (Negative Stock Recovery Algorithm)
Giả sử tại thời điểm nhập hàng:
- Tồn hiện tại: $S_{cur}$
- Đơn giá vốn hiện tại: $C_{cur}$
- Số lượng nhập mới: $Q_{in} > 0$
- Đơn giá nhập mới: $C_{in} > 0$

#### Trường hợp 1: Tồn kho đang dương hoặc bằng 0 ($S_{cur} \ge 0$)
Áp dụng công thức Bình quân gia quyền tiêu chuẩn:
$$S_{new} = S_{cur} + Q_{in}$$
$$C_{new} = \frac{(S_{cur} \times C_{cur}) + (Q_{in} \times C_{in})}{S_{new}}$$

#### Trường hợp 2: Tồn kho đang âm ($S_{cur} < 0$)
1. Số lượng bù trừ phần âm: $Q_{offset} = \min(|S_{cur}|, Q_{in})$
2. Tồn kho sau nhập: $S_{new} = S_{cur} + Q_{in}$
3. Cập nhật đơn giá vốn:
   - **Nếu $S_{new} \le 0$** (Hàng nhập về chưa đủ hoặc vừa đủ bù âm):
     $$C_{new} = C_{in}$$
     *(Giải thích: Toàn bộ số hàng mới dùng để bù cho các đơn đã bán trước đó theo giá nhập mới nhất $C_{in}$, kho vẫn chưa có thặng dư dương).*
   - **Nếu $S_{new} > 0$** (Hàng nhập về lớn hơn lượng âm, có dư dương):
     $$C_{new} = C_{in}$$
     *(Giải thích: Lượng âm đã tiêu thụ hết phần bù trừ. Phần dư thực tế $S_{new}$ hoàn toàn thuộc về lô hàng mới nhập với giá $C_{in}$. Tuyệt đối không nhân số âm làm méo mó giá vốn).*

---

### 2.2. Công thức Doanh thu, COGS & Lợi nhuận gộp (Profitability Engine)

1. **Doanh thu thuần (Net Revenue)**:
   $$\text{Doanh thu thuần} = \sum \text{finalAmount của các đơn PAID}$$
2. **Giá vốn hàng bán (COGS)**:
   $$\text{COGS}_{\text{đơn}} = \sum_{i \in \text{Items}} \left( \text{quantity}_i \times \sum_{j \in \text{BOM}_i} (\text{quantityRequired}_j \times \text{costPerUnit}_j) \right)$$
   $$\text{Tổng COGS} = \sum \text{COGS}_{\text{đơn}} + \sum \text{Hao hụt bếp (Kitchen Waste)}$$
3. **Lợi nhuận gộp (Gross Profit)**:
   $$\text{Lợi nhuận gộp} = \text{Doanh thu thuần} - \text{Tổng COGS}$$
4. **Biên lợi nhuận gộp (Gross Margin %)**:
   $$\text{Gross Margin} = \left(\frac{\text{Lợi nhuận gộp}}{\text{Doanh thu thuần}}\right) \times 100\%$$

---

## 📊 3. ĐẶC TẢ PHÂN HỆ EXCEL IMPORT / EXPORT KHO

### 3.1. File Mẫu Import (`crispy_bite_stock_in_template.xlsx`)
Cấu trúc cột cố định:

| Cột (Column) | Tên hiển thị | Kiểu dữ liệu | Bắt buộc | Ràng buộc nghiệp vụ |
| :---: | :--- | :---: | :---: | :--- |
| **A** | `Mã nguyên liệu` | Chuỗi (Code/SKU) | Có | Mã duy nhất (VD: `ING-GA-01`, `ING-KHOAI-01`). |
| **B** | `Tên nguyên liệu` | Chuỗi | Không | Dùng để người dùng đối chiếu mắt thường. |
| **C** | `Đơn vị tính` | Chuỗi | Có | Phải khớp với đơn vị đã cấu hình (g, ml, cái, lon...). |
| **D** | `Số lượng nhập` | Số (> 0) | Có | Hỗ trợ số thập phân (VD: `2.5`, `5000`). |
| **E** | `Đơn giá nhập (VND)` | Số nguyên (> 0) | Có | Đơn giá cho 1 đơn vị tính (VND). |
| **F** | `Ghi chú` | Chuỗi | Không | Tên NCC, số hóa đơn đỏ, hạn sử dụng... |

### 3.2. Luồng Xử Lý Nhập Hàng Từ Excel (Upload $\rightarrow$ Validate $\rightarrow$ Preview $\rightarrow$ Commit)

```
[1. Upload File] ──> Quản lý chọn file .xlsx trên màn hình Kho
        │
[2. Parse & Validate] ──> Backend đọc buffer bằng 'xlsx' / 'exceljs'
        │                 Kiểm tra từng dòng:
        │                 - Mã nguyên liệu có tồn tại trong CSDL không?
        │                 - Đơn vị tính có khớp không?
        │                 - Số lượng và đơn giá có hợp lệ (>0) không?
        │
[3. Phân Loại Dòng]
        ├─ Dòng HỢP LỆ   ──> Tính thử giá vốn mới & tồn kho mới
        └─ Dòng LỖI      ──> Báo rõ lỗi (VD: "Dòng 4: Mã ING-999 không tồn tại")
        │
[4. Màn Hình Preview] ──> Hiển thị Modal đối soát trực quan:
        │                 - Danh sách dòng sẵn sàng nhập (Badge Xanh)
        │                 - Danh sách dòng cảnh báo/lỗi (Badge Đỏ)
        │                 - Quản lý xác nhận [TIẾN HÀNH NHẬP KHO]
        │
[5. Commit Atomic Tx] ──> Ghi dữ liệu vào CSDL:
                          - Cập nhật tồn kho & giá vốn từng nguyên liệu hợp lệ
                          - Tạo Batch InventoryTransaction (type = STOCK_IN)
                          - Ghi log: "Nhập qua Excel - [tên_file] - [timestamp]"
```

### 3.3. Xử lý Lỗi Dòng Riêng Biệt (Non-blocking Partial Import)
- Không hủy toàn bộ file nếu chỉ có 1-2 dòng sai sót.
- Hệ thống cho phép:
  1. Bỏ qua dòng lỗi và nhập các dòng hợp lệ trước.
  2. Xuất file báo cáo các dòng lỗi kèm nguyên nhân để quản lý sửa lại và import lần 2.

### 3.4. Xuất Báo Cáo Tồn Kho Ra Excel (Export Inventory)
- Nút **[Xuất Excel Tồn Kho]** trên màn hình quản trị.
- File xuất ra chứa:
  - Mã NVL, Tên NVL, Đơn vị tính, Tồn kho hiện tại, Giá vốn hiện tại, Thành tiền (Tồn $\times$ Giá vốn), Cột trống "Kiểm kê thực tế" để in ra cho nhân viên đếm kho.

---

## 🗄️ 4. THIẾT KẾ CƠ SỞ DỮ LIỆU PRISMA (PHASE 1)

```prisma
// backend/prisma/schema.prisma (Bổ sung cho Kho & BOM)

model Ingredient {
  id           Int      @id @default(autoincrement())
  sku          String   @unique // Ma nguyen lieu (VD: ING-CHICKEN-01)
  name         String   // Ten nguyen lieu
  unit         String   // Don vi: gram, ml, piece, can...
  currentStock Float    @default(0) // Ton kho thuc te
  minThreshold Float    @default(0) // Nguong canh bao do
  costPerUnit  Int      @default(0) // Gia von trung binh (VND/don vi)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  menuItemIngredients   MenuItemIngredient[]
  inventoryTransactions InventoryTransaction[]

  @@index([sku])
  @@index([isActive])
}

model MenuItemIngredient {
  id               Int      @id @default(autoincrement())
  menuItemId       Int
  ingredientId     Int
  quantityRequired Float    // Dinh luong tieu hao cho 1 phan mon an

  menuItem   MenuItem   @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  ingredient Ingredient @relation(fields: [ingredientId], references: [id], onDelete: Restrict)

  @@unique([menuItemId, ingredientId])
  @@index([menuItemId])
  @@index([ingredientId])
}

enum InventoryTransactionType {
  STOCK_IN       // Nhap kho (Thu cong hoac Excel)
  AUTO_DEDUCT    // Tu dong tru khi don PAID
  KITCHEN_WASTE  // Hao hut che bien tai bep
  MANUAL_ADJUST  // Dieu chinh kiem ke
  VOID_RESTORE   // Hoan tra khi huy don
}

model InventoryTransaction {
  id           Int                      @id @default(autoincrement())
  ingredientId Int
  type         InventoryTransactionType
  quantity     Float                    // + khi nhap, - khi xuat
  costAmount   Int                      @default(0) // Gia tri VND giao dich
  orderId      Int?                     // Don hang lien quan (neu auto deduct)
  note         String?                  // Ghi chu: "Nhap qua Excel...", "Chay kds..."
  createdByUserId Int?
  createdAt    DateTime                 @default(now())

  ingredient   Ingredient               @relation(fields: [ingredientId], references: [id], onDelete: Restrict)
  order        Order?                   @relation(fields: [orderId], references: [id], onDelete: SetNull)

  @@index([ingredientId])
  @@index([type])
  @@index([createdAt])
}
```

---

## 🚀 5. BẢN KẾ HOẠCH TRIỂN KHAI CHI TIẾT (PHASE 1)

### Bước 1: Migration CSDL & Seed Dữ Liệu Ban Đầu
- Cập nhật `backend/prisma/schema.prisma`.
- Chạy `npx prisma migrate dev --name add_inventory_and_bom`.
- Thêm nguyên liệu mẫu vào `prisma/seed.ts` (Thịt gà fillet, Cánh gà, Khoai tây đông lạnh, Dầu chiên thực vật, Phô mai lát, Vỏ burger, Lon Coca-Cola).
- Thêm định lượng mẫu (BOM) cho 3-5 món bán chạy nhất.

### Bước 2: Backend Core - Module `inventory`
- **TDD Viết Test trước**:
  - Test thuật toán tính bình quân gia quyền khi tồn dương.
  - Test thuật toán bù trừ khi tồn âm (không méo mó số liệu).
  - Test logic trừ kho tự động khi Order `PAID`.
  - Test parse và validate file Excel.
- **Triển khai Code Service & Controller**:
  - `GET /api/inventory/ingredients`: Lấy danh sách NVL kèm trạng thái tồn (Bình thường / Sắp hết / Tồn âm).
  - `POST /api/inventory/ingredients`: Tạo mới NVL.
  - `PATCH /api/inventory/ingredients/:id`: Sửa thông tin / ngưỡng cảnh báo.
  - `POST /api/inventory/stock-in`: Nhập kho thủ công 1 nguyên liệu.
  - `POST /api/inventory/excel/preview`: Upload file Excel $\rightarrow$ Trả về bảng preview và phân loại dòng lỗi/hợp lệ.
  - `POST /api/inventory/excel/commit`: Xác nhận nhập kho hàng loạt từ kết quả preview.
  - `GET /api/inventory/excel/export`: Tải file Excel tồn kho hiện tại.
  - `GET & PUT /api/inventory/recipes/:menuItemId`: Xem và cập nhật công thức BOM của món.

### Bước 3: Tích Hợp Tự Động Trừ Kho (Order Payment Integration)
- Cập nhật Service thanh toán `orders.service.ts`:
  - Trong interactive transaction: Đổi trạng thái `PAID` $\rightarrow$ Duyệt BOM $\rightarrow$ Trừ kho $\rightarrow$ Tạo `InventoryTransaction` (`AUTO_DEDUCT`).

### Bước 4: Frontend Quản Trị Kho (Admin UI)
- Tạo Tab/Màn hình **Quản lý Kho (Inventory Management)**:
  - **Bảng Danh mục NVL**: Tìm kiếm, lọc theo tình trạng tồn (Đủ hàng, Sắp hết ⚠️, Bán âm 🔴).
  - **Modal Cài đặt Định lượng (BOM Recipe)**: Chọn món $\rightarrow$ Chọn NVL và nhập số lượng tiêu hao.
  - **Khu vực Nhập Hàng**:
    - Nhập nhanh 1 món.
    - Nút "Tải file mẫu Excel" & "Upload file Excel nhập hàng" $\rightarrow$ Modal Preview thông minh kiểm tra lỗi trước khi lưu.
    - Nút "Xuất Excel Tồn kho".

---

*Tài liệu này đã chính thức chốt mọi quy chuẩn kỹ thuật và nghiệp vụ. Sẵn sàng bắt đầu triển khai code theo quy trình TDD chuẩn mực!*
