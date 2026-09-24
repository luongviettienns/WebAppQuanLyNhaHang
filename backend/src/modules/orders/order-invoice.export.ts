import * as XLSX from 'xlsx';

export const orderInvoiceExportHeaders = [
  'Mã hóa đơn', 'Thời gian', 'Loại đơn', 'Trạng thái', 'Thanh toán', 'Khách hàng',
  'Tổng tiền hàng', 'Giảm giá', 'Sau giảm giá', 'VAT', 'Tổng thanh toán', 'Khách đã trả'
];

export type OrderInvoiceExportRow = {
  code: string;
  createdAt: string;
  orderType: string;
  status: string;
  paymentStatus: string;
  customerName: string | null;
  totalGoods: number;
  discountAmount: number;
  totalAfterDiscount: number;
  vatAmount: number;
  finalAmount: number;
  paidAmount: number;
};

const values = (row: OrderInvoiceExportRow): Array<string | number> => [
  row.code, row.createdAt, row.orderType, row.status, row.paymentStatus, row.customerName ?? '',
  row.totalGoods, row.discountAmount, row.totalAfterDiscount, row.vatAmount, row.finalAmount, row.paidAmount
];

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function serializeOrderInvoicesCsv(rows: OrderInvoiceExportRow[]): Buffer {
  const lines = [orderInvoiceExportHeaders, ...rows.map(values)].map((row) => row.map(csvCell).join(','));
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

export function serializeOrderInvoicesWorkbook(rows: OrderInvoiceExportRow[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([orderInvoiceExportHeaders, ...rows.map(values)]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hoa_don');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
