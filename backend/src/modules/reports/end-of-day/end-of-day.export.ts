import * as XLSX from 'xlsx';
import { ApiError } from '../../../lib/api-error';
import type { EndOfDayReportResponse } from './end-of-day.types';

export const END_OF_DAY_EXPORT_MAX_ROWS = 50_000;
/** Serialized source-data budget, not a measurement of total process heap. */
export const END_OF_DAY_EXPORT_MAX_SOURCE_BYTES = 32 * 1024 * 1024;

export function reportExportTooLarge(estimatedRows: number, maxRows = END_OF_DAY_EXPORT_MAX_ROWS): ApiError {
  return new ApiError(413, 'REPORT_EXPORT_TOO_LARGE',
    'Báo cáo vượt giới hạn xuất Excel. Vui lòng thu hẹp khoảng thời gian hoặc bộ lọc.', { estimatedRows, maxRows });
}

type ExportSnapshot = EndOfDayReportResponse<unknown, unknown> & { filters?: object };
type CellValue = string | number | boolean;
function cellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function keyValues(value: unknown, prefix = ''): { key: string; value: CellValue }[] {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([key, child]) => keyValues(child, prefix ? `${prefix}.${key}` : key));
  }
  return [{ key: prefix, value: cellValue(value) }];
}

export function serializeEndOfDayWorkbook(snapshot: ExportSnapshot, limits: { maxBytes?: number } = {}): Buffer {
  const estimatedRows = Math.max(snapshot.pagination.totalRows, snapshot.rows.length);
  if (estimatedRows > END_OF_DAY_EXPORT_MAX_ROWS) throw reportExportTooLarge(estimatedRows);
  const maxBytes = Math.min(limits.maxBytes ?? END_OF_DAY_EXPORT_MAX_SOURCE_BYTES, END_OF_DAY_EXPORT_MAX_SOURCE_BYTES);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw ApiError.badRequest('Giới hạn dữ liệu xuất không hợp lệ');
  // Count each section before constructing any workbook; avoid a second full snapshot string.
  let bytes = 0;
  for (const section of [snapshot.metadata, snapshot.summary, snapshot.filters ?? {}, snapshot.filterOptions, snapshot.pagination, ...snapshot.rows]) {
    bytes += Buffer.byteLength(JSON.stringify(section), 'utf8');
    if (bytes > maxBytes) throw reportExportTooLarge(estimatedRows);
  }
  const data = snapshot.rows.map(row => Object.fromEntries(Object.entries(row as Record<string, unknown>)
    .map(([key, value]) => [key, cellValue(value)])));
  const summary = keyValues(snapshot.summary);
  const metadata = keyValues({ ...snapshot.metadata, hasData: snapshot.hasData,
    filters: snapshot.filters ?? {}, pagination: snapshot.pagination, filterOptions: snapshot.filterOptions });
  for (const row of [...data, ...summary, ...metadata]) {
    for (const [key, value] of Object.entries(row)) {
      if (key.length > 32767 || (typeof value === 'string' && value.length > 32767)) throw reportExportTooLarge(estimatedRows);
    }
  }
  const book = XLSX.utils.book_new();
  // String values are explicit string cells: spreadsheet-like text never becomes a formula.
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Data');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(metadata), 'Metadata');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
}
