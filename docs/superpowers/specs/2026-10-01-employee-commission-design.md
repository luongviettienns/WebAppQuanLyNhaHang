# Đặc tả Bảng hoa hồng nhân viên

Ngày: 2026-10-01
Trạng thái: Thiết kế nghiệp vụ và giao diện đã được duyệt; chờ người dùng duyệt đặc tả trước khi lập kế hoạch TDD

## 1. Mục tiêu

Xây dựng workspace Admin **Bảng hoa hồng** đồng bộ với hồ sơ nhân viên, POS, đơn QR, thanh toán, trả hàng và bảng lương. Hệ thống cho phép cấu hình nhiều bảng hoa hồng theo món, gắn một nhân viên phụ trách ở cấp dòng món, ghi nhận hoa hồng đúng một lần khi giao dịch đủ điều kiện, và lưu sổ bút toán có snapshot để mọi thay đổi hoặc trả hàng về sau không viết lại lịch sử.

Ảnh đính kèm chỉ là tham chiếu cấu trúc giao diện. Tên bảng, nhóm hàng, số liệu và thương hiệu trong ảnh không phải quy tắc nghiệp vụ của Crispy Bite.

## 2. Phạm vi MVP

### 2.1 Có trong MVP

- Một workspace `Bảng hoa hồng` trong phân hệ Nhân viên.
- Bảng hoa hồng theo chi nhánh `MAIN` hiện hữu, có trạng thái nháp/hoạt động/lưu trữ và ngày hiệu lực.
- Ba cách tính: tiền cố định mỗi đơn vị, phần trăm doanh thu thuần và phần trăm lợi nhuận gộp đã snapshot.
- Quy tắc riêng theo từng `MenuItem`; nhóm hàng dùng để lọc, không tự tạo quy tắc kế thừa.
- Gán nhân viên ở cấp `OrderItem`; mỗi dòng món có tối đa một nhân viên phụ trách và có thể để trống.
- POS chọn hoặc bỏ trống nhân viên theo từng dòng giỏ hàng. Đơn QR luôn để trống cho đến khi nhân viên được gán bởi luồng nội bộ.
- Ghi nhận theo sự kiện thanh toán thành công hoặc sự kiện gán muộn cho dòng đã thanh toán.
- Hàng đợi dòng đã đủ điều kiện nhưng chưa thể ghi nhận do thiếu nhân viên, quy tắc, giá vốn hoặc dữ liệu xung đột.
- Ledger hoa hồng bất biến với entry dương/âm, snapshot và liên kết entry gốc.
- Trả hàng, đổi người hưởng và sửa sai bằng entry điều chỉnh; không sửa trực tiếp entry lịch sử.
- Tích hợp bảng lương bằng allocation có lịch sử, không tính trùng và không sửa bảng lương đã chốt.
- Admin audit, idempotency, khóa đồng thời và realtime invalidation sau commit.

### 2.2 Ngoài phạm vi MVP

- Chia một `OrderItem` cho nhiều người. Nếu cần chia, POS phải tách thành nhiều dòng có số lượng tương ứng trước khi tạo đơn.
- Hoa hồng theo bậc doanh số, chỉ tiêu tháng, tổng số đơn, nhóm nhân viên hoặc chiến dịch.
- Quy tắc kế thừa từ nhóm hàng.
- Nhiều bảng hoa hồng đồng thời cho cùng một nhân viên tại cùng thời điểm.
- Tự động suy đoán nhân viên phục vụ từ tài khoản thu ngân/quản lý.
- Sửa/xóa entry ledger, viết lại bảng lương đã finalized hoặc tự động chi trả hoa hồng.
- Phân bổ chi phí riêng cho modifier; MVP chỉ dùng BOM của món, trong khi doanh thu dòng vẫn gồm giá modifier.
- Quản trị nhiều chi nhánh. Commission dùng branch `MAIN` cho đến khi Order/POS có branch ownership chính thức.

## 3. Thuật ngữ và nguồn sự thật

