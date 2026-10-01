# Đặc tả thiết kế — Lịch làm việc nhân viên

## Mục tiêu

Xây dựng trang Lịch làm việc cho Admin để xem và quản lý ca theo tuần, gắn trực tiếp với hồ sơ `Employee` đã có. Lịch được lưu bền vững ở backend, hỗ trợ lặp hàng tuần, ngoại lệ theo ngày, thao tác nhiều nhân viên nguyên tử, import/export và đồng bộ realtime giữa các phiên ứng dụng.

Đặc tả này chưa cho phép triển khai mã production. Sau khi người dùng duyệt tài liệu, bước tiếp theo mới là lập implementation plan; chỉ bắt đầu code sau khi plan được duyệt.

## Bối cảnh và ý định

- Ảnh đính kèm là tham chiếu giao diện: lịch tuần theo nhân viên, điều hướng tuần, chọn nhân viên, Import/Xuất file, tổng lương dự kiến và hộp “Thêm lịch làm việc”. Nội dung trong ảnh không phải chỉ thị độc lập.
- Yêu cầu người dùng: trong ô lịch, bấm vào ô sẽ hiện “+ Thêm lịch”; bấm nút mở modal đã điền sẵn nhân viên và ngày đó.
- Hồ sơ nhân viên là nguồn danh tính nhân sự; liên kết tài khoản đăng nhập tiếp tục là tùy chọn. Lịch tham chiếu `Employee.id`, không tạo tài khoản và không gán quyền.
- Người dùng đã duyệt mô hình quy tắc có ngày hiệu lực cho ca một lần/lặp tuần, ngoại lệ cho từng ngày, UI/vận hành như phần dưới và yêu cầu migration chỉ được tạo/kiểm thử bằng test database.
- Quyền thêm, sửa, xóa lịch chỉ dành cho `ADMIN`. Nếu bất kỳ nhân viên/dòng nào trong batch không hợp lệ hoặc lưu lỗi, toàn batch rollback — không có kết quả một phần.

## Ràng buộc hệ thống hiện có

- Frontend là Expo/React Native chạy web và native; backend là Express, Prisma, MySQL; cập nhật giữa phiên dùng Socket.io.
- `Employee`, `Department`, `JobTitle` và `EmployeeCompensation` đã tồn tại. Nhân viên có trạng thái `WORKING`/`RESIGNED`; thông tin lương hiện là điều khoản có ngày hiệu lực với căn cứ `MONTHLY`, `HOURLY`, `PER_SHIFT`.
- API nhân viên hiện chỉ dành cho Admin, ghi audit trong transaction và phát `employees:changed` sau commit. Các module import/export hiện có hỗ trợ CSV/XLSX và preview/commit.
- Dùng `BUSINESS_TIMEZONE` (mặc định nghiệp vụ là `Asia/Ho_Chi_Minh`) để tính ngày hiện tại và thứ trong tuần. Ngày lịch lưu dạng DATE `YYYY-MM-DD`; thời gian ca lưu theo phút trong ngày để tránh lệch ngày do UTC.
- Dùng theme token sẵn có, hỗ trợ sáng/tối; không đưa một bộ màu thương hiệu KiotViet riêng vào ứng dụng.

## Phạm vi

### Bao gồm

1. Trang lịch tuần bên trong khu vực Nhân viên, giữ nguyên điều hướng và shell theo vai trò hiện tại.
2. Lưới theo nhân viên: cột nhân viên, bảy ngày Thứ hai–Chủ nhật, cột lương dự kiến; tuần trước/tuần sau/tuần này, tìm nhân viên, chọn cách xem theo nhân viên, Import và Xuất file.
3. Ba ca mặc định có thể dùng ngay: Ca sáng 08:00–12:00, Ca chiều 13:00–17:00, Ca tối 18:00–22:00; Admin có thể thêm định nghĩa ca mới từ modal.
4. Tạo lịch một lần hoặc lặp hàng tuần, có thể không đặt ngày kết thúc; hỗ trợ áp dụng cùng ngày/ca cho nhiều nhân viên trong một thao tác.
5. Sửa/xóa lịch một lần, riêng một buổi của lịch lặp, hoặc từ ngày được chọn trở đi; không cho sửa/xóa ngược các ngày quá khứ.
6. Import CSV/XLSX qua xem trước, kiểm lỗi từng dòng và commit nguyên tử; xuất CSV/XLSX cho tuần đang xem.
7. Tính lương dự kiến chỉ từ dữ liệu thật, audit các thay đổi, phân quyền Admin và realtime invalidation.
8. Migration cộng thêm bảng/index/seed ca mặc định. Chỉ kiểm thử migration trên `TEST_DATABASE_URL` hoặc test database tương đương.

