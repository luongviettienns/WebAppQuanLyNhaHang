import { beforeAll, describe, expect, it } from 'vitest';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('inventory waste persistence', () => {
  let ingredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const ingredient = await prismaTest.ingredient.create({
      data: {
        sku: 'NL-WASTE-PERSIST-1',
        name: 'Nguyên liệu xuất hủy',
        unit: 'kg',
        currentStock: 10,
        costPerUnit: 12000
      }
    });
    ingredientId = ingredient.id;
  });

  it('persists a voucher, snapshot line, and nullable waste ledger ownership', async () => {
    const waste = await prismaTest.inventoryWaste.create({
      data: {
        wasteCode: 'XH000001',
        note: 'Hàng hỏng',
        lines: {
          create: {
            ingredientId,
            ingredientSku: 'NL-WASTE-PERSIST-1',
            ingredientName: 'Nguyên liệu xuất hủy',
            unit: 'kg',
            systemQuantity: 10,
            quantity: 2,
            costPerUnit: 12000,
            lineValue: 24000
          }
        }
      },
      include: { lines: true }
    });

    const ledger = await prismaTest.inventoryTransaction.create({
      data: {
        ingredientId,
        inventoryWasteId: waste.id,
        type: 'KITCHEN_WASTE',
        quantity: -2,
        costAmount: -24000
      },
      include: { inventoryWaste: true }
    });

    expect(waste).toMatchObject({
      wasteCode: 'XH000001',
      status: 'DRAFT',
      totalValue: 0,
      lines: [{
        ingredientId,
        systemQuantity: 10,
        quantity: 2,
        lineValue: 24000
      }]
    });
    expect(ledger.inventoryWaste).toMatchObject({ id: waste.id, wasteCode: 'XH000001' });
  });
});
