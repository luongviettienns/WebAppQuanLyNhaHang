import { describe, expect, it } from 'vitest';
import {
  canCommitMenuImport,
  getMenuImportSummary,
  isSupportedMenuImportFile
} from './menuImportViewModel';

describe('menu import view model', () => {
  it('accepts CSV/XLSX files case-insensitively and rejects other extensions', () => {
    expect(isSupportedMenuImportFile('MENU.CSV')).toBe(true);
    expect(isSupportedMenuImportFile('menu.xlsx')).toBe(true);
    expect(isSupportedMenuImportFile('menu.xls')).toBe(false);
    expect(isSupportedMenuImportFile('menu.pdf')).toBe(false);
  });

  it('only enables commit when there are valid rows and no errors', () => {
    expect(canCommitMenuImport({ validRows: [{ rowNumber: 2 } as never], errorRows: [] })).toBe(true);
    expect(canCommitMenuImport({ validRows: [], errorRows: [] })).toBe(false);
    expect(canCommitMenuImport({ validRows: [{ rowNumber: 2 } as never], errorRows: [{ rowNumber: 3, error: 'Sai' }] })).toBe(false);
  });

  it('formats a concise preview summary for valid and error counts', () => {
    expect(getMenuImportSummary({ totalRows: 12, validRows: [{ rowNumber: 2 } as never], errorRows: [{ rowNumber: 3, error: 'Sai' }] })).toBe(
      '12 dòng · 1 hợp lệ · 1 lỗi'
    );
  });
});
