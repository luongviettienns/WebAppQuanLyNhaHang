import {
  MenuBulkAction,
  MenuBulkPayload,
  MenuItemType,
  MenuType
} from '../../api/contracts';

const MENU_TYPES: MenuType[] = ['FOOD', 'DRINK', 'SERVICE', 'OTHER'];
const ITEM_TYPES: MenuItemType[] = ['REGULAR', 'TOPPING', 'COMBO', 'SERVICE'];

export function hasBulkSelection(ids: number[]): boolean {
  return ids.length > 0;
}

export function getBulkActionLabel(action: MenuBulkAction): string {
  const labels: Record<MenuBulkAction, string> = {
    setAvailability: 'Đổi trạng thái bán',
    setCategory: 'Chuyển danh mục',
    setMenuType: 'Đổi loại menu',
    setItemType: 'Đổi loại món',
    setTrackStock: 'Theo dõi tồn kho',
    adjustStock: 'Điều chỉnh tồn kho',
    delete: 'Ẩn món đã chọn'
  };
  return labels[action];
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} phải là boolean`);
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} phải là số nguyên dương`);
  }
  return value;
}

function requireEnum<T extends string>(value: unknown, values: T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${field} không hợp lệ`);
  }
  return value as T;
}

export function buildBulkPayload(action: MenuBulkAction, value?: unknown): MenuBulkPayload {
  switch (action) {
    case 'setAvailability':
      return { isAvailable: requireBoolean(value, 'isAvailable') };
    case 'setCategory':
      return { categoryId: requirePositiveInteger(value, 'categoryId') };
    case 'setMenuType':
      return { menuType: requireEnum(value, MENU_TYPES, 'menuType') };
    case 'setItemType':
      return { itemType: requireEnum(value, ITEM_TYPES, 'itemType') };
    case 'setTrackStock':
      return { trackStock: requireBoolean(value, 'trackStock') };
    case 'adjustStock':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new Error('delta phải là số nguyên');
      }
      return { delta: value };
    case 'delete':
      return {};
  }
}
