import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemDto } from '../api/contracts';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { auth } = vi.hoisted(() => ({ auth: { user: null, token: null, handleUnauthorized: vi.fn() } }));
vi.mock('./AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../api/config', () => ({
  getApiBaseUrl: () => 'http://test', getSocketBaseUrl: () => 'http://test', onServerConfigChanged: () => () => {}
}));
vi.mock('socket.io-client', () => ({ default: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));

import { RestaurantProvider, useRestaurant } from './RestaurantContext';

describe('RestaurantContext dine-in visit guard', () => {
  let screen: ReactTestRenderer;
  let restaurant: ReturnType<typeof useRestaurant>;
  const Consumer = () => { restaurant = useRestaurant(); return null; };
  beforeEach(async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => ({
      ok: true,
      json: async () => options?.method === 'POST' ? { data: { order: { id: 301, tableId: 4, tableSessionId: 'started-visit' } } } : { data: { categories: [] } }
    }));
    await act(async () => { screen = create(<RestaurantProvider><Consumer /></RestaurantProvider>); });
    const item: MenuItemDto = { id: 1, categoryId: 1, name: 'Chicken', basePrice: 35000, isAvailable: true,
      displayOrder: 1, sku: 'CHICKEN', menuType: 'FOOD', itemType: 'REGULAR', trackStock: false, stockQuantity: 0 };
    await act(async () => { restaurant.addToCart(item, 1, []); });
  });
  afterEach(async () => { await act(async () => { screen.unmount(); }); vi.restoreAllMocks(); });

  it.each([null, 'observed-visit'])('preserves the explicit observed marker %s in the HTTP order payload', async (marker) => {
    await act(async () => { await restaurant.createDineInOrder(4, undefined, 'qr-token', undefined, undefined, marker); });
    const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === 'POST')!;
    expect(JSON.parse(call[1]!.body as string)).toMatchObject({ tableId: 4, expectedTableSessionId: marker });
  });

  it('omits the visit guard for legacy staff callers', async () => {
    await act(async () => { await restaurant.createDineInOrder(4); });
    const call = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === 'POST')!;
    expect(JSON.parse(call[1]!.body as string)).not.toHaveProperty('expectedTableSessionId');
  });
});
