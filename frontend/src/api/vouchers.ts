import { getApiBaseUrl } from './config';
import { VoucherDto, VoucherValidationResultDto } from './contracts';

function getAuthHeaders(token?: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function validateVoucherApi(
  code: string,
  orderAmount: number
): Promise<VoucherValidationResultDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/vouchers/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, orderAmount })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Mã voucher không hợp lệ (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function fetchActiveVouchersApi(): Promise<VoucherDto[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/vouchers/active`, {
    headers: { 'Content-Type': 'application/json' }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi tải danh sách voucher (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function fetchAdminVouchersApi(token: string | null): Promise<VoucherDto[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/vouchers`, {
    headers: getAuthHeaders(token)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi tải danh sách voucher admin (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function createVoucherApi(
  token: string | null,
  data: Partial<VoucherDto>
): Promise<VoucherDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/vouchers`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi tạo voucher (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function updateVoucherApi(
  token: string | null,
  id: number,
  data: Partial<VoucherDto>
): Promise<VoucherDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/vouchers/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(token),
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi cập nhật voucher (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function deleteVoucherApi(
  token: string | null,
  id: number
): Promise<{ success: boolean; softDeleted?: boolean }> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/vouchers/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi xóa voucher (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}
