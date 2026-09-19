import * as XLSX from 'xlsx';
import { MenuItemType, MenuType } from '@prisma/client';

export const MENU_IMPORT_HEADERS = [
  'sku',
  'name',
  'categoryName',
  'basePrice',
  'menuType',
  'itemType',
  'isAvailable',
  'trackStock',
  'stockQuantity',
  'position',
  'description',
  'imageUrl'
] as const;

export const MENU_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export interface MenuImportRow {
  rowNumber: number;
  sku?: string;
  name: string;
  categoryName: string;
  basePrice: number;
  menuType: MenuType;
  itemType: MenuItemType;
  isAvailable: boolean;
  trackStock: boolean;
  stockQuantity: number;
  position: string | null;
  description: string | null;
  imageUrl: string | null;
}

export type MenuExportRow = Omit<MenuImportRow, 'rowNumber'>;

export interface MenuImportErrorRow {
  rowNumber: number;
  sku?: string;
  name?: string;
  categoryName?: string;
  error: string;
}

export interface MenuImportParseResult {
  rows: MenuImportRow[];
  errors: MenuImportErrorRow[];
  totalRows: number;
}

const MENU_TYPES = new Set<MenuType>(['FOOD', 'DRINK', 'SERVICE', 'OTHER']);
const MENU_ITEM_TYPES = new Set<MenuItemType>(['REGULAR', 'TOPPING', 'COMBO', 'SERVICE']);

function normalizeHeader(value: unknown) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase();
}

function textValue(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function parseInteger(value: unknown, field: string, errors: string[]) {
  const text = String(value ?? '').trim().replace(/[\s,]/g, '');
  if (!text) {
    errors.push(`${field} là bắt buộc`);
    return null;
  }

  const parsed = Number(text);
  if (!Number.isInteger(parsed)) {
    errors.push(`${field} phải là số nguyên`);
    return null;
  }

  return parsed;
}

function parseBoolean(value: unknown, field: string, fallback: boolean, errors: string[]) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return fallback;

  if (['true', '1', 'yes', 'y', 'on', 'co', 'có'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'off', 'khong', 'không'].includes(text)) return false;

  errors.push(`${field} phải là true/false, 1/0, yes/no hoặc có/không`);
  return fallback;
}

function parseEnum<T extends string>(value: unknown, field: string, allowed: Set<T>, fallback: T, errors: string[]) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return fallback;
  if (allowed.has(text as T)) return text as T;

  errors.push(`${field} không hợp lệ`);
  return fallback;
}

function readCell(row: unknown[], indexes: Map<string, number>, header: string) {
  const index = indexes.get(normalizeHeader(header));
  return index === undefined ? '' : row[index];
}

function parseCsvRows(text: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error('CSV có dấu ngoặc kép chưa đóng');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
    rows.push(row);
  }

  return rows;
}

