import { describe, expect, it } from 'vitest';
import { prismaTest } from '../helpers/database';

describe('inventory check persistence', () => {
  it('exposes the stocktake models and nullable ledger relation', async () => {
    const checkCount = await prismaTest.inventoryCheck.count();
    const ingredient = await prismaTest.ingredient.findFirst({ select: { id: true } });
    const ledger = ingredient
      ? await prismaTest.inventoryTransaction.findFirst({ where: { ingredientId: ingredient.id }, include: { inventoryCheck: true } })
      : null;

    expect(checkCount).toBeGreaterThanOrEqual(0);
    expect(ledger === null || ledger.inventoryCheck === null || typeof ledger.inventoryCheck.id === 'number').toBe(true);
  });
});
