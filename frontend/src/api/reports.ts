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
