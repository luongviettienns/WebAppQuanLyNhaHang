import { emitToAll } from '../../lib/socket';

export type InventoryChangedSourceType = 'INGREDIENT' | 'MENU_ITEM' | 'SUPPLIER' | 'SUPPLIER_GROUP';
export type InventoryChangedReason =
  | 'STOCK_IN'
  | 'SUPPLIER_UPDATED'
  | 'PURCHASE_RECEIPT_POSTED'
  | 'PURCHASE_RETURN_CHANGED'
  | 'ORDER_PAID'
  | 'ORDER_VOIDED'
  | 'MANUAL_ADJUST'
  | 'KITCHEN_WASTE'
  | 'RECIPE_UPDATED'
  | 'INGREDIENT_UPDATED'
  | 'MENU_ITEM_UPDATED';

export type InventoryChangedPayload = {
  sourceType: InventoryChangedSourceType;
  sourceIds: number[];
  reason: InventoryChangedReason;
  updatedAt: string;
};

export function emitInventoryChanged(payload: InventoryChangedPayload): void {
  if (payload.sourceIds.length === 0) return;

  emitToAll('inventory:changed', {
    ...payload,
    sourceIds: [...new Set(payload.sourceIds)].sort((left, right) => left - right)
  });
}
