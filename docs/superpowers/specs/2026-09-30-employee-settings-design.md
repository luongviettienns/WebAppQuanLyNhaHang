# Đặc tả Thiết lập nhân viên

Ngày: 2026-09-30
Trạng thái: Đã duyệt thiết kế, chờ duyệt đặc tả trước khi lập implementation plan

## 1. Mục tiêu

Xây dựng workspace Admin **Thiết lập nhân viên** đồng bộ với hồ sơ nhân viên, lịch làm việc, kiosk/bảng chấm công và bảng lương. Thiết lập phải là chính sách backend có kiểu dữ liệu, có phiên bản theo ngày hiệu lực và có audit; giao diện không được lưu hoặc mô phỏng cấu hình chỉ ở frontend.

Ảnh đính kèm chỉ là tham chiếu bố cục. Các chức năng xuất hiện trong ảnh nhưng chưa có nghiệp vụ backend an toàn phải hiển thị khóa với nhãn `Chưa hỗ trợ`, không được tạo switch giả.

## 2. Phạm vi MVP đã duyệt

### 2.1 Có trong MVP

- Workspace gồm: Khởi tạo, Chấm công, Tính lương, Ngày làm & Nghỉ.
- Policy theo chi nhánh, mặc định sử dụng branch `MAIN` hiện có.
- Policy có phiên bản theo `effectiveFrom`; không sửa bản ghi policy lịch sử.
- Chấm công theo ca; kiosk mã chấm công vẫn là nguồn tự chấm công chính.
- Số phút ngày công chuẩn, ngưỡng đi muộn, ngưỡng về sớm và quyền chấm ngoài lịch.
- Kỳ lương tháng bắt đầu ngày 1 và lương giờ dựa trên actual attendance.
- Bộ ngày làm việc trong tuần theo chi nhánh.
- Kỳ nghỉ/lễ theo khoảng ngày.
- Checklist khởi tạo lấy từ dữ liệu thật.
- Audit, optimistic concurrency bằng revision, realtime invalidation sau commit.
- Cập nhật màn hình lịch, bảng chấm công, kiosk Admin và bảng lương khi policy liên quan thay đổi.

### 2.2 Ngoài phạm vi MVP

- Chấm công di động/GPS/QR cá nhân.
- Tự động tạo actual attendance.
- Một lượt vào–ra tự tách nhiều ca liên tục.
- Quy đổi số giờ thành nửa công/một công.
- Tự động phê duyệt hoặc tính tiền tăng ca.
- Tự động tạo/cập nhật bảng lương theo lịch nền.
- Mẫu lương, danh mục phụ cấp/giảm trừ riêng.
- Thuế TNCN, bảo hiểm xã hội.
- Hệ số lương ngày lễ hoặc tự động khấu trừ ngày nghỉ.
- Zalo Mini App, máy chấm công phần cứng và quản lý chuỗi chi nhánh.

Các mục ngoài phạm vi có thể xuất hiện trong UI để phản ánh bố cục tham chiếu, nhưng luôn disabled theo `capabilities` do backend trả về.

## 3. Nguyên tắc bất biến

1. Thay đổi policy không sửa actual attendance, schedule snapshot hoặc bảng lương đã chốt.
2. Policy mới chỉ áp dụng từ `effectiveFrom`; MVP chỉ cho tạo phiên bản từ business date hiện tại hoặc tương lai.
3. Check-in snapshot policy hiệu lực; check-out luôn dùng snapshot của session đã mở.
4. Payroll `FINALIZED` không đọc lại policy. Batch `DRAFT`/`CALCULATED` chỉ nhận policy mới khi Admin chủ động tính lại.
5. Workweek/holiday tạo cảnh báo, không tự tạo, sửa hoặc hủy lịch; không tự sinh absence.
6. Holiday/workweek không tự đổi công thức lương MVP.
7. Mọi mutation thiết lập là Admin-only, audit trong cùng transaction và chỉ phát realtime sau commit.
8. Không lưu cấu hình cho capability chưa hỗ trợ.
9. Không xóa cứng policy hoặc kỳ nghỉ đã được sử dụng.
10. Business date dùng `Asia/Ho_Chi_Minh` như attendance hiện tại.

## 4. Mô hình dữ liệu

### 4.1 `BranchAttendancePolicyVersion`

