import { describe, expect, it } from 'vitest';
import { CategoryDto, MenuItemDto } from '../../api/contracts';
import { filterMenuManagementItems, formatMenuItemCode } from './menuManagementFilters';

const categories: CategoryDto[] = [
  { id: 1, name: 'Combo', displayOrder: 1 },
  { id: 2, name: 'Tra sua', displayOrder: 2 }
];

const items: MenuItemDto[] = [
  {
    id: 1,
    categoryId: 1,
    name: 'Combo ga gion',
    description: 'Ga va khoai',
    basePrice: 69000,
    isAvailable: true,
    displayOrder: 1,
    modifierGroups: [
      {
        id: 10,
        menuItemId: 1,
        name: 'Chon vi',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        options: []
      }
    ]
  },
  {
    id: 25,
    categoryId: 2,
    name: 'Tra dao',
    description: 'Do uong mat',
    basePrice: 32000,
    isAvailable: false,
    displayOrder: 2,
    modifierGroups: []
  }
];

describe('menuManagementFilters', () => {
  it('formats display item codes without requiring a persisted sku field', () => {
    expect(formatMenuItemCode(25)).toBe('SP000025');
  });

  it('filters by display code, category, availability and option presence', () => {
    expect(
      filterMenuManagementItems(items, categories, {
        searchQuery: 'sp000025',
        categoryId: null,
        availability: 'all',
        optionPresence: 'all'
      }).map((item) => item.id)
    ).toEqual([25]);

    expect(
      filterMenuManagementItems(items, categories, {
        searchQuery: 'combo',
        categoryId: 1,
        availability: 'available',
        optionPresence: 'withOptions'
      }).map((item) => item.id)
    ).toEqual([1]);

    expect(
      filterMenuManagementItems(items, categories, {
        searchQuery: 'tra sua',
        categoryId: null,
        availability: 'unavailable',
        optionPresence: 'withoutOptions'
      }).map((item) => item.id)
    ).toEqual([25]);
  });
});
