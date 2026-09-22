import type {
  CreateInventoryWasteInput,
  InventoryWasteLineInput,
  InventoryWasteListQuery,
  UpdateInventoryWasteInput
} from './inventory-waste.schemas';

export type InventoryWasteCommandActor = {
  userId: number;
};

export type InventoryWasteDraftInput = CreateInventoryWasteInput | UpdateInventoryWasteInput;
export type InventoryWasteDraftLineInput = InventoryWasteLineInput;
export type InventoryWasteQuery = InventoryWasteListQuery;

export type InventoryWasteImportRow = {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  quantity: number;
  note?: string;
};

export type InventoryWasteImportPreviewRow = InventoryWasteImportRow & {
  ingredientId?: number;
  systemQuantity?: number;
  error?: string;
};
