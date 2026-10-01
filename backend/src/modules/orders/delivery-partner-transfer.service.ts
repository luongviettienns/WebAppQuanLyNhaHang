import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { CreateDeliveryPartnerDto, createDeliveryPartnerSchema, DeliveryPartnerListQuery } from './delivery-partner.schemas';
import { DeliveryPartnerService } from './delivery-partner.service';

const columns = [['code', 'Mã đối tác'], ['name', 'Tên đối tác'], ['phone', 'Điện thoại'], ['email', 'Email'], ['partnerType', 'Loại đối tác'], ['address', 'Địa chỉ'], ['province', 'Tỉnh / Thành phố'], ['district', 'Quận / Huyện'], ['ward', 'Phường / Xã'], ['groupName', 'Nhóm đối tác'], ['note', 'Ghi chú']] as const;
const normalized = (value: string) => value.trim().toLocaleLowerCase('vi');
const safeCsv = (value: string | number) => { let text = String(value); if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
function workbook(rows: Array<Array<string | number>>) { const book = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet(rows); sheet['!cols'] = rows[0].map(() => ({ wch: 24 })); XLSX.utils.book_append_sheet(book, sheet, 'Doi_tac_giao_hang'); return XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer; }

export class DeliveryPartnerTransferService {
  static template() { return workbook([columns.map(([, label]) => label)]); }
  static async export(query: DeliveryPartnerListQuery, format: 'csv' | 'xlsx') {
    const data = await DeliveryPartnerService.list({ ...query, page: 1, pageSize: 100 });
    const rows: Array<Array<string | number>> = [[...columns.map(([, label]) => label), 'Trạng thái', 'Tổng đơn hàng', 'Nợ cần trả', 'Tổng phí giao hàng']];
    for (const partner of data.items) { const source: any = { ...partner, groupName: partner.group?.name || '', partnerType: partner.partnerType === 'COMPANY' ? 'Công ty' : 'Cá nhân' }; rows.push([...columns.map(([key]) => source[key] || ''), partner.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động', partner.totalOrders, partner.outstandingAmount, partner.totalDeliveryFee]); }
    return format === 'xlsx' ? workbook(rows) : Buffer.from('\uFEFF' + rows.map(row => row.map(safeCsv).join(',')).join('\r\n'), 'utf8');
  }
  static async preview(fileName: string, fileBase64: string) {
    const buffer = Buffer.from(fileBase64, 'base64'); if (buffer.length > 5 * 1024 * 1024) throw ApiError.badRequest('File tối đa 5 MB');
    let book: XLSX.WorkBook; try { book = XLSX.read(buffer, { type: 'buffer', raw: true, cellFormula: true, sheetRows: 502 }); } catch { throw ApiError.badRequest('Không thể đọc file. Vui lòng dùng mẫu XLSX hoặc CSV.'); }
    const sheet = book.Sheets[book.SheetNames[0]]; if (!sheet) throw ApiError.badRequest('File không có trang tính'); if (Object.entries(sheet).some(([key, cell]) => !key.startsWith('!') && cell?.f)) throw ApiError.badRequest('File nhập phải chứa giá trị, không chứa công thức');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }); const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1'); if (range.e.r > 500) throw ApiError.badRequest('Tối đa 500 dòng mỗi lần nhập');
    const headers = (rows[0] || []).map(value => normalized(String(value))); if (headers.indexOf(normalized('Tên đối tác')) < 0) throw ApiError.badRequest('Thiếu cột Tên đối tác. Vui lòng dùng file mẫu.');
    const groups = await DeliveryPartnerService.groups(); const groupsByName = new Map(groups.map(group => [normalized(group.name), group.id])); const seen = new Set<string>(); const candidates: Array<{ rowNumber: number; data: CreateDeliveryPartnerDto }> = []; const errorRows: Array<{ rowNumber: number; name: string; error: string }> = [];
    for (let index = 1; index < rows.length; index++) { const row = rows[index]; if (row.every(cell => !String(cell).trim())) continue; const input: Record<string, unknown> = {}; for (const [key, label] of columns) { const value = String(row[headers.indexOf(normalized(label))] ?? '').trim(); if (value) input[key] = value; } if (input.partnerType) input.partnerType = normalized(String(input.partnerType)) === 'công ty' ? 'COMPANY' : 'INDIVIDUAL'; let error: string | undefined; const groupName = String(input.groupName || ''); if (groupName) { input.groupId = groupsByName.get(normalized(groupName)); if (!input.groupId) error = 'Nhóm không tồn tại; hãy tạo nhóm trước khi nhập'; } const parsed = createDeliveryPartnerSchema.safeParse(input); if (!parsed.success) error = parsed.error.issues.map(issue => issue.message).join('; '); if (parsed.success && parsed.data.code) { if (seen.has(parsed.data.code)) error = 'Mã đối tác trùng trong file'; seen.add(parsed.data.code); } if (error || !parsed.success) errorRows.push({ rowNumber: index + 1, name: String(input.name || ''), error: error || 'Dữ liệu không hợp lệ' }); else candidates.push({ rowNumber: index + 1, data: parsed.data }); }
    const existing = await prisma.deliveryPartner.findMany({ where: { code: { in: candidates.flatMap(row => row.data.code ? [row.data.code] : []) } }, select: { code: true } }); const codes = new Set(existing.map(row => row.code.toUpperCase())); const validRows = candidates.filter(row => { if (!row.data.code || !codes.has(row.data.code)) return true; errorRows.push({ rowNumber: row.rowNumber, name: row.data.name, error: 'Mã đối tác đã tồn tại' }); return false; });
    return { fileName, totalRows: validRows.length + errorRows.length, validRows, errorRows: errorRows.sort((a, b) => a.rowNumber - b.rowNumber) };
  }
  static async commit(rows: CreateDeliveryPartnerDto[], actorId?: number, actorName?: string) {
    try { const ids = await prisma.$transaction(async tx => { const result: number[] = []; for (const input of rows) result.push((await DeliveryPartnerService.createInTransaction(tx, input)).id); return result; }, { timeout: 30000 }); await AuditService.log({ action: 'DELIVERY_PARTNERS_IMPORTED', targetType: 'DeliveryPartner', actorId, actorName, metadata: { createdCount: ids.length, ids } }); return { createdCount: ids.length }; } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Mã đối tác bị trùng. Không có dòng nào được nhập; hãy kiểm tra lại file.'); throw error; }
  }
}
