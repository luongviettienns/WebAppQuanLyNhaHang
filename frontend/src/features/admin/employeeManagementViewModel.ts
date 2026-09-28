import type { EmployeeFilter, EmployeePayBasis, EmployeeStatus } from '../../api/employeeManagement';

export function buildEmployeeFilter(filter: EmployeeFilter): EmployeeFilter {
  return Object.fromEntries(Object.entries(filter).filter(([, value]) => value !== undefined && value !== null && value !== '')) as EmployeeFilter;
}

export function maskEmployeeNationalId(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.includes('•')) return value;
  return `${'•'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

export function formatEmployeeStatus(status: EmployeeStatus): string {
  return status === 'WORKING' ? 'Đang làm việc' : 'Đã nghỉ';
}

export function formatEmployeePayBasis(payBasis: EmployeePayBasis): string {
  switch (payBasis) {
    case 'MONTHLY': return 'Lương tháng';
    case 'HOURLY': return 'Lương giờ';
    case 'PER_SHIFT': return 'Lương theo ca';
  }
}

export function formatEmployeeVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} đ`;
}
