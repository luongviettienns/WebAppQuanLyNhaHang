# Crispy Bite UI/UX Redesign

## Mục tiêu

Thiết kế lại toàn bộ giao diện Crispy Bite theo ngôn ngữ QSR hiện đại, gọn và thực dụng. Giao diện mới phải giảm dấu hiệu của UI sinh tự động, tăng tốc độ đọc và thao tác trong ca vận hành, đồng thời giữ nguyên nghiệp vụ, API và các điểm móc kiểm thử hiện có.

## Phạm vi

- Hệ thống theme, typography, spacing, radius, elevation và icon.
- Login và app shell theo vai trò.
- POS, modal tùy chọn món và hóa đơn.
- KDS bếp.
- Sơ đồ bàn và luồng chi tiết/hủy/thanh toán/dọn bàn.
- Màn khách QR tại bàn.
- Quản trị menu và báo cáo.
- Light/dark mode theo vai trò và responsive web/mobile/tablet.

Không thay đổi REST API, Socket.io contract, trạng thái đơn hàng, quyền người dùng hoặc cấu trúc database.

## Định hướng thị giác

### Bảng màu

- Brick `#B42318`: nhận diện và hành động chính.
- Charcoal `#24211F`: chữ chính, navigation và nền vận hành.
- Paper `#FFFFFF`: bề mặt thao tác.
- Canvas `#F4F3F0`: nền phân khu trung tính.
- Operational green `#15803D`: sẵn sàng, hoàn tất và bàn trống.
- Service amber `#C66A15`: cảnh báo và gần quá hạn.

Màu trạng thái có phiên bản nền nhạt, viền và chữ riêng. Không dùng màu thương hiệu để thay thế ngữ nghĩa trạng thái.

### Typography

- Barlow Condensed cho wordmark, mã đơn, số bàn và tiêu đề vận hành ngắn.
- Inter cho nội dung, form, menu, bảng và nút.
- Sentence case cho nhãn và hành động; không viết hoa hàng loạt.
- Giá tiền, thời gian và KPI dùng tabular numerals.
- Cỡ chữ theo thang 12, 14, 16, 20, 24, 32; hạn chế giá trị tùy ý.

### Hình khối và icon

- Bỏ emoji khỏi logo, navigation, trạng thái và nút.
- Dùng Lucide với stroke và kích thước nhất quán.
- Radius theo cấp: 4px cho trạng thái/field nhỏ, 6px cho button/input, 8px cho panel/modal. Pill chỉ dành cho filter hoặc trạng thái.
- Không dùng gradient. Shadow chỉ dành cho modal/floating cart; phân khu thường dùng nền và đường viền.
- Card chỉ biểu đạt một nhóm dữ liệu hoặc một đối tượng nghiệp vụ, không bọc mọi nội dung.

## Kiến trúc UI

Tạo lớp `frontend/src/ui` gồm các primitive không chứa nghiệp vụ:

- `BrandMark`: wordmark Crispy Bite không dùng emoji.
- `AppIcon`: wrapper Lucide chuẩn kích thước/màu.
- `Button`: primary, secondary, quiet, danger và trạng thái loading/disabled.
- `Field`: label, input, helper và error.
- `Surface`: panel có cấp độ rõ ràng.
- `StatusBadge`: ánh xạ trạng thái nghiệp vụ sang màu/nhãn.
- `ScreenHeader`: tiêu đề, mô tả ngắn và action.
- `EmptyState`, `InlineAlert`, `Metric`, `Divider`.
- `RoleShell`: header, navigation theo vai trò và vùng nội dung responsive.

Các primitive nhận token từ theme. Màn nghiệp vụ vẫn sở hữu dữ liệu, state, callback và `testID`; việc tách component không thay đổi luồng dữ liệu.

## Bố cục theo vai trò

### Login

Desktop chia hai vùng: dải thương hiệu/ca vận hành bên trái và form đăng nhập rộng vừa đủ bên phải. Mobile xếp dọc và bỏ phần trang trí không thiết yếu. Demo account hiển thị như danh sách chuyển vai trò gọn, không dùng ba nút màu khác nhau. Lỗi nằm sát vùng form liên quan.

### POS

Tablet/desktop dùng bố cục hai vùng: catalog chiếm phần chính, giỏ hàng cố định bên phải. Category là thanh filter ngang có trạng thái chọn rõ. Menu item ưu tiên tên, giá, trạng thái còn/hết; ảnh là hỗ trợ, không quyết định chiều cao toàn bộ. Mobile chuyển giỏ thành bottom sheet/floating summary.

### KDS

Mặc định dark mode. Header hiển thị tình trạng kết nối và tổng số ticket. Ticket chia ba lane Pending, Preparing, Ready trên desktop; tablet có thể cuộn ngang; mobile dùng filter trạng thái. Tuổi đơn được thể hiện bằng cạnh màu và timer, không tô toàn bộ card. CTA trạng thái nằm cố định ở cuối ticket.

### Sơ đồ bàn