### Không bao gồm

- Chấm công, máy chấm công, xin nghỉ, yêu cầu/phê duyệt, ca đổi giữa nhân viên, payroll/payslip, thuế, làm thêm, hoa hồng, tạm ứng và ghi nhận thanh toán lương.
- Tự tạo tài khoản đăng nhập, tự gán role, quản lý chi nhánh (repo chưa có mô hình chi nhánh), tích hợp POS/KDS hay tự tạo `Order`.
- Ca qua nửa đêm trong lát đầu này. Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày; có thể mở rộng ca qua đêm ở đặc tả sau nếu nghiệp vụ cần.
- Áp migration, reset, seed phá dữ liệu hoặc thay đổi schema trên `DATABASE_URL`/database phát triển. Không chạy migration production trong task này.

## Thiết kế dữ liệu

### `WorkShift`

- `id`, `code` duy nhất, `name` duy nhất sau chuẩn hóa, `startMinute`, `endMinute`, `isActive`, `createdByUserId`, `createdAt`, `updatedAt`.
- `startMinute` nằm trong `0..1439`; `endMinute` trong `1..1440`; bắt buộc `startMinute < endMinute`. Khoảng ca được hiểu nửa kín `[start,end)`, vì vậy hai ca chạm đúng giờ (ví dụ 08:00–12:00 và 12:00–16:00) không chồng nhau.
- Migration tạo ba ca mặc định theo `code` ổn định `MORNING`, `AFTERNOON`, `EVENING`. Việc seed chỉ thêm các mã còn thiếu, không ghi đè tên/giờ ca do Admin đã chỉnh về sau.
- Ca đã dùng không bị xóa cứng trong lát này. Ca ngừng hoạt động vẫn hiển thị trên lịch cũ nhưng không thể được chọn để tạo lịch mới. Modal cho phép tạo ca mới; chưa cho sửa giờ ca đã dùng để tránh hồi tố lịch.

### `EmployeeScheduleRule`

- `id`, `employeeId`, `shiftId`, `recurrenceType` (`ONCE` hoặc `WEEKLY`), `startDate`, `endDate` nullable, `dayOfWeek` nullable ISO `1..7`, `cancelledAt`/`cancelledByUserId` nullable, `createdByUserId`, `createdAt`, `updatedAt`.
- `ONCE`: đúng một occurrence vào `startDate`; `dayOfWeek` rỗng. `endDate` không dùng.
- `WEEKLY`: occurrence đầu tiên là `startDate`, lặp đúng thứ ISO của ngày đó, gồm cả `endDate` nếu được đặt; `endDate=null` nghĩa là chưa đặt hạn. `dayOfWeek` phải trùng thứ của `startDate`.
- Có khóa ngoại `Employee` và `WorkShift` với `RESTRICT`; index tối thiểu `(employeeId, startDate, endDate)`, `(shiftId, startDate)` và index cho trạng thái/quy tắc cần lọc. DB unique constraint chặn bản sao hoàn toàn giống nhau khi có thể; kiểm tra giao nhau giữa khoảng lặp là trách nhiệm transaction service.
- Một nhân viên có thể làm nhiều ca trong ngày nếu các khoảng giờ không chồng. Không lưu occurrence tuần thành từng bản ghi; API khai triển quy tắc khi đọc tuần.

### `EmployeeScheduleException`

