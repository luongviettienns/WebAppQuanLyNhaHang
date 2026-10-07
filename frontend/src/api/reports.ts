import { getApiBaseUrl } from './config';
import { ApiErrorResponse } from './contracts';

export interface ProfitAndLossReportData {
  timeframe: { from: string; to: string; date?: string };
  revenue: {
    grossSales: number;
    discountAmount: number;
    returnsAmount: number;
    netRevenue: number;
    vatAmount: number;
    orderCount: number;
  };
  cogs: {
    salesCogs: number;
    grossProfit: number;
    grossProfitMargin: number;
  };
  operatingExpenses: {
    kitchenWasteCost: number;
    cashExpenses: number;
    payrollCost: number;
    totalExpenses: number;
  };
  netProfit: {
    operatingProfit: number;
    netProfitMargin: number;
  };
  revenueByPaymentMethod: {
    cash: number;
    bankTransfer: number;
    other: number;
  };
  expenseBreakdownByCategory: {
    categoryName: string;
    amount: number;
  }[];
}

export interface InventoryBalanceRow {
  ingredientId: number;
  sku: string;
  name: string;
  unit: string;
  costPerUnit: number;
  minThreshold: number;
  openingStock: number;
  stockIn: number;
  stockOut: number;
  waste: number;
  manualAdjust: number;
  closingStock: number;
  inventoryValue: number;
  isLowStock: boolean;
}

export interface InventoryBalanceReportData {
  timeframe: { from: string; to: string; date?: string };
  summary: {
    totalIngredients: number;
    totalInventoryValue: number;
    lowStockCount: number;
    totalStockInQuantity: number;
    totalStockOutQuantity: number;
    totalWasteQuantity: number;
    totalWasteValue: number;
  };
  items: InventoryBalanceRow[];
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
  throw new Error(payload?.error?.message || `${fallback} (${response.status})`);
}

export async function fetchProfitAndLossReportApi(
  token?: string | null,
  params?: { date?: string; from?: string; to?: string }
): Promise<ProfitAndLossReportData> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const url = `${getApiBaseUrl()}/api/reports/profit-and-loss${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { ...authHeaders(token) }
  });

  if (!response.ok) {
    await throwApiError(response, 'Không thể tải báo cáo tài chính lãi lỗ');
  }

  const payload = await response.json();
  return payload.data;
}

export async function fetchInventoryBalanceReportApi(
  token?: string | null,
  params?: { date?: string; from?: string; to?: string; search?: string }
): Promise<InventoryBalanceReportData> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.search) query.set('search', params.search);

  const url = `${getApiBaseUrl()}/api/reports/inventory-balance${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { ...authHeaders(token) }
  });

  if (!response.ok) {
    await throwApiError(response, 'Không thể tải báo cáo xuất nhập tồn kho');
  }

  const payload = await response.json();
  return payload.data;
}

export interface CustomerReportRow {
  customerId: number;
  code: string;
  name: string;
  phone: string;
  tier: string;
  points: number;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
}

export interface CustomerReportData {
  timeframe: { from: string; to: string; date?: string };
  summary: {
    totalCustomers: number;
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
  };
  customers: CustomerReportRow[];
}

export async function fetchCustomerReportApi(
  token?: string | null,
  params?: { date?: string; from?: string; to?: string }
): Promise<CustomerReportData> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const url = `${getApiBaseUrl()}/api/reports/customers${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { ...authHeaders(token) }
  });

  if (!response.ok) {
    await throwApiError(response, 'Không thể tải báo cáo khách hàng');
  }

  const payload = await response.json();
  return payload.data;
}

export interface SupplierReportRow {
  supplierId: number;
  code: string;
  name: string;
  phone: string;
  receiptCount: number;
  totalAmount: number;
  paidAmount: number;
  currentDebt: number;
}

export interface SupplierReportData {
  timeframe: { from: string; to: string; date?: string };
  summary: {
    totalSuppliers: number;
    totalPurchaseValue: number;
    totalPaid: number;
    outstandingDebt: number;
  };
  suppliers: SupplierReportRow[];
}

export async function fetchSupplierReportApi(
  token?: string | null,
  params?: { date?: string; from?: string; to?: string }
): Promise<SupplierReportData> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const url = `${getApiBaseUrl()}/api/reports/suppliers${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { ...authHeaders(token) }
  });

  if (!response.ok) {
    await throwApiError(response, 'Không thể tải báo cáo nhà cung cấp');
  }

  const payload = await response.json();
  return payload.data;
}

export interface EmployeeReportRow {
  employeeId: number;
  code: string;
  fullName: string;
  role: string;
  orderCount: number;
  revenue: number;
  commission: number;
}

export interface EmployeeReportData {
  timeframe: { from: string; to: string; date?: string };
  summary: {
    totalEmployees: number;
    totalOrders: number;
    totalRevenue: number;
    totalCommission: number;
  };
  employees: EmployeeReportRow[];
}

export async function fetchEmployeeReportApi(
  token?: string | null,
  params?: { date?: string; from?: string; to?: string }
): Promise<EmployeeReportData> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const url = `${getApiBaseUrl()}/api/reports/employees${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { ...authHeaders(token) }
  });

  if (!response.ok) {
    await throwApiError(response, 'Không thể tải báo cáo nhân viên');
  }

  const payload = await response.json();
  return payload.data;
}

export interface ChannelBreakdown {
  channel: string;
  orderCount: number;
  grossSales: number;
  discounts: number;
  netRevenue: number;
  sharePercent: number;
}

export interface DeliveryPartnerBreakdown {
  partnerId: number;
  code: string;
  name: string;
  orderCount: number;
  netRevenue: number;
}

export interface ChannelReportData {
  timeframe: { from: string; to: string; date?: string };
  summary: {
    totalOrders: number;
    grossSales: number;
    discounts: number;
    netRevenue: number;
  };
  channels: ChannelBreakdown[];
  deliveryPartners: DeliveryPartnerBreakdown[];
}

export async function fetchChannelReportApi(
  token?: string | null,
  params?: { date?: string; from?: string; to?: string }
): Promise<ChannelReportData> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const url = `${getApiBaseUrl()}/api/reports/channels${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { ...authHeaders(token) }
  });

  if (!response.ok) {
    await throwApiError(response, 'Không thể tải báo cáo kênh bán hàng');
  }

  const payload = await response.json();
  return payload.data;
}

