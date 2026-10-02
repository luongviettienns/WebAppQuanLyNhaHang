# Đặc tả thiết kế — Báo cáo cuối ngày

## Trạng thái và mục tiêu

Thiết kế này đã được người dùng duyệt về kiến trúc, quy tắc nguồn dữ liệu, giao diện, xử lý lỗi và chiến lược kiểm thử. Tài liệu là nguồn quyết định chính thức cho việc lập implementation plan; chưa cho phép bỏ qua bước lập kế hoạch hoặc tự chạy migration trên database dùng chung.

Mục tiêu là xây dựng trang Báo cáo cuối ngày cho Admin, đồng bộ với dữ liệu thật của Đơn hàng, Thanh toán, Trả hàng, Sổ quỹ, Kho, Khách hàng và Nhân viên. Báo cáo phải trả lời chính xác hoạt động phát sinh trong một ngày nghiệp vụ, không gom theo ngày tạo đơn và không cộng trùng một giao dịch xuất hiện ở nhiều bảng nguồn.

Trang có năm mối quan tâm:

1. Bán hàng.
2. Thu chi.
3. Hàng hóa.
4. Hủy món.
5. Tổng hợp.

Ba trục nguồn chính là Bán hàng, Thu chi và Hàng hóa. Hủy món là luồng audit riêng của vận hành bán hàng; Tổng hợp chỉ tổng hợp lại bốn tập dữ liệu đã chuẩn hóa, không chạy một công thức độc lập có thể lệch với các báo cáo con.

## Bối cảnh hệ thống

- Frontend là Expo/React Native, chạy Web và native. Backend là Express, Prisma và MySQL.
- ADMIN hiện có tab `reports` trỏ trực tiếp tới `DashboardScreen`. Backend hiện chỉ có `GET /api/reports/daily`, tổng hợp đơn theo `createdAt`; đây không phải hợp đồng đúng cho Báo cáo cuối ngày mới.
- `Order`, `OrderPaymentTransaction`, `OrderReturn`, `CashVoucher`, `InventoryTransaction`, `Customer`, `Employee`, `DiningTable`, `TableArea` và các luồng Cashbook liên quan đã tồn tại.
- `Branch` hiện chỉ làm nền tảng cho workforce; Order, Cashbook và Inventory chưa branch-scoped. MVP của nhà hàng là một phạm vi vận hành toàn cục.
- Hai database local được cấu hình đang chậm hơn migration history của checkout. Không được reset, migrate cưỡng bức, retrofit hay dùng chúng làm bằng chứng migration sạch.
- Ảnh KiotViet chỉ là tham chiếu cho bố cục và thuật ngữ. Giao diện phải dùng design system Crispy Bite, không sao chép thương hiệu hoặc coi nội dung ảnh là quy tắc nghiệp vụ.

## Phạm vi

### Bao gồm

- `ReportsWorkspaceScreen` có tám menu con: Cuối ngày, Bán hàng, Hàng hóa, Khách hàng, Nhà cung cấp, Nhân viên, Kênh bán hàng và Tài chính.
- Cuối ngày là trang mặc định. `DashboardScreen` hiện tại được giữ lại dưới menu Bán hàng để tránh hồi quy. Sáu menu chưa có nguồn đầy đủ xuất hiện đúng vị trí nhưng ở trạng thái chưa khả dụng; không hiển thị số liệu giả.
- Trang Cuối ngày có năm mối quan tâm, hai kiểu hiển thị Dọc/Ngang, bộ lọc theo nguồn thật, in và xuất XLSX.
- API snapshot nhất quán cho summary, rows, pagination, filter options và metadata.
- Thêm `Order.receivedByEmployeeId` và lịch sử append-only `OrderItemCancellation`.
- Bổ sung index phục vụ các timestamp nghiệp vụ và bộ lọc đã duyệt.
- Kiểm thử migration/API/concurrency trên MySQL cô lập từ baseline xác định.

### Không bao gồm

- Xây dựng sáu trang báo cáo còn lại ngoài Cuối ngày và dashboard Bán hàng hiện có.
- Đa chi nhánh cho Order/Cashbook/Inventory. Bộ lọc chi nhánh chỉ hiển thị “Nhà hàng chính” ở trạng thái khóa.
- Giao diện vận hành cho phép hủy riêng từng dòng món. Nguồn `OrderItemCancellation` trong lát này được ghi khi hủy toàn bộ đơn và được thiết kế sẵn để luồng hủy món riêng dùng về sau.
- Bảng snapshot/materialized report, data warehouse, cron tổng hợp hoặc sao chép số liệu tài chính sang bảng report.
- Thay đổi nguyên tắc ghi nhận doanh thu, giá vốn, thanh toán, trả hàng hoặc Sổ quỹ ngoài phạm vi cần thiết để tạo nguồn báo cáo đúng.
- Áp migration lên DEV/TEST đang lệch schema, database production hoặc database không xác minh được danh tính.