- `id`
- `branchId`
- `effectiveFrom` (`DATE`)
- `revision` (số tăng đơn điệu theo branch và loại policy)
- `attendanceMode = SHIFT`
- `standardDayMinutes`
- `lateThresholdMinutes`
- `earlyLeaveThresholdMinutes`
- `allowUnscheduledAttendance`
- `createdByUserId`
- `createdAt`

Ràng buộc:

- Unique `(branchId, effectiveFrom)`.
- `standardDayMinutes` từ 60 đến 1.440.
- Hai threshold từ 0 đến 720.
- Không có endpoint update/delete. Thay đổi tạo phiên bản mới.

### 4.2 `BranchPayrollPolicyVersion`

- `id`
- `branchId`
- `effectiveFrom`
- `revision`
- `frequency = MONTHLY`
- `periodStartDay = 1`
- `hourlyCalculationSource = ACTUAL_ATTENDANCE`
- `createdByUserId`
- `createdAt`

MVP chỉ chấp nhận các giá trị trên. Các lựa chọn khác không được lưu dù client tự gửi.

### 4.3 `BranchWorkweekPolicyVersion`

- `id`
- `branchId`
- `effectiveFrom`
- `revision`
- `monday` ... `sunday`
- `createdByUserId`
- `createdAt`

Phải có ít nhất một ngày làm việc.

### 4.4 `BranchHolidayPeriod`

- `id`
- `branchId`
- `name`
- `startDate`, `endDate`
- `note?`
- `revision`
- `archivedAt?`, `archivedByUserId?`
- `createdByUserId`, `createdAt`, `updatedAt`

Hai holiday đang hoạt động trong cùng branch không được chồng ngày. Holiday không bị xóa cứng. Sửa/lưu trữ yêu cầu `expectedRevision`; thay đổi được audit before/after.

### 4.5 Snapshot attendance

`EmployeeAttendanceSession` bổ sung:

- `attendancePolicyVersionId?`
- `standardDayMinutesSnapshot`
- `lateThresholdMinutesSnapshot`
- `earlyLeaveThresholdMinutesSnapshot`
- `allowUnscheduledAttendanceSnapshot`

Policy được chốt khi tạo session. Phiên ngoài lịch vẫn snapshot policy. Check-out và mọi projection sau đó dùng snapshot, không dùng policy hiện hành. Admin sửa policy snapshot của session chỉ qua correction hiện có, bắt buộc lý do/audit before-after.

### 4.6 Snapshot payroll

Không tạo cột tài chính trùng lặp. `EmployeePayrollLine.sourceSnapshot` của lần tạo/tính lại mới bổ sung:

- payroll policy ID/revision và giá trị hỗ trợ;
- attendance policy revisions được các session nguồn sử dụng;
- workweek policy revisions áp dụng trong kỳ;
- danh sách holiday label/date thuộc kỳ.

Các metadata này phục vụ đối soát, không thay đổi công thức đã duyệt. Snapshot của payroll đã chốt bất biến.

### 4.7 Audit

Dùng `AuditLog` hiện có. Các action tối thiểu:

- `EMPLOYEE_ATTENDANCE_POLICY_CREATED`
- `EMPLOYEE_PAYROLL_POLICY_CREATED`
- `EMPLOYEE_WORKWEEK_POLICY_CREATED`
- `EMPLOYEE_HOLIDAY_CREATED`
- `EMPLOYEE_HOLIDAY_UPDATED`
- `EMPLOYEE_HOLIDAY_ARCHIVED`
- `EMPLOYEE_ATTENDANCE_POLICY_SNAPSHOT_CORRECTED`

Metadata gồm branch, effective date, revision, before/after và lý do khi thao tác sửa dữ liệu đã tồn tại.

## 5. Chọn policy theo ngày

Với branch, loại policy và business date, backend chọn bản ghi có `effectiveFrom <= date`, sắp xếp `effectiveFrom DESC`, lấy một bản. Migration bảo đảm luôn có baseline nên runtime không fallback bằng constant ẩn.

Khi tạo phiên bản:

1. Xác thực Admin, branch và payload.
2. Reject `effectiveFrom` trước business date hiện tại.
3. Lock branch row và đọc revision mới nhất trong transaction.
4. So sánh `expectedRevision`; khác thì trả `409 EMPLOYEE_SETTINGS_REVISION_CONFLICT`.
5. Reject duplicate effective date.
6. Tạo version + audit trong cùng transaction.
7. Commit rồi phát realtime invalidation.

## 6. Tác động đến chấm công

