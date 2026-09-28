import { describe, expect, it } from 'vitest';
import { buildEmployeeFilter, formatEmployeePayBasis, formatEmployeeStatus, formatEmployeeVnd, maskEmployeeNationalId } from './employeeManagementViewModel';

describe('employee management view model', () => {
  it('masks national ID except the last four characters and preserves already-masked values', () => {
    expect(maskEmployeeNationalId('079123456789')).toBe('••••••••6789');
    expect(maskEmployeeNationalId('••••6789')).toBe('••••6789');
    expect(maskEmployeeNationalId(null)).toBe('—');
  });

  it('formats employee status and VND compensation', () => {
    expect(formatEmployeeStatus('WORKING')).toBe('Đang làm việc');
    expect(formatEmployeeStatus('RESIGNED')).toBe('Đã nghỉ');
    expect(formatEmployeePayBasis('MONTHLY')).toBe('Lương tháng');
    expect(formatEmployeePayBasis('HOURLY')).toBe('Lương giờ');
    expect(formatEmployeePayBasis('PER_SHIFT')).toBe('Lương theo ca');
    expect(formatEmployeeVnd(12000000)).toBe('12.000.000 đ');
  });

  it('builds a clean employee filter without dropping zero-valued amounts or page number', () => {
    expect(buildEmployeeFilter({ status: 'WORKING', departmentId: 0, page: 1, pageSize: 25, search: '' })).toEqual({
      status: 'WORKING', departmentId: 0, page: 1, pageSize: 25
    });
  });
});