## Thuật ngữ và quy tắc thời gian

### Ngày nghiệp vụ

- Múi giờ cố định của lát này là `Asia/Ho_Chi_Minh`; implementation có thể đọc từ `BUSINESS_TIMEZONE` nhưng giá trị mặc định và acceptance là múi giờ này.
- Ngày `YYYY-MM-DD` dùng khoảng nửa mở `[from, to)`: `from` là 00:00:00 của ngày chọn, `to` là 00:00:00 của ngày kế tiếp theo giờ Việt Nam.
- Nếu người dùng chọn khoảng giờ trong ngày, `from` và `to` vẫn là hai mốc tuyệt đối trong cùng ngày nghiệp vụ. `from < to` là bắt buộc; không hỗ trợ khoảng qua nửa đêm trong lát này.
- Bản ghi đúng tại `from` được tính. Bản ghi đúng tại `to` không được tính.
- Không dùng `createdAt` của Order thay cho timestamp nghiệp vụ.

### Timestamp theo loại nghiệp vụ

| Nghiệp vụ | Timestamp dùng để chọn ngày | Ghi chú |
|---|---|---|
| Hóa đơn bán hoàn tất | `Order.completedAt` | Chỉ `status=COMPLETED`; đơn tạo hôm trước nhưng hoàn tất hôm nay thuộc hôm nay. |
| Thanh toán đơn | `OrderPaymentTransaction.confirmedAt` | Chỉ `status=SUCCESS`; mỗi transaction là một giao dịch, không gộp theo Order. |
| Trả hàng | `OrderReturn.returnedAt` | Chỉ `status=COMPLETED`; không hồi tố về ngày bán. |
| Hoàn tiền trả hàng | `OrderReturn.completedAt` trong mô hình hiện tại | Đây là thời điểm hoàn tiền/hoàn tất hiện có; DTO gọi rõ `refundCompletedAt`. Nếu sau này tách RefundTransaction thì chuyển sang timestamp transaction đó. |
| Cọc/hoàn cọc | `ReservationDepositTransaction.confirmedAt` | Chỉ `status=SUCCESS`; `APPLY_TO_BILL` và `FORFEIT` không tự tạo dòng tiền mới. |
| Sổ quỹ độc lập | `CashVoucher.occurredAt` | Chỉ `status=POSTED`. |
| Kho/hàng hóa | `InventoryTransaction.createdAt` | Đây là timestamp phát sinh ledger kho hiện có. |
| Hủy món/đơn | `OrderItemCancellation.cancelledAt`; fallback `Order.cancelledAt` | Không dùng ngày tạo đơn. |

Ví dụ: cọc được xác nhận hôm nay cho bữa ăn ngày mai xuất hiện trong Thu chi hôm nay, nhưng chưa tạo doanh thu Bán hàng hôm nay. Khi hóa đơn hoàn tất ngày mai, doanh thu thuộc ngày mai; `APPLY_TO_BILL` không được coi là một lần thu tiền thứ hai.

## Snapshot nhất quán

### Định nghĩa kỹ thuật

Một response báo cáo là một read snapshot duy nhất:

- Backend chuẩn hóa đúng một bộ `from`, `to`, `timezone`, concern và filters trước khi đọc dữ liệu.
- `summary`, `rows`, `pagination`, `filterOptions` và các invariant Tổng hợp chạy trong cùng một read-consistent transaction MySQL với isolation `REPEATABLE READ` hoặc mức mạnh hơn.
- Transaction lấy `asOf` từ database clock ở đầu transaction. Tất cả truy vấn trong request nhìn cùng database snapshot; không ghép các lần đọc độc lập bên ngoài transaction.
- `generatedAt` được tạo khi server hoàn thành payload. `asOf` là mốc snapshot; `generatedAt` là mốc response được sinh. Hai trường không bị đánh đồng.
- Không trả partial response. Nếu một phần snapshot thất bại, toàn request thất bại và frontend giữ snapshot thành công gần nhất nếu có.

Metadata tối thiểu:

```ts
interface EndOfDayReportMetadata {
  date: string;
  from: string;
  to: string;
  timezone: 'Asia/Ho_Chi_Minh';
  asOf: string;
  generatedAt: string;
  concern: 'SALES' | 'CASHFLOW' | 'GOODS' | 'CANCELLED_ITEMS' | 'SUMMARY';
  view: 'VERTICAL' | 'HORIZONTAL';
  branch: { id: 1; code: 'MAIN'; name: 'Nhà hàng chính'; locked: true };
}
```

