// frontend/src/api/contracts.ts
// Chuan hoa DTO, Enums va Socket Payload cho toan bo Client CRISPY BITE QSR

// ==========================================
// 1. ENUMS
// ==========================================
export type Role = 'CASHIER' | 'KITCHEN' | 'ADMIN';
export type OrderType = 'DINE_IN' | 'TAKE_AWAY';
export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'NEED_CLEANING' | 'DIRTY';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD';
export type PaymentStatus = 'UNPAID' | 'PAID' | 'VOIDED';
export type MenuType = 'FOOD' | 'DRINK' | 'SERVICE' | 'OTHER';
export type MenuItemType = 'REGULAR' | 'TOPPING' | 'COMBO' | 'SERVICE';
export type PriceListType = 'GENERAL' | 'CUSTOM';
export type PriceListScopeType = 'GLOBAL' | 'BRANCH' | 'CHANNEL' | 'CUSTOMER_GROUP';
export type PurchaseReceiptStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';
export type MenuBulkAction =
  | 'setAvailability'
  | 'setCategory'
  | 'setMenuType'
  | 'setItemType'
  | 'setTrackStock'
  | 'adjustStock'
  | 'delete';

export type MenuBulkPayload =
  | { isAvailable: boolean }
  | { categoryId: number }
  | { menuType: MenuType }
  | { itemType: MenuItemType }
  | { trackStock: boolean }
  | { delta: number }
  | Record<string, never>;

export interface MenuBulkActionResultDto {
  updatedCount: number;
  action: MenuBulkAction;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ORDER_STATE_INVALID'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'INVALID_CREDENTIALS';

// ==========================================
// 2. HTTP ENVELOPES
// ==========================================
export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string>;
  };
}

// ==========================================
// 3. USER & AUTH DTOs
// ==========================================
export interface UserDto {
  id: number;
  username: string;
  name: string;
  role: Role;
}

export interface LoginResponseDto {
  token: string;
  user: UserDto;
}

// ==========================================
// 4. MENU & MODIFIER DTOs
// ==========================================
export interface ModifierOptionDto {
  id: number;
  modifierGroupId: number;
  name: string;
  priceDelta: number; // VND
  isAvailable: boolean;
}

export interface ModifierGroupDto {
  id: number;
  menuItemId: number;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOptionDto[];
}

export interface MenuItemDto {
  id: number;
  categoryId: number;
  name: string;
  description?: string | null;
  basePrice: number; // VND
  imageUrl?: string | null;
  isAvailable: boolean;
  displayOrder: number;
  sku: string;
  menuType: MenuType;
  itemType: MenuItemType;
  trackStock: boolean;
  stockQuantity: number;
  position?: string | null;
  modifierGroups?: ModifierGroupDto[];
}

export interface CategoryDto {
  id: number;
  name: string;
  displayOrder: number;
  menuItems?: MenuItemDto[];
}

export interface CategoryUpsertDto {
  name: string;
  displayOrder?: number;
}

export interface ModifierOptionUpsertDto {
  id?: number;
  name: string;
  priceDelta: number;
  isAvailable?: boolean;
}

export interface ModifierGroupUpsertDto {
  id?: number;
  name: string;
  isRequired?: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOptionUpsertDto[];
}

export interface MenuItemUpsertDto {
  categoryId?: number;
  name?: string;
  description?: string | null;
  basePrice?: number;
  imageUrl?: string | null;
  isAvailable?: boolean;
  displayOrder?: number;
  menuType?: MenuType;
  itemType?: MenuItemType;
  trackStock?: boolean;
  stockQuantity?: number;
  position?: string | null;
  modifierGroups?: ModifierGroupUpsertDto[];
}

