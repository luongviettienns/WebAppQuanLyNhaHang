import type { PurchaseReceiptStatus } from '../../api/contracts';
import type { StatusTone } from '../../ui';

const statusPresentation: Record<PurchaseReceiptStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Phiếu tạm', tone: 'warning' },
  POSTED: { label: 'Đã nhập hàng', tone: 'success' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' }
};

export function getPurchaseReceiptStatusPresentation(status: PurchaseReceiptStatus) {
  return statusPresentation[status];
}

export function getReceiptPaymentSummary(input: {
  subtotalAmount: number;
  discountAmount: number;
  paidAmount: number;
}): { payableAmount: number; outstandingAmount: number } {
  const payableAmount = Math.max(0, input.subtotalAmount - input.discountAmount);
  return {
    payableAmount,
    outstandingAmount: Math.max(0, payableAmount - input.paidAmount)
  };
}

export function formatReceiptMoney(value: number): string {
  return `${value.toLocaleString('vi-VN')} đ`;
}

export function formatReceiptDate(value: string): string {
  return new Date(value).toLocaleString('vi-VN');
}

export function getPurchaseReceiptRowKey(id: number): string {
  return `PURCHASE_RECEIPT:${id}`;
}