`branch` là metadata giao diện cho phạm vi nhà hàng duy nhất, không phải tuyên bố Order đã branch-scoped.

## Thiết kế dữ liệu

### `Order.receivedByEmployeeId`

- Nullable foreign key tới `Employee`, quan hệ `RESTRICT` để lịch sử không mất do xóa cứng. Hệ thống hiện dùng trạng thái nghỉ việc thay vì xóa nhân viên.
- `createdByUserId` là tài khoản tạo đơn; `receivedByEmployeeId` là nhân viên đầu tiên nhận hoặc xác nhận đơn. Hai trường độc lập và có hai bộ lọc riêng.
- Đơn do nhân viên đăng nhập tạo trực tiếp: backend tìm hồ sơ Employee liên kết `userId` và tự gán nếu hồ sơ tồn tại. Không có hồ sơ liên kết thì để `NULL`, không lấy tên text làm nguồn chính.
- Đơn khách tạo qua QR: để `NULL`. Lần chuyển trạng thái có xác thực đầu tiên thể hiện nhận/xác nhận đơn sẽ thử gán từ Employee liên kết với actor.
- Gán bằng conditional update trong transaction với điều kiện `receivedByEmployeeId IS NULL`. Hai request đồng thời chỉ một request ghi được; request thua không ghi đè người nhận đầu tiên.
- Sau khi khác `NULL`, mọi thao tác bàn giao hoặc đổi người phụ trách không được thay đổi trường này. Nhu cầu “người đang phụ trách” tương lai dùng `assignedEmployeeId` hoặc bảng lịch sử riêng.
- Không backfill dữ liệu lịch sử từ `createdByUserId`. UI và export hiển thị “Chưa xác định”.
- Index tối thiểu phục vụ filter theo người nhận và `completedAt`.

### `OrderItemCancellation`

Bảng append-only mới lưu:

- `id`, `orderId`, `orderItemId`, `menuItemId`.
- Snapshot `menuItemSku`, `menuItemName`, `quantity`, `unitPrice`, `lineAmount`.
- `reason`, `cancelledAt`, `cancelledByUserId`.
- `orderStatusSnapshot` và `preparationStateSnapshot` (`NOT_STARTED`, `PREPARING`, `READY`, `UNKNOWN`). Trong lát này, preparation snapshot được suy ra từ trạng thái Order tại lúc void; không tuyên bố có line-level KDS state khi hệ thống chưa có.
- `inventoryEffect` (`NONE`, `RESTORED`, `WASTE_RECORDED`) và liên kết nguồn đủ để đối chiếu `VOID_RESTORE`/waste khi có.
- `source` (`ORDER_VOID`; dự phòng `ITEM_CANCEL` cho feature sau), `createdAt`.

Quy tắc:

- Hủy toàn bộ đơn tạo một cancellation record cho mỗi OrderItem hiện có của đơn trong cùng transaction với cập nhật Order và hoàn nguyên kho. Ở lát này hệ thống chưa có trạng thái hủy riêng trên từng OrderItem, vì vậy “hiện có” nghĩa là toàn bộ OrderItem thuộc đơn; unique/idempotency constraint ngăn cùng một lần `ORDER_VOID` ghi trùng dòng. Một lỗi làm toàn bộ rollback.
- Bản ghi không được update/delete. Sửa lý do bằng cơ chế correction/reversal riêng nếu sau này cần, không viết đè lịch sử.
- Báo cáo ưu tiên cancellation records. Với Order lịch sử có `status=CANCELLED`, `cancelledAt` trong khoảng và chưa có cancellation records, service dựng legacy rows từ OrderItem, gắn `source=LEGACY_ORDER_VOID`, `dataQuality=HISTORICAL_FALLBACK`.
- Nếu đã có ít nhất một cancellation record của Order, không sinh fallback cho Order đó; không double count.

## Kiến trúc backend

### Service boundary

Tạo `EndOfDayReportService` trong module reports. Service nhận query đã validate, mở read-consistent transaction, gọi concern adapter tương ứng và trả contract chuẩn hóa. Mỗi adapter có một nhiệm vụ:

- `SalesReportAdapter` — hóa đơn hoàn tất và trả hàng.
- `CashflowReportAdapter` — các money events chuẩn hóa và liên kết CashVoucher.
- `GoodsReportAdapter` — dòng món bán và inventory ledger.
- `CancelledItemsReportAdapter` — cancellation mới và fallback lịch sử.
- `SummaryReportAdapter` — kết hợp chính các normalized datasets trên; không truy vấn công thức cạnh tranh.