- **Gán hiện tại:** `OrderItem.commissionEmployeeId`, dùng cho thao tác POS và hiển thị người phụ trách hiện tại.
- **Ghi nhận:** tạo `CommissionEntry` dương khi dòng món đủ điều kiện.
- **Điều chỉnh:** tạo `CommissionEntry` âm hoặc dương liên kết entry gốc do trả hàng, đổi người hoặc sửa sai.
- **Ngày bán:** ngày nghiệp vụ tại `Asia/Ho_Chi_Minh` của lần thanh toán làm đơn đủ điều kiện.
- **Ngày hạch toán:** ngày entry được đưa vào luồng tài chính. Entry điều chỉnh muộn dùng ngày điều chỉnh, không giả mạo ngày bán.
- **Allocation bảng lương:** bản ghi cho biết entry đã được giữ/chốt/giải phóng bởi payroll line nào.
- `CommissionEntry` là nguồn sự thật cho số tiền hoa hồng. `OrderItem.commissionEmployeeId` không phải số dư tài chính và không được dùng để tính lại lịch sử.

## 4. Bất biến nghiệp vụ

1. `commissionEmployeeId` được phép rỗng. Không có nhân viên không làm thất bại thanh toán; dòng được đưa vào hàng đợi.
2. Mỗi `OrderItem` có tối đa một nhân viên phụ trách. Một món chia nhiều người phải được tách thành nhiều dòng trước khi tạo đơn.
3. Việc gán nhân viên không tự tạo tiền. Chỉ sự kiện đủ điều kiện mới tạo entry.
4. Điều kiện MVP là `paymentStatus = PAID` và đơn không bị hủy/void. Các đường thanh toán tiền mặt/thẻ/chuyển khoản, prepayment đặt bàn và cọc trả đủ đều phải gọi cùng một recognition service trong transaction của sự kiện thanh toán.
5. Một dòng món chỉ có một entry ghi nhận gốc cho cùng sự kiện thanh toán. Unique event key và khóa DB ngăn ghi trùng khi retry hoặc request đồng thời.
6. Mỗi return line tạo reversal đúng một lần cho đúng số lượng đã trả. Tổng số lượng return reversal không vượt số lượng còn hiệu lực của entry gốc.
7. Snapshot ghi nhận gồm nhân viên, món, số lượng, căn cứ doanh thu/chiết khấu/giá vốn/lợi nhuận, bảng/rule/version, loại/mức và số tiền kết quả.
8. Đổi cấu hình hoặc hồ sơ sau đó không tính lại entry cũ.
9. Sau ghi nhận, đổi người phải tạo cặp entry âm/dương có cùng correlation key, lý do và actor; không update số tiền entry cũ.
10. Entry điều chỉnh giữ `saleBusinessDate` của giao dịch gốc nhưng dùng `accountingDate` tại thời điểm điều chỉnh.
11. Entry chỉ được allocate vào tối đa một payroll line đang active. Allocation finalized không thể chuyển hoặc xóa.
12. Payroll finalized không bị viết lại. Điều chỉnh phát sinh sau đó ở trạng thái chưa allocate và được kỳ payroll mở tiếp theo nhận.
13. Realtime chỉ phát sau transaction commit. Socket là tín hiệu refetch, không phải nguồn dữ liệu hoàn chỉnh.

## 5. Nhân viên phụ trách ở POS

### 5.1 Dữ liệu gán

Thêm nullable `commissionEmployeeId` vào `OrderItem`, relation `Employee` với `onDelete: SetNull` và index phục vụ hàng đợi.

`createOrderSchema.items[]` nhận `commissionEmployeeId?: number | null`. Backend chỉ chấp nhận nhân viên đang làm việc và đang thuộc một bảng hoa hồng active/effective; trường không hợp lệ trả lỗi, nhưng trường bị bỏ qua hoặc `null` vẫn hợp lệ.

### 5.2 Tự điền an toàn

Không suy đoán từ `Order.createdByUserId`. Một assignment nhân viên trong bảng hoa hồng có cờ `autoAssignOwnPos`. POS chỉ tự điền khi:

- request đã đăng nhập;
- `User` liên kết duy nhất với một `Employee` đang làm việc;
- employee có assignment effective với `autoAssignOwnPos = true`;
- người dùng chưa chủ động chọn người khác hoặc bỏ trống dòng.

Tài khoản thu ngân/quản lý không có cờ này không tự nhận hoa hồng. Đơn QR không có user nội bộ nên luôn tạo dòng chưa gán.

### 5.3 Quyền thao tác

- `CASHIER` và `ADMIN` được đọc danh sách assignee tối thiểu gồm id, mã, tên và bảng áp dụng; không trả attendance code, national ID, lương hoặc tài khoản ngân hàng.
- `CASHIER` và `ADMIN` được chọn nhân viên khi tạo đơn và thay đổi assignment trước khi dòng được ghi nhận.
- Sau khi có entry, chỉ `ADMIN` được đổi người; bắt buộc lý do và tạo ledger adjustment.
- Không có endpoint công khai cho khách QR gán nhân viên.

## 6. Cấu hình bảng hoa hồng

### 6.1 Trạng thái và hiệu lực

`CommissionPlanStatus`: `DRAFT | ACTIVE | ARCHIVED`.

- Draft cho phép chỉnh metadata/rule/assignment trước khi có hiệu lực.
- Active dùng `effectiveFrom` và nullable `effectiveTo` theo ngày nghiệp vụ `Asia/Ho_Chi_Minh`.
- Rule hoặc assignment đã có hiệu lực không bị sửa tại chỗ; thay đổi tạo phiên bản/khoảng hiệu lực mới.
- Archived chỉ đóng tương lai; lịch sử, snapshot và quan hệ ledger được giữ nguyên.
- Tại một ngày, một employee chỉ có tối đa một plan active/effective trong branch. Service khóa employee theo ID tăng dần và kiểm tra overlap trong transaction.

### 6.2 Rule theo món

`CommissionRuleType`:

- `FIXED_PER_UNIT`
- `PERCENT_NET_REVENUE`
- `PERCENT_GROSS_PROFIT`

Mỗi phiên bản rule thuộc `(planId, menuItemId)`, có `effectiveFrom`, nullable `effectiveTo`, `revision`, loại và mức:

- fixed amount là số nguyên VND không âm;
- percentage lưu basis points nguyên từ `0` đến `10000`, trong đó `10000 = 100%`;
- đúng một trong `fixedAmount` hoặc `rateBps` có giá trị theo loại rule.

Một dòng không có rule effective được đưa vào issue `RULE_MISSING`, không dùng fallback nhóm hàng và không tự dùng mức 0.

## 7. Công thức và làm tròn

### 7.1 Phân bổ giảm giá

Với mỗi order đã thanh toán:

- `grossLineRevenue = OrderItem.subtotal`; giá này đã gồm modifier.
- `orderDiscount = min(Order.discountAmount, sum(grossLineRevenue))`.
- Phân bổ discount tỷ lệ theo `grossLineRevenue` bằng phương pháp phần dư lớn nhất.
- Phần nguyên dùng floor; số VND còn lại phân cho dòng có phần dư thập phân lớn hơn, tie-break bằng `OrderItem.id` tăng dần.
- Tổng discount phân bổ phải đúng bằng `orderDiscount`. Nếu tổng gross bằng 0, tất cả allocation bằng 0.
- `netLineRevenue = max(0, grossLineRevenue - allocatedDiscount)`.

VAT, delivery fee, tiền cọc, payment fee và phương thức thanh toán không thuộc căn cứ hoa hồng.

### 7.2 Giá vốn và lợi nhuận

- Giá vốn một đơn vị dùng `calculateRecipeCostOrNull` trên BOM và `Ingredient.costPerUnit` tại thời điểm ghi nhận.
- `costAmount = unitRecipeCost × quantity`.
- BOM rỗng là thiếu dữ liệu, khác với BOM có tổng giá vốn bằng 0.
- `grossProfit = max(0, netLineRevenue - costAmount)`.
- Modifier tăng doanh thu nhưng MVP chưa có modifier cost riêng; giới hạn này phải hiển thị trong mô tả rule lợi nhuận.
- Rule profit thiếu BOM tạo issue `COST_MISSING`; không âm thầm coi giá vốn là 0.

