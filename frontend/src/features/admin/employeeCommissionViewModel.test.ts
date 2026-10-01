import { describe, expect, it } from 'vitest';
import { commissionEmptyState, filterCommissionRows, formatCommissionMoney, formatCommissionRule } from './employeeCommissionViewModel';

describe('employee commission view model', () => {
  it('formats signed VND amounts without hiding negative adjustments', () => {
    expect(formatCommissionMoney(15000)).toBe('+15.000 ₫');
    expect(formatCommissionMoney(-5000)).toBe('−5.000 ₫');
    expect(formatCommissionMoney(0)).toBe('0 ₫');
  });

  it('formats all rule cells and conflicts explicitly', () => {
    expect(formatCommissionRule({ type: 'FIXED_PER_UNIT', fixedAmount: 15000, rateBps: null })).toBe('15.000đ/sp');
    expect(formatCommissionRule({ type: 'PERCENT_NET_REVENUE', fixedAmount: null, rateBps: 500 })).toBe('5% doanh thu');
    expect(formatCommissionRule({ type: 'PERCENT_GROSS_PROFIT', fixedAmount: null, rateBps: 1250 })).toBe('12,5% lợi nhuận');
    expect(formatCommissionRule(null)).toBe('Chưa thiết lập');
    expect(formatCommissionRule({ conflict: true })).toBe('Xung đột quy tắc');
  });

  it('filters rows safely and distinguishes empty from no-match states', () => {
    const rows = [{ id: 1, sku: 'CF01', name: 'Cà phê sữa' }, { id: 2, sku: 'TEA01', name: 'Trà đào' }];
    expect(filterCommissionRows(rows, 'ca phe')).toEqual([rows[0]]);
    expect(commissionEmptyState(0, '')).toBe('Chưa có hàng hóa để thiết lập hoa hồng.');
    expect(commissionEmptyState(2, 'matcha')).toBe('Không tìm thấy kết quả phù hợp.');
  });
});

