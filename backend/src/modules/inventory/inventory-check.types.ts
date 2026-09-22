import { InventoryCheckStatus } from '@prisma/client';

export type InventoryCheckActor = { id: number; name: string };

export type InventoryCheckLineDto = {
  id: number;
  ingredientId: number;
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  systemQuantity: number;
  actualQuantity: number | null;
  varianceQuantity: number | null;
  costPerUnit: number;
  varianceValue: number | null;
};

export type InventoryCheckSummaryDto = {
  totalActualQuantity: number;
  totalVarianceQuantity: number;
  increasedQuantity: number;
  decreasedQuantity: number;
  totalVarianceValue: number;
  uncheckedCount: number;
};

export type InventoryCheckDto = InventoryCheckSummaryDto & {
  id: number;
  checkCode: string;
  status: InventoryCheckStatus;
  countedAt: Date;
  balancedAt: Date | null;
  note: string | null;
  createdByUserId: number | null;
  balancedByUserId: number | null;
  cancelledByUserId: number | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: InventoryCheckLineDto[];
  recentChecks?: InventoryCheckDto[];
};

export type InventoryCheckListDataDto = {
  items: InventoryCheckDto[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  totalVarianceValue: number;
  increasedQuantity: number;
  decreasedQuantity: number;
};

export type InventoryCheckImportValidRowDto = {
  rowNumber: number;
  ingredientId: number;
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  actualQuantity: number;
};

export type InventoryCheckImportErrorRowDto = {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  actualQuantity: number;
  error: string;
};

export type InventoryCheckImportPreviewDto = {
  fileName: string;
  totalRows: number;
  validRows: InventoryCheckImportValidRowDto[];
  errorRows: InventoryCheckImportErrorRowDto[];
};