Tạo toolbar lọc theo khu vực/trạng thái và lưới bàn có mật độ ổn định. Số bàn là điểm nhìn chính; trạng thái, tổng tiền và tuổi đơn là thông tin phụ. Modal chi tiết dùng các section theo nghiệp vụ thay vì nhiều card lồng nhau.

### Khách QR

Mobile-first, header gọn với số bàn và trạng thái đơn. Menu có vùng tìm/lọc dễ chạm. Giỏ hàng cố định dưới màn hình nhưng không che nội dung. Theo dõi đơn dùng timeline tuyến tính. Ngôn ngữ hướng đến khách hàng, không dùng thuật ngữ nội bộ như KDS/POS.

### Admin và báo cáo

Desktop dùng sub-navigation rõ ràng giữa Thực đơn và Báo cáo. Quản lý menu chuyển sang list/table responsive với thao tác bật/tắt và chỉnh sửa tại cùng ngữ cảnh. KPI dùng nhịp điệu số liệu có phân cấp, không phải bốn card giống nhau. Biểu đồ và top món dùng chung chuẩn màu/trục/nhãn.

## Theme theo vai trò

- Login, POS, Admin và QR mặc định light.
- KDS mặc định dark ở lần vào vai trò đầu tiên.
- Người dùng có thể đổi thủ công; lựa chọn được lưu riêng theo vai trò để KDS không ép các vai trò khác sang dark.
- Theme tối dùng nền charcoal trung tính, bề mặt nâng nhẹ và trạng thái đủ tương phản; không dùng slate xanh mặc định.

## Responsive và khả năng tiếp cận

- Breakpoint mục tiêu: mobile dưới 768px, tablet 768–1199px, desktop từ 1200px.
- Touch target tối thiểu 44px; thao tác POS/KDS chính tối thiểu 52px.
- Focus ring rõ trên web, hỗ trợ bàn phím cho navigation, form và modal.
- Tương phản chữ đạt WCAG AA; không truyền tải trạng thái chỉ bằng màu.
- Tôn trọng reduced motion. Motion chỉ dùng cho modal, trạng thái xác nhận và thay đổi ngữ cảnh do người dùng kích hoạt.

## Nội dung và giọng điệu

- Dùng tiếng Việt rõ, động từ trực tiếp: “Tạo đơn”, “Bắt đầu chế biến”, “Đánh dấu đã dọn”.
- Giữ thuật ngữ POS/KDS ở nơi nhân viên cần nhận diện hệ thống; không đưa vào màn khách.
- Empty state nêu hành động tiếp theo. Lỗi cho biết điều gì xảy ra và cách thử lại.
- Không dùng emoji hoặc slogan trang trí trong nội dung vận hành.

## Luồng dữ liệu và tương thích

- Context và API hiện tại tiếp tục là nguồn dữ liệu duy nhất.
- Component UI nhận dữ liệu qua props và phát callback; không gọi API trực tiếp.
- Giữ nguyên toàn bộ `testID` được E2E sử dụng.
- Giữ các trạng thái loading, empty, error và offline/socket-disconnected hiện có; chuẩn hóa cách hiển thị qua primitive chung.
- Không đổi shape của order, menu, table, report hoặc auth state.

## Trình tự triển khai

1. Bổ sung font và token; dựng primitive UI dùng chung.
2. Thay Login, RoleShell và navigation.
3. Chuyển POS, modifier modal và receipt.
4. Chuyển KDS và hệ thống trạng thái ticket.
5. Chuyển sơ đồ bàn và màn khách QR.
6. Chuyển Admin, menu management và báo cáo.
7. Loại màu/radius/emoji hard-code còn sót; hoàn thiện responsive và accessibility.
8. Chạy typecheck, unit/integration, E2E và đánh giá screenshot ở ba viewport.

## Kiểm thử và tiêu chí hoàn tất

- `npm run typecheck` không lỗi.
- Test frontend/backend liên quan vẫn chạy qua.
- Hai flow E2E cashier–kitchen và admin operations vẫn giữ nguyên hành vi.
- Login, POS, KDS, Tables, QR và Admin được kiểm tra ở mobile, tablet và desktop phù hợp vai trò.
- Không còn emoji trong navigation/hành động/trạng thái.
- Không còn màu UI tùy ý ngoài token, trừ dữ liệu biểu đồ cần palette riêng đã định nghĩa.
- Theme theo vai trò hoạt động và lựa chọn thủ công được lưu.
- Không có overflow, nội dung bị che hoặc touch target dưới chuẩn ở viewport mục tiêu.

## Rủi ro và kiểm soát

- Các file màn hình hiện rất lớn: tách dần component trình bày, không tái cấu trúc context nghiệp vụ trong cùng đợt.
- Snapshot/E2E có thể phụ thuộc text viết hoa: giữ `testID`, cập nhật expectation text chỉ khi copy mới đã được xác nhận.
- Font tải chậm: bundle font qua Expo, giữ system fallback và chặn splash chỉ trong thời gian font cần thiết.
- Thay đổi toàn hệ thống dễ tạo lệch style: kiểm tra token bằng tìm kiếm màu/radius hard-code và screenshot sau mỗi nhóm màn hình.

