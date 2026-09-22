import { describe, expect, it } from 'vitest';
import {
  createInventoryWasteSchema,
  inventoryWasteImportPreviewSchema,
  inventoryWasteLineInputSchema,
  inventoryWasteListQuerySchema,
  updateInventoryWasteSchema
} from '../../src/modules/inventory/inventory-waste.schemas';

describe('inventory waste schemas', () => {
  it('accepts an empty draft and valid positive quantities', () => {
    expect(createInventoryWasteSchema.parse({})).toEqual({ lines: [] });
    expect(inventoryWasteLineInputSchema.parse({ ingredientId: 1, quantity: 0.25 }))
      .toEqual({ ingredientId: 1, quantity: 0.25 });
  });

  it('rejects a duplicate ingredient in a draft', () => {
    expect(() => createInventoryWasteSchema.parse({
      lines: [
        { ingredientId: 1, quantity: 1 },
        { ingredientId: 1, quantity: 2 }
      ]
    })).toThrow('Một nguyên liệu chỉ được xuất hiện một lần');
  });

  it('rejects non-positive and non-finite waste quantities', () => {
    expect(() => inventoryWasteLineInputSchema.parse({ ingredientId: 1, quantity: 0 })).toThrow();
    expect(() => inventoryWasteLineInputSchema.parse({ ingredientId: 1, quantity: -1 })).toThrow();
    expect(() => inventoryWasteLineInputSchema.parse({ ingredientId: 1, quantity: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('parses the waste statuses and rejects oversized pages', () => {
    expect(inventoryWasteListQuerySchema.parse({
      statuses: 'DRAFT,COMPLETED,CANCELLED',
      page: '2',
      pageSize: '50'
    })).toMatchObject({
      statuses: ['DRAFT', 'COMPLETED', 'CANCELLED'],
      page: 2,
      pageSize: 50
    });
    expect(() => inventoryWasteListQuerySchema.parse({ pageSize: '101' })).toThrow();
  });

  it('rejects an empty update and malformed import preview payload', () => {
    expect(() => updateInventoryWasteSchema.parse({})).toThrow('Cần cung cấp ít nhất một trường');
    expect(() => inventoryWasteImportPreviewSchema.parse({ fileBase64: '', fileName: 'waste.xlsx' })).toThrow();
    expect(() => inventoryWasteImportPreviewSchema.parse({ fileBase64: 'abc', fileName: ' ' })).toThrow();
  });
});
