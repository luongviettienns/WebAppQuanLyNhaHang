import { MenuImportErrorRowDto, MenuImportPreviewDto, MenuImportRowDto } from '../../api/contracts';

export function isSupportedMenuImportFile(fileName: string): boolean {
  const extension = fileName.trim().toLowerCase().split('.').pop();
  return extension === 'csv' || extension === 'xlsx';
}

export function canCommitMenuImport(input: Pick<MenuImportPreviewDto, 'validRows' | 'errorRows'>): boolean {
  return input.validRows.length > 0 && input.errorRows.length === 0;
}

export function getMenuImportSummary(
  input: Pick<MenuImportPreviewDto, 'totalRows' | 'validRows' | 'errorRows'>
): string {
  return `${input.totalRows} dòng · ${input.validRows.length} hợp lệ · ${input.errorRows.length} lỗi`;
}

export function getMenuImportErrorLabel(error: MenuImportErrorRowDto): string {
  return `Dòng ${error.rowNumber}: ${error.error}`;
}

export function getMenuImportRowLabel(row: MenuImportRowDto): string {
  return `${row.sku || 'SKU tự sinh'} · ${row.name}`;
}