- Policy mặc định giữ hành vi strict hiện tại vì threshold bằng 0.
- `checkInDeltaMinutes` và `checkOutDeltaMinutes` luôn là chênh lệch actual so với schedule snapshot, không bị làm tròn hoặc sửa bởi threshold.
- Check-in được coi `ON_TIME` khi delta không vượt `lateThresholdMinutesSnapshot`; vượt threshold là `LATE`.
- Check-out được coi `ON_TIME` khi số phút về sớm không vượt `earlyLeaveThresholdMinutesSnapshot`; vượt threshold là `LEFT_EARLY`.
- `checkInAfterShiftEnd` vẫn độc lập và dựa trên actual/schedule snapshot như thiết kế attendance hiện có.
- Nếu `allowUnscheduledAttendance=false`, kiosk không cho xác nhận `OUTSIDE_SCHEDULE`; 0 ca trả lỗi `ATTENDANCE_SCHEDULE_REQUIRED`. Nhiều ca vẫn bắt chọn; ca duy nhất đã kết thúc vẫn cho chọn chính ca đó nhưng không cho nhánh ngoài lịch.
- Backend không tin giờ, threshold hay capability từ client.
- Check-out đóng đúng session đã mở và không chọn policy lại.

## 7. Tác động đến lịch làm việc

- API tuần trả thêm metadata cho mỗi ngày: ngày làm mặc định, ngày ngoài workweek, holiday labels.
- Tạo lịch vào ngày ngoài workweek/holiday không bị reject. API preview/mutation trả warning xác định; UI yêu cầu xác nhận trước khi lưu.
- Xác nhận warning không thay đổi validation overlap/duplicate/employee status hiện có.
- Thay đổi workweek/holiday không sửa hoặc hủy rule đã lưu.
- Event settings làm lịch refetch để cập nhật marker/cảnh báo.

## 8. Tác động đến bảng lương

- Kỳ lương vẫn là một tháng lịch hoàn chỉnh, ngày bắt đầu bằng 1.
- Lương giờ vẫn dùng actual completed attendance minutes.
- Lương ca và lương tháng giữ nguyên công thức snapshot MVP đã duyệt.
- Standard day, workweek và holiday không tạo tiền, ngày công, bonus hoặc deduction tự động.
- Phụ cấp/giảm trừ sử dụng `EmployeePayrollAdjustment` hiện có.
- Batch mở chỉ đọc policy mới khi `recalculate`; batch finalized không thay đổi.
- Export và detail có thể hiển thị metadata policy/holiday nhưng không lộ attendance code.

## 9. Checklist Khởi tạo

Checklist được tính theo branch tại thời điểm đọc:

1. `Có nhân viên`: ít nhất một employee `WORKING`.
2. `Thiết lập chế độ chấm công`: có attendance policy hiệu lực và ít nhất một active work shift.
3. `Hình thức chấm công`: có ít nhất một kiosk session chưa revoke/chưa hết hạn.
4. `Thiết lập lương`: mọi employee `WORKING` có compensation term hiệu lực tại business date.
5. `Thiết lập bảng lương`: có ít nhất một payroll batch thuộc branch.

Response trả `completedCount`, `totalCount = 5`, số liệu và destination key cho từng bước. Frontend ánh xạ destination key sang màn hình nội bộ; backend không trả URL tùy ý.

## 10. API

Base path: `/api/employee-settings`; toàn bộ route dùng `authenticate` + `authorize('ADMIN')`.

- `GET /?branchId=`: policy hiệu lực, lịch sử phân trang ngắn, holiday đang hoạt động, checklist, capabilities và revision.
- `POST /attendance-policies`: tạo attendance version.
- `POST /payroll-policies`: tạo payroll version.
- `POST /workweek-policies`: tạo workweek version.
- `GET /holidays?branchId=&from=&to=&includeArchived=`: danh sách holiday.
- `POST /holidays`: tạo holiday.
- `PATCH /holidays/:id`: sửa holiday với `expectedRevision` và reason.
- `POST /holidays/:id/archive`: lưu trữ với `expectedRevision` và reason.

Mutation policy nhận `branchId`, `effectiveFrom`, `expectedRevision` và các field được hỗ trợ. Không nhận actor, revision mới, timestamp hoặc capability từ client.

### 10.1 Capabilities

Response tối thiểu:

- `mobileAttendance: false`
- `automaticAttendance: false`
- `continuousShiftPunch: false`
- `hourToDayConversion: false`
- `automaticOvertime: false`
- `scheduledHoursPayroll: false`
- `automaticPayrollCreation: false`
- `automaticPayrollRefresh: false`
- `salaryTemplates: false`
- `tax: false`
- `insurance: false`
- `hardwareTimeclock: false`
- `zaloMiniApp: false`

Frontend dựa vào response này để khóa UI; backend vẫn reject payload ngoài capability.

### 10.2 Error codes

- `EMPLOYEE_SETTINGS_BRANCH_NOT_FOUND` — 404
- `EMPLOYEE_SETTINGS_EFFECTIVE_DATE_INVALID` — 422
- `EMPLOYEE_SETTINGS_EFFECTIVE_DATE_IN_PAST` — 422
- `EMPLOYEE_SETTINGS_VERSION_DUPLICATE` — 409
- `EMPLOYEE_SETTINGS_REVISION_CONFLICT` — 409
- `EMPLOYEE_SETTINGS_VALUE_INVALID` — 422 với field errors
- `EMPLOYEE_SETTINGS_CAPABILITY_UNSUPPORTED` — 422
- `EMPLOYEE_SETTINGS_WORKWEEK_EMPTY` — 422
- `EMPLOYEE_HOLIDAY_DATE_INVALID` — 422
- `EMPLOYEE_HOLIDAY_OVERLAP` — 409
- `EMPLOYEE_HOLIDAY_ARCHIVED` — 409
- `ATTENDANCE_SCHEDULE_REQUIRED` — 409 tại kiosk punch

## 11. Realtime và cache consistency

Event `employee-settings:changed` phát sau commit với:

- `branchId`
- `settingsArea`
- `effectiveFrom` hoặc holiday range
- `revision`
- event revision dùng cho invalidation

Payload không phải nguồn dữ liệu chuẩn. Client liên quan refetch:

- Employee Settings: mọi event cùng branch.
- Schedule: workweek/holiday event.
- Attendance Admin/Kiosk: attendance policy event.
- Payroll: payroll/workweek/holiday event; batch đang mở không tự recalculate.
- Initialization checklist: các event employee, schedule, kiosk, compensation và payroll hiện có cũng làm refetch.

Không phát event khi transaction rollback.

## 12. Giao diện

Workspace Nhân viên bổ sung tab `Thiết lập nhân viên` chỉ có ở Admin.

### 12.1 Responsive shell

- Desktop: sidebar bốn mục, content card rộng.
- Tablet: sidebar hẹp/compact.
- Mobile: tab cuộn ngang, form một cột, bảng holiday chuyển thành card/list hoặc cuộn ngang có nhãn rõ.
- Không sao chép global header/branding trong ảnh; dùng navigation và token hiện có.

### 12.2 Khởi tạo

- Progress `x/5` và năm hàng lấy từ checklist API.
- Hàng hoàn tất/chưa hoàn tất có icon, số liệu và CTA.
- CTA dùng destination key nội bộ để chuyển section/tab hiện có.

### 12.3 Chấm công

- Hiển thị version đang hiệu lực, ngày hiệu lực và revision.
- Form tạo version mới với standard day, threshold và allow unscheduled.
- Modal xác nhận effective date, mặc định business date hiện tại.
- Lịch sử version read-only.
- Nhóm chưa hỗ trợ disabled, badge và mô tả nguyên nhân.

### 12.4 Tính lương

- Hiển thị `Hàng tháng`, `Ngày 1`, `Theo giờ thực tế`.
- CTA mở Bảng lương và adjustment ledger hiện có.
- Banner giải thích finalized payroll bất biến.
- Các option auto/template/tax/insurance disabled theo capabilities.

### 12.5 Ngày làm & Nghỉ

- Chọn bảy ngày; lưu thành workweek version mới.
- Holiday table có tên, từ/đến ngày, số ngày, trạng thái và action.
- Modal tạo/sửa validate trên client để phản hồi nhanh nhưng backend là authority.
- Archive thay cho delete.
- Lịch sử workweek read-only.

### 12.6 Trạng thái và accessibility

- Loading skeleton, empty state, inline error và retry riêng.
- Save disabled khi form không đổi hoặc đang submit.
- Conflict 409 hiển thị thông báo dữ liệu đã đổi và refetch; không ghi đè im lặng.
- Tab, input, switch, modal và disabled capability có accessibility label/state; dùng được bằng bàn phím.

## 13. Migration và backfill

Migration cộng thêm:

1. Tạo bảng policy/holiday, foreign keys và index.
2. Với mỗi branch hiện có, tạo baseline `effectiveFrom = 1970-01-01`:
   - attendance: SHIFT, 480, threshold 0/0, allow unscheduled true;
   - payroll: MONTHLY, day 1, ACTUAL_ATTENDANCE;
   - workweek: T2–CN true.
3. Thêm snapshot fields attendance; backfill session cũ bằng baseline mà không sửa actual/schedule snapshot.
4. Giữ nguyên payroll source snapshot cũ; code đọc field settings như optional để tương thích.
5. Không reset, truncate hoặc seed lại dữ liệu.

Migration chỉ được tạo và chạy lần đầu trên `TEST_DATABASE_URL`. Sau khi schema/domain/API/integration/frontend/regression tests đạt, rollout DEV yêu cầu:

1. xác nhận đúng `DATABASE_URL`;
2. backup DEV;
3. chạy migration đã kiểm thử, không reset/seed;
4. kiểm tra baseline/backfill/index;
5. smoke test API và browser.

## 14. Kiểm thử bắt buộc

### 14.1 Domain/schema

- Boundary chọn version trước/đúng/sau effective date.
- Validation minute, workweek và holiday.
- Migration từ schema hiện tại, baseline mọi branch và attendance backfill.
- Payroll snapshot cũ vẫn đọc được.

### 14.2 Backend/integration/concurrency

- Admin-only trên mọi settings route; Cashier/Kitchen/kiosk bị 403.
- Hai request policy cùng expected revision: một commit, một 409.
- Duplicate effective date, past date và invalid value không ghi policy/audit/event.
- Holiday overlap và concurrent create được serialize đúng.
- Audit commit/rollback cùng mutation.
- Realtime chỉ sau commit.
- Checklist thay đổi theo employee/shift/kiosk/compensation/payroll thực tế.
- Attendance threshold classification giữ actual/delta.
- Policy đổi giữa check-in/check-out không đổi session snapshot.
- `allowUnscheduledAttendance=false` chặn mọi nhánh outside schedule.
- Schedule holiday/workweek warning không làm thay đổi persistence semantics.
- Payroll create/recalculate snapshot policy; finalized batch bất biến.

### 14.3 Frontend

- Điều hướng bốn section và workspace Admin.
- Checklist 0–5, CTA routing và realtime refresh.
- Form create version, validation, history và conflict recovery.
- Capability disabled không thể thao tác và client không gửi field unsupported.
- Holiday create/edit/archive và overlap error.
- Schedule warning confirmation.
- Attendance/payroll UI phản ánh policy snapshot đúng.
- Desktop/tablet/mobile, tiếng Việt và accessibility.

### 14.4 Regression/UAT

- Chạy toàn bộ employee directory, schedule, kiosk/attendance và payroll suites.
- UAT hai cửa sổ để xác minh realtime.
- UAT trọn luồng policy → lịch → kiosk → attendance → payroll snapshot/export.
- Kiểm tra finalized payroll không đổi sau khi tạo policy mới.

## 15. Tiêu chí nghiệm thu

- Admin quản lý policy theo branch và effective date mà không sửa lịch sử.
- Trang settings phản ánh dữ liệu thật và khóa trung thực chức năng chưa hỗ trợ.
- Attendance mới dùng snapshot policy đúng; actual time không bị sửa.
- Lịch hiển thị warning ngày nghỉ nhưng không bị tự động thay đổi.
- Payroll mới/tính lại lưu metadata policy; finalized payroll bất biến.
- Checklist Khởi tạo, audit và realtime nhất quán sau commit.
- Migration test an toàn, không reset/seed dữ liệu và không làm hỏng bản ghi hiện có.
- Tất cả test bắt buộc và UAT đạt trước khi coi tính năng hoàn thành.

## 16. Quyết định đã duyệt

- Policy có kiểu dữ liệu, theo branch và version theo ngày hiệu lực.
- Thay đổi chỉ áp dụng về sau; batch mở cần chủ động tính lại; finalized bất biến.
- Truthful MVP cho attendance và payroll; capability chưa hỗ trợ bị khóa.
- Workweek/holiday chỉ cảnh báo và snapshot metadata, chưa tác động tiền lương.
- Kiosk mã chấm công vẫn là nguồn chính; không tự tạo actual attendance.
- Migration/test trên TEST DB trước, backup và migration DEV có chủ đích sau khi đạt toàn bộ verification.