Adapter trả `records`, `summary`, `facets/filterOptions` và invariant counters qua interface chung. Mapping DTO tách khỏi Prisma rows để test không phụ thuộc chi tiết ORM.

### Endpoint đọc

`GET /api/reports/end-of-day`

Query:

- `date=YYYY-MM-DD` bắt buộc hoặc mặc định ngày hiện tại theo business timezone.
- `fromTime=HH:mm`, `toTime=HH:mm` tùy chọn; mặc định toàn ngày.
- `concern=SALES|CASHFLOW|GOODS|CANCELLED_ITEMS|SUMMARY`.
- `view=VERTICAL|HORIZONTAL`.
- Bộ lọc nullable: `customerId`, `receiverEmployeeId`, `creatorUserId`, `paymentMethods`, `delivery`, `areaId`, `tableId`, `cancelReason`, `recordTypes`, `search`.
- `page` mặc định 1; `pageSize` mặc định 50, tối đa 200; sort chỉ cho allow-list theo concern.

Response:

```ts
interface EndOfDayReportResponse<Row, Summary> {
  metadata: EndOfDayReportMetadata;
  hasData: boolean;
  summary: Summary;
  rows: Row[];
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number };
  filterOptions: EndOfDayFilterOptions;
}
```

- `hasData` dựa trên số event/record của concern, không dựa trên aggregate khác 0.
- Một ngày có nghiệp vụ nhưng `netCashFlow=0` vẫn có `hasData=true` và hiển thị số 0 hợp lệ.
- Empty state chỉ khi `hasData=false`.
- Filter options là faceted options: dùng cùng date/concern và tất cả filter đang chọn ngoại trừ chính dimension đang liệt kê. Chúng vẫn nằm trong cùng snapshot.

### Endpoint export

`GET /api/reports/end-of-day/export?format=xlsx` dùng cùng schema/parser và cùng service filters với endpoint màn hình; không có một bộ semantics riêng.

- Export bỏ pagination của màn hình và lấy toàn bộ rows trong đúng một ngày/khoảng giờ đã chọn.
- XLSX tối đa 50.000 dòng và giới hạn kích thước bộ nhớ cấu hình. Nếu vượt giới hạn, trả lỗi domain `REPORT_EXPORT_TOO_LARGE` cùng `estimatedRows` và hướng dẫn thu hẹp bộ lọc; không cắt file im lặng.
- Workbook có sheet dữ liệu, sheet tóm tắt/metadata, `from`, `to`, timezone, `asOf`, `generatedAt`, filters và quality flags.
- Tổng số dòng và aggregate export phải khớp endpoint màn hình với cùng filters/asOf trong test fixture ổn định. Export request thực tế tạo snapshot mới và công khai `asOf` riêng.
- In dùng layout report hiện tại và metadata của snapshot đang hiển thị. Nếu người dùng muốn in toàn bộ detail ngoài page hiện tại, frontend gọi payload/print path có cùng giới hạn bảo vệ; không giả vờ đã in các hàng chưa tải.

### Phân quyền và lỗi

- `GET /api/reports/end-of-day` và export yêu cầu authenticate + `ADMIN` như reports hiện tại.
- Validation lỗi trả `400 VALIDATION_ERROR`; thiếu auth `401`; sai role `403`; export quá lớn dùng `413 REPORT_EXPORT_TOO_LARGE`; lỗi hệ thống theo envelope hiện có.
- Không log token, dữ liệu nhạy cảm của khách hàng, số tài khoản đầy đủ hoặc plaintext attendance code.
- Query và export không ghi dữ liệu, không tự chữa/migrate schema.

## Nguồn dữ liệu và công thức

### Bán hàng

Tập record gồm:

- Invoice rows: `Order.status=COMPLETED`, `completedAt in [from,to)`.
- Return rows: `OrderReturn.status=COMPLETED`, `returnedAt in [from,to)`.

KPI:

- `completedInvoiceCount`: số Order hoàn tất trong khoảng.
- `grossInvoiceValue`: tổng `Order.finalAmount` của invoice rows. Đây là giá trị hóa đơn cuối cùng, không phải tiền đã thu trong ngày.
- `salesReturnValue`: tổng `OrderReturn.totalRefundDue` của return rows. `refundedAmount` thuộc cashflow thực trả và có thể khác số cần trả.
- `netInvoiceValue = grossInvoiceValue - salesReturnValue`.
- Các breakdown `goodsAmount`, `discountAmount`, `vatAmount`, `deliveryFee` lấy snapshot Order tương ứng và luôn có nhãn rõ.