### 7.3 Tiền hoa hồng

- Fixed: `fixedAmount × quantity`.
- Revenue: `round(netLineRevenue × rateBps / 10000)`.
- Profit: `round(grossProfit × rateBps / 10000)`.
- Mỗi entry được làm tròn một lần đến VND. Kết quả không âm.

### 7.4 Trả một phần

Reversal dùng snapshot của earning đang có hiệu lực, không đọc rule/BOM hiện tại. Với mỗi trường tài chính snapshot, phần reversal được tính tỷ lệ theo số lượng trả trên số lượng gốc. Các reversal trước được trừ khỏi tổng; reversal cuối lấy chính xác phần còn lại để tổng các entry âm không vượt và có thể triệt tiêu đúng entry dương.

## 8. Sự kiện ghi nhận và idempotency

### 8.1 Payment recognition

Tạo `CommissionRecognitionService.recognizePaidOrder(tx, orderId, occurredAt)` và gọi bên trong mọi transaction chuyển order sang `PAID`:

- thanh toán POS thông thường;
- thanh toán hoàn toàn bằng cọc;
- xác nhận prepayment/chuyển khoản đặt bàn;
- mọi đường thanh toán mới về sau.

Service khóa order và order items theo ID ổn định. Với mỗi dòng:

- nếu chưa gán nhân viên: upsert issue `UNASSIGNED_EMPLOYEE`;
- không có plan effective: `PLAN_MISSING`;
- overlap plan ngoài dự kiến: `PLAN_CONFLICT`;
- không có rule: `RULE_MISSING`;
- profit rule thiếu cost: `COST_MISSING`;
- đủ dữ liệu: insert earning với event key `ORDER_PAID:<orderId>:<orderItemId>` và resolve issue hiện hữu.

Domain issue không làm rollback thanh toán. Lỗi kỹ thuật trong transaction làm rollback toàn bộ payment để không tồn tại trạng thái `PAID` mà không có earning hoặc issue tương ứng.

### 8.2 Gán muộn và retry

Khi Admin/Cashier gán một dòng đã `PAID` nhưng chưa có earning, assignment transaction gọi cùng recognition service. Admin có endpoint retry issue sau khi sửa rule hoặc BOM. Unique event key khiến retry trả lại kết quả hiện hữu thay vì ghi lần hai.

### 8.3 Sales return

`SalesReturnService.create` gọi `CommissionRecognitionService.reverseReturn(tx, savedReturn)` trong cùng transaction sau khi return lines được khóa/kiểm tra. Mỗi return line tạo entry `RETURN_REVERSAL` với event key `ORDER_RETURN:<returnLineId>:<rootEntryId>`, liên kết root earning và snapshot tỷ lệ. Khóa order item, root entry và các reversal ngăn hai request trả hàng vượt số lượng.

### 8.4 Reassignment sau ghi nhận

Admin gửi employee mới, lý do và idempotency key. Service khóa order item và chuỗi ledger, xác định số lượng còn hiệu lực sau returns, sau đó tạo:

- `REASSIGNMENT_REVERSAL` âm cho employee hiện tại;
- `REASSIGNMENT_EARNING` dương cho employee mới, giữ cùng căn cứ/rule snapshot và số tiền tuyệt đối;
- cập nhật `OrderItem.commissionEmployeeId` sau khi cặp ledger được tạo.

Cả hai entry có `originalEntryId` trỏ root earning và cùng `correlationKey`. Nếu số lượng còn hiệu lực bằng 0, chỉ cập nhật assignment phục vụ hiển thị và audit; không tạo tiền mới.

## 9. Mô hình dữ liệu

### 9.1 CommissionPlan

