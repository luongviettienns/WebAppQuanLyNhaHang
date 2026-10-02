import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findAccounts, findVouchers } = vi.hoisted(() => ({ findAccounts: vi.fn(), findVouchers: vi.fn() }));
vi.mock('../../src/config/prisma', () => ({ prisma: { financialAccount: { findMany: findAccounts }, cashVoucher: { findMany: findVouchers } } }));

import { CashbookService } from '../../src/modules/cashbook/cashbook.service';

describe('cashbook export source references', () => {
  beforeEach(() => {
    findAccounts.mockResolvedValue([{ id: 1 }]);
    findVouchers.mockResolvedValue([{
      code: 'PC-001', occurredAt: new Date('2026-10-02T10:00:00.000Z'), direction: 'PAYMENT', account: { name: 'Ngân hàng' },
      category: { name: 'Nhập hàng' }, amount: 500_000, status: 'POSTED', counterpartyName: 'Nhà cung cấp A', note: 'Thanh toán hóa đơn',
      reversalOfId: null, sourceType: 'PURCHASE_RECEIPT_PAYMENT', sourceCode: 'PN-001', sourceInvoiceNumber: 'INV-001',
      sourceInvoiceDate: new Date('2026-10-01T00:00:00.000Z'), sourceTransactionId: 42
    }]);
  });

  it('includes the source voucher, source transaction and invoice references in CSV exports', async () => {
    const result = await CashbookService.export({} as never, 'csv');
    expect(result.body).toContain('Loại_nguồn');
    expect(result.body).toContain('Mã_chứng_từ_nguồn');
    expect(result.body).toContain('Số_hóa_đơn');
    expect(result.body).toContain('Mã_giao_dịch_nguồn');
    expect(result.body).toContain('PN-001');
    expect(result.body).toContain('INV-001');
    expect(result.body).toContain('PURCHASE_RECEIPT_PAYMENT');
  });
});