export interface MenuImportRowDto {
  rowNumber: number;
  sku?: string;
  name: string;
  categoryName: string;
  basePrice: number;
  menuType: MenuType;
  itemType: MenuItemType;
  isAvailable: boolean;
  trackStock: boolean;
  stockQuantity: number;
  position?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export interface MenuImportErrorRowDto {
  rowNumber: number;
  sku?: string;
  name?: string;
  categoryName?: string;
  error: string;
}

export interface MenuImportPreviewDto {
  fileName: string;
  totalRows: number;
  validRows: MenuImportRowDto[];
  errorRows: MenuImportErrorRowDto[];
  canCommit: boolean;
}

export interface MenuImportCommitDto {
  createdCount: number;
  updatedCount: number;
  categoryCreatedCount: number;
}

export type MenuExportFormat = 'csv' | 'xlsx';

// ==========================================
// 5. PRICE LIST DTOs
// ==========================================
export interface PriceListDto {
  id: number;
  code: string;
  name: string;
  type: PriceListType;
  scopeType: PriceListScopeType;
  isDefault: boolean;
  isActive: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface PriceListItemDto {
  id: number;
  priceListId: number;
  menuItemId: number;
  sku: string;
  name: string;
  categoryId: number;
  categoryName: string;
  costPrice: number | null;
  salePrice: number;
  marginPercent: number | null;
  version: number;
  updatedAt: string;
}

export interface PriceListDataDto {
  priceList: PriceListDto;
  items: PriceListItemDto[];
}

export type PriceFormulaOperation =
  | { mode: 'fixed'; value: number; rounding?: 100 | 1000 | 10000 }
  | { mode: 'amount'; value: number; rounding?: 100 | 1000 | 10000 }
  | { mode: 'percent'; value: number; rounding?: 100 | 1000 | 10000 };

export interface PriceListImportRowDto {
  rowNumber: number;
  sku: string;
  name: string;
  menuItemId: number;
  salePrice: number;
}

export interface PriceListImportErrorRowDto {
  rowNumber: number;
  sku: string;
  message: string;
}

export interface PriceListImportPreviewDto {
  fileName: string;
  totalRows: number;
  validRows: PriceListImportRowDto[];
  errorRows: PriceListImportErrorRowDto[];
  canCommit: boolean;
}

export interface PriceListImportCommitDto {
  updatedCount: number;
  createdCount: number;
}

// ==========================================
// 5. TABLE DTOs
// ==========================================
export interface DiningTableDto {
  id: number;
  tableNumber: number;
  qrCodeToken?: string;
  status: TableStatus;
  capacity: number;
  currentOrderId?: number | null;
  orders?: OrderDto[];
}

// ==========================================
// 6. ORDER DTOs
// ==========================================
export interface SelectedModifierDto {
  modifierGroupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  priceDelta: number;
}

export interface OrderItemCreateDto {
  menuItemId: number;
  quantity: number;
  selectedModifiers?: SelectedModifierDto[];
  notes?: string;
}

export interface OrderCreateDto {
  orderType: OrderType;
  tableId?: number;
  qrCodeToken?: string;
  buzzerNumber?: number;
  items: OrderItemCreateDto[];
  notes?: string;
  idempotencyKey?: string;
}

export interface OrderItemDto {
  id: number;
  orderId: number;
  menuItemId: number;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  selectedModifiersJson?: SelectedModifierDto[] | null;
  notes?: string | null;
}

export interface OrderDto {
  id: number;
  code: string;
  priceListId?: number | null;
  orderType: OrderType;
  status: OrderStatus;
  tableId?: number | null;
  tableNumber?: number | null;
  buzzerNumber?: number | null;
  totalAmount: number;
  vatAmount: number;
  finalAmount: number;
  paymentMethod?: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paidAt?: string | null;
  notes?: string | null;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  preparingAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  prepTimeSec?: number | null;
  voidedByUserId?: number | null;
  voidReason?: string | null;
  voidedAt?: string | null;

