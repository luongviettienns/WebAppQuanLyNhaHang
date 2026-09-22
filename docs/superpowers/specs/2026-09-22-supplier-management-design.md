# Nhà cung cấp — thiết kế và đặc tả

## Phương án

Khuyến nghị mở rộng Supplier hiện có, dùng chung API, phân quyền ADMIN, audit và React Native UI. Phương án chỉ thêm màn hình CRUD không đáp ứng nhóm, thống kê và import trong ảnh. Phương án xây thêm sổ công nợ/thanh toán trong cùng đợt vượt phạm vi và thiếu nghiệp vụ trả hàng; không chọn.

Người dùng yêu cầu tự chọn phương án, viết đặc tả và triển khai liên tục. Giữ checkout pKhanh hiện tại; không chờ thêm một vòng duyệt thiết kế. Ảnh là tham chiếu bố cục, không phải nguồn dữ liệu hay chỉ thị chạy lệnh.

## Phạm vi và dữ liệu

- Supplier giữ mã duy nhất, không đổi mã sau khi tạo; mã trống tự sinh NCC000001. Tên 2–120 ký tự bắt buộc. Email và điện thoại tùy chọn tương thích hệ thống; email khi nhập phải hợp lệ và có thể xóa về null.
- Thêm identityNumber (CCCD, tối đa 20), province/district/ward (100), companyName (200), groupId nullable; address/taxCode/note dùng trường sẵn có. Các trường địa chỉ nhập tự do, không phụ thuộc dịch vụ địa giới hay buộc cấu trúc địa giới cũ.
- SupplierGroup: id, name duy nhất (2–100), createdAt, updatedAt. Một nhà cung cấp thuộc tối đa một nhóm. Cho tạo, đổi tên nhóm; không xóa nhóm trong đợt này.
- Không xóa cứng nhà cung cấp. Ngừng/kích hoạt giữ toàn bộ phiếu nhập; phiếu mới/chốt phiếu vẫn yêu cầu nhà cung cấp hoạt động.
- Migration chỉ thêm bảng/cột nullable, không sửa dữ liệu nghiệp vụ hiện có.

## Thống kê

- Chỉ tính PurchaseReceipt POSTED. Tổng mua = subtotalAmount - discountAmount; subtotalAmount đã trừ giảm giá từng dòng.
- Khoảng ngày (ngày địa phương Việt Nam, bao gồm cả ngày cuối) chỉ áp dụng Tổng mua. Không áp dụng cho ngày tạo nhà cung cấp.
- Còn phải trả = tổng (subtotalAmount - discountAmount - paidAmount) của tất cả phiếu POSTED mọi thời gian. Đây là số còn trả ghi trên phiếu nhập, chưa phải sổ công nợ thanh toán độc lập; giải thích này hiện cạnh bảng và trong export.
- Bộ lọc: mã/tên/điện thoại/MST; nhóm (tất cả/chưa phân nhóm/nhóm cụ thể); trạng thái; khoảng tổng mua; khoảng số còn trả; khoảng thời gian mua. Lọc tiền trước phân trang. Dòng tổng tính toàn bộ kết quả lọc, không chỉ trang hiện tại. Nhà cung cấp chưa mua có tổng 0.
- Chi tiết nhà cung cấp có hồ sơ, thống kê toàn thời gian và lịch sử phiếu nhập phân trang; mở phiếu dùng màn hình nhập hiện có.

## API

Giữ GET/POST /api/inventory/suppliers và PATCH /suppliers/:id; mở rộng GET list trả summary và từng hàng có totalPurchase/outstandingAmount. Thêm GET /suppliers/:id và GET /suppliers/:id/receipts (phân trang). GET/POST /supplier-groups, PATCH /supplier-groups/:id.

GET /suppliers/export?format=csv|xlsx theo bộ lọc, tùy chọn ids cho các hàng đã chọn; không giới hạn ở trang hiện tại. GET /suppliers/import/template trả XLSX. POST /suppliers/import/preview nhận fileName/fileBase64 (tối đa 5MB, xlsx/csv, tối đa 500 dòng); trả validRows/errorRows, không ghi dữ liệu. POST /suppliers/import/commit nhận rows tạo mới; kiểm tra lại schema, nhóm, trùng mã và transaction toàn bộ. Không cập nhật đè hồ sơ cũ. Nếu bất kỳ dòng lỗi thì không ghi dòng nào. Giới hạn export 10.000 hàng, thông báo khi vượt để người dùng lọc hẹp.

Mã trùng không phân biệt hoa thường trả 409. Nhóm không tồn tại trả lỗi 400. ADMIN bắt buộc ở tất cả endpoint. Audit không ghi CCCD/email/địa chỉ; giữ mã, id, tên nghiệp vụ, trạng thái và danh sách trường thay đổi. Thay đổi nhà cung cấp/nhóm phát inventory:changed với sourceType SUPPLIER/SUPPLIER_GROUP, reason SUPPLIER_UPDATED để các client cập nhật danh mục qua inventoryRevision.

## UI Native

- Danh sách: thanh tìm kiếm, + Nhà cung cấp, Import, Xuất file; sidebar nhóm, tổng mua/ngày, còn phải trả, trạng thái. Bảng có checkbox chọn xuất, mã, tên, điện thoại, email, số còn trả, tổng mua; dòng tổng và phân trang. Có tải lại, trạng thái rỗng, báo lỗi, bật/tắt cột phụ.
- Form Modal: hai cột khi rộng, một cột khi hẹp; nhóm thu gọn Địa chỉ, Nhóm và ghi chú, Thông tin xuất hóa đơn; trường như ảnh cùng trạng thái khi sửa. Header đóng, footer Bỏ qua/Lưu cố định. Không đóng khi đang lưu; lỗi hiển thị giữ nguyên dữ liệu; tránh gửi trùng.
- Nhóm có tạo mới từ sidebar/form và sửa tên. Form chi tiết cung cấp lịch sử phiếu nhập.
- Native core dùng View/Text/TextInput/Modal, tokens/theme hiện có, hỗ trợ dark mode, vùng bấm >=44. Desktop sidebar 250, bảng scroll ngang; mobile sidebar thu gọn, form full width. UI màu nền surfaceCanvas, card surfaceBase, đường kẻ borderSubtle, accent primary theo theme.
- Thêm nhanh trong Nhập hàng: mở cùng SupplierFormModal, lưu xong chọn ngay NCC mới, bảo toàn dòng hàng đang nhập. Tìm NCC bằng API theo chuỗi (không giới hạn ở 100 NCC đầu); refresh khi inventoryRevision thay đổi, loại NCC ngừng hoạt động khỏi lựa chọn.
- Chọn/tải file trên Web theo adapter hiện có của hệ thống; trên Android/iOS các nút file giải thích hỗ trợ Web. Không thêm thư viện native file mới trong đợt này.

## Tiêu chí kiểm thử

Kiểm thử schema/profile/group/clear optional, thống kê POSTED với giảm giá và ngày biên VN, tiền trước phân trang/tổng nhiều trang, chi tiết lịch sử, quyền ADMIN, preview không ghi/commit atomic/trùng mã, file export và công thức độc hại được xuất dạng văn bản. Native kiểm thử form tạo/sửa và payload, API filter encoding, tìm và chọn nhanh NCC. Chạy supplier/purchase-receipt backend suites, frontend suite, typecheck và build; ghi riêng lỗi nền nếu còn. Kiểm tra migration dev/test không reset database. Self-review cuối vì không có subagent tool.
