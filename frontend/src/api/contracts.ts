// frontend/src/api/contracts.ts
// Chuan hoa DTO, Enums va Socket Payload cho toan bo Client CRISPY BITE QSR

// ==========================================
// 1. ENUMS
// ==========================================
export type Role = 'CASHIER' | 'KITCHEN' | 'ADMIN';
export type OrderType = 'DINE_IN' | 'TAKE_AWAY';
export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'NEED_CLEANING';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CREDIT_CARD';
export type PaymentStatus = 'UNPAID' | 'PAID';

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
  modifierGroups?: ModifierGroupDto[];
}

export interface CategoryDto {
  id: number;
  name: string;
  displayOrder: number;
  menuItems?: MenuItemDto[];
}

// ==========================================
// 5. TABLE DTOs
// ==========================================
export interface DiningTableDto {
  id: number;
  tableNumber: number;
  qrCodeToken: string;
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

export interface DailyReportDto {
  date: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  averagePrepTimeSec: number;
  topSellers: TopSellerItemDto[];
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
  prepTimeSec?: number;
  readyAt?: string;
  completedAt?: string;
}

export interface SocketMenuItemSoldOutChangedPayload {
  menuItemId: number;
  isAvailable: boolean;
}

export interface SocketTableStatusChangedPayload {
  tableId: number;
  tableNumber: number;
  status: TableStatus;
  currentOrderId?: number | null;
}
