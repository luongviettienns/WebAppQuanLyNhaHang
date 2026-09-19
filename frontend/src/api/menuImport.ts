import { getApiBaseUrl } from './config';
import {
  ApiErrorResponse,
  MenuExportFormat,
  MenuImportCommitDto,
  MenuImportPreviewDto,
  MenuImportRowDto
} from './contracts';

function jsonHeaders(token?: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function authHeaders(token?: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = await response.json().catch(() => null) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || `${fallback} (${response.status})`);
}

export async function previewMenuImportApi(
  token: string | null,
  fileName: string,
  fileBase64: string,
  createMissingCategories = false
): Promise<MenuImportPreviewDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/menu/import/preview`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ fileName, fileBase64, createMissingCategories })
  });

  if (!response.ok) await throwApiError(response, 'Lỗi đối soát menu');
  const payload = await response.json() as { data: MenuImportPreviewDto };
  return payload.data;
}

export async function commitMenuImportApi(
  token: string | null,
  sourceFileName: string,
  rows: MenuImportRowDto[],
  createMissingCategories = false
): Promise<MenuImportCommitDto> {
  const response = await fetch(`${getApiBaseUrl()}/api/menu/import/commit`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ sourceFileName, createMissingCategories, rows })
  });

  if (!response.ok) await throwApiError(response, 'Lỗi ghi menu từ file');
  const payload = await response.json() as { data: MenuImportCommitDto };
  return payload.data;
}

export async function downloadMenuExportApi(token: string | null, format: MenuExportFormat): Promise<Blob> {
  const response = await fetch(`${getApiBaseUrl()}/api/menu/export?format=${format}`, {
    headers: authHeaders(token)
  });

  if (!response.ok) await throwApiError(response, 'Lỗi tải menu');
  return response.blob();
}
