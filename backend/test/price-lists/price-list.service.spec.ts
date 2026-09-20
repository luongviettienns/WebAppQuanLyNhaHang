import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import { PriceListService } from '../../src/modules/price-lists/price-list.service';

describe('PriceListService', () => {
  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('resolves the GENERAL price item before MenuItem.basePrice', async () => {
    const item = await prismaTest.menuItem.findFirstOrThrow();
    const general = await prismaTest.priceList.findUniqueOrThrow({ where: { code: 'GENERAL' } });
    await prismaTest.priceListItem.update({
      where: { priceListId_menuItemId: { priceListId: general.id, menuItemId: item.id } },
      data: { salePrice: item.basePrice + 5000 }
    });

    const prices = await PriceListService.resolveEffectivePrices(prismaTest, [item.id]);
    expect(prices.get(item.id)?.salePrice).toBe(item.basePrice + 5000);
    expect(prices.get(item.id)?.source).toBe('PRICE_LIST');
  });

  it('falls back to basePrice when a price row is missing', async () => {
    const item = await prismaTest.menuItem.findFirstOrThrow();
    const general = await prismaTest.priceList.findUniqueOrThrow({ where: { code: 'GENERAL' } });
    await prismaTest.priceListItem.delete({
      where: { priceListId_menuItemId: { priceListId: general.id, menuItemId: item.id } }
    });

    const prices = await PriceListService.resolveEffectivePrices(prismaTest, [item.id]);
    expect(prices.get(item.id)?.salePrice).toBe(item.basePrice);
    expect(prices.get(item.id)?.source).toBe('BASE_PRICE');
  });

  it('returns null BOM cost for a menu item without ingredients', async () => {
    const priceRow = await prismaTest.priceListItem.findFirstOrThrow();
    await prismaTest.menuItemIngredient.deleteMany({ where: { menuItemId: priceRow.menuItemId } });

    const data = await PriceListService.getGeneralPriceListData();
    const row = data.items.find((candidate) => candidate.menuItemId === priceRow.menuItemId);

    expect(row).toBeDefined();
    expect(row?.costPrice).toBeNull();
  });
});
