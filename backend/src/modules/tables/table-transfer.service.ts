import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { CreateTableInput, createTableSchema, TableManageQuery } from './tables.schemas';
import { TablesService } from './tables.service';

const columns = [['displayName', 'Tên phòng/bàn'], ['areaName', 'Khu vực'], ['seatCount', 'Số ghế'], ['displayOrder', 'Số thứ tự'], ['note', 'Ghi chú'], ['tableNumber', 'Số bàn']] as const;
const normalized = (value: string) => value.trim().toLocaleLowerCase('vi');
const safeCsv = (value: string | number) => { let text = String(value); if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
function workbook(rows: Array<Array<string | number>>) { const book = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet(rows); sheet['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 12 }]; XLSX.utils.book_append_sheet(book, sheet, 'Phong_ban'); return XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer; }

export class TableTransferService {
  static template() { return workbook([columns.map(([, label]) => label)]); }

  static async export(query: TableManageQuery, format: 'csv' | 'xlsx') {
    const items: Awaited<ReturnType<typeof TablesService.manage>>['items'] = [];
    let page = 1; let totalPages = 1;
    do { const data = await TablesService.manage({ ...query, page, pageSize: 100 }); items.push(...data.items); totalPages = data.pagination.totalPages; page++; } while (page <= totalPages);
    const rows: Array<Array<string | number>> = [[...columns.map(([, label]) => label), 'Trạng thái hoạt động', 'Trạng thái phục vụ', 'Mã QR']];
    for (const table of items) {
      const source: Record<string, string | number> = { ...table, areaName: table.area?.name || '', seatCount: table.seatCount, note: table.note || '' };
      rows.push([...columns.map(([key]) => source[key] ?? ''), table.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động', table.status, table.qrCodeToken]);
    }
    return format === 'xlsx' ? workbook(rows) : Buffer.from('\uFEFF' + rows.map(row => row.map(safeCsv).join(',')).join('\r\n'), 'utf8');
  }

  static async preview(fileName: string, fileBase64: string) {
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) throw ApiError.badRequest('File tối đa 5 MB');
    let book: XLSX.WorkBook;
    try { book = XLSX.read(buffer, { type: 'buffer', raw: true, cellFormula: true, sheetRows: 502 }); } catch { throw ApiError.badRequest('Không thể đọc file. Vui lòng dùng mẫu XLSX hoặc CSV.'); }
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) throw ApiError.badRequest('File không có trang tính');
    if (Object.entries(sheet).some(([key, cell]) => !key.startsWith('!') && cell?.f)) throw ApiError.badRequest('File nhập phải chứa giá trị, không chứa công thức');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
    const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
    if (range.e.r > 500) throw ApiError.badRequest('Tối đa 500 dòng mỗi lần nhập');
    const headers = (rows[0] || []).map(value => normalized(String(value)));
    if (headers.indexOf(normalized('Tên phòng/bàn')) < 0) throw ApiError.badRequest('Thiếu cột Tên phòng/bàn. Vui lòng dùng file mẫu.');
    const areas = await TablesService.areas();
    const areaByName = new Map(areas.filter(area => area.isActive).map(area => [normalized(area.name), area.id]));
    const seenNumbers = new Set<number>();
    const candidates: Array<{ rowNumber: number; data: CreateTableInput }> = [];
    const errorRows: Array<{ rowNumber: number; name: string; error: string }> = [];
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index]; if (row.every(cell => !String(cell).trim())) continue;
      const input: Record<string, unknown> = {};
      for (const [key, label] of columns) { const value = String(row[headers.indexOf(normalized(label))] ?? '').trim(); if (value) input[key] = value; }
      for (const key of ['seatCount', 'displayOrder', 'tableNumber']) if (input[key] !== undefined) input[key] = Number(input[key]);
      let error: string | undefined;
      const areaName = String(input.areaName || '');
      delete input.areaName;
      if (areaName) { input.areaId = areaByName.get(normalized(areaName)); if (!input.areaId) error = 'Khu vực không tồn tại hoặc đã ngừng hoạt động'; }
      const parsed = createTableSchema.safeParse(input);
      if (!parsed.success) error = parsed.error.issues.map(issue => issue.message).join('; ');
      if (parsed.success && parsed.data.tableNumber) { if (seenNumbers.has(parsed.data.tableNumber)) error = 'Số bàn trùng trong file'; seenNumbers.add(parsed.data.tableNumber); }
      if (error || !parsed.success) errorRows.push({ rowNumber: index + 1, name: String(input.displayName || ''), error: error || 'Dữ liệu không hợp lệ' });
      else candidates.push({ rowNumber: index + 1, data: parsed.data });
    }
    const existing = await prisma.diningTable.findMany({ where: { tableNumber: { in: candidates.flatMap(row => row.data.tableNumber ? [row.data.tableNumber] : []) } }, select: { tableNumber: true } });
    const numbers = new Set(existing.map(row => row.tableNumber));
    const validRows = candidates.filter(row => { if (!row.data.tableNumber || !numbers.has(row.data.tableNumber)) return true; errorRows.push({ rowNumber: row.rowNumber, name: row.data.displayName, error: 'Số bàn đã tồn tại' }); return false; });
    return { fileName, totalRows: validRows.length + errorRows.length, validRows, errorRows: errorRows.sort((a, b) => a.rowNumber - b.rowNumber) };
  }

  static async commit(rows: CreateTableInput[], actorId?: number, actorName?: string) {
    try {
      const ids = await prisma.$transaction(async tx => { const result: number[] = []; for (const input of rows) result.push((await TablesService.createInTransaction(tx, input)).id); await AuditService.logInTransaction(tx, { action: 'TABLES_IMPORTED', targetType: 'DiningTable', actorId, actorName, metadata: { createdCount: result.length, ids: result } }); return result; }, { timeout: 30000 });
      TablesService.notify(ids);
      return { createdCount: ids.length };
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Số bàn bị trùng. Không có dòng nào được nhập; hãy kiểm tra lại file.'); throw error; }
  }
}
