import * as XLSX from 'xlsx';
import { InventoryCatalogRowDto } from './inventory-catalog.types';

export const inventoryCatalogExportHeaders = [
  'sourceType',
  'managementGroup',
  'sku',
  'name',
  'categoryName',
  'menuType',
  'unit',
  'costPrice',
  'stockQuantity',
  'minStock',
  'stockStatus',
  'isActive',
  'position',
  'updatedAt'
] as const;

function exportValues(row: InventoryCatalogRowDto): Array<string | number | boolean | null> {
  return [
    row.sourceType,
    row.managementGroup,
    row.sku,
    row.name,
    row.categoryName ?? null,
    row.menuType ?? null,
    row.unit,
    row.costPrice,
    row.stockQuantity,
    row.minStock,
    row.stockStatus,
    row.isActive,
    row.position ?? null,
    row.updatedAt
  ];
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeInventoryCatalogCsv(rows: InventoryCatalogRowDto[]): Buffer {
  const lines = rows.map(row => exportValues(row).map(csvCell).join(','));
  return Buffer.from(`\uFEFF${inventoryCatalogExportHeaders.join(',')}\r\n${lines.join('\r\n')}\r\n`, 'utf8');
}

export function serializeInventoryCatalogWorkbook(rows: InventoryCatalogRowDto[]): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...inventoryCatalogExportHeaders],
    ...rows.map(exportValues)
  ]);
  worksheet['!cols'] = inventoryCatalogExportHeaders.map(header => ({ wch: Math.max(header.length + 2, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh_sach_kho');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
