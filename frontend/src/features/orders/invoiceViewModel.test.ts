import { describe, expect, it } from 'vitest';
import { getInvoiceCustomerLabel, getOrderStatusPresentation, formatInvoiceMoney } from './invoiceViewModel';

describe('invoice view model', () => {
  it('formats Vietnamese money and missing customer without inventing data', () => {
    expect(formatInvoiceMoney(151200)).toBe('151.200 ₫');
    expect(getInvoiceCustomerLabel({ customerName: null })).toBe('—');
  });

  it('maps order lifecycle status to a stable Native badge', () => {
    expect(getOrderStatusPresentation('COMPLETED')).toEqual({ label: 'Hoàn thành', tone: 'success' });
    expect(getOrderStatusPresentation('CANCELLED')).toEqual({ label: 'Đã hủy', tone: 'danger' });
  });
});
