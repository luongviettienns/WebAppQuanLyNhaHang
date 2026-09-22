import { CategoryDto, MenuItemDto, MenuItemType, MenuType } from '../../api/contracts';

export type MenuAvailabilityFilter = 'all' | 'available' | 'unavailable';
export type MenuOptionPresenceFilter = 'all' | 'withOptions' | 'withoutOptions';
export type MenuTypeFilter = 'all' | MenuType;
export type MenuItemTypeFilter = 'all' | MenuItemType;
export type MenuStockFilter = 'all' | 'tracked' | 'untracked' | 'inStock' | 'outOfStock';

export interface MenuManagementFilters {
  searchQuery: string;
  categoryId: number | null;
  availability: MenuAvailabilityFilter;
  optionPresence: MenuOptionPresenceFilter;
  menuType?: MenuTypeFilter;
  itemType?: MenuItemTypeFilter;
  stockStatus?: MenuStockFilter;
}

export function formatMenuItemCode(id: number) {
  return `SP${id.toString().padStart(6, '0')}`;
}

export function filterMenuManagementItems(
  items: MenuItemDto[],
  categories: CategoryDto[],
  filters: MenuManagementFilters
) {
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const query = filters.searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.categoryId !== null && item.categoryId !== filters.categoryId) {
      return false;
    }

    if (filters.availability === 'available' && !item.isAvailable) {
      return false;
    }

    if (filters.availability === 'unavailable' && item.isAvailable) {
      return false;
    }

    const optionCount = item.modifierGroups?.length || 0;
    if (filters.optionPresence === 'withOptions' && optionCount === 0) {
      return false;
    }

    if (filters.optionPresence === 'withoutOptions' && optionCount > 0) {
      return false;
    }

    if (filters.menuType && filters.menuType !== 'all' && item.menuType !== filters.menuType) {
      return false;
    }

    if (filters.itemType && filters.itemType !== 'all' && item.itemType !== filters.itemType) {
      return false;
    }

    if (filters.stockStatus === 'tracked' && !item.trackStock) {
      return false;
    }

    if (filters.stockStatus === 'untracked' && item.trackStock) {
      return false;
    }

    if (filters.stockStatus === 'inStock' && (!item.trackStock || item.stockQuantity <= 0)) {
      return false;
    }

    if (filters.stockStatus === 'outOfStock' && (!item.trackStock || item.stockQuantity > 0)) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      item.sku || '',
      formatMenuItemCode(item.id),
      item.name,
      item.description || '',
      categoryNameById.get(item.categoryId) || '',
      item.position || ''
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}