- `id`, `code`, `name`, `branchId`, `status`
- `effectiveFrom`, `effectiveTo?`
- `createdByUserId`, `createdAt`, `updatedAt`
- `activatedByUserId?`, `activatedAt?`
- `archivedByUserId?`, `archivedAt?`, `archiveReason?`
- optimistic `revision`

### 9.2 CommissionPlanEmployee

- `id`, `planId`, `employeeId`
- `effectiveFrom`, `effectiveTo?`
- `autoAssignOwnPos`
- `createdByUserId`, `createdAt`
- `endedByUserId?`, `endedAt?`, `endReason?`

Assignment history is append-only by effective interval. Application service prevents overlapping active plans for an employee.

### 9.3 CommissionRule

- `id`, `planId`, `menuItemId`, `revision`
- `type`, `fixedAmount?`, `rateBps?`
- `effectiveFrom`, `effectiveTo?`
- `createdByUserId`, `createdAt`
- `endedByUserId?`, `endedAt?`, `endReason?`

Unique/indexes support `(planId, menuItemId, effectiveFrom, revision)` and latest-effective reads.

### 9.4 OrderItem extension

- `commissionEmployeeId?`
- relation đến `Employee` với `onDelete: SetNull`
- index `(commissionEmployeeId, orderId)`

### 9.5 CommissionEntry

`CommissionEntryType`:

- `EARNING`
- `RETURN_REVERSAL`
- `REASSIGNMENT_REVERSAL`
- `REASSIGNMENT_EARNING`

- `id`, unique `eventKey`, `type`, `correlationKey?`, `originalEntryId?`
- source: `orderId`, `orderItemId`, `orderReturnId?`, `orderReturnLineId?`
- `employeeId`, `commissionPlanId`, `commissionRuleId`
- `saleBusinessDate`, `accountingDate`, `occurredAt`
- signed snapshot deltas: `quantityDelta`, `grossRevenueDelta`, `allocatedDiscountDelta`, `netRevenueDelta`, `costAmountDelta`, `grossProfitDelta`, `commissionAmountDelta`
- employee snapshot: code/name
- item snapshot: menu item ID/SKU/name/unit price and modifier snapshot
- rule snapshot: plan code/name, rule revision/type, fixed amount/rate basis points
- `reason?`, `createdByUserId?`, `createdByName?`, `createdAt`

Entries are never updated or deleted by business APIs. `originalEntryId` points to the root earning for reversals/reassignments. Financial fields use signed integers; root earning and reassignment earning are positive, reversals are negative.

### 9.6 CommissionRecognitionIssue

- `id`, unique `orderItemId`
- `type`: `UNASSIGNED_EMPLOYEE | PLAN_MISSING | PLAN_CONFLICT | RULE_MISSING | COST_MISSING`
- `status`: `OPEN | RESOLVED`
- source/order/item summary and diagnostic JSON without secrets
- `firstDetectedAt`, `lastDetectedAt`, `resolvedAt?`, `resolvedByUserId?`

Issue is operational state, not a financial ledger. Upsert prevents duplicate queue rows.

### 9.7 CommissionPayrollAllocation

- `id`, `commissionEntryId`, `payrollBatchId`, `payrollLineId`
- `status`: `RESERVED | FINALIZED | RELEASED`
- `reservedAt`, `finalizedAt?`, `releasedAt?`, `releaseReason?`

Service locks entries before allocation and allows at most one active (`RESERVED` or `FINALIZED`) allocation. Historical released allocations remain readable.

### 9.8 Payroll extensions

Add to `EmployeePayrollLine`:

- `commissionAmount` integer, default 0;
- commission entry/allocation IDs in `sourceSnapshot`.

Add to `EmployeePayrollBatch`:

- `totalCommissionAmount` integer, default 0.

Payroll arithmetic becomes:

`netAmount = max(0, grossAmount + commissionAmount + bonusAmount - deductionAmount)`.

## 10. Payroll integration

