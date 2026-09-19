export interface WeightedAverageParams {
  currentStock: number;
  currentCost: number;
  incomingQty: number;
  incomingCost: number;
}

export interface WeightedAverageResult {
  newStock: number;
  newCost: number;
}

/**
 * Tinh toan ton kho va gia von binh quan gia quyen theo quy tac nghiep vu Q1 & Q3:
 * - Khi ton kho hien tai >= 0: Ap dung cong thuc binh quan gia quyen tieu chuan.
 * - Khi ton kho hien tai < 0: Tuyet doi KHONG dua so am vao nhan phep tinh binh quan (tranh meo gia).
 *   Hang nhap moi se bu tru luong am. Neu sau bu tru co duong (newStock > 0), gia von moi se lay truc tiep
 *   theo gia cua lo hang moi (incomingCost).
 */
export function calculateNewWeightedAverageCost(params: WeightedAverageParams): WeightedAverageResult {
  const { currentStock, currentCost, incomingQty, incomingCost } = params;

  if (incomingQty <= 0) {
    throw new Error('Số lượng nhập kho phải lớn hơn 0');
  }
  if (incomingCost < 0) {
    throw new Error('Đơn giá nhập kho không được nhỏ hơn 0');
  }

  const newStock = Math.round((currentStock + incomingQty) * 1000) / 1000;

  // Truong hop 1: Ton kho hien tai am (Quy tac Q3)
  if (currentStock < 0) {
    // Luong nhap bu tru cho luong am. Du newStock <= 0 hay > 0, gia von hien tai lay theo lo moi
    return {
      newStock,
      newCost: Math.round(incomingCost)
    };
  }

  // Truong hop 2: Ton kho hien tai = 0 hoac duong
  if (currentStock === 0) {
    return {
      newStock,
      newCost: Math.round(incomingCost)
    };
  }

  // Cong thuc binh quan gia quyen tieu chuan
  const currentTotalValue = currentStock * currentCost;
  const incomingTotalValue = incomingQty * incomingCost;
  const newAverageCost = Math.round((currentTotalValue + incomingTotalValue) / newStock);

  return {
    newStock,
    newCost: newAverageCost
  };
}

/**
 * Tinh tong chi phi gia von (COGS) cua 1 don vi mon an dua tren danh sach dinh luong BOM
 */
export function calculateRecipeCost(
  bom: Array<{ quantityRequired: number; costPerUnit: number }>
): number {
  if (!bom || bom.length === 0) {
    return 0;
  }

  const total = bom.reduce((sum, item) => {
    return sum + item.quantityRequired * item.costPerUnit;
  }, 0);

  return Math.round(total);
}
