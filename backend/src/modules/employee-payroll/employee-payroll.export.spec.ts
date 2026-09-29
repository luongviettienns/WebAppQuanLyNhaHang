import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  employeePayrollExportHeaders,
  serializeEmployeePayrollCsv,
  serializeEmployeePayrollWorkbook,
  type EmployeePayrollExportRow
} from './employee-payroll.export';

const row = (overrides: Partial<EmployeePayrollExportRow> = {}): EmployeePayrollExportRow => ({
  batchCode: 'BL202609001',
  batchName: 'Bảng lương tháng 9/2026',
  status: 'FINALIZED',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  employeeCode: 'NV000001',
  employeeName: 'Nguyễn Minh Anh',
  departmentName: 'Phục vụ',
  jobTitleName: 'Nhân viên',
  bankName: 'VCB',
  bankAccountNumber: '0123456789',
  bankAccountName: 'NGUYEN MINH ANH',
  completedSessions: 20,
  actualMinutes: 9_600,
  confirmedAbsences: 0,
  grossAmount: 12_000_000,
  bonusAmount: 500_000,
  deductionAmount: 0,
  netAmount: 12_500_000,
  paidAmount: 2_500_000,
  remainingAmount: 10_000_000,
  warningCodes: [],
  ...overrides
});

describe('employee payroll export', () => {
  it('writes UTF-8 BOM CSV and neutralizes formula-shaped employee data', () => {
    const csv = serializeEmployeePayrollCsv([row({ employeeName: '=HYPERLINK("https://bad")' })]).toString('utf8');

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain(',=HYPERLINK');
    expect(csv).toContain('BL202609001');
  });

  it('writes the documented XLSX headers and every matching line', () => {
    const buffer = serializeEmployeePayrollWorkbook([
      row(),
      row({ employeeCode: 'NV000002', employeeName: '@Nguy hiểm' })
    ]);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true });

    expect(values[0]).toEqual(employeePayrollExportHeaders);
    expect(values).toHaveLength(3);
    expect(values[2]).toContain('NV000002');
    expect(values[2]).toContain("'@Nguy hiểm");
  });
});
