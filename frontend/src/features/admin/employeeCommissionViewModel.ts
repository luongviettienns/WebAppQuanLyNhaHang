import type { CommissionRuleType } from '../../api/employeeCommissions';

export type RuleCell = { type: CommissionRuleType; fixedAmount: number | null; rateBps: number | null } | { conflict: true } | null;

const integer = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function formatCommissionMoney(value: number) {
  if (value === 0) return '0\u00a0₫';
  return `${value > 0 ? '+' : '−'}${integer.format(Math.abs(value))}\u00a0₫`;
}

function percent(rateBps: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(rateBps / 100);
}

export function formatCommissionRule(rule: RuleCell) {
  if (!rule) return 'Chưa thiết lập';
  if ('conflict' in rule) return 'Xung đột quy tắc';
  if (rule.type === 'FIXED_PER_UNIT') return `${integer.format(rule.fixedAmount ?? 0)}đ/sp`;
  if (rule.type === 'PERCENT_NET_REVENUE') return `${percent(rule.rateBps ?? 0)}% doanh thu`;
  return `${percent(rule.rateBps ?? 0)}% lợi nhuận`;
}

function searchable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLocaleLowerCase('vi-VN');
}

export function filterCommissionRows<T extends { sku?: string; code?: string; name: string }>(rows: T[], search: string) {
  const needle = searchable(search.trim());
  if (!needle) return rows;
  return rows.filter(row => searchable(`${row.sku ?? row.code ?? ''} ${row.name}`).includes(needle));
}

export function commissionEmptyState(totalRows: number, search: string) {
  if (totalRows === 0 && !search.trim()) return 'Chưa có hàng hóa để thiết lập hoa hồng.';
  if (search.trim()) return 'Không tìm thấy kết quả phù hợp.';
  return null;
}