- Payroll create/recalculate locks candidate commission entries for each employee.
- Candidate set contains unallocated signed entries with `accountingDate <= periodEnd`. This deliberately carries late or previously unallocated entries into the next available open payroll rather than dropping them because `accountingDate < periodStart`.
- Entries dated after `periodEnd` are excluded.
- Create/recalculate writes `RESERVED` allocations in the same transaction as payroll line snapshots.
- Recalculation of `DRAFT/CALCULATED` releases the batch's prior reservations, rebuilds the candidate set and reserves again atomically.
- Finalize changes the batch's reservations to `FINALIZED` in the same transaction.
- Cancel releases `RESERVED` allocations. If an unpaid finalized batch is cancellable under payroll policy, its finalized allocations become `RELEASED` with reason so a replacement payroll can claim them; ledger entries themselves remain unchanged.
- A new entry affecting an employee with a non-finalized batch emits commission/payroll invalidation and makes payroll source stale until explicit recalculate.
- An entry created after payroll finalization remains unallocated for a later payroll. It never mutates the finalized line.
- Payroll detail/export shows base salary, commission, adjustments and net as separate figures.

## 11. API surface và quyền

### 11.1 Admin configuration/read APIs

All require `ADMIN`:

- `GET /api/employee-commissions/workspace` — plans, category filters, item matrix or employee matrix, pagination and summary.
- `POST /api/employee-commissions/plans`
- `PATCH /api/employee-commissions/plans/:id` — draft metadata or safe name change only.
- `POST /api/employee-commissions/plans/:id/activate`
- `POST /api/employee-commissions/plans/:id/archive`
- `POST /api/employee-commissions/plans/:id/rules` — append rule version.
- `POST /api/employee-commissions/plans/:id/employees` — append/end employee assignment intervals.
- `GET /api/employee-commissions/issues`
- `POST /api/employee-commissions/issues/:id/retry`
- `GET /api/employee-commissions/ledger`
- `POST /api/employee-commissions/order-items/:id/reassign`

### 11.2 POS APIs

- `GET /api/employee-commissions/assignees` — `CASHIER | ADMIN`, minimal working/effective employees and safe default for current user.
- Order creation accepts nullable `commissionEmployeeId` per item.
- `PATCH /api/employee-commissions/order-items/:id/assignment` — `CASHIER | ADMIN` only before recognition; Admin-only after recognition via reassign endpoint.

### 11.3 Stable error codes

At least:

- `COMMISSION_PLAN_OVERLAP`
- `COMMISSION_PLAN_STATE_INVALID`
- `COMMISSION_RULE_INVALID`
- `COMMISSION_EMPLOYEE_INVALID`
- `COMMISSION_ASSIGNMENT_LOCKED`
- `COMMISSION_RECOGNITION_CONFLICT`
- `COMMISSION_RETURN_EXCEEDS_RECOGNIZED`
- `COMMISSION_ENTRY_ALREADY_ALLOCATED`
- `COMMISSION_IDEMPOTENCY_KEY_REUSED`

## 12. Giao diện

### 12.1 Điều hướng

Thêm `Bảng hoa hồng` giữa `Bảng lương` và `Thiết lập nhân viên` trong `EmployeeWorkspaceScreen`. Workspace vẫn Admin-only theo global Nhân viên tab.

### 12.2 Toolbar và desktop layout

- Tiêu đề, ô tìm/thêm món, nút/badge `Chưa gán`, `Cần xử lý`, `Lịch sử`.
- Sidebar khoảng 250–280 px gồm kiểu hiển thị, tìm/danh sách bảng hoa hồng, `Thêm bảng`, tìm/lọc nhóm hàng.
- Main table ở chế độ Hàng hóa: chọn, mã, tên, đơn vị, giá bán chung, giá vốn, lợi nhuận tạm tính và một cột cho mỗi plan đang chọn.
- Cell rule hiển thị `15.000đ/sp`, `5% doanh thu`, `10% lợi nhuận` hoặc `Chưa thiết lập`; chọn cell mở form rule và ngày hiệu lực.
- Chế độ Nhân viên áp dụng: mã/tên/phòng ban/trạng thái, plan, khoảng hiệu lực và cờ tự gán POS.