Payment-method filter của Bán hàng chọn Order có ít nhất một `OrderPaymentTransaction.status=SUCCESS` với phương thức đã chọn. Chỉ dùng `Order.paymentMethod` làm legacy fallback khi Order không có payment transactions; response gắn quality flag cho fallback. Filter không thay đổi timestamp ghi nhận doanh thu: Order vẫn phải hoàn tất trong `[from,to)`.

### Thu chi và chống double count

Cashflow adapter chuẩn hóa một money event registry:

| Nguồn | Điều kiện | Timestamp | Hướng |
|---|---|---|---|
| `OrderPaymentTransaction` | `SUCCESS` | `confirmedAt` | Thu |
| Reservation deposit | `SUCCESS`, type `DEPOSIT` | `confirmedAt` | Thu |
| Reservation refund | `SUCCESS`, type `REFUND`/`PARTIAL_REFUND` | `confirmedAt` | Chi |
| Reservation `APPLY_TO_BILL`/`FORFEIT` | mọi trạng thái | Không tạo cash event | Không cộng |
| OrderReturn refund | `COMPLETED`, `refundedAmount>0` | `completedAt` | Chi |
| `CashVoucher` manual/standalone | `POSTED` | `occurredAt` | Theo `direction` |
| CashVoucher tích hợp nguồn khác | `POSTED` | timestamp domain nếu có; nếu không có dùng `occurredAt` | Theo `direction` |

Deduplication:

- Khóa chuẩn là `(sourceType, sourceTransactionId)` hoặc `sourceKey` ổn định.
- Nếu CashVoucher liên kết một domain transaction, response có đúng một money event; domain transaction quyết định business timestamp, voucher cung cấp ledger/account/category/reference.
- CashVoucher `MANUAL` hoặc không liên kết domain event là một event độc lập theo `occurredAt`.
- Domain transaction thành công chưa có CashVoucher vẫn xuất hiện một lần với `reconciliationStatus=UNRECONCILED`; không che giấu tiền thật và không tạo voucher trong request đọc.
- Voucher đã `CANCELLED` không tạo event; reversal `POSTED` là event đảo dấu riêng theo `occurredAt` và có liên kết reversal.

KPI gồm tổng thu, tổng chi, thuần, breakdown theo payment method/account/category/source và số unreconciled. `netCashFlow=0` là dữ liệu hợp lệ khi có events bù nhau.

### Hàng hóa

Goods adapter có hai record kind:

- `SALE_ITEM`: OrderItem thuộc Order hoàn tất trong `[from,to)` theo `Order.completedAt`; dùng snapshot quantity/unitPrice/subtotal để phản ánh món bán.
- `INVENTORY_EVENT`: InventoryTransaction trong `[from,to)` theo `createdAt`; giữ signed quantity, absolute/signed cost được diễn giải theo type.

Mapping ledger:

- `STOCK_IN`: nhập tăng.
- `PURCHASE_RETURN`: xuất trả nhà cung cấp.
- `AUTO_DEDUCT`: xuất theo bán hàng.
- `KITCHEN_WASTE`: xuất hủy/hao hụt.
- `MANUAL_ADJUST`: tăng hoặc giảm theo dấu quantity.
- `VOID_RESTORE`: nhập hoàn khi hủy.
- `SALES_RETURN`: nhập hoàn do khách trả.

KPI bán món và KPI biến động nguyên liệu tách nhãn; không cộng số lượng món với đơn vị nguyên liệu. Giá vốn bán, giá trị trả kho, xuất hủy và điều chỉnh lấy `costAmount` với sign/type rõ ràng.

### Hủy món

- Nguồn chính: `OrderItemCancellation.cancelledAt in [from,to)`.
- Nguồn fallback: Order lịch sử `CANCELLED` theo `cancelledAt`, chưa có cancellation records.
- KPI: số order có hủy, số dòng món hủy, tổng quantity, giá trị dòng món chưa ghi nhận doanh thu, breakdown lý do/người hủy/preparation state/inventory effect và số fallback rows.
- Hủy món không được trừ doanh thu nếu Order chưa từng được ghi nhận doanh thu. Nếu có future item-cancel trên Order đã hoàn tất, quy tắc kinh tế phải đi qua Return/adjustment flow; không âm thầm sửa invoice lịch sử.

### Tổng hợp