- `id`, `scheduleRuleId`, `workDate`, `type` (lát đầu chỉ có `CANCELLED`), `reason` tùy chọn, `createdByUserId`, `createdAt`.
- Unique `(scheduleRuleId, workDate)`; `workDate` chỉ hợp lệ nếu là occurrence của rule.
- Hủy riêng một occurrence tạo ngoại lệ, không xóa quy tắc. Xóa/sửa “từ ngày này trở đi” rút ngắn rule cũ đến ngày trước ngày chọn; nếu chưa có occurrence trước đó thì đánh dấu rule đã hủy. Sửa sẽ tạo rule thay thế. Cách này bảo toàn lịch quá khứ. Lịch một lần bị xóa được đánh dấu `cancelledAt`, không xóa cứng.

### Nhân viên nghỉ việc

- Không cho tạo lịch mới nếu nhân viên không tồn tại, `status != WORKING`, ngày lịch trước `startDate`, hoặc ngày occurrence sau `endDate` (nếu có).
- Khi hồ sơ chuyển sang `RESIGNED`, transaction cập nhật trạng thái nhân viên đồng thời giới hạn các rule tuần đã bắt đầu đến ngày làm việc cuối cùng; rule tuần chưa bắt đầu và lịch một lần nằm sau ngày đó được đánh dấu `cancelledAt`. Ghi audit thay đổi lịch. Nếu thất bại thì trạng thái nghỉ việc và lịch cùng rollback. Chuyển nhân viên về `WORKING` không tự khôi phục rule đã đóng.

## Giao diện và tương tác

### Lịch tuần

- Bố cục desktop: thanh tiêu đề/công cụ ở trên; bảng tuần rộng, cột nhân viên ở trái; bảy cột ngày ở giữa; lương dự kiến ở phải. Có thể cuộn ngang khi thiếu chiều rộng; tên nhân viên giữ dễ nhận biết khi cuộn. Desktop không chia mọi thành phần thành các thẻ giống nhau.
- Trên thiết bị hẹp, bảng cuộn ngang hoặc chuyển sang danh sách nhân viên có bảy ngày cuộn ngang; thao tác và nội dung không bị mất.
- Ô có ca hiển thị nhãn ca và giờ; ngày đang chọn/hiện tại có phân biệt rõ theo token theme. Ô trống vẫn giữ vùng bấm đủ lớn.
- Khi bấm một ô lịch, hiện hành động “+ Thêm lịch” trong ô; bấm hành động mở modal “Thêm lịch làm việc” đã điền nhân viên và ngày tương ứng. Trong ô đã có ca, bấm nhãn ca mở thao tác sửa/xóa ca; vùng trống còn lại vẫn cho phép thêm. Bấm ngày điều hướng tuần hoặc các nút tuần không tự tạo lịch.
- Tìm kiếm lọc theo mã hoặc tên nhân viên. Chỉ nhân viên đang làm việc xuất hiện trong danh sách tạo lịch; lịch lịch sử vẫn có thể xem theo tuần cũ. API phân trang mặc định 100 nhân viên/trang, tối đa 100; UI phân trang hoặc virtualization khi danh sách lớn.
- Khu vực lương dự kiến: số tiền chỉ khi có thể tính chính xác; trạng thái ghi rõ nếu chưa thiết lập lương hoặc loại lương tháng không thể suy ra từ ca.

### Modal thêm/sửa

- Header thể hiện ngày và nhân viên được chọn. Bộ chọn ca dạng checkbox cho phép chọn nhiều ca; mỗi lựa chọn hiển thị tên và khung giờ. Nút “+” mở form tên, giờ bắt đầu, giờ kết thúc cho ca mới.
- “Lặp lại hàng tuần” tạo quy tắc tuần từ ngày được chọn; khi bật, cho phép đặt ngày kết thúc, mặc định để trống (không hết hạn). Ngày kết thúc phải cùng hoặc sau ngày đầu.
- “Thêm lịch tương tự cho nhân viên khác” mở bộ chọn nhiều nhân viên đang làm việc; nội dung ca/ngày được áp dụng giống nhau. Nút Lưu chỉ báo thành công nếu toàn bộ batch đã được ghi.
- Sửa lịch lặp yêu cầu chọn phạm vi: “Chỉ ngày này” hoặc “Từ ngày này trở đi”. Khi sửa một ngày, tạo ngoại lệ cho occurrence cũ và rule một lần thay thế; từ ngày được chọn trở đi, đóng rule cũ trước ngày đó và tạo rule tuần mới.
- Xóa lịch cũng yêu cầu phạm vi tương ứng. Có hộp xác nhận cho xóa từ ngày chọn trở đi. Không hiển thị hành động sửa/xóa cho ngày quá khứ.
- Khóa nút lưu trong lúc gửi; lỗi giữ nguyên dữ liệu form và hiển thị nguyên nhân. Thành công đóng modal, tải lại tuần hiện hành và thông báo “Đã lưu lịch làm việc”.

