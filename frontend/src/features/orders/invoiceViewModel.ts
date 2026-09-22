import { OrderInvoiceListItemDto, OrderStatus, PaymentStatus } from '../../api/contracts';

export function formatInvoiceMoney(value: number): string {
  return `${value.toLocaleString('vi-VN')} ₫`;
}

export function formatInvoiceDate(value: string): string {
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export function getOrderStatusPresentation(status: OrderStatus): { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' } {
  const values: Record<OrderStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
    PENDING: { label: 'Chờ xử lý', tone: 'warning' }, PREPARING: { label: 'Đang chuẩn bị', tone: 'info' },
    READY: { label: 'Sẵn sàng', tone: 'info' }, COMPLETED: { label: 'Hoàn thành', tone: 'success' }, CANCELLED: { label: 'Đã hủy', tone: 'danger' }
  };
  return values[status];
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  return ({ UNPAID: 'Chưa thanh toán', PAID: 'Đã thanh toán', VOIDED: 'Đã hoàn tác' })[status];
}

export function getInvoiceCustomerLabel(item: Pick<OrderInvoiceListItemDto, 'customerName'>): string {
  return item.customerName || '—';
}
