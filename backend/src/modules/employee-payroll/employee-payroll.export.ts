import * as XLSX from 'xlsx';

export const employeePayrollExportHeaders = [
  'Mã bảng lương', 'Tên bảng lương', 'Trạng thái', 'Từ ngày', 'Đến ngày',
  'Mã nhân viên', 'Tên nhân viên', 'Phòng ban', 'Chức danh',
  'Ngân hàng', 'Số tài khoản', 'Tên chủ tài khoản',
  'Số phiên hoàn tất', 'Phút làm thực tế', 'Số ngày vắng đã xác nhận',
  'Lương gộp', 'Hoa hồng', 'Hoa hồng âm chuyển kỳ sau', 'Thưởng', 'Khấu trừ', 'Thực nhận', 'Đã trả', 'Còn lại', 'Cảnh báo'
];

export interface EmployeePayrollExportRow {
  batchCode: string;
  batchName: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string | null;
  jobTitleName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  completedSessions: number;
  actualMinutes: number;
  confirmedAbsences: number;
  grossAmount: number;
  commissionAmount: number;
  commissionDeferredDebitAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  netAmount: number;
  paidAmount: number;
  remainingAmount: number;
  warningCodes: string[];
}

function safeSpreadsheetValue(value: string | number): string | number {
  if (typeof value === 'string' && /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

const values = (row: EmployeePayrollExportRow): Array<string | number> => [
  row.batchCode,
  row.batchName,
  row.status,
  row.periodStart,
  row.periodEnd,
  row.employeeCode,
  row.employeeName,
  row.departmentName ?? '',
  row.jobTitleName ?? '',
  row.bankName ?? '',
  row.bankAccountNumber ?? '',
  row.bankAccountName ?? '',
  row.completedSessions,
  row.actualMinutes,
  row.confirmedAbsences,
  row.grossAmount,
  row.commissionAmount,
  row.commissionDeferredDebitAmount,
  row.bonusAmount,
  row.deductionAmount,
  row.netAmount,
  row.paidAmount,
  row.remainingAmount,
  row.warningCodes.join(' | ')
].map(safeSpreadsheetValue);

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeEmployeePayrollCsv(rows: EmployeePayrollExportRow[]): Buffer {
  const lines = [employeePayrollExportHeaders, ...rows.map(values)].map(row => row.map(csvCell).join(','));
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

export function serializeEmployeePayrollWorkbook(rows: EmployeePayrollExportRow[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([employeePayrollExportHeaders, ...rows.map(values)]);
  sheet['!cols'] = employeePayrollExportHeaders.map(header => ({ wch: Math.max(14, header.length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Bang_luong');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