- Tái sử dụng normalized outputs của Sales, Cashflow, Goods và CancelledItems trong cùng transaction.
- Không cộng `netInvoiceValue` và `netCashFlow` thành một “tổng tiền”; hai đại lượng được trình bày riêng.
- `netSalesCogs = abs(AUTO_DEDUCT cost) - abs(SALES_RETURN cost)` từ các inventory events phát sinh trong khoảng. Giá trị trả kho làm giảm giá vốn; không lấy `SALE_ITEM` để tính giá vốn lần thứ hai.
- `estimatedGrossProfit = netInvoiceValue - netSalesCogs`. Tên trường và nhãn phải có chữ “ước tính” vì doanh thu và ledger kho cùng tuân theo timestamp nghiệp vụ của chính chúng, không giả định đây là kỳ kế toán đã khóa sổ.
- `operatingContributionAfterWaste = estimatedGrossProfit - kitchenWasteCost`. `kitchenWasteCost` vẫn hiển thị riêng; không nhập nó vào `netSalesCogs` hoặc gắn nhãn sai là giá vốn bán hàng.
- Dashboard cũ có thể tiếp tục dùng contract `grossProfit` trong giai đoạn chuyển tiếp, nhưng Báo cáo cuối ngày không tái sử dụng nhãn kế toán mơ hồ đó. Các CashVoucher chi khác trình bày riêng, không tự gọi là lợi nhuận ròng khi hệ thống chưa có kế toán đầy đủ.
- Invariant bắt buộc: tổng hàng Tổng hợp cho từng domain khớp summary của concern tương ứng trong cùng response snapshot.

## Giao diện

### Điều hướng

- Giữ `RoleTabs` và command bar hiện có. Desktop vẫn dùng rail “Khu vực làm việc”; tablet dùng thanh ngang; mobile dùng bottom navigation như hệ thống.
- Bên trong Reports, sub-navigation tám mục dùng pattern của Orders/Employee workspace. Cuối ngày active mặc định; Dashboard hiện có nằm ở Bán hàng.
- Menu chưa triển khai bị disabled và không điều hướng tới placeholder có số liệu giả.

### Bố cục Cuối ngày

Desktop:

```text
ScreenHeader: Báo cáo cuối ngày                 In · Xuất XLSX · Làm mới
Subnav 8 báo cáo
┌─ Bộ lọc 272 px ─┐  ┌─ Nền sunken / toolbar report ───────────────┐
│ Mối quan tâm ▼  │  │ ┌─ Tờ báo cáo trắng, in được ────────────┐ │
│ Kiểu dọc/ngang  │  │ │ metadata · tiêu đề · KPI · table       │ │
│ Chi nhánh khóa  │  │ │ breakdown · data-quality note          │ │
│ Ngày + từ/đến   │  │ └────────────────────────────────────────┘ │
│ Filters theo    │  └─────────────────────────────────────────────┘
│ concern         │
└─────────────────┘
```

- Mối quan tâm là selector/dropdown đúng thứ tự: Bán hàng, Thu chi, Hàng hóa, Hủy món, Tổng hợp.
- Báo cáo dọc là overview/KPI và breakdown theo concern. Báo cáo ngang là bảng chi tiết, phân trang và ưu tiên chiều rộng dữ liệu.
- Filter không áp dụng cho concern hiện tại được ẩn, không disabled lộn xộn. Chi nhánh hiển thị khóa và giải thích phạm vi một nhà hàng.
- Toolbar viewer chỉ chứa hành động có chức năng thật. Không đặt các icon giả chỉ để giống ảnh tham chiếu.

Responsive:

- Dưới breakpoint tablet, filter panel chuyển lên trên hoặc mở/đóng bằng nút “Bộ lọc”.
- Mobile dùng touch target tối thiểu 44 px; Từ/Đến có thể cùng hàng khi đủ rộng, còn lại xếp một cột.
- Tờ report không bị thu nhỏ đến mức chữ không đọc được. KPI chuyển 2 cột; bảng detail cuộn ngang có kiểm soát; mọi hành động vẫn truy cập bằng bàn phím/cảm ứng.

### Design system

- Palette dùng semantic token hiện có: primary `#B42318`, secondary/warning `#C66A15`, canvas `#F4F3F0`, surface `#FFFFFF`, ink `#24211F`, border `#D8D4CE`, highlight `#FFF1DD`; dark mode dùng `darkTheme`, không hard-code nền sáng cho chrome ứng dụng.
- Inter dùng cho nhãn/nội dung; Barlow Condensed đậm dùng cho `ScreenHeader`, mã chứng từ và số vận hành. Số dùng tabular numerals.
- Spacing 4/8/12/16/24/32, radius chủ đạo 8 px. Không thêm font/dependency mới.
- Điểm nhận diện duy nhất là “tờ báo cáo vận hành” nằm trên surface sunken; phần còn lại giữ phẳng, không thêm gradient, dashboard-card kit hoặc animation trang trí.
- Bản in luôn nền trắng/chữ tối để ổn định trên giấy, nhưng chrome và filter hỗ trợ đầy đủ light/dark theme.

