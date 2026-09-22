import * as XLSX from 'xlsx';

export interface ParsedPriceImportRow {
  rowNumber: number;
  sku: string;
  name?: string;
  salePrice: number | null;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parsePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^0-9-]/g, '');
  if (!digits || digits === '-') return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parsePriceImportBuffer(buffer: Buffer): ParsedPriceImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const headers = (rows[0] ?? []).map(normalizeHeader);
  const skuIndex = headers.findIndex(header => ['sku', 'ma mon', 'ma hang'].includes(header));
  const nameIndex = headers.findIndex(header => ['ten mon', 'ten hang'].includes(header));
  const salePriceIndex = headers.findIndex(header => ['gia ban', 'saleprice', 'sale price', 'gia moi'].includes(header));
  const effectivePriceIndex = salePriceIndex >= 0 ? salePriceIndex : 4;

  return rows.slice(1).map((row, index) => {
    const values = row as unknown[];
    const sku = String(values[skuIndex >= 0 ? skuIndex : 0] ?? '').trim();
    return {
      rowNumber: index + 2,
      sku,
      name: nameIndex >= 0 ? String(values[nameIndex] ?? '').trim() : undefined,
      salePrice: parsePrice(values[effectivePriceIndex])
    };
  }).filter(row => row.sku || row.salePrice !== null);
}

export interface PriceListExportRow {
  sku: string;
  name: string;
  categoryName: string;
  costPrice: number | null;
  salePrice: number;
}

export function serializePriceListCsv(rows: PriceListExportRow[]): Buffer {
  const csvCell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['SKU', 'Tên món', 'Nhóm món', 'Giá vốn BOM', 'Giá bán'];
  const lines = rows.map(row => [row.sku, row.name, row.categoryName, row.costPrice, row.salePrice].map(csvCell).join(','));
  return Buffer.from(`\uFEFF${header.map(csvCell).join(',')}\r\n${lines.join('\r\n')}\r\n`, 'utf8');
}
