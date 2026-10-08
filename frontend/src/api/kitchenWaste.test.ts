import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./config', () => ({ getApiBaseUrl: () => 'http://localhost:4000' }));
import { fetchKitchenWasteOptionsApi, recordKitchenWasteApi } from './inventory';

afterEach(() => { vi.unstubAllGlobals(); });
describe('Kitchen waste HTTP contract', () => {
  it('sends the existing request key in a header and preserves fractional stock quantities', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return { ok: true, json: async () => ({ data: { totalCostAmount: 5000, deductedIngredients: [{ ingredientId: 41, name: 'Gà', quantityDeducted: 0.05, costAmount: 5000 }] } }) };
    });
    const result = await recordKitchenWasteApi('token', { type: 'INGREDIENT', ingredientId: 41, quantity: 0.05, reason: 'Bị rơi' }, 'pending-key');
    expect(requests[0].url).toBe('http://localhost:4000/api/inventory/kitchen-waste');
    expect(requests[0].init.headers).toMatchObject({ 'Idempotency-Key': 'pending-key', Authorization: 'Bearer token' });
    expect(JSON.parse(String(requests[0].init.body)).quantity).toBe(0.05);
    expect(result.deductedIngredients[0].quantityDeducted).toBe(0.05);
  });

  it('distinguishes a definite validation response from a lost response for safe retries', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Số lượng không hợp lệ' } }) }));
    await expect(recordKitchenWasteApi('token', { type: 'INGREDIENT', ingredientId: 41, quantity: 0, reason: 'Bị rơi' }, 'bad-key'))
      .rejects.toMatchObject({ status: 400 });
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(recordKitchenWasteApi('token', { type: 'INGREDIENT', ingredientId: 41, quantity: 0.05, reason: 'Bị rơi' }, 'pending-key'))
      .rejects.toBeInstanceOf(TypeError);
  });

  it('loads the kitchen-specific options endpoint', async () => {
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { requests.push(url); return { ok: true, json: async () => ({ data: { ingredients: [], recipes: [] } }) }; });
    expect(await fetchKitchenWasteOptionsApi('token')).toEqual({ ingredients: [], recipes: [] });
    expect(requests).toEqual(['http://localhost:4000/api/inventory/kitchen-waste/options']);
  });
});
