import type { MenuItemDto, OrderItemCreateDto, SelectedModifierDto } from '../../api/contracts';

export interface CommissionCartLine {
  menuItem: MenuItemDto;
  quantity: number;
  selectedModifiers: SelectedModifierDto[];
  unitPrice: number;
  subtotal: number;
  notes?: string;
  commissionEmployeeId: number | null;
}

function identity(line: CommissionCartLine) {
  const modifiers = line.selectedModifiers
    .map(modifier => `${modifier.modifierGroupId}:${modifier.optionId}`)
    .sort()
    .join('|');
  return `${line.menuItem.id}::${modifiers}::${line.notes?.trim() ?? ''}::${line.commissionEmployeeId ?? 'none'}`;
}

export function appendOrMergeCommissionCartLine<T extends CommissionCartLine>(current: T[], incoming: T): T[] {
  const match = current.findIndex(line => identity(line) === identity(incoming));
  if (match < 0) return [...current, incoming];
  return current.map((line, index) => index === match ? {
    ...line,
    quantity: line.quantity + incoming.quantity,
    subtotal: line.subtotal + incoming.subtotal
  } : line);
}

export function cartToOrderItems(lines: CommissionCartLine[], forceNullCommissionEmployeeId: boolean): OrderItemCreateDto[] {
  return lines.map(line => ({
    menuItemId: line.menuItem.id,
    quantity: line.quantity,
    selectedModifiers: line.selectedModifiers.map(modifier => ({
      modifierGroupId: modifier.modifierGroupId,
      optionId: modifier.optionId
    })) as SelectedModifierDto[],
    notes: line.notes,
    commissionEmployeeId: forceNullCommissionEmployeeId ? null : line.commissionEmployeeId
  }));
}