function parseRows(rawRows: unknown[][]): MenuImportParseResult {
  if (rawRows.length === 0) {
    throw new Error('File import không có dòng header');
  }

  const headerRow = rawRows[0] || [];
  const indexes = new Map<string, number>();
  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized) indexes.set(normalized, index);
  });

  const missingHeaders = MENU_IMPORT_HEADERS.filter((header) => !indexes.has(normalizeHeader(header)));
  if (missingHeaders.length > 0) {
    throw new Error(`Thiếu cột bắt buộc: ${missingHeaders.join(', ')}`);
  }

  const rows: MenuImportRow[] = [];
  const errors: MenuImportErrorRow[] = [];
  let totalRows = 0;

  for (let index = 1; index < rawRows.length; index += 1) {
    const rawRow = rawRows[index] || [];
    const isEmpty = rawRow.every((value) => String(value ?? '').trim() === '');
    if (isEmpty) continue;

    totalRows += 1;
    const rowNumber = index + 1;
    const sku = textValue(readCell(rawRow, indexes, 'sku')) || undefined;
    const name = textValue(readCell(rawRow, indexes, 'name')) || '';
    const categoryName = textValue(readCell(rawRow, indexes, 'categoryName')) || '';
    const rowErrors: string[] = [];

    if (!name) rowErrors.push('name là bắt buộc');
    if (!categoryName) rowErrors.push('categoryName là bắt buộc');

    const basePrice = parseInteger(readCell(rawRow, indexes, 'basePrice'), 'basePrice', rowErrors);
    if (basePrice !== null && basePrice <= 0) rowErrors.push('basePrice phải lớn hơn 0');

    const stockQuantity = parseInteger(readCell(rawRow, indexes, 'stockQuantity'), 'stockQuantity', rowErrors);
    if (stockQuantity !== null && stockQuantity < 0) rowErrors.push('stockQuantity không được âm');

    const menuType = parseEnum(readCell(rawRow, indexes, 'menuType'), 'menuType', MENU_TYPES, 'FOOD', rowErrors);
    const itemType = parseEnum(readCell(rawRow, indexes, 'itemType'), 'itemType', MENU_ITEM_TYPES, 'REGULAR', rowErrors);
    const isAvailable = parseBoolean(readCell(rawRow, indexes, 'isAvailable'), 'isAvailable', true, rowErrors);
    const trackStock = parseBoolean(readCell(rawRow, indexes, 'trackStock'), 'trackStock', false, rowErrors);

    const parsedRow: MenuImportRow = {
      rowNumber,
      ...(sku ? { sku } : {}),
      name,
      categoryName,
      basePrice: basePrice ?? 0,
      menuType,
      itemType,
      isAvailable,
      trackStock,
      stockQuantity: stockQuantity ?? 0,
      position: textValue(readCell(rawRow, indexes, 'position')),
      description: textValue(readCell(rawRow, indexes, 'description')),
      imageUrl: textValue(readCell(rawRow, indexes, 'imageUrl'))
    };

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, sku, name: name || undefined, categoryName: categoryName || undefined, error: rowErrors.join('; ') });
    } else {
      rows.push(parsedRow);
    }
  }

  const rowsBySku = new Map<string, MenuImportRow[]>();
  rows.forEach((row) => {
    if (!row.sku) return;
    const skuRows = rowsBySku.get(row.sku) || [];
    skuRows.push(row);
    rowsBySku.set(row.sku, skuRows);
  });

  const duplicateRows = new Set<number>();
  rowsBySku.forEach((skuRows) => {
    if (skuRows.length < 2) return;
    skuRows.forEach((row) => {
      duplicateRows.add(row.rowNumber);
      errors.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        name: row.name,
        categoryName: row.categoryName,
        error: `SKU ${row.sku} bị trùng trong file import`
      });
    });
  });

  return {
    rows: rows.filter((row) => !duplicateRows.has(row.rowNumber)),
    errors: errors.sort((a, b) => a.rowNumber - b.rowNumber),
    totalRows
  };
}

export function parseMenuImportBuffer(buffer: Buffer, fileName: string): MenuImportParseResult {
  if (buffer.length > MENU_IMPORT_MAX_BYTES) {
    throw new Error('File import vượt quá giới hạn 5 MB');
  }

  const extension = fileName.toLowerCase().split('.').pop();
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new Error('Chỉ hỗ trợ file CSV hoặc XLSX');
  }

  let rawRows: unknown[][];
  if (extension === 'csv') {
    rawRows = parseCsvRows(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } else {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    } catch {
      throw new Error('Không thể đọc file import. Vui lòng kiểm tra định dạng file');
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error('File import không có sheet dữ liệu');

    const sheet = workbook.Sheets[firstSheetName];
    rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  }

  return parseRows(rawRows);
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportRowValues(row: MenuExportRow) {
  return [
    row.sku || '',
    row.name,
    row.categoryName,
    row.basePrice,
    row.menuType,
    row.itemType,
    row.isAvailable,
    row.trackStock,
    row.stockQuantity,
    row.position || '',
    row.description || '',
    row.imageUrl || ''
  ];
}

export function serializeMenuCsv(rows: MenuExportRow[]): Buffer {
  const lines = [
    MENU_IMPORT_HEADERS.join(','),
    ...rows.map((row) => exportRowValues(row).map(csvCell).join(','))
  ];
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

export function serializeMenuWorkbook(rows: MenuExportRow[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([MENU_IMPORT_HEADERS, ...rows.map(exportRowValues)]);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 20 },
    { wch: 36 },
    { wch: 36 }
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
