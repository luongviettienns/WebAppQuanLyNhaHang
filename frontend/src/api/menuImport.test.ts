import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  commitMenuImportApi,
  downloadMenuExportApi,
  previewMenuImportApi
} from './menuImport';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('menu import API helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('sends preview payload with the admin bearer token and returns normalized rows', async () => {
    const preview = {
      fileName: 'menu.csv',
      totalRows: 1,
      validRows: [],
      errorRows: [],
      canCommit: false
    };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: preview }) });

    await expect(previewMenuImportApi('token-123', 'menu.csv', 'YmFzZTY0', false)).resolves.toEqual(preview);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/menu/import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
      body: JSON.stringify({ fileName: 'menu.csv', fileBase64: 'YmFzZTY0', createMissingCategories: false })
    });
  });

  it('commits normalized rows with the source filename and category option', async () => {
    const row = {
      rowNumber: 2,
      name: 'Món mới',
      categoryName: 'Món chính',
      basePrice: 45000,
      menuType: 'FOOD' as const,
      itemType: 'REGULAR' as const,
      isAvailable: true,
      trackStock: false,
      stockQuantity: 0,
      position: null,
      description: null,
      imageUrl: null
    };
    const result = { createdCount: 1, updatedCount: 0, categoryCreatedCount: 0 };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: result }) });

    await expect(commitMenuImportApi('token-123', 'menu.xlsx', [row], true)).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/menu/import/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
      body: JSON.stringify({ sourceFileName: 'menu.xlsx', createMissingCategories: true, rows: [row] })
    });
  });

  it('maps API error messages to a readable Error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Dòng 3 thiếu categoryName' } })
    });

    await expect(previewMenuImportApi(null, 'menu.csv', 'YmFzZTY0', false)).rejects.toThrow('Dòng 3 thiếu categoryName');
  });

  it('returns the binary export as a Blob and requests the selected format', async () => {
    const blob = new Blob(['sku,name\n'], { type: 'text/csv' });
    fetchMock.mockResolvedValue({ ok: true, blob: async () => blob });

    await expect(downloadMenuExportApi('token-123', 'csv')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/menu/export?format=csv', {
      headers: { Authorization: 'Bearer token-123' }
    });
  });
});
