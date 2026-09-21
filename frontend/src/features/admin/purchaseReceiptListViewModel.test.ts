import { describe, expect, it } from 'vitest';
import {
  formatReceiptMoney,
  getPurchaseReceiptStatusPresentation,
  getReceiptListFilterSummary
} from './purchaseReceiptListViewModel';

describe('purchase receipt list view model', () => {
  it('shows an overdue draft and formats VND totals for the receipt table', () => {
    expect(getPurchaseReceiptStatusPresentation('DRAFT').label).toBe('Phiếu tạm');
    expect(formatReceiptMoney(1_013_000)).toBe('1.013.000 đ');
  });

  it('normalizes selected statuses and exposes a stable empty filter summary', () => {
    expect(getReceiptListFilterSummary({ status: ['DRAFT', 'POSTED'], search: '  PN0001  ' }))
      .toEqual({ statuses: ['DRAFT', 'POSTED'], search: 'PN0001' });
    expect(getReceiptListFilterSummary({})).toEqual({ statuses: ['DRAFT', 'POSTED'], search: '' });
    expect(getReceiptListFilterSummary({ status: [] })).toEqual({ statuses: [], search: '' });
  });
});
