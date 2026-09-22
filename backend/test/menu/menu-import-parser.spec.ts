import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  MenuExportRow,
  parseMenuImportBuffer,
  serializeMenuCsv,
  serializeMenuWorkbook
} from '../../src/modules/menu/menu.import';

const headers = [
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
];

const exportRows: MenuExportRow[] = [
  {
    sku: 'SP000001',
    name: 'Burger, phô mai',
    categoryName: 'Món chính',
    basePrice: 69000,
    menuType: 'FOOD',
    itemType: 'REGULAR',
    isAvailable: true,
    trackStock: true,
    stockQuantity: 12,
    position: 'Quầy nóng',
    description: 'Bánh mì, bò và phô mai',
    imageUrl: null
  }
];

describe('menu import parser and serializers', () => {
  it('parses UTF-8 CSV, quoted Vietnamese text and friendly boolean values', () => {
    const csv = [
      headers.join(','),
      'SP000001,"Burger, phô mai",Món chính,69000,FOOD,REGULAR,có,yes,12,Quầy nóng,"Bánh mì, bò và phô mai",'
    ].join('\n');

    const result = parseMenuImportBuffer(Buffer.from(`\uFEFF${csv}`, 'utf8'), 'menu.csv');

    expect(result.totalRows).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 2,
      sku: 'SP000001',
      name: 'Burger, phô mai',
      categoryName: 'Món chính',
      basePrice: 69000,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 12,
      position: 'Quầy nóng'
    });
  });

  it('parses the first XLSX sheet and ignores empty rows', () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      headers,
      ['SP000002', 'Trà đào', 'Đồ uống', 32000, 'DRINK', 'REGULAR', 1, 0, 0, 'Quầy nước', '', ''],
      [],
      ['', '', '', '', '', '', '', '', '', '', '', '']
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = parseMenuImportBuffer(buffer, 'menu.xlsx');

    expect(result.totalRows).toBe(1);
    expect(result.rows[0]).toMatchObject({ name: 'Trà đào', menuType: 'DRINK', isAvailable: true, trackStock: false });
    expect(result.errors).toEqual([]);
  });

  it('returns row-level errors for required fields, invalid enum, number and boolean', () => {
    const csv = [
      headers.join(','),
      'SP000003,,Đồ uống,-100,BAD,REGULAR,maybe,false,-2,,,',
    ].join('\n');

    const result = parseMenuImportBuffer(Buffer.from(csv, 'utf8'), 'menu.csv');

    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ rowNumber: 2, sku: 'SP000003' });
    expect(result.errors[0].error).toContain('name');
    expect(result.errors[0].error).toContain('basePrice');
    expect(result.errors[0].error).toContain('menuType');
    expect(result.errors[0].error).toContain('isAvailable');
  });

  it('rejects duplicate SKUs within one file', () => {
    const csv = [
      headers.join(','),
      'SP000004,Burger 1,Món chính,50000,FOOD,REGULAR,true,false,0,,,',
      'SP000004,Burger 2,Món chính,60000,FOOD,REGULAR,true,false,0,,,',
    ].join('\n');

    const result = parseMenuImportBuffer(Buffer.from(csv, 'utf8'), 'menu.csv');

    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((error) => error.error.includes('SKU'))).toBe(true);
  });

  it('serializes CSV with UTF-8 BOM and canonical headers', () => {
    const buffer = serializeMenuCsv(exportRows);
    const text = buffer.toString('utf8');

    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text.slice(1).split('\r\n')[0]).toBe(headers.join(','));
    expect(text).toContain('Burger, phô mai');
  });

  it('serializes an XLSX workbook with a Menu sheet and canonical headers', () => {
    const buffer = serializeMenuWorkbook(exportRows);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Menu, { header: 1 }) as unknown[][];

    expect(workbook.SheetNames).toEqual(['Menu']);
    expect(rows[0]).toEqual(headers);
    expect(rows[1]).toContain('SP000001');
  });
});