### 12.3 Plan/rule/assignment forms

- Tạo plan: tên, hiệu lực và trạng thái draft ban đầu.
- Activate kiểm tra rule/assignment hợp lệ và overlap trước khi xác nhận.
- Rule editor chọn đúng một trong ba loại, nhập mức, hiển thị căn cứ tính và cảnh báo modifier cost.
- Thay đổi rule/assignment đã effective yêu cầu ngày áp dụng; server tạo phiên bản mới.
- Pending guard chống submit lặp; lỗi giữ nguyên dữ liệu người dùng.

### 12.4 Hàng đợi và ledger

- `Chưa gán` lọc riêng issue `UNASSIGNED_EMPLOYEE`, hỗ trợ chọn nhiều dòng và gán nhân viên.
- `Cần xử lý` hiển thị plan/rule/cost/conflict issue và hành động phù hợp như mở rule, mở BOM hoặc retry.
- Ledger hiển thị ngày hạch toán, ngày bán, loại entry, employee, order/item, quantity, căn cứ, rule snapshot, số tiền dương/âm, root entry và payroll allocation.
- Ledger read-only. Reassign/sửa sai mở modal yêu cầu lý do; không có edit/delete entry.

### 12.5 POS và responsive

- Mỗi cart row nội bộ có control nhân viên phụ trách, mặc định rỗng trừ khi API trả safe default.
- Hai cart row cùng món nhưng khác employee không được merge.
- Customer QR UI không hiển thị selector và payload để trống.
- Desktop giữ bảng rộng/horizontal scroll. Dưới 820 px, sidebar trở thành filter drawer, plan là selector và item hiển thị dạng card/compact rows; modals xếp dọc.
- Dùng token ThemeContext, typography, spacing, focus state và UI primitives hiện hữu. Không sao chép header/branding KiotViet.
- Có keyboard focus, accessibility roles/states, empty/error/loading states và thông báo rõ cách khắc phục.

## 13. Audit và realtime

Audit trong transaction cho:

- plan create/update/activate/archive;
- rule version create/end;
- employee assignment create/end;
- pre-recognition order-item assignment;
- earning, return reversal và reassignment pair;
- issue retry/resolve;
- payroll allocation reserve/finalize/release.

Audit metadata chứa ID, before/after, lý do và version nhưng không chứa attendance code, national ID, bank account hoặc secret.

Realtime event `employee-commission:changed` gồm revision, branch ID, affected plan/employee/order-item IDs và reason enum. Frontend tăng `employeeCommissionRevision` rồi refetch. Payroll lắng nghe revision này để đánh dấu/refetch nguồn non-finalized; finalized payroll không thay đổi.

## 14. Concurrency, bảo mật và phục hồi

- Dùng MySQL row locks theo thứ tự ổn định: order → order items → employee/plan/rule → root entries → allocations.
- Unique `CommissionEntry.eventKey` bảo vệ exactly-once; mutation retry-sensitive yêu cầu `Idempotency-Key` và request digest.
- Plan assignment overlap được kiểm tra lại sau khi lock employee.
- Return reversal khóa root chain và cộng quantity đã reversal trước khi insert.
- Reassignment tạo cặp âm/dương, update assignment và audit trong một transaction.
- Payment/return không phát socket trước commit.
- Domain issue được ghi nhận mà không làm thất bại payment; technical failure rollback transaction.
- Không tin số tiền/rate/base do client gửi. Backend tải order, item, discount, BOM, plan và rule từ DB.
- Management/ledger/payroll integration Admin-only; POS chỉ nhận DTO nhân viên tối thiểu.

## 15. Migration và rollout

