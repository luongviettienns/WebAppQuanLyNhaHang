import { CategoryDto } from '../../api/contracts';

export function moveCategory(categories: CategoryDto[], index: number, direction: -1 | 1): CategoryDto[] {
  const targetIndex = index + direction;
  if (index < 0 || index >= categories.length || targetIndex < 0 || targetIndex >= categories.length) {
    return categories.slice();
  }

  const reordered = categories.slice();
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  return reordered.map((category, displayOrder) => ({ ...category, displayOrder }));
}

export function normalizeCategoryDraft(nameInput: string, displayOrderInput: string) {
  const name = nameInput.trim();
  if (!name) {
    throw new Error('Tên danh mục không được để trống');
  }

  const displayOrder = Number(displayOrderInput.trim() || '0');
  if (!Number.isInteger(displayOrder) || displayOrder < 0) {
    throw new Error('displayOrder không hợp lệ');
  }

  return { name, displayOrder };
}