## Trạng thái UI và lỗi

- Lần tải đầu: loading giữ kích thước bố cục; success hiển thị snapshot; failure hiển thị `InlineAlert`, nguyên nhân có thể hành động và nút Thử lại.
- Refresh: giữ snapshot thành công gần nhất. Nếu thất bại, không thay số bằng 0/null và không nhận partial response; hiển thị cảnh báo stale với `generatedAt` gần nhất và thời điểm thử refresh.
- Khi request mới thành công, thay toàn bộ snapshot nguyên tử và bỏ stale warning.
- Empty state dùng `hasData=false`, thông điệp riêng theo concern và gợi ý đổi ngày/bộ lọc. Snapshot có rows/events nhưng aggregate bằng 0 vẫn render báo cáo đầy đủ.
- Đổi concern/filter/date hủy hoặc bỏ qua response cũ khi request về sai thứ tự; chỉ request mới nhất được commit vào state.
- Export/print disabled trong initial loading/error không có snapshot; vẫn có thể export snapshot cũ khi refresh fail nhưng UI phải ghi rõ timestamp snapshot.

## Hiệu năng và index

- Detail API phân trang; summary không được tính từ page hiện tại.
- Query chỉ select trường cần cho DTO; không tải toàn bộ nested relations rồi aggregate trong Node nếu SQL/grouping phù hợp hơn.
- Index tối thiểu được review trong migration: Order `(status, completedAt)`, receiver/date filter; payment transaction `(status, confirmedAt, paymentMethod)`; OrderReturn `(status, returnedAt)` và refund completion; CashVoucher `(status, occurredAt)` cùng source key; InventoryTransaction `(createdAt, type)`; cancellation `(cancelledAt, orderId)` và actor/reason filter phù hợp.
- Không tạo index trùng với index hiện có; implementation plan phải kiểm kê migration/schema trước khi chốt SQL.
- Timeout/query limits theo config; lỗi export lớn là lỗi có hướng dẫn, không OOM hoặc cắt dữ liệu im lặng.

## Migration và an toàn môi trường

- Migration chỉ cộng thêm `receivedByEmployeeId`, relation/index và bảng/enum/index cancellation; không drop/rename/overwrite bảng hiện có.
- Review SQL migration và chạy từ một baseline sạch, xác định được toàn bộ migration history.
- Chỉ dùng MySQL cô lập với datadir/schema/port riêng, được xác minh không trùng service DEV/TEST đang chạy. `TEST_DATABASE_URL` cho process test phải trỏ đúng instance này; không fallback sang `DATABASE_URL`.
- Không chạy `prisma migrate reset`, không sửa migration đã áp dụng, không ghi vào DEV/TEST đang lệch schema và không tự “sửa” `_prisma_migrations`.
- Nếu không dựng được instance cô lập, dừng phần migration/DB acceptance, giữ source và báo blocker; không hạ tiêu chuẩn bằng cách dùng shared database.

## Kế hoạch kiểm thử

### Schema và migration

1. Migration sạch từ baseline tạo đúng FK/index/enum/table; migrate status up to date.
2. `receivedByEmployeeId` nullable, giữ dữ liệu Order cũ; Employee delete bị restrict theo policy.
3. Cancellation append-only structure, snapshot columns và unique/idempotency constraint cần thiết.
4. Không thay đổi hoặc xóa dữ liệu/bảng hiện có; migration chạy lại theo deploy semantics an toàn.

### Backend/API và snapshot

