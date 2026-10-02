import { describe, expect, it } from 'vitest';
import { confirmDepositSchema, refundDepositSchema } from '../../src/modules/reservations/reservations.schemas';
import { confirmOrderPaymentSchema, payOrderSchema } from '../../src/modules/orders/orders.schemas';
import { salesReturnCreateSchema } from '../../src/modules/orders/sales-return.schemas';
import { createPurchaseReceiptSchema } from '../../src/modules/inventory/purchase-receipt.schemas';
import { createPurchaseReturnSchema } from '../../src/modules/inventory/purchase-return.schemas';
import { parsePayrollPaymentInput } from '../../src/modules/employee-payroll/employee-payroll.schemas';
import { parseSupplierPaymentInput } from '../../src/modules/inventory/supplier-payment.schemas';

describe('cashbook-aware source payment contracts', () => {
  it('allows legacy payloads until activation while preserving account fields for the new UI', () => {
    expect(payOrderSchema.safeParse({ paymentMethod: 'CASH' }).success).toBe(true);
    expect(payOrderSchema.safeParse({ paymentMethod: 'BANK_TRANSFER' }).success).toBe(true);
    expect(payOrderSchema.safeParse({ paymentMethod: 'BANK_TRANSFER', financialAccountId: 2 }).success).toBe(true);
    expect(payOrderSchema.safeParse({ paymentMethod: 'BANK_TRANSFER', financialAccountId: null }).success).toBe(true);
  });

  it('keeps account identity optional at the transport layer so activation policy stays server-side', () => {
    expect(confirmDepositSchema.safeParse({ amount: 100, paymentMethod: 'BANK_TRANSFER', externalReference: 'bank-1' }).success).toBe(true);
    expect(refundDepositSchema.safeParse({ amount: 100, externalReference: 'refund-1', reason: 'Hủy bàn' }).success).toBe(true);
    expect(confirmOrderPaymentSchema.safeParse({ amount: 100, externalReference: 'order-1' }).success).toBe(true);
    expect(confirmOrderPaymentSchema.safeParse({ amount: 100, financialAccountId: 2, externalReference: 'order-1' }).success).toBe(true);
    expect(confirmDepositSchema.safeParse({ amount: 100, paymentMethod: 'BANK_TRANSFER', financialAccountId: null, externalReference: 'bank-2' }).success).toBe(true);
    expect(confirmOrderPaymentSchema.safeParse({ amount: 100, financialAccountId: null, externalReference: 'order-2' }).success).toBe(true);
  });

  it('accepts a new refund account selection without breaking pre-activation clients', () => {
    const payload = { orderId: 1, lines: [{ orderItemId: 1, quantity: 1 }] };
    expect(salesReturnCreateSchema.safeParse(payload).success).toBe(true);
    expect(salesReturnCreateSchema.parse({ ...payload, financialAccountId: 3, refundMethod: 'BANK_TRANSFER' }).financialAccountId).toBe(3);
    expect(salesReturnCreateSchema.safeParse({ ...payload, financialAccountId: null }).success).toBe(true);
  });

  it('keeps supplier payment account/method snapshots on purchase documents', () => {
    expect(createPurchaseReceiptSchema.parse({ paidAmount: 100, paymentMethod: 'BANK_TRANSFER', financialAccountId: 4, lines: [] }))
      .toMatchObject({ paymentMethod: 'BANK_TRANSFER', financialAccountId: 4 });
    expect(createPurchaseReceiptSchema.safeParse({ paidAmount: 100, paymentMethod: 'CASH', financialAccountId: null, lines: [] }).success).toBe(true);
    expect(createPurchaseReturnSchema.parse({ refundAmount: 100, refundMethod: 'BANK_TRANSFER', financialAccountId: 4, lines: [] }))
      .toMatchObject({ refundMethod: 'BANK_TRANSFER', financialAccountId: 4 });
  });

  it('accepts an optional account snapshot on payroll payment requests', () => {
    expect(parsePayrollPaymentInput({ amount: 10_000, method: 'BANK_TRANSFER', financialAccountId: 3 }))
      .toMatchObject({ method: 'BANK_TRANSFER', financialAccountId: 3 });
    expect(parsePayrollPaymentInput({ amount: 10_000, method: 'OTHER', financialAccountId: null }))
      .toMatchObject({ method: 'OTHER', financialAccountId: null });
    expect(parseSupplierPaymentInput({ amount: 10_000, paymentMethod: 'BANK_TRANSFER', financialAccountId: null }))
      .toMatchObject({ paymentMethod: 'BANK_TRANSFER', financialAccountId: null });
  });
});
