import { describe, expect, it } from 'vitest';
import {
  calculateWasteRow,
  summarizeWasteRows,
  upsertWasteRow,
  validateWasteForCompletion
} from './inventoryWasteViewModel';

const cookingOil = {
  ingredientId: 7,
  ingredientSku: 'NL-07',
  ingredientName: 'Dầu ăn',
  unit: 'lít',
  systemQuantity: 3,
  quantity: 1.5,
  costPerUnit: 12000,
  lineValue: 0
};

describe('inventory waste view model', () => {
  it('calculates positive display values and voucher totals from current rows', () => {
    const first = calculateWasteRow(cookingOil);
    const second = calculateWasteRow({
      ingredientId: 8,
      ingredientSku: 'NL-08',
      ingredientName: 'Bột mì',
      unit: 'kg',
      systemQuantity: 5,
      quantity: 0.5,
      costPerUnit: 8000,
      lineValue: 0
    });

    expect(first).toMatchObject({ quantity: 1.5, costPerUnit: 12000, lineValue: 18000 });
    expect(summarizeWasteRows([first, second])).toEqual({ totalQuantity: 2, totalValue: 22000 });
  });

  it('upserts a selected ingredient instead of creating duplicate rows', () => {
    const first = calculateWasteRow(cookingOil);
    const updated = calculateWasteRow({ ...cookingOil, quantity: 2 });

    expect(upsertWasteRow([first], updated)).toEqual([
      expect.objectContaining({ ingredientId: 7, quantity: 2, lineValue: 24000 })
    ]);
  });

  it('blocks completion when the reason is blank or a quantity exceeds loaded stock', () => {
    expect(validateWasteForCompletion({
      note: '   ',
      lines: [calculateWasteRow(cookingOil)]
    })).toEqual(['Vui lòng nhập ghi chú hoặc lý do xuất hủy']);

    expect(validateWasteForCompletion({
      note: 'Hàng hỏng',
      lines: [calculateWasteRow({ ...cookingOil, quantity: 4 })]
    })).toEqual(['Số lượng hủy của Dầu ăn vượt tồn kho hiện tại']);
  });
});
