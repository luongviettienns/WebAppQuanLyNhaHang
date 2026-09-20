export type InventorySourceType = 'INGREDIENT' | 'MENU_ITEM' | 'TOOL';
export type InventoryManagementGroup = 'MATERIAL' | 'SELLABLE' | 'TOOL';
export type InventoryStockStatus = 'NORMAL' | 'LOW' | 'NEGATIVE' | 'NOT_TRACKED';

export interface InventoryCatalogRowDto {
  sourceType: InventorySourceType;
  sourceId: number;
  sku: string;
  name: string;
  managementGroup: InventoryManagementGroup;
  categoryId?: number | null;
  categoryName?: string | null;
  menuType?: string | null;
  unit: string;
  costPrice: number | null;
  stockQuantity: number | null;
  minStock: number | null;
  maxStock?: number | null;
  stockStatus: InventoryStockStatus;
  trackStock: boolean;
  isActive: boolean;
  position?: string | null;
  brand?: string | null;
  attributes?: Record<string, string> | null;
  updatedAt: string;
}

export interface InventoryCatalogSummaryDto {
  totalRows: number;
  trackedRows: number;
  lowStockRows: number;
  negativeStockRows: number;
  totalStockValue: number;
}

export interface InventoryCatalogPaginationDto {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export interface InventoryCatalogDataDto {
  rows: InventoryCatalogRowDto[];
  summary: InventoryCatalogSummaryDto;
  pagination: InventoryCatalogPaginationDto;
}
