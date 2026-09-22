import { InventoryWasteStatus } from '@prisma/client';
import type {
  CreateInventoryWasteInput,
  InventoryWasteLineInput,
  InventoryWasteListQuery,
  UpdateInventoryWasteInput
} from './inventory-waste.schemas';

export type InventoryWasteCommandActor = {
  id: number;
  name: string;
};

export type InventoryWasteActor = InventoryWasteCommandActor;
export type InventoryWasteDraftInput = CreateInventoryWasteInput | UpdateInventoryWasteInput;
export type InventoryWasteDraftLineInput = InventoryWasteLineInput;
export type InventoryWasteQuery = InventoryWasteListQuery;

export type InventoryWasteLineDto = {
  id: number;
  ingredientId: number;
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  systemQuantity: number;
  quantity: number;
  costPerUnit: number;
  lineValue: number;
};

export type InventoryWasteDto = {
  id: number;
  wasteCode: string;
  status: InventoryWasteStatus;
  wastedAt: Date;
  completedAt: Date | null;
  note: string | null;
  totalValue: number;
  totalQuantity: number;
  createdByUserId: number | null;
  completedByUserId: number | null;
  cancelledByUserId: number | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: InventoryWasteLineDto[];
  recentWastes?: InventoryWasteDto[];
};

export type InventoryWasteListDataDto = {
  items: InventoryWasteDto[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  totalValue: number;
};

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

export type InventoryWasteImportPreviewDto = {
  fileName: string;
  totalRows: number;
  validRows: Array<{
    rowNumber: number;
    ingredientId: number;
    ingredientSku: string;
    ingredientName: string;
    unit: string;
    quantity: number;
    systemQuantity: number;
    costPerUnit: number;
    note?: string;
  }>;
  errorRows: Array<InventoryWasteImportPreviewRow>;
};
