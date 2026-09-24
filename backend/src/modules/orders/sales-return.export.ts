import * as XLSX from 'xlsx';

export const salesReturnHeaders = ['Mã trả hàng', 'Mã hóa đơn', 'Thời gian', 'Phòng/Bàn', 'Khách hàng', 'Cần trả khách', 'Đã trả khách', 'Trạng thái'];
export type SalesReturnExportRow = { returnCode: string; orderCode: string; returnedAt: string; tableNumber: number | null; customerName: string | null; totalRefundDue: number; refundedAmount: number; status: string };
const values = (row: SalesReturnExportRow): Array<string | number> => [row.returnCode, row.orderCode, row.returnedAt, row.tableNumber === null ? '' : row.tableNumber, row.customerName ?? '', row.totalRefundDue, row.refundedAmount, row.status];
const csvCell = (value: string | number) => { const text = String(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
export function serializeSalesReturnsCsv(rows: SalesReturnExportRow[]): Buffer { return Buffer.from(`\uFEFF${[salesReturnHeaders, ...rows.map(values)].map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8'); }
export function serializeSalesReturnsWorkbook(rows: SalesReturnExportRow[]): Buffer { const sheet = XLSX.utils.aoa_to_sheet([salesReturnHeaders, ...rows.map(values)]); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Tra_hang'); return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer; }