### Import/Export

- Export chỉ gồm các occurrence của tuần đang xem, dạng CSV/XLSX, với mã/tên nhân viên, mã/tên ca, ngày, giờ bắt đầu/kết thúc và thông tin lặp; không xuất thông tin ngân hàng hay trường cá nhân nhạy cảm.
- Import CSV/XLSX tối đa 1.000 dòng/lần. Cột: `employeeCode`, `shiftCode`, `workDate`, `repeatWeekly`, `endDate` tùy chọn. Ca phải tồn tại và đang hoạt động; nhân viên phải hợp lệ. Preview trả số dòng hợp lệ/lỗi cùng số dòng, trường và thông báo có thể sửa. Commit gửi lại dữ liệu đã phân tích, backend kiểm tra lại toàn bộ trong transaction; một lỗi hoặc conflict thì không có dòng nào được ghi.
- Bộ đọc file giới hạn 5 MiB và chỉ cho `.csv`/`.xlsx`, theo pattern import của hệ thống; file mẫu dùng đúng mã ca/mã nhân viên.

## Quy tắc lương dự kiến

- Với `PER_SHIFT`: cộng `baseRate` hiệu lực tại ngày từng occurrence.
- Với `HOURLY`: cộng `baseRate × số phút ca / 60`, làm tròn đến VND nguyên ở tổng tuần; chỉ thời lượng ca đã lưu được tính, chưa trừ giờ nghỉ vì domain chưa có giờ nghỉ.
- Với `MONTHLY`: trả `amount=null`, `status=MONTHLY_NOT_ESTIMATED`; không quy đổi tùy tiện lương tháng thành chi phí tuần.
- Không tìm thấy compensation hiệu lực tại ngày occurrence: `amount=null`, `status=COMPENSATION_NOT_CONFIGURED`.
- Số liệu chỉ là projection cho tuần, không ghi thành payroll, không được ghi nhận là chi phí/thanh toán và không thay đổi lịch sử hóa đơn.

## API, quyền và lỗi

Các route nằm dưới `/api/employee-schedules` và đều yêu cầu authenticate + `ADMIN`:

- `GET /week`: nhận `weekStart` là thứ Hai theo `YYYY-MM-DD`, tùy chọn search/department/page/pageSize (mặc định 100, tối đa 100); trả nhân viên, occurrence đã khai triển sau ngoại lệ, ca, nguồn rule và lương dự kiến.
- `GET /shifts`: liệt kê ca hoạt động cho form và ca cũ cần render.
- `POST /`: payload `employeeIds[]`, `shiftIds[]`, `startDate`, `repeatWeekly`, `endDate?`; tạo tích Descartes nhân viên × ca trong cùng transaction.
- `PATCH /:ruleId`: payload gồm `workDate`, `scope=occurrence|following`, `shiftIds[]`; thay ca theo quy tắc phạm vi đã chốt.
- `DELETE /:ruleId?workDate=YYYY-MM-DD&scope=occurrence|following`: thêm ngoại lệ, đánh dấu rule một lần đã hủy, hoặc đóng rule từ ngày đó.
- `POST /shifts`: thêm ca hoạt động.
- `GET /export?weekStart=&format=csv|xlsx`, `POST /import/preview`, `POST /import/commit`.

### Tính nguyên tử và xung đột

