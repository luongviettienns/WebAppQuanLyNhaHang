import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { CashbookPostingService, normalizeCashbookPersistenceError, resolveCashbookAccountForPayment } from '../cashbook/cashbook-posting.service';
import { cashbookChangedEvent } from '../cashbook/cashbook.events';
import { CashVoucherSourceType } from '@prisma/client';
import { emitToAll } from '../../lib/socket';
import type { SupplierPaymentInput } from './supplier-payment.schemas';
import { calculateSupplierOutstanding } from './supplier-payment.domain';

const requestDigest = (supplierId: number, input: SupplierPaymentInput) => createHash('sha256')
  .update(JSON.stringify({ supplierId, input }), 'utf8').digest('hex');

export class SupplierPaymentService {
  static async record(supplierId: number, input: SupplierPaymentInput, idempotencyKey: string, actor: { id: number; name?: string }) {
    const digest = requestDigest(supplierId, input);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM Supplier WHERE id = ${supplierId} FOR UPDATE`;
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw ApiError.notFound('Nhà cung cấp không tồn tại');
      if (!supplier.isActive) throw ApiError.conflict('Nhà cung cấp đã ngừng hoạt động');

      const replay = await tx.supplierPayment.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.requestDigest !== digest) throw ApiError.conflict('Idempotency-Key đã được dùng cho một khoản thanh toán khác', 'SUPPLIER_PAYMENT_IDEMPOTENCY_KEY_REUSED');
        return { payment: replay, voucher: null, replayed: true };
      }

      const [receipts, payments, returns] = await Promise.all([
        tx.purchaseReceipt.aggregate({ where: { supplierId, status: 'POSTED' }, _sum: { subtotalAmount: true, discountAmount: true } }),
        tx.supplierPayment.aggregate({ where: { supplierId, status: 'SUCCESS' }, _sum: { amount: true } }),
        tx.purchaseReturn.aggregate({ where: { supplierId, status: 'COMPLETED' }, _sum: { subtotalAmount: true, discountAmount: true, vatAmount: true, refundAmount: true } })
      ]);
      const grossPayable = (receipts._sum.subtotalAmount ?? 0) - (receipts._sum.discountAmount ?? 0);
      const returnPayable = (returns._sum.subtotalAmount ?? 0) - (returns._sum.discountAmount ?? 0) + (returns._sum.vatAmount ?? 0);
      const outstanding = calculateSupplierOutstanding({
        receiptsPayable: grossPayable, successfulPayments: payments._sum.amount ?? 0,
        returnsPayable: returnPayable, supplierRefunds: returns._sum.refundAmount ?? 0
      });
      if (input.amount > outstanding) throw ApiError.conflict('Số tiền thanh toán vượt công nợ nhà cung cấp còn lại', 'SUPPLIER_PAYMENT_EXCEEDS_OUTSTANDING', { outstandingAmount: String(outstanding) });

      const financialAccountId = await resolveCashbookAccountForPayment(tx, input.paymentMethod, input.financialAccountId);
      const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
      const payment = await tx.supplierPayment.create({ data: {
        supplierId, financialAccountId, amount: input.amount, paymentMethod: input.paymentMethod,
        paidAt, externalReference: input.externalReference, idempotencyKey, requestDigest: digest,
        note: input.note ?? null, createdByUserId: actor.id, createdByName: actor.name ?? null
      } });
      let voucher = null;
      if (financialAccountId !== null) {
        const category = await tx.cashFlowCategory.findUniqueOrThrow({ where: { code: 'SUPPLIER_PAYMENT' } });
        voucher = await CashbookPostingService.post(tx, {
          direction: 'PAYMENT', amount: payment.amount, accountId: financialAccountId, categoryId: category.id,
          paymentMethod: input.paymentMethod, occurredAt: paidAt, sourceType: 'SUPPLIER_PAYMENT',
          sourceTransactionId: payment.id, sourceCode: `NCC${supplierId}-${payment.id}`,
          counterpartyType: 'SUPPLIER', counterpartyId: supplierId, counterpartyName: supplier.name,
          note: input.note ?? 'Thanh toán công nợ nhà cung cấp'
        }, { id: actor.id, name: actor.name ?? null, role: 'ADMIN' });
      }
      return { payment, voucher, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 }).catch(normalizeCashbookPersistenceError);
    if (result.voucher && !result.replayed) emitToAll('cashbook:changed', cashbookChangedEvent(result.voucher));
    return result.payment;
  }

  static async reverse(paymentId: number, reason: string, idempotencyKey: string, actor: { id: number; name?: string }) {
    const digest = createHash('sha256').update(JSON.stringify({ paymentId, reason: reason.trim() }), 'utf8').digest('hex');
    const outcome = await prisma.$transaction(async tx => {
      const reference = await tx.supplierPayment.findUnique({ where: { id: paymentId }, select: { supplierId: true } });
      if (!reference) throw ApiError.notFound('Không tìm thấy khoản thanh toán nhà cung cấp');
      await tx.$queryRaw`SELECT id FROM Supplier WHERE id = ${reference.supplierId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM SupplierPayment WHERE id = ${paymentId} FOR UPDATE`;
      const replay = await tx.supplierPayment.findUnique({ where: { reversalIdempotencyKey: idempotencyKey } });
      if (replay) {
        if (replay.reversalRequestDigest !== digest) throw ApiError.conflict('Idempotency-Key đã được dùng cho một yêu cầu đảo khác', 'SUPPLIER_PAYMENT_IDEMPOTENCY_KEY_REUSED');
        return { payment: replay, voucher: null, replayed: true };
      }
      const payment = await tx.supplierPayment.findUnique({ where: { id: paymentId } });
      if (!payment) throw ApiError.notFound('Không tìm thấy khoản thanh toán nhà cung cấp');
      if (payment.status !== 'SUCCESS') throw ApiError.conflict('Khoản thanh toán đã được đảo trước đó');
      let voucher = null;
      const setting = await tx.cashbookSetting.findUnique({ where: { id: 1 }, select: { activatedAt: true } });
      if (setting?.activatedAt && payment.financialAccountId !== null) {
        const sourceType = payment.purchaseReceiptId === null ? CashVoucherSourceType.SUPPLIER_PAYMENT : CashVoucherSourceType.PURCHASE_RECEIPT_PAYMENT;
        const sourceVoucher = await tx.cashVoucher.findUnique({ where: { sourceKey: `${sourceType}:${payment.id}` }, select: { id: true } });
        if (sourceVoucher) {
          voucher = await CashbookPostingService.reverseSourceTransaction(tx, sourceType, payment.id,
            { id: actor.id, name: actor.name ?? null, role: 'ADMIN' }, reason.trim());
        }
      }
      const reversed = await tx.supplierPayment.update({ where: { id: payment.id }, data: {
        status: 'REVERSED', reversedAt: new Date(), reversedByUserId: actor.id, reverseReason: reason.trim(),
        reversalIdempotencyKey: idempotencyKey, reversalRequestDigest: digest
      } });
      await tx.auditLog.create({ data: {
        action: 'SUPPLIER_PAYMENT_REVERSED', targetType: 'SupplierPayment', targetId: payment.id,
        actorId: actor.id, actorName: actor.name ?? null,
        metadata: { supplierId: payment.supplierId, amount: payment.amount, reason: reason.trim() }
      } });
      return { payment: reversed, voucher, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 }).catch(normalizeCashbookPersistenceError);
    if (outcome.voucher && !outcome.replayed) emitToAll('cashbook:changed', cashbookChangedEvent(outcome.voucher));
    return outcome.payment;
  }
}
