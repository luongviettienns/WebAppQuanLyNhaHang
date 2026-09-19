import { describe, expect, it } from 'vitest';
import { CategoryDto } from '../../api/contracts';
import { moveCategory, normalizeCategoryDraft } from './categoryManagement';

const categories: CategoryDto[] = [
  { id: 1, name: 'Món chính', displayOrder: 0 },
  { id: 2, name: 'Đồ uống', displayOrder: 1 },
  { id: 3, name: 'Tráng miệng', displayOrder: 2 }
];

describe('category management helpers', () => {
  it('moves a category one position without mutating the source list', () => {
    const reordered = moveCategory(categories, 2, -1);

    expect(reordered.map(category => category.id)).toEqual([1, 3, 2]);
    expect(categories.map(category => category.id)).toEqual([1, 2, 3]);
  });

  it('normalizes category form values before sending them to the API', () => {
    expect(normalizeCategoryDraft('  Đồ uống  ', ' 7 ')).toEqual({ name: 'Đồ uống', displayOrder: 7 });
    expect(() => normalizeCategoryDraft('   ', '0')).toThrow('Tên danh mục không được để trống');
    expect(() => normalizeCategoryDraft('Đồ uống', '-1')).toThrow('displayOrder không hợp lệ');
  });
});