- Validate cú pháp Zod trước transaction. Transaction khóa các Employee mục tiêu theo ID tăng dần (`SELECT ... FOR UPDATE`) để hai request phân lịch đồng thời không vượt qua kiểm tra chồng giờ; sau khóa phải đọc lại status, employment dates và các rule/exception mới nhất.
- Kiểm tra toàn bộ ứng viên và các occurrence giao với rule hiện có trong miền ngày hữu hiệu. Với rule tuần vô hạn, phép kiểm tra chồng lịch so thứ trong tuần, thời gian hiệu lực và khoảng giờ; rule một lần được so với occurrence tuần tương ứng.
- Nếu một ứng viên lỗi, dừng trước ghi hoặc throw trong transaction để rollback toàn bộ rule/exception/audit của request. Import và batch nhiều nhân viên dùng chung cam kết này.
- Khoảng thời gian ca dùng `[start,end)`. Trùng cùng nhân viên + cùng ca + cùng ngày trả lỗi trùng; khác ca nhưng giao khoảng giờ trả lỗi chồng giờ. Hai ca kề giờ không conflict.
- Mã lỗi bổ sung ổn định: `EMPLOYEE_NOT_FOUND` (404), `EMPLOYEE_NOT_WORKING` (409), `SHIFT_NOT_FOUND` (404), `SHIFT_INACTIVE` (409), `SCHEDULE_DATE_INVALID`, `SCHEDULE_TIME_INVALID`, `SCHEDULE_RECURRENCE_INVALID` (400), `SCHEDULE_DUPLICATE` và `SCHEDULE_OVERLAP` (409). Body vẫn theo envelope API hiện hành `{ error: { code, message, details? } }`; details nêu mã nhân viên, ngày, ca hoặc dòng import gây lỗi. `FORBIDDEN` hiện có trả 403 cho mọi route nếu caller không phải Admin.

## Audit và đồng bộ realtime

- Tạo rule, tạo ca, sửa phạm vi một ngày/từ ngày, ngoại lệ xóa, import, và auto-cap khi nhân viên nghỉ việc đều ghi audit trong cùng transaction. Metadata chỉ gồm ID/mã nhân viên, ca, ngày, phạm vi và các trường đổi; không ghi dữ liệu cá nhân/lương chi tiết.
- Sau commit thành công mới phát `employee-schedules:changed` gồm `employeeIds`, `changedFrom`, `changedThrough` (null nếu còn mở) và `updatedAt`. Thay đổi trạng thái nhân viên có thể đồng thời phát `employees:changed`.
- `RestaurantContext` tăng revision riêng khi nhận event lịch; các màn lịch đang mở tải lại tuần hiện hành. Không phát event khi rollback. Save phía client cũng invalidate/refetch sau response để có cập nhật ngay kể cả socket đang ngắt.
- Lỗi mạng/reconnect không làm client coi dữ liệu local là nguồn thật; khi reconnect hoặc focus màn hình, tải lại tuần từ API.

## Hướng thiết kế giao diện

- Palette lấy từ token của sản phẩm: đỏ thương hiệu `#B42318`, nền canvas `#F4F3F0`, mặt lịch `#FFFFFF`, đường kẻ `#D8D4CE`, chữ chính `#24211F`, trạng thái thông tin `#E9F1FB`. Dùng xanh chỉ ở trạng thái thông tin/ngày theo semantic token, không thay màu thương hiệu bằng xanh KiotViet.
- Chữ dùng Inter hiện có: nhãn 12–14 px, nội dung ô 14 px, tiêu đề 20 px; số liệu dùng tabular numerals để cột lương thẳng hàng. Không thêm font/dependency mới.
- Bảng lịch là điểm nhận diện duy nhất: lưới sáng, đường chia mảnh, cột nhân viên rõ, ngày hiện tại có nền/viền token, nhãn ca nhỏ gọn. Header và modal theo component UI hiện có; không thêm gradient, shadow trang trí hoặc animation tự chạy.
- Focus bàn phím rõ ràng, kích thước thao tác phù hợp cảm ứng; trạng thái rỗng hướng dẫn chọn ngày/thêm ca, lỗi nêu chính xác bước sửa.

## Migration và an toàn môi trường

- Chỉ thêm migration mới cho ba bảng/enum/index/ca mặc định; không sửa hoặc xóa dữ liệu/bảng nghiệp vụ hiện tại.
- Sinh SQL từ schema, review nội dung migration. Mọi lệnh `prisma migrate deploy`/smoke migration và API integration test chỉ được chạy với giá trị `TEST_DATABASE_URL` đã xác minh trỏ test database; script không được tự fallback sang `DATABASE_URL`.
- Không chạy `db:reset`, migrate/seed trên `DATABASE_URL`, không thay `.env` phát triển, không khởi động app theo cách tự migrate. Nếu không xác minh được test database, dừng bước test migration và báo giới hạn; vẫn có thể chạy kiểm tra tĩnh/validation không kết nối DB.

