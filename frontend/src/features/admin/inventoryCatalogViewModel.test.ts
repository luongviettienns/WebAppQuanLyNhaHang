import { describe, expect, it } from 'vitest';
import {
  formatInventorySummary,
  getInventoryRowActionTarget,
  getInventoryRowKey,
  getInventoryStatusPresentation
} from './inventoryCatalogViewModel';
import { InventoryCatalogRowDto } from '../../api/contracts';

const row = (overrides: Partial<InventoryCatalogRowDto> = {}): InventoryCatalogRowDto => ({
  sourceType: 'INGREDIENT',
  sourceId: 12,
  sku: 'ING-001',
  name: 'Thịt gà',
  managementGroup: 'MATERIAL',
  unit: 'gram',
  costPrice: 80,
  stockQuantity: 100,
  minStock: 20,
  stockStatus: 'NORMAL',
  trackStock: true,
  isActive: true,
  updatedAt: '2026-09-20T00:00:00.000Z',
  ...overrides
});

describe('inventory catalog view model', () => {
  it('maps every stock status to a stable label and tone', () => {
    expect(getInventoryStatusPresentation('NORMAL')).toEqual({ label: 'Bình thường', tone: 'success' });
    expect(getInventoryStatusPresentation('LOW')).toEqual({ label: 'Sắp hết', tone: 'warning' });
    expect(getInventoryStatusPresentation('NEGATIVE')).toEqual({ label: 'Tồn âm', tone: 'danger' });
    expect(getInventoryStatusPresentation('NOT_TRACKED')).toEqual({ label: 'Không theo dõi', tone: 'neutral' });
  });

  it('keeps row identity composite and maps read-only navigation targets', () => {
    expect(getInventoryRowKey(row())).toBe('INGREDIENT:12');
    expect(getInventoryRowKey(row({ sourceType: 'MENU_ITEM', sourceId: 12, managementGroup: 'SELLABLE' }))).toBe('MENU_ITEM:12');
    expect(getInventoryRowActionTarget(row())).toBe('ingredient');
    expect(getInventoryRowActionTarget(row({ sourceType: 'MENU_ITEM', managementGroup: 'SELLABLE' }))).toBe('menu');
    expect(getInventoryRowActionTarget(row({ sourceType: 'TOOL', managementGroup: 'TOOL' }))).toBe('unavailable');
  });

  it('formats summary values and preserves missing cost as a dash', () => {
    expect(formatInventorySummary({ totalRows: 12, trackedRows: 8, lowStockRows: 2, negativeStockRows: 1, totalStockValue: 1250000 })).toEqual({
      total: '12',
      tracked: '8',
      alerts: '3',
      stockValue: '1.250.000 đ'
    });
    expect(formatInventorySummary({ totalRows: 0, trackedRows: 0, lowStockRows: 0, negativeStockRows: 0, totalStockValue: 0 }).stockValue).toBe('0 đ');
  });
});
