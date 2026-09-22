import { describe, expect, it } from 'vitest';
import {
  createInventoryCheckSchema,
  inventoryCheckListQuerySchema,
  inventoryCheckLineInputSchema,
  inventoryCheckImportPreviewSchema,
  updateInventoryCheckSchema
} from '../../src/modules/inventory/inventory-check.schemas';

describe('inventory check schemas', () => {
  it('accepts zero and null actual quantities', () => {
    expect(inventoryCheckLineInputSchema.parse({ ingredientId: 1, actualQuantity: 0 })).toEqual({
      ingredientId: 1,
      actualQuantity: 0
    });
    expect(inventoryCheckLineInputSchema.parse({ ingredientId: 1, actualQuantity: null })).toEqual({
      ingredientId: 1,
      actualQuantity: null
    });
  });

  it('rejects a negative actual quantity', () => {
    expect(() => inventoryCheckLineInputSchema.parse({ ingredientId: 1, actualQuantity: -1 }))
      .toThrow();
  });

  it('rejects duplicate ingredients in a draft', () => {
    expect(() => createInventoryCheckSchema.parse({
      lines: [
        { ingredientId: 1, actualQuantity: 1 },
        { ingredientId: 1, actualQuantity: 2 }
      ]
    })).toThrow('Một nguyên liệu chỉ được xuất hiện một lần');
  });

  it('requires at least one field for an update', () => {
    expect(() => updateInventoryCheckSchema.parse({})).toThrow('Cần cung cấp ít nhất một trường');
  });

  it('parses list status filters and rejects oversized pages', () => {
    expect(inventoryCheckListQuerySchema.parse({ statuses: 'DRAFT,BALANCED', page: '2', pageSize: '50' }))
      .toMatchObject({ statuses: ['DRAFT', 'BALANCED'], page: 2, pageSize: 50 });
    expect(() => inventoryCheckListQuerySchema.parse({ pageSize: '101' })).toThrow();
  });

  it('validates Excel preview payload', () => {
    expect(inventoryCheckImportPreviewSchema.parse({ fileBase64: 'abc', fileName: 'check.xlsx' }))
      .toEqual({ fileBase64: 'abc', fileName: 'check.xlsx' });
  });
});