## Kế hoạch kiểm thử và tiêu chí chấp nhận

### Backend/API

1. Admin xem tuần; CASHIER/KITCHEN và guest bị từ chối ở list, shift mutation, create/edit/delete, import/export.
2. Tạo một ca cho nhiều nhân viên và nhiều shift thành công; kiểm tra số rule đúng tích nhân viên × ca.
3. Batch có nhân viên không tồn tại, nhân viên nghỉ, ca inactive, dữ liệu sai, trùng hoặc chồng giờ: response mang đúng status/code/details; không rule, exception hoặc audit nào của batch được lưu.
4. Chặn khoảng giờ chồng nhau, cho phép hai ca kề nhau; test cả hai request concurrent trên cùng employee để chứng minh row lock/recheck không tạo conflict lọt.
5. API tuần khai triển đúng rule một lần, rule tuần theo ISO thứ, `endDate` inclusive, open-ended rule, và không trả occurrence có exception.
6. Sửa/xóa một occurrence chỉ ảnh hưởng ngày đó; phạm vi following giữ nguyên ngày trước, đổi/xóa đúng từ ngày chọn; ngày quá khứ bị từ chối.
7. Resign employee cắt rule tuần/cancel occurrence tương lai trong cùng transaction, audit và event chỉ sau commit; rehire không tự bật lịch cũ.
8. Lương giờ/theo ca/monthly/không có compensation cho kết quả chính xác và không ghi ledger.
9. Import preview trả lỗi theo hàng; import commit revalidate, success all rows or failure zero rows; export chứa đúng occurrence tuần.

### Frontend

1. View-model kiểm thử ngày bắt đầu tuần thứ Hai, ranh giới tháng/năm, lặp, ngoại lệ, kết thúc rule, ca qua ngày (không hỗ trợ và báo lỗi) và format giờ/lương.
2. Component test: click ô -> hiện `+ Thêm lịch`; click button -> modal nhận đúng `employeeId`/`workDate`; shift selection/repeat/employee multi-select phản ánh payload.
3. Khi lưu thành công, modal đóng và dữ liệu tuần refetch ngay; socket event từ phiên khác cũng refetch; khi backend trả lỗi conflict, modal giữ form và hiển thị đúng ngày/ca.
4. Kiểm thử preview/import/export và trạng thái loading/empty/error; không làm gãy directory hiện tại.

### Môi trường và hồi quy

- Chạy focused API/frontend tests, backend/frontend typecheck, lint mục tiêu và Expo web export. Chạy nhóm test hồi quy phù hợp và báo riêng failure đã tồn tại trước feature.
- API tests/migration chỉ dùng test DB. Xác minh trước/sau rằng `DATABASE_URL` phát triển không bị gọi, schema không đổi và dữ liệu DB phát triển không bị tác động.
- Không ghi mã production trước khi người dùng duyệt spec và implementation plan.

### Acceptance cuối

1. Admin có thể xem tuần, điều hướng, tìm nhân viên và nhìn ca cùng giờ trên lưới responsive.
2. Click ô trống hiện “+ Thêm lịch”; modal được điền nhân viên/ngày; lưu mới hoặc nhiều nhân viên thành công cập nhật ngay.
3. Lặp tuần, ngày kết thúc và exception được bung chính xác theo tuần.
4. Admin sửa/xóa đúng phạm vi; quá khứ không bị viết lại.
5. Mọi lỗi validate, employee/shift state, duplicate, overlap và quyền đều có response cụ thể; mọi batch rollback toàn bộ khi một phần thất bại.
6. Import/export tương thích CSV/XLSX, audit/realtime chỉ phát sau commit.
7. Dữ liệu lịch gắn `Employee.id`; nhân viên nghỉ việc không giữ các ca tương lai hiệu lực.
8. Migration chỉ được kiểm thử trên test DB, không có lệnh động đến `DATABASE_URL` phát triển.
