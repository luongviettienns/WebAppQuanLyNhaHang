import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { generateTemplateWorkbook, parseExcelBuffer, exportInventoryWorkbook } from '../../src/modules/inventory/inventory.excel';

describe('Inventory Excel Utility (TDD)', () => {
  it('tao file template Excel mau dung chuan 6 cot', () => {
    const buffer = generateTemplateWorkbook();
    expect(buffer).toBeInstanceOf(Buffer);

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    expect(data.length).toBeGreaterThanOrEqual(2);
    expect(data[0][0]).toBe('Mã nguyên liệu');
    expect(data[0][1]).toBe('Tên nguyên liệu');
    expect(data[0][2]).toBe('Đơn vị tính');
    expect(data[0][3]).toBe('Số lượng nhập');
    expect(data[0][4]).toBe('Đơn giá nhập (VND)');
    expect(data[0][5]).toBe('Ghi chú');
  });

  it('parse duoc du lieu tu buffer Excel hop le', () => {
    // Tao mot file Excel nho bang xlsx de test parse
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Mã nguyên liệu', 'Tên nguyên liệu', 'Đơn vị tính', 'Số lượng nhập', 'Đơn giá nhập (VND)', 'Ghi chú'],
      ['ING-GA-01', 'Thịt gà tươi', 'gram', 5000, 85, 'NCC Ba Huân'],
      ['ING-KHOAI-01', 'Khoai tây đông lạnh', 'gram', 10000, 35, 'Hàng mới về']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const rows = parseExcelBuffer(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      rowNumber: 2,
      sku: 'ING-GA-01',
      name: 'Thịt gà tươi',
      unit: 'gram',
      quantity: 5000,
      costPerUnit: 85,
      note: 'NCC Ba Huân'
    });
  });

  it('xuat duoc danh sach ton kho ra buffer Excel co day du cot kiem ke', () => {
    const mockIngredients = [
      {
        sku: 'ING-GA-01',
        name: 'Thịt gà tươi',
        unit: 'gram',
        currentStock: 25000,
        minThreshold: 5000,
        costPerUnit: 85
      },
      {
        sku: 'ING-DAU-01',
        name: 'Dầu chiên',
        unit: 'ml',
        currentStock: 2000,
        minThreshold: 5000, // Thap hon nguong
        costPerUnit: 40
      }
    ];

    const buffer = exportInventoryWorkbook(mockIngredients);
    expect(buffer).toBeInstanceOf(Buffer);

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    expect(data[0]).toContain('Mã NVL');
    expect(data[0]).toContain('Kiểm kê thực tế');
    expect(data[1][0]).toBe('ING-GA-01');
    expect(data[2][6]).toContain('Sắp hết'); // Warning badge
  });
});
