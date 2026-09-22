import { describe, expect, it } from 'vitest';
import { lineAmount, summarizePurchaseReturn, validatePurchaseReturnForCompletion } from './purchaseReturnViewModel';

describe('purchaseReturnViewModel', () => {
  it('tính tiền trả hàng theo giá trả và tách tiền hoàn khỏi công nợ', () => {
    expect(lineAmount({ quantity: 2, returnUnitPrice: 150 })).toBe(300);
    expect(summarizePurchaseReturn([{ quantity: 2, returnUnitPrice: 150 }], 20, 28, 100)).toEqual({ subtotalAmount: 300, payableAmount: 308, debtReductionAmount: 208, refundAmount: 100 });
  });
  it('chặn hoàn thành khi thiếu nhà cung cấp hoặc trả vượt tồn', () => {
    expect(validatePurchaseReturnForCompletion({ supplierId: null, lines: [], payableAmount: 0, refundAmount: 0 })).toContain('Cần chọn nhà cung cấp');
    expect(validatePurchaseReturnForCompletion({ supplierId: 1, lines: [{ ingredientId: 1, ingredientSku: 'A', ingredientName: 'A', unit: 'kg', currentStock: 1, quantity: 2, returnUnitPrice: 10, purchaseUnitCost: 8 }], payableAmount: 20, refundAmount: 0 })).toContain('Số lượng trả không được vượt tồn kho hiện tại');
  });
});
