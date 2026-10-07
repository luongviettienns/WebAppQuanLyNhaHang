import { getApiBaseUrl } from './config';
import type { ApiErrorResponse } from './contracts';
import type { OrderDto } from './contracts';

export type ReservationStatus = 'PENDING_DEPOSIT' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type DepositStatus = 'UNPAID' | 'WAITING_CONFIRMATION' | 'PAID' | 'REFUND_PENDING' | 'REFUNDED' | 'FORFEITED' | 'APPLIED_TO_BILL';
export type VietQrInstructions = { bankId: string; accountNumber: string; accountName: string; qrUrl: string } | null;
export type ReservationDto = {
  id: number; code: string; status: ReservationStatus; depositStatus: DepositStatus; depositAmount: number;
  scheduledAt: string; partySize: number; contactName: string; contactPhone: string; note: string | null;
  customer: { id: number; name: string; phone: string | null } | null;
  table: { id: number; tableNumber: number; displayName: string | null } | null;
};
export type ReservationListData = { items: ReservationDto[]; pagination: { page: number; pageSize: number; totalRows: number; totalPages: number } };
export type ReservationFilter = { status?: ReservationStatus; depositStatus?: DepositStatus; search?: string; from?: string; to?: string; page?: number; pageSize?: number };
export type PublicReservationResult = {
  code: string; accessToken: string; status: ReservationStatus; depositStatus: DepositStatus; depositAmount: number;
  scheduledAt: string; partySize: number; transferContent: string; paymentInstructions: VietQrInstructions;
  tableOrder: { tableNumber: number; qrCodeToken: string } | null;
};
export type QrOrderPaymentDeclaration = { paymentStatus: string; amountDue: number; transferContent: string; paymentInstructions: VietQrInstructions; order: OrderDto };
export type ReservationOrderPaymentDeclaration = QrOrderPaymentDeclaration;
export type PaymentConfirmationDto = {
  id: number; code: string; status: string; paymentStatus: string; reservationId: number | null; tableId: number | null;
  tableNumber: number | null; finalAmount: number; totalAmount: number; vatAmount: number; createdAt: string;
  reservation: { id: number; code: string; contactName: string; contactPhone: string } | null;
  customer: { id: number; name: string; phone: string | null } | null;
  paymentDeclaration: { id: number; amount: number; paymentMethod: string | null; createdAt: string } | null; transferContent: string;
};

const headers = (token?: string | null, json = false): Record<string, string> => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) });
async function request<T>(path: string, options: { token?: string | null; method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/api/${path}`, {
    method: options.method || 'GET', headers: headers(options.token, options.body !== undefined),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
    throw new Error(payload?.error?.message || `Không thể xử lý đặt bàn (${response.status})`);
  }
  return (await response.json() as { data: T }).data;
}
function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return query.toString();
}

export const fetchReservationsApi = (token: string | null, filter: ReservationFilter = {}) => {
  const query = queryString(filter);
  return request<ReservationListData>(`reservations${query ? `?${query}` : ''}`, { token });
};
export const fetchReservationDetailApi = (token: string | null, id: number) => request<ReservationDto & Record<string, unknown>>(`reservations/${id}`, { token });
export const createPublicReservationApi = (input: { name: string; phone: string; scheduledAt: string; partySize: number; note?: string }) => request<PublicReservationResult>('reservations', { method: 'POST', body: input });
export const fetchPublicReservationApi = (accessToken: string) => request<PublicReservationResult>(`reservations/public/${encodeURIComponent(accessToken)}`);
export const declarePublicReservationPaymentApi = (accessToken: string) => request<PublicReservationResult>(`reservations/public/${encodeURIComponent(accessToken)}/payment-declaration`, { method: 'POST', body: {} });
export const declareQrOrderPaymentApi = (orderId: number, access: { reservationAccessToken: string } | { qrCodeToken: string }) => request<QrOrderPaymentDeclaration>(`orders/${orderId}/payment-declaration`, { method: 'POST', body: access });
export const declareReservationOrderPaymentApi = (orderId: number, accessToken: string) => declareQrOrderPaymentApi(orderId, { reservationAccessToken: accessToken });
export const requestReservationCancellationApi = (accessToken: string, reason: string) => request<PublicReservationResult>(`reservations/public/${encodeURIComponent(accessToken)}/cancellation-request`, { method: 'POST', body: { reason } });
export const confirmReservationDepositApi = (token: string | null, id: number, amount: number, externalReference: string, financialAccountId?: number | null) => request<ReservationDto>(`reservations/${id}/deposit/confirm`, { token, method: 'POST', body: { amount, paymentMethod: 'BANK_TRANSFER', externalReference, financialAccountId } });
export const rejectReservationDepositApi = (token: string | null, id: number, reason: string) => request<ReservationDto>(`reservations/${id}/deposit/reject`, { token, method: 'POST', body: { reason } });
export const refundReservationDepositApi = (token: string | null, id: number, amount: number, externalReference: string, reason: string, financialAccountId?: number | null) => request<ReservationDto>(`reservations/${id}/deposit/refund`, { token, method: 'POST', body: { amount, externalReference, reason, financialAccountId } });
export const rescheduleReservationApi = (token: string | null, id: number, newScheduledAt: string, reason: string) => request<ReservationDto>(`reservations/${id}/reschedule`, { token, method: 'POST', body: { newScheduledAt, reason } });
export const markReservationNoShowApi = (token: string | null, id: number, reason: string) => request<ReservationDto>(`reservations/${id}/no-show`, { token, method: 'POST', body: { reason } });
export const checkInReservationApi = (token: string | null, id: number, tableId: number) => request<ReservationDto>(`reservations/${id}/check-in`, { token, method: 'POST', body: { tableId } });
export const cancelReservationByRestaurantApi = (token: string | null, id: number, reason: string) => request<ReservationDto>(`reservations/${id}/cancel`, { token, method: 'POST', body: { reason } });
export const fetchOrderPaymentConfirmationsApi = (token: string | null) => request<PaymentConfirmationDto[]>('orders/payment-confirmations', { token });
export const confirmOrderPaymentApi = (token: string | null, id: number, amount: number, externalReference: string, financialAccountId?: number | null) => request<PaymentConfirmationDto>(`orders/${id}/payment/confirm`, { token, method: 'POST', body: { amount, externalReference, financialAccountId } });
export const rejectOrderPaymentApi = (token: string | null, id: number, reason: string) => request<PaymentConfirmationDto>(`orders/${id}/payment/reject`, { token, method: 'POST', body: { reason } });
export const authorizeReservationOrderPayLaterApi = (token: string | null, id: number, reason: string) => request<PaymentConfirmationDto>(`orders/${id}/pay-later`, { token, method: 'POST', body: { reason } });
