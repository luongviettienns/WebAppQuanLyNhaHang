import { describe, expect, it } from 'vitest';
import {
  buildBulkPayload,
  getBulkActionLabel,
  hasBulkSelection
} from './menuBulkViewModel';

describe('menu bulk action view-model', () => {
  it('recognizes whether the toolbar should be visible', () => {
    expect(hasBulkSelection([])).toBe(false);
    expect(hasBulkSelection([11])).toBe(true);
  });

  it('keeps stable Vietnamese labels for every supported action', () => {
    expect(getBulkActionLabel('setAvailability')).toBe('Đổi trạng thái bán');
    expect(getBulkActionLabel('setCategory')).toBe('Chuyển danh mục');
    expect(getBulkActionLabel('setMenuType')).toBe('Đổi loại menu');
    expect(getBulkActionLabel('setItemType')).toBe('Đổi loại món');
    expect(getBulkActionLabel('setTrackStock')).toBe('Theo dõi tồn kho');
    expect(getBulkActionLabel('adjustStock')).toBe('Điều chỉnh tồn kho');
    expect(getBulkActionLabel('delete')).toBe('Ẩn món đã chọn');
  });

  it('builds the exact payload shape for each action', () => {
    expect(buildBulkPayload('setAvailability', false)).toEqual({ isAvailable: false });
    expect(buildBulkPayload('setCategory', 7)).toEqual({ categoryId: 7 });
    expect(buildBulkPayload('setMenuType', 'DRINK')).toEqual({ menuType: 'DRINK' });
    expect(buildBulkPayload('setItemType', 'TOPPING')).toEqual({ itemType: 'TOPPING' });
    expect(buildBulkPayload('setTrackStock', true)).toEqual({ trackStock: true });
    expect(buildBulkPayload('adjustStock', -2)).toEqual({ delta: -2 });
    expect(buildBulkPayload('delete')).toEqual({});
  });

  it('rejects an invalid stock adjustment value', () => {
    expect(() => buildBulkPayload('adjustStock', 1.5)).toThrow('delta phải là số nguyên');
  });
});
