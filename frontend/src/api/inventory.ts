import { getApiBaseUrl } from './config';
import {
  IngredientDto,
  MenuItemRecipeDto,
  ExcelPreviewResultDto,
  KitchenWasteCreateDto,
  LowStockAlertDto
} from './contracts';

function getAuthHeaders(token?: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function fetchIngredientsApi(
  token: string | null,
  filter?: { search?: string; lowStock?: boolean; negativeStock?: boolean }
): Promise<IngredientDto[]> {
  const base = getApiBaseUrl();
  const params = new URLSearchParams();
  if (filter?.search) params.append('search', filter.search);
  if (filter?.lowStock) params.append('lowStock', 'true');
  if (filter?.negativeStock) params.append('negativeStock', 'true');

  const res = await fetch(`${base}/api/inventory/ingredients?${params.toString()}`, {
    headers: getAuthHeaders(token)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi tải danh mục kho (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function createIngredientApi(
  token: string | null,
  data: {
    sku: string;
    name: string;
    unit: string;
    currentStock?: number;
    minThreshold?: number;
    costPerUnit?: number;
  }
): Promise<IngredientDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/ingredients`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi tạo nguyên liệu (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function updateIngredientApi(
  token: string | null,
  id: number,
  data: {
    name?: string;
    unit?: string;
    minThreshold?: number;
    costPerUnit?: number;
    isActive?: boolean;
  }
): Promise<IngredientDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/ingredients/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(token),
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi cập nhật nguyên liệu (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function stockInApi(
  token: string | null,
  data: {
    ingredientId: number;
    quantity: number;
    costPerUnit: number;
    note?: string;
  }
): Promise<IngredientDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/stock-in`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi nhập kho (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function previewExcelApi(
  token: string | null,
  fileBase64: string,
  fileName: string
): Promise<ExcelPreviewResultDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/excel/preview`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ fileBase64, fileName })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi đối soát file Excel (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function commitExcelApi(
  token: string | null,
  items: Array<{
    sku: string;
    quantity: number;
    costPerUnit: number;
    note?: string;
  }>,
  sourceFileName: string
): Promise<{ importedCount: number }> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/excel/commit`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ items, sourceFileName })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi nhập kho từ Excel (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function fetchRecipeApi(
  token: string | null,
  menuItemId: number
): Promise<MenuItemRecipeDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/recipes/${menuItemId}`, {
    headers: getAuthHeaders(token)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi tải công thức món (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function updateRecipeApi(
  token: string | null,
  menuItemId: number,
  ingredients: Array<{ ingredientId: number; quantityRequired: number }>
): Promise<MenuItemRecipeDto> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/recipes/${menuItemId}`, {
    method: 'PUT',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ ingredients })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi cập nhật công thức món (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function recordKitchenWasteApi(
  token: string | null,
  data: KitchenWasteCreateDto
): Promise<{ totalCostAmount: number; deductedIngredients: any[] }> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/kitchen-waste`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi ghi nhận hao hụt bếp (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}

export async function fetchLowStockAlertsApi(
  token: string | null
): Promise<LowStockAlertDto[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/inventory/low-stock-alerts`, {
    headers: getAuthHeaders(token)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Lỗi tải cảnh báo tồn kho (${res.status})`);
  }

  const json = await res.json();
  return json.data;
}