- Migration additive: enum/table/index/relation commission; nullable field trên OrderItem; commission fields trên payroll batch/line.
- Không xóa hoặc viết lại order/payroll lịch sử.
- Order items cũ được backfill `commissionEmployeeId = null`; không retroactively tạo earning.
- Plan dùng branch `MAIN`; migration không gán branch cho Order vì multi-branch order nằm ngoài phạm vi.
- Chỉ validate/apply migration và chạy DB integration/concurrency trên `TEST_DATABASE_URL` đã xác minh tách biệt.
- Không reset/seed/drop hoặc dùng fallback sang `DATABASE_URL` trong test.
- DEV migration cần kiểm thử nghiệm thu và ủy quyền rollout rõ ràng; push cần yêu cầu riêng.
- Rollout order: migration → backend recognition/API → payroll integration → frontend workspace/POS. Backend phải tương thích client cũ vì trường commission item là optional.

## 16. Chiến lược kiểm thử

### 16.1 Domain/unit

- Largest-remainder discount allocation, tie-break và tổng bằng discount order.
- Ba công thức, basis points, rounding một lần, zero/negative profit.
- BOM rỗng khác BOM giá vốn 0.
- Partial reversal, nhiều lần trả và last-reversal remainder.
- Effective plan/rule/assignment selection và overlap.
- Reassignment chain và signed ledger aggregation.
- Payroll candidate carry-forward và allocation transitions.

### 16.2 Database/API integration

- Admin authorization cho configuration/issue/ledger/reassign; minimal Cashier assignee access.
- Nullable assignment và validation employee.
- Mọi đường chuyển `PAID` tạo earning hoặc issue trong cùng transaction.
- Retry payment/recognition không tạo entry thứ hai.
- Gán muộn cho paid item ghi nhận đúng một lần.
- Concurrent return requests không reversal vượt quantity.
- Return dùng snapshot cũ sau khi rule/BOM đổi.
- Reassignment tạo cặp cân bằng, lý do/audit và payroll accounting date đúng.
- Plan overlap dưới concurrent activation/assignment.
- Payroll create/recalculate/finalize/cancel reserve/finalize/release allocation đúng và không double include.
- Finalized payroll không đổi khi có late reversal; kỳ sau nhận entry carry-forward.

### 16.3 Frontend

- Workspace tab và default section hiện hữu không đổi.
- Item/employee view, plan/category/search filters và matrix cells.
- Plan/rule/assignment effective-date forms và pending/error preservation.
- Unassigned/issues queues, bulk assignment và retry.
- Ledger signed values, snapshot detail, allocation badges và reassign modal.
- POS default chỉ khi safe default được trả; manual null/selection; QR không có selector.
- Hai cart rows khác employee không merge.
- Realtime refetch không đóng modal hoặc mất form đang nhập.
- Desktop/compact layout, accessibility và horizontal scroll.

### 16.4 Regression và verification

- Orders/payment/prepayment/reservation, sales return, inventory/BOM và POS/QR suites.
- Employee directory/settings, payroll calculation/lifecycle/payment và full frontend suites.
- Prisma validate/migrate status trên TEST, typecheck, lint, build, `git diff --check`, secret scan và requirement audit.

## 17. Tiêu chí nghiệm thu

- Admin cấu hình được plan, employee assignments và ba loại rule theo món với lịch sử hiệu lực.
- POS có thể để trống hoặc gán employee theo dòng; không tự gán thu ngân/quản lý khi chưa được cấu hình.
- Mọi payment path tạo đúng một earning hoặc một issue xử lý được.
- Trả hàng và reassignment tạo signed entries dựa trên snapshot; lịch sử không bị sửa.
- Tổng reversal quantity không thể vượt quantity đã ghi nhận ngay cả khi request đồng thời.
- Ledger giải thích được mọi số tiền bằng snapshot và liên kết nguồn/root/payroll.
- Payroll nhận mỗi entry tối đa một lần, tách commission khỏi base salary và không sửa finalized batch.
- Điều chỉnh muộn được carry forward vào payroll mở tiếp theo.
- UI bám bố cục tham chiếu nhưng đồng bộ theme, responsive và accessibility của Crispy Bite.
- TEST migration, focused/concurrency/regression tests, typecheck, lint và production build đạt yêu cầu trước DEV rollout.