  items: OrderItemDto[];
}

// ==========================================
// 7. REPORT DTOs
// ==========================================
export interface TopSellerItemDto {
  menuItemId: number;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface PaymentMethodSummaryDto {
  count: number;
  total: number;
}

export interface PaymentBreakdownDto {
  cash: PaymentMethodSummaryDto;
  bankTransfer: PaymentMethodSummaryDto;
  other: PaymentMethodSummaryDto;
}

export interface ProfitSummaryDto {
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMargin: number;
}

export interface DailyReportDto {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  averagePrepTimeSec: number;
  topSellers: TopSellerItemDto[];
  paymentBreakdown?: PaymentBreakdownDto;
  profitSummary?: ProfitSummaryDto;
}

// ==========================================
// 8. REAL-TIME SOCKET PAYLOADS
// ==========================================
export interface SocketOrderNewPayload {
  order: OrderDto;
}

export interface SocketOrderStatusChangedPayload {
  orderId: number;
  code: string;
  status: OrderStatus;
  tableId?: number | null;
  tableNumber?: number | null;
  prepTimeSec?: number;
  preparingAt?: string;
  readyAt?: string;
  completedAt?: string;
}

export interface SocketMenuItemSoldOutChangedPayload {
  menuItemId: number;
  isAvailable: boolean;
}

export interface SocketMenuStockChangedPayload {
  items: Array<{
    menuItemId: number;
    stockQuantity: number;
    trackStock: boolean;
    isAvailable: boolean;
  }>;
}

export interface SocketTableStatusChangedPayload {
  tableId: number;
  tableNumber: number;
  status: TableStatus;
  currentOrderId?: number | null;
}

export interface SocketPriceListItemChangedPayload {
  priceListId: number;
  menuItemId: number;
  salePrice: number;
  version: number;
  updatedAt: string;
}

export interface SocketPriceListBulkChangedPayload {
  priceListId: number;
  menuItemIds: number[];
  updatedAt: string;
}

// ==========================================
// 9. AUDIT LOG DTOs
// ==========================================
export type AuditAction =
  | 'MENU_ITEM_CREATED'
  | 'MENU_ITEM_UPDATED'
  | 'MENU_ITEM_AVAILABILITY_CHANGED'
  | 'MENU_IMAGE_UPLOADED'
  | 'ORDER_VOIDED'
  | 'MENU_RECIPE_UPDATED'
  | 'INGREDIENT_CREATED'
  | 'INGREDIENT_UPDATED'
  | 'INVENTORY_STOCK_IN'
  | 'INVENTORY_EXCEL_IMPORT'
  | 'SUPPLIER_CREATED'
  | 'SUPPLIER_UPDATED';

export interface AuditLogDto {
  id: number;
  action: AuditAction;
  targetType: string;
  targetId?: number | null;
  actorId?: number | null;
  actorName?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface AuditLogsPageDto {
  logs: AuditLogDto[];
  total: number;
  page: number;
  totalPages: number;
}

// ==========================================
// 10. INVENTORY & BOM DTOs
// ==========================================
export type InventoryTransactionType =
  | 'STOCK_IN'
  | 'AUTO_DEDUCT'
  | 'KITCHEN_WASTE'
  | 'MANUAL_ADJUST'
  | 'VOID_RESTORE';

export interface IngredientDto {
  id: number;
  sku: string;
  name: string;
  unit: string;
  currentStock: number;
  minThreshold: number;
  costPerUnit: number;
  isActive: boolean;
  isLowStock: boolean;
  isNegative: boolean;
  totalValue: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierDto {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPaginationDto {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export interface SupplierListDataDto {
  items: SupplierDto[];
  pagination: SupplierPaginationDto;
}

export interface PurchaseReceiptSupplierDto {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface PurchaseReceiptLineDto {
  id: number;
  ingredientId: number;
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  discountAmount: number;
  lineAmount: number;
  note: string | null;
}

export interface PurchaseReceiptDto {
  id: number;
  receiptCode: string;
  supplierId: number | null;
  supplier: PurchaseReceiptSupplierDto | null;
  receivedAt: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  status: PurchaseReceiptStatus;
  subtotalAmount: number;
  discountAmount: number;
  payableAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  note: string | null;
  createdByUserId: number | null;
  postedByUserId: number | null;
  postedAt: string | null;
  cancelledByUserId: number | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseReceiptLineDto[];
}

export type PurchaseReceiptDetailDto = PurchaseReceiptDto;

export interface PurchaseReceiptListDataDto {
  items: PurchaseReceiptDto[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  totalPayableAmount: number;
}

export interface PurchaseReceiptListFilter {
  status?: PurchaseReceiptStatus[];
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PurchaseReceiptLineInput {
  ingredientId: number;
  quantity: number;
  unitCost: number;
  discountAmount?: number;
  note?: string | null;
}

export interface PurchaseReceiptDraftInput {
  supplierId?: number | null;
  receivedAt?: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  discountAmount?: number;
  paidAmount?: number;
  note?: string | null;
  lines: PurchaseReceiptLineInput[];
}

export interface PurchaseReceiptImportValidRowDto {
  rowNumber: number;
  ingredientId: number;
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  discountAmount: 0;
  note: string | null;
}

export interface PurchaseReceiptImportErrorRowDto {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  quantity: number;
  costPerUnit: number;
  error: string;
}

export interface PurchaseReceiptImportPreviewDto {
  fileName: string;
  totalRows: number;
  validRows: PurchaseReceiptImportValidRowDto[];
  errorRows: PurchaseReceiptImportErrorRowDto[];
}

export type InventoryCheckStatus = 'DRAFT' | 'BALANCED' | 'CANCELLED';

export interface InventoryCheckLineDto {
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
}

export interface InventoryCheckSummaryDto {
  totalActualQuantity: number;
  totalVarianceQuantity: number;
  increasedQuantity: number;
  decreasedQuantity: number;
  totalVarianceValue: number;
  uncheckedCount: number;
}

export interface InventoryCheckDto extends InventoryCheckSummaryDto {
  id: number;
  checkCode: string;
  status: InventoryCheckStatus;
  countedAt: string;
  balancedAt: string | null;
  note: string | null;
  createdByUserId: number | null;
  balancedByUserId: number | null;
  cancelledByUserId: number | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: InventoryCheckLineDto[];
  recentChecks?: InventoryCheckDto[];
}

export type InventoryCheckDetailDto = InventoryCheckDto;

export interface InventoryCheckListDataDto {
  items: InventoryCheckDto[];
  pagination: InventoryCatalogPaginationDto;
  totalVarianceValue: number;
  increasedQuantity: number;
  decreasedQuantity: number;
}

export interface InventoryCheckListFilter {
  statuses?: InventoryCheckStatus[];
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface InventoryCheckLineInput {
  ingredientId: number;
  actualQuantity: number | null;
}

export interface InventoryCheckDraftInput {
  note?: string | null;
  lines: InventoryCheckLineInput[];
}

export interface InventoryCheckImportValidRowDto {
  rowNumber: number;
  ingredientId: number;
  ingredientSku: string;
  ingredientName: string;
  unit: string;
  actualQuantity: number;
}

export interface InventoryCheckImportErrorRowDto {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  actualQuantity: number;
  error: string;
}

export interface InventoryCheckImportPreviewDto {
  fileName: string;
  totalRows: number;
  validRows: InventoryCheckImportValidRowDto[];
  errorRows: InventoryCheckImportErrorRowDto[];
}

export type InventoryCheckExportFormat = 'csv' | 'xlsx';

export interface RecipeIngredientDto {
  id: number;
  ingredientId: number;
  sku: string;
  name: string;
  unit: string;
  quantityRequired: number;
  costPerUnit: number;
  itemCost: number;
}

export interface MenuItemRecipeDto {
  menuItemId: number;
  menuItemName: string;
  basePrice: number;
  totalCost: number;
  profitMargin: number;
  ingredients: RecipeIngredientDto[];
}

export interface ExcelPreviewRowDto {
  rowNumber: number;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  costPerUnit: number;
  projectedStock: number;
  projectedCost: number;
  note?: string;
}

export interface ExcelErrorRowDto {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  quantity: number;
  costPerUnit: number;
  error: string;
}

export interface ExcelPreviewResultDto {
  fileName: string;
  totalRows: number;
  validRows: ExcelPreviewRowDto[];
  errorRows: ExcelErrorRowDto[];
}

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
  menuType?: MenuType | null;
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

export type InventoryCatalogExportFormat = 'csv' | 'xlsx';

export interface InventoryCatalogFilter {
  search?: string;
  managementGroup?: InventoryManagementGroup;
  categoryId?: number;
  menuType?: MenuType;
  stockStatus?: 'ALL' | InventoryStockStatus;
  position?: string;
  isActive?: 'true' | 'false' | 'all';
  page?: number;
  pageSize?: number;
  sortBy?: 'sku' | 'name' | 'costPrice' | 'stockQuantity' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface SocketInventoryChangedPayload {
  sourceType: 'INGREDIENT' | 'MENU_ITEM';
  sourceIds: number[];
  reason:
    | 'STOCK_IN'
    | 'PURCHASE_RECEIPT_POSTED'
    | 'ORDER_PAID'
    | 'ORDER_VOIDED'
    | 'MANUAL_ADJUST'
    | 'RECIPE_UPDATED'
    | 'INGREDIENT_UPDATED'
    | 'MENU_ITEM_UPDATED';
  updatedAt: string;
}

