import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkUpdateMenuItemsApi } from './menuBulk';

vi.mock('./config', () => ({ getApiBaseUrl: () => 'https://api.example.test' }));

describe('menu bulk API helper', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('sends the selected IDs, action and payload to the admin bulk endpoint', async () => {
    const result = { updatedCount: 2, action: 'setAvailability' as const };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: result }) });

    await expect(
      bulkUpdateMenuItemsApi('token-123', [11, 12], 'setAvailability', { isAvailable: false })
    ).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/menu/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-123' },
      body: JSON.stringify({ ids: [11, 12], action: 'setAvailability', payload: { isAvailable: false } })
    });
  });

  it('maps the backend error message to a readable Error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Tồn kho sau cập nhật không được âm' } })
    });

    await expect(
      bulkUpdateMenuItemsApi(null, [11], 'adjustStock', { delta: -3 })
    ).rejects.toThrow('Tồn kho sau cập nhật không được âm');
  });
});
