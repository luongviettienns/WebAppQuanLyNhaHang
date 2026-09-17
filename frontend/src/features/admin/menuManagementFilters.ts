import { CategoryDto, MenuItemDto } from '../../api/contracts';

export type MenuAvailabilityFilter = 'all' | 'available' | 'unavailable';
export type MenuOptionPresenceFilter = 'all' | 'withOptions' | 'withoutOptions';

export interface MenuManagementFilters {
  searchQuery: string;
  categoryId: number | null;
  availability: MenuAvailabilityFilter;
  optionPresence: MenuOptionPresenceFilter;
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

    if (!query) {
      return true;
    }

    const haystack = [
      formatMenuItemCode(item.id),
      item.name,
      item.description || '',
      categoryNameById.get(item.categoryId) || ''
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}
