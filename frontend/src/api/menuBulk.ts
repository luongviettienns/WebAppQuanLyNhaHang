import { ApiErrorResponse, MenuBulkAction, MenuBulkActionResultDto, MenuBulkPayload } from './contracts';
import { getApiBaseUrl } from './config';

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  const error = new Error(payload?.error?.message || `${fallback} (${response.status})`);
  Object.assign(error, { status: response.status });
  throw error;
}

export async function bulkUpdateMenuItemsApi(
  token: string | null,
  ids: number[],
  action: MenuBulkAction,
  payload: MenuBulkPayload
): Promise<MenuBulkActionResultDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/menu/bulk`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ ids, action, payload })
  });

  if (!response.ok) await throwApiError(response, 'Lỗi cập nhật hàng loạt menu');
  const result = await response.json() as { data: MenuBulkActionResultDto };
  return result.data;
}
