import * as XLSX from 'xlsx';

export const inventoryCheckExportHeaders = [
  'Mã kiểm kho',
  'Thời gian',
  'Ngày cân bằng',
  'Tổng chênh lệch',
  'SL lệch tăng',
  'SL lệch giảm',
  'Ghi chú',
  'Trạng thái'
] as const;

export type InventoryCheckExportRow = {
  checkCode: string;
  countedAt: Date;
  balancedAt: Date | null;
  totalVarianceValue: number;
  increasedQuantity: number;
  decreasedQuantity: number;
  note: string;
  status: string;
};

function rowValues(row: InventoryCheckExportRow): Array<string | number> {
  return [
    row.checkCode,
    row.countedAt.toISOString(),
    row.balancedAt?.toISOString() ?? '',
    row.totalVarianceValue,
    row.increasedQuantity,
    row.decreasedQuantity,
    row.note,
    row.status
  ];
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeInventoryCheckCsv(rows: InventoryCheckExportRow[]): Buffer {
  const lines = rows.map(row => rowValues(row).map(csvCell).join(','));
  return Buffer.from(`\uFEFF${inventoryCheckExportHeaders.join(',')}\r\n${lines.join('\r\n')}\r\n`, 'utf8');
}

export function serializeInventoryCheckWorkbook(rows: InventoryCheckExportRow[]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...inventoryCheckExportHeaders],
    ...rows.map(rowValues)
  ]);
  worksheet['!cols'] = inventoryCheckExportHeaders.map(header => ({ wch: Math.max(header.length + 2, 16) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Phieu_kiem_kho');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export type ParsedInventoryCheckRow = {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  actualQuantity: number;
};

export function parseInventoryCheckExcelBuffer(buffer: Buffer): ParsedInventoryCheckRow[] {
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
    const actualQuantity = typeof rawQuantity === 'number'
      ? rawQuantity
      : Number.parseFloat(String(rawQuantity ?? '').replace(/,/g, ''));
    return [{
      rowNumber: index + 2,
      sku,
      name: String(values[1] ?? '').trim() || undefined,
      unit: String(values[2] ?? '').trim() || undefined,
      actualQuantity: Number.isNaN(actualQuantity) ? 0 : actualQuantity
    }];
  });
}
