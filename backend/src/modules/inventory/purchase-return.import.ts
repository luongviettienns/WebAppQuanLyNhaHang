import * as XLSX from 'xlsx';

export type ParsedPurchaseReturnRow = { rowNumber: number; sku: string; name?: string; unit?: string; quantity: number; returnUnitPrice: number };
export function parsePurchaseReturnExcelBuffer(buffer: Buffer): ParsedPurchaseReturnRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false });
  const sheetName = workbook.SheetNames[0]; if (!sheetName) throw new Error('File Excel không có trang tính nào');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
  return rows.slice(1).flatMap((raw, index) => { const values = Array.isArray(raw) ? raw : []; const sku = String(values[0] ?? '').trim(); if (!sku) return []; const quantity = typeof values[3] === 'number' ? values[3] : Number(String(values[3] ?? '').replace(/,/g, '')); const price = typeof values[4] === 'number' ? values[4] : Number(String(values[4] ?? '').replace(/,/g, '')); return [{ rowNumber: index + 2, sku, name: String(values[1] ?? '').trim() || undefined, unit: String(values[2] ?? '').trim() || undefined, quantity: Number.isFinite(quantity) ? quantity : 0, returnUnitPrice: Number.isFinite(price) ? Math.round(price) : 0 }]; });
}
