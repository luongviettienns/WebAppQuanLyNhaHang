import { describe, expect, it } from 'vitest';
import { isMenuItemOrderable, isMenuItemOutOfStock } from './menuStock';

describe('menu stock presentation rules', () => {
  it('marks tracked zero-stock items as out of stock and not orderable', () => {
    const item = { trackStock: true, stockQuantity: 0, isAvailable: true };

    expect(isMenuItemOutOfStock(item)).toBe(true);
    expect(isMenuItemOrderable(item)).toBe(false);
  });

  it('keeps untracked zero-stock items orderable', () => {
    const item = { trackStock: false, stockQuantity: 0, isAvailable: true };

    expect(isMenuItemOutOfStock(item)).toBe(false);
    expect(isMenuItemOrderable(item)).toBe(true);
  });

  it('keeps manually unavailable items not orderable regardless of stock', () => {
    const item = { trackStock: true, stockQuantity: 5, isAvailable: false };

    expect(isMenuItemOutOfStock(item)).toBe(false);
    expect(isMenuItemOrderable(item)).toBe(false);
  });
});
