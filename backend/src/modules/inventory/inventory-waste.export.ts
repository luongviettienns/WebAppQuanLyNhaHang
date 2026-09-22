import * as XLSX from 'xlsx';

export const inventoryWasteExportHeaders = [
  'Mã xuất hủy',
  'Thời gian',
  'Người tạo',
  'Tổng giá trị hủy',
  'Ghi chú',
  'Trạng thái'
] as const;

export type InventoryWasteExportRow = {
  wasteCode: string;
  wastedAt: Date;
  creatorName: string;
  totalValue: number;
  note: string;
  status: string;
};

function rowValues(row: InventoryWasteExportRow): Array<string | number> {
  return [
    row.wasteCode,
    row.wastedAt.toISOString(),
    row.creatorName,
    row.totalValue,
    row.note,
    row.status
  ];
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function serializeInventoryWasteCsv(rows: InventoryWasteExportRow[]): Buffer {
  const lines = rows.map(row => rowValues(row).map(csvCell).join(','));
  return Buffer.from('\uFEFF' + inventoryWasteExportHeaders.join(',') + '\r\n' + lines.join('\r\n') + '\r\n', 'utf8');
}

export function serializeInventoryWasteWorkbook(rows: InventoryWasteExportRow[]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...inventoryWasteExportHeaders],
    ...rows.map(rowValues)
  ]);
  worksheet['!cols'] = inventoryWasteExportHeaders.map(header => ({ wch: Math.max(header.length + 2, 16) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Phieu_xuat_huy');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export type ParsedInventoryWasteRow = {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  quantity: number;
  note?: string;
};

export function parseInventoryWasteExcelBuffer(buffer: Buffer): ParsedInventoryWasteRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File Excel không có trang tính (sheet) nào');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
  if (rows.length <= 1) return [];

  return rows.slice(1).flatMap((row, index) => {
    const values = Array.isArray(row) ? row : [];
    const sku = String(values[0] ?? '').trim();
    if (!sku) return [];
    const rawQuantity = values[3];
    const quantity = typeof rawQuantity === 'number'
      ? rawQuantity
      : Number.parseFloat(String(rawQuantity ?? '').replace(/,/g, ''));
    return [{
      rowNumber: index + 2,
      sku,
      name: String(values[1] ?? '').trim() || undefined,
      unit: String(values[2] ?? '').trim() || undefined,
      quantity: Number.isNaN(quantity) ? 0 : quantity,
      note: String(values[4] ?? '').trim() || undefined
    }];
  });
}
