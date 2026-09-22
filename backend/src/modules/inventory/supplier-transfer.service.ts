import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { CreateSupplierDto, createSupplierSchema, SupplierListQuery } from './supplier.schemas';
import { SupplierService } from './supplier.service';
import { SupplierReportService } from './supplier-report.service';

const columns = [
  ['code', 'Mã nhà cung cấp'], ['name', 'Tên nhà cung cấp'], ['phone', 'Điện thoại'], ['email', 'Email'],
  ['address', 'Địa chỉ'], ['province', 'Tỉnh / Thành phố'], ['district', 'Quận / Huyện'], ['ward', 'Phường / Xã'],
  ['identityNumber', 'CCCD'], ['taxCode', 'Mã số thuế'], ['companyName', 'Công ty'], ['groupName', 'Nhóm nhà cung cấp'], ['note', 'Ghi chú']
] as const;
const normalized = (text: string) => text.trim().toLocaleLowerCase('vi');
const csvText = (value: string | number) => {
  let text = String(value);
  if (typeof value === 'string' && (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
};

function workbook(rows: Array<Array<string | number>>) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = rows[0].map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(book, sheet, 'Nha_cung_cap');
  return XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

export class SupplierTransferService {
  static template() { return workbook([columns.map(column => column[1])]); }

  static async export(query: SupplierListQuery, format: 'csv' | 'xlsx') {
    const data = await SupplierReportService.list(query, true);
    const rows: Array<Array<string | number>> = [[...columns.map(column => column[1]), 'Trạng thái', 'Tổng mua trong kỳ', 'Còn phải trả theo phiếu nhập (toàn thời gian)']];
    for (const supplier of data.items) {
      const source = { ...supplier, groupName: supplier.group?.name || '' };
      rows.push([...columns.map(([key]) => source[key] || ''), supplier.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động', supplier.totalPurchase, supplier.outstandingAmount]);
    }
    return format === 'xlsx' ? workbook(rows) : Buffer.from('\uFEFF' + rows.map(row => row.map(csvText).join(',')).join('\r\n'), 'utf8');
  }

  static async preview(fileName: string, fileBase64: string) {
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) throw ApiError.badRequest('File tối đa 5 MB');
    let book: XLSX.WorkBook;
    try { book = XLSX.read(buffer, { type: 'buffer', raw: true, cellFormula: true, sheetRows: 502 }); }
    catch { throw ApiError.badRequest('Không thể đọc file. Vui lòng dùng mẫu XLSX hoặc CSV.'); }
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) throw ApiError.badRequest('File không có trang tính');
    if (Object.entries(sheet).some(([key, cell]) => !key.startsWith('!') && cell?.f)) throw ApiError.badRequest('File nhập phải chứa giá trị, không chứa công thức');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
    const sourceRange = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
    if (sourceRange.e.r > 500) throw ApiError.badRequest('Tối đa 500 dòng mỗi lần nhập');
    const headers = (rows[0] || []).map(value => normalized(String(value)));
    const nameHeader = headers.indexOf(normalized('Tên nhà cung cấp'));
    if (nameHeader < 0) throw ApiError.badRequest('Thiếu cột Tên nhà cung cấp. Vui lòng dùng file mẫu.');
    const groups = await SupplierService.groups();
    const byGroup = new Map(groups.map(group => [normalized(group.name), group.id]));
    const seen = new Set<string>();
    const candidates: Array<{ rowNumber: number; data: CreateSupplierDto }> = [];
    const errorRows: Array<{ rowNumber: number; name: string; error: string }> = [];
    for (let index = 1; index < rows.length; index++) {
      const row = rows[index];
      if (row.every(cell => !String(cell).trim())) continue;
      const input: Record<string, unknown> = {};
      for (const [key, label] of columns) {
        const value = String(row[headers.indexOf(normalized(label))] ?? '').trim();
        if (value) input[key] = value;
      }
      let error: string | undefined;
      const groupName = String(input.groupName || '');
      if (groupName) {
        input.groupId = byGroup.get(normalized(groupName));
        if (!input.groupId) error = 'Nhóm không tồn tại; hãy tạo nhóm trước khi nhập';
      }
      const parsed = createSupplierSchema.safeParse(input);
      if (!parsed.success) error = parsed.error.issues.map(issue => issue.message).join('; ');
      if (parsed.success && parsed.data.code) {
        if (seen.has(parsed.data.code)) error = 'Mã nhà cung cấp trùng trong file';
        seen.add(parsed.data.code);
      }
      if (error || !parsed.success) errorRows.push({ rowNumber: index + 1, name: String(input.name || ''), error: error || 'Dữ liệu không hợp lệ' });
      else candidates.push({ rowNumber: index + 1, data: parsed.data });
    }
    const existing = await prisma.supplier.findMany({ where: { code: { in: candidates.flatMap(row => row.data.code ? [row.data.code] : []) } }, select: { code: true } });
    const codes = new Set(existing.map(row => row.code.toUpperCase()));
    const validRows = candidates.filter(row => {
      if (!row.data.code || !codes.has(row.data.code)) return true;
      errorRows.push({ rowNumber: row.rowNumber, name: row.data.name, error: 'Mã nhà cung cấp đã tồn tại' });
      return false;
    });
    return { fileName, totalRows: validRows.length + errorRows.length, validRows, errorRows: errorRows.sort((a, b) => a.rowNumber - b.rowNumber) };
  }

  static async commit(rows: CreateSupplierDto[], actorId?: number, actorName?: string) {
    try {
      const ids = await prisma.$transaction(async tx => {
        const result: number[] = [];
        for (const input of rows) result.push((await SupplierService.createInTransaction(tx, input)).id);
        return result;
      }, { timeout: 30000 });
      await AuditService.log({ action: 'SUPPLIERS_IMPORTED', targetType: 'Supplier', actorId, actorName, metadata: { createdCount: ids.length, ids } });
      SupplierService.notify(ids);
      return { createdCount: ids.length };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Mã nhà cung cấp bị trùng. Không có dòng nào được nhập; hãy kiểm tra lại file.');
      throw error;
    }
  }
}
