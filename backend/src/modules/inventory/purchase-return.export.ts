import * as XLSX from 'xlsx';

export const purchaseReturnExportHeaders = ['Mã trả hàng', 'Thời gian', 'Nhà cung cấp', 'Tổng tiền hàng', 'Chiết khấu', 'VAT', 'Phải trả', 'Đã hoàn', 'Ghi chú', 'Trạng thái'] as const;
export type PurchaseReturnExportRow = { code: string; returnedAt: Date; supplier: string; subtotal: number; discount: number; vat: number; payable: number; refund: number; note: string; status: string };
function values(row: PurchaseReturnExportRow): Array<string | number> { return [row.code, row.returnedAt.toISOString(), row.supplier, row.subtotal, row.discount, row.vat, row.payable, row.refund, row.note, row.status]; }
function csvCell(value: string | number): string { const text = String(value); return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }
export function serializePurchaseReturnCsv(rows: PurchaseReturnExportRow[]): Buffer { return Buffer.from('\uFEFF' + purchaseReturnExportHeaders.join(',') + '\r\n' + rows.map(row => values(row).map(csvCell).join(',')).join('\r\n') + '\r\n', 'utf8'); }
export function serializePurchaseReturnWorkbook(rows: PurchaseReturnExportRow[]): Buffer { const sheet = XLSX.utils.aoa_to_sheet([[...purchaseReturnExportHeaders], ...rows.map(values)]); sheet['!cols'] = purchaseReturnExportHeaders.map(header => ({ wch: Math.max(header.length + 2, 16) })); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Phieu_tra_hang'); return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }); }
