import { PriceListScopeType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { PriceDataClient, PriceResolveContext, ResolvedPrice } from './price-list.types';

function isWithinEffectiveWindow(priceList: { effectiveFrom: Date | null; effectiveTo: Date | null }, at: Date) {
  if (priceList.effectiveFrom && priceList.effectiveFrom > at) return false;
  if (priceList.effectiveTo && priceList.effectiveTo < at) return false;
  return true;
}

export class PriceListService {
  static async getGeneralPriceList(client: PriceDataClient = prisma) {
    return client.priceList.findFirst({
      where: {
        code: 'GENERAL',
        scopeType: PriceListScopeType.GLOBAL,
        isDefault: true,
        isActive: true
      },
      include: { items: true },
      orderBy: { id: 'asc' }
    });
  }

  static async resolveEffectivePrices(
    client: PriceDataClient,
    menuItemIds: number[],
    context: PriceResolveContext = {}
  ): Promise<Map<number, ResolvedPrice>> {
    const uniqueIds = Array.from(new Set(menuItemIds));
    if (uniqueIds.length === 0) return new Map();

    const at = context.at ?? new Date();
    const menuItems = await client.menuItem.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, basePrice: true }
    });
    const itemById = new Map(menuItems.map(item => [item.id, item]));

    const priceList = context.priceListId
      ? await client.priceList.findFirst({
          where: { id: context.priceListId, isActive: true },
          select: { id: true, scopeType: true, scopeKey: true, effectiveFrom: true, effectiveTo: true }
        })
      : await client.priceList.findFirst({
          where: {
            code: 'GENERAL',
            scopeType: context.scopeType ?? PriceListScopeType.GLOBAL,
            scopeKey: context.scopeKey ?? null,
            isDefault: true,
            isActive: true
          },
          select: { id: true, scopeType: true, scopeKey: true, effectiveFrom: true, effectiveTo: true },
          orderBy: { id: 'asc' }
        });

    const priceItems = priceList && isWithinEffectiveWindow(priceList, at)
      ? await client.priceListItem.findMany({
          where: { priceListId: priceList.id, menuItemId: { in: uniqueIds } },
          select: { menuItemId: true, salePrice: true, version: true }
        })
      : [];
    const priceByItemId = new Map(priceItems.map(item => [item.menuItemId, item]));

    return new Map(uniqueIds.flatMap(menuItemId => {
      const menuItem = itemById.get(menuItemId);
      if (!menuItem) return [];
      const priceItem = priceByItemId.get(menuItemId);
      return [[menuItemId, {
        menuItemId,
        salePrice: priceItem?.salePrice ?? menuItem.basePrice,
        priceListId: priceItem ? priceList?.id ?? null : null,
        version: priceItem?.version ?? null,
        source: priceItem ? 'PRICE_LIST' : 'BASE_PRICE'
      } satisfies ResolvedPrice]] as const;
    }));
  }

  static async syncMenuItemPrice(client: PriceDataClient, menuItemId: number, salePrice: number) {
    const general = await client.priceList.findFirstOrThrow({
      where: { code: 'GENERAL', scopeType: PriceListScopeType.GLOBAL, isDefault: true, isActive: true },
      select: { id: true }
    });
    await client.priceListItem.upsert({
      where: { priceListId_menuItemId: { priceListId: general.id, menuItemId } },
      update: { salePrice, version: { increment: 1 } },
      create: { priceListId: general.id, menuItemId, salePrice }
    });
    await client.menuItem.update({ where: { id: menuItemId }, data: { basePrice: salePrice } });
  }
}