1. Guest/CASHIER/KITCHEN bị từ chối; ADMIN đọc và export được.
2. Đơn tạo hôm trước nhưng `completedAt` hôm nay thuộc hôm nay; đơn tạo hôm nay hoàn tất ngày mai không thuộc hôm nay.
3. Bản ghi tại đúng `from` được tính; đúng `to` bị loại.
4. Dữ liệu được ghi giữa các truy vấn nội bộ trong lúc tạo report không làm summary, rows, pagination hoặc filter options lệch nhau; `asOf` và transaction snapshot được chứng minh.
5. Một ngày có events thu và chi bù nhau cho `netCashFlow=0`, `hasData=true`; ngày không event mới là empty.
6. Cọc hôm nay, bữa ăn ngày mai: cashflow hôm nay, revenue ngày mai; `APPLY_TO_BILL` không tạo thu lần hai.
7. Một Order nhiều payment transactions/nhiều methods tạo đúng số money events và breakdown.
8. Payment + CashVoucher liên kết chỉ xuất hiện một lần; orphan payment có `UNRECONCILED`; manual voucher vẫn là event riêng.
9. Trả hàng theo `returnedAt`, refund theo completion timestamp; không hồi tố ngày bán.
10. Inventory types và signs map đúng; SALE_ITEM không trộn đơn vị với Ingredient transaction.
11. Hủy Order tạo cancellation snapshots và inventory effects nguyên tử; lỗi giữa chừng rollback cả order/cancellation/stock/audit.
12. Legacy cancelled Order sinh fallback đúng một lần; Order có cancellation mới không bị fallback double count.
13. Hai request đồng thời nhận cùng Order: đúng một conditional assignment thắng, `receivedByEmployeeId` không bị ghi đè.
14. Tất cả filters, faceted filter options, sort allow-list và pagination đúng concern.
15. Tổng hợp invariant khớp bốn concern trong cùng snapshot.
16. Export và màn hình cùng filter trên fixture ổn định có cùng totalRows/aggregates; export quá giới hạn trả lỗi có hướng dẫn.

### Frontend

1. Reports workspace mặc định Cuối ngày; chuyển Bán hàng giữ Dashboard cũ; menu chưa làm disabled và accessible.
2. Dropdown đủ năm mối quan tâm đúng thứ tự; đổi concern thay filters, summary/table và empty copy phù hợp.
3. Dọc/Ngang đổi overview/detail mà không đổi semantics filters.
4. Initial loading/error, empty, zero-valued snapshot, success và stale-after-refresh-failure là các trạng thái khác nhau.
5. Refresh thất bại giữ nguyên snapshot/`generatedAt` cũ; success mới thay state nguyên tử.
6. Response request cũ về muộn không ghi đè request mới.
7. Export/print dùng filters và snapshot timestamp đúng; lỗi quá lớn hiển thị hướng dẫn.
8. `receivedByEmployeeId=null` hiển thị “Chưa xác định”; không suy diễn từ creator.
9. Component/accessibility tests cho keyboard focus, label, touch target và disabled menus.
10. Visual QA light/dark tại 1440 px, 1024 px và 390 px; không overlap, clipping hoặc chữ report quá nhỏ.

### Hồi quy

- Existing `GET /api/reports/daily` và Dashboard tiếp tục hoạt động trong giai đoạn chuyển tiếp; có thể deprecate sau khi consumer đã chuyển, không xóa đột ngột.
- POS staff order auto-assign receiver khi có Employee link; không link vẫn tạo Order bình thường.
- QR order vẫn tạo với receiver null và được claim nguyên tử ở xác nhận đầu tiên.
- Hủy Order, restore stock, audit, KDS/order socket, sales return, reservation deposit/refund, Cashbook và inventory focused suites tiếp tục pass.
- Backend/frontend typecheck, focused lint, Expo web build/export và `git diff --check` pass.

## Tiêu chí chấp nhận cuối

1. Admin mở Báo cáo → Cuối ngày và xem đủ năm mối quan tâm trên giao diện đồng bộ Crispy Bite, responsive và hỗ trợ dark mode.
2. Số liệu dùng đúng timestamp nghiệp vụ và khoảng ngày nửa mở theo `Asia/Ho_Chi_Minh`.
3. `summary`, `rows`, pagination và filter options luôn thuộc cùng snapshot; metadata công khai `from`, `to`, timezone, `asOf`, `generatedAt`.
4. Bán hàng và dòng tiền được tách; payment/CashVoucher không double count; cọc không được nhận nhầm là doanh thu.
5. Hàng hóa giải thích rõ dòng món bán và inventory movement; Hủy món có audit source mới và fallback lịch sử không trùng.
6. Người nhận đơn đầu tiên được ghi bằng FK Employee, concurrency-safe, bất biến và không backfill giả.
7. Empty khác zero; refresh fail giữ snapshot cũ và báo độ stale.
8. In/XLSX dùng đúng filters, metadata và giới hạn an toàn; không cắt dữ liệu im lặng.
9. Migration/API/concurrency được chứng minh trên MySQL cô lập; không có write/migration/reset trên DEV/TEST đang lệch schema.

## Quyết định đã đóng băng

- Không còn câu hỏi nghiệp vụ mở cho implementation plan.
- Nếu trong khi lập plan phát hiện schema/flow hiện tại mâu thuẫn với đặc tả, dừng và sửa đặc tả trước; không tự đổi quy tắc nguồn dữ liệu hoặc timestamp trong code.
