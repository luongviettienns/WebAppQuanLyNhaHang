import * as XLSX from 'xlsx';

export const purchaseReceiptExportHeaders = [
  'Mã phiếu',
  'Thời gian',
  'Nhà cung cấp',
  'Tổng tiền hàng',
  'Giảm giá',
  'Cần trả',
  'Đã trả',
  'Công nợ',
  'Trạng thái'
] as const;

export type PurchaseReceiptExportRow = {
  receiptCode: string;
  receivedAt: Date;
  supplierName: string;
  subtotalAmount: number;
  discountAmount: number;
  payableAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
};

function rowValues(row: PurchaseReceiptExportRow): Array<string | number> {
  return [
    row.receiptCode,
    row.receivedAt.toISOString(),
    row.supplierName,
    row.subtotalAmount,
    row.discountAmount,
    row.payableAmount,
    row.paidAmount,
    row.outstandingAmount,
    row.status
  ];
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializePurchaseReceiptCsv(rows: PurchaseReceiptExportRow[]): Buffer {
  const lines = rows.map(row => rowValues(row).map(csvCell).join(','));
  return Buffer.from(`\uFEFF${purchaseReceiptExportHeaders.join(',')}\r\n${lines.join('\r\n')}\r\n`, 'utf8');
}

export function serializePurchaseReceiptWorkbook(rows: PurchaseReceiptExportRow[]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...purchaseReceiptExportHeaders],
    ...rows.map(rowValues)
  ]);
  worksheet['!cols'] = purchaseReceiptExportHeaders.map(header => ({ wch: Math.max(header.length + 2, 16) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Phieu_nhap_hang');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
