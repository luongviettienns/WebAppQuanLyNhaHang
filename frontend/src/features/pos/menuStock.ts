import { MenuItemDto } from '../../api/contracts';

export function isMenuItemOutOfStock(item: Pick<MenuItemDto, 'trackStock' | 'stockQuantity'>): boolean {
  return item.trackStock && item.stockQuantity <= 0;
}

export function isMenuItemOrderable(item: Pick<MenuItemDto, 'isAvailable' | 'trackStock' | 'stockQuantity'>): boolean {
  return item.isAvailable && !isMenuItemOutOfStock(item);
}
