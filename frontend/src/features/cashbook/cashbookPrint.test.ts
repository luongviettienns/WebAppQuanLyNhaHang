import { describe, expect, it } from 'vitest';
import { amountInVietnameseWords, buildCashVoucherPrintHtml } from './cashbookPrint';

describe('cash voucher print view', () => {
  it('spells VND amounts in Vietnamese for the printable copy', () => {
    expect(amountInVietnameseWords(125000)).toBe('Một trăm hai mươi lăm nghìn đồng');
    expect(amountInVietnameseWords(0)).toBe('Không đồng');
  });

  it('includes amount, status and reversal linkage while escaping untrusted voucher fields', () => {
    const html = buildCashVoucherPrintHtml({
      id: 2, code: 'PT-002', direction: 'RECEIPT', status: 'POSTED', occurredAt: '2026-10-02T08:00:00.000Z', updatedAt: '2026-10-02T08:00:00.000Z',
      amount: 125000, accountId: 1, categoryId: 3, paymentMethod: 'CASH', note: '<script>alert(1)</script>', counterpartyName: 'Khách & đối tác',
      reversalOf: { id: 1, code: 'PT-001', direction: 'PAYMENT', amount: 125000 }, reversal: null
    });
    expect(html).toContain('125.000 ₫');
    expect(html).toContain('Đã ghi sổ');
    expect(html).toContain('Bút toán đảo của PT-001');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
