import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '../../api/config';
import type { KitchenWasteCreateDto } from '../../api/contracts';

export interface PendingKitchenWaste { key: string; input: KitchenWasteCreateDto }
const storageKey = (actorId: number) => `@crispy_bite_kitchen_waste:${getApiBaseUrl()}:${actorId}`;

export async function readPendingKitchenWaste(actorId: number): Promise<PendingKitchenWaste | null> {
  const raw = await AsyncStorage.getItem(storageKey(actorId));
  if (!raw) return null;
  const value: PendingKitchenWaste = JSON.parse(raw);
  if (typeof value.key !== 'string' || !value.key || !value.input ||
      !['MENU_ITEM', 'INGREDIENT'].includes(value.input.type) ||
      !Number.isFinite(value.input.quantity) || value.input.quantity <= 0 || typeof value.input.reason !== 'string') {
    throw new Error('Không thể khôi phục phiếu hao hụt đang chờ. Vui lòng liên hệ quản lý.');
  }
  return value;
}

export async function savePendingKitchenWaste(actorId: number, input: KitchenWasteCreateDto): Promise<PendingKitchenWaste> {
  const pending = { key: globalThis.crypto?.randomUUID?.() ?? `waste-${Date.now()}-${Math.random().toString(36).slice(2)}`, input };
  await AsyncStorage.setItem(storageKey(actorId), JSON.stringify(pending));
  return pending;
}

export async function clearPendingKitchenWaste(actorId: number): Promise<void> {
  await AsyncStorage.removeItem(storageKey(actorId));
}
