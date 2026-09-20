import { PriceListScopeType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import { PriceDataClient, PriceResolveContext, ResolvedPrice } from './price-list.types';
import { BulkPriceOperation } from './price-list.schemas';
import { parsePriceImportBuffer, serializePriceListCsv } from './price-list.import';

function isWithinEffectiveWindow(priceList: { effectiveFrom: Date | null; effectiveTo: Date | null }, at: Date) {
  if (priceList.effectiveFrom && priceList.effectiveFrom > at) return false;
  if (priceList.effectiveTo && priceList.effectiveTo < at) return false;
  return true;
}

export class PriceListService {
  private static async requireGeneralPriceList(client: PriceDataClient = prisma) {
    const priceList = await client.priceList.findFirst({
      where: {
        code: 'GENERAL',
        scopeType: PriceListScopeType.GLOBAL,
        isDefault: true,
        isActive: true
      },
      orderBy: { id: 'asc' }
    });
    if (!priceList) throw ApiError.notFound('Không tìm thấy Bảng giá chung');
    return priceList;
  }

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

  static async getGeneralPriceListData() {
    const priceList = await this.requireGeneralPriceList();
    const items = await prisma.priceListItem.findMany({
      where: { priceListId: priceList.id },
      orderBy: { menuItem: { displayOrder: 'asc' } },
      include: {
        menuItem: {
          include: {
            category: { select: { name: true } },
            menuItemIngredients: {
              include: { ingredient: { select: { costPerUnit: true } } }
            }
          }
        }
      }
    });

    return {
      priceList: {
        id: priceList.id,
        code: priceList.code,
        name: priceList.name,
        type: priceList.type,
        scopeType: priceList.scopeType,
        isDefault: priceList.isDefault,
        isActive: priceList.isActive,
        effectiveFrom: priceList.effectiveFrom,
        effectiveTo: priceList.effectiveTo
      },
      items: items.map(item => {
        const costPrice = item.menuItem.menuItemIngredients.reduce(
          (sum, recipe) => sum + recipe.quantityRequired * recipe.ingredient.costPerUnit,
          0
        );
        const roundedCostPrice = Math.round(costPrice);
        return {
          id: item.id,
          priceListId: item.priceListId,
          menuItemId: item.menuItemId,
          sku: item.menuItem.sku,
          name: item.menuItem.name,
          categoryId: item.menuItem.categoryId,
          categoryName: item.menuItem.category.name,
          costPrice: roundedCostPrice > 0 ? roundedCostPrice : null,
          salePrice: item.salePrice,
          marginPercent: roundedCostPrice > 0
            ? Number((((item.salePrice - roundedCostPrice) / item.salePrice) * 100).toFixed(2))
            : null,
          version: item.version,
          updatedAt: item.updatedAt
        };
      })
    };
  }

  static async updateGeneralPrice(
    priceListId: number,
    menuItemId: number,
    salePrice: number,
    expectedVersion: number,
    actorId?: number,
    actorName?: string
  ) {
    const result = await prisma.$transaction(async tx => {
      const priceList = await tx.priceList.findFirst({
        where: { id: priceListId, code: 'GENERAL', scopeType: PriceListScopeType.GLOBAL, isActive: true },
        select: { id: true }
      });
      if (!priceList) throw ApiError.notFound('Bảng giá không tồn tại hoặc không hoạt động');

      const current = await tx.priceListItem.findUnique({
        where: { priceListId_menuItemId: { priceListId, menuItemId } },
        include: { menuItem: { select: { id: true, sku: true, name: true } } }
      });
      if (!current) throw ApiError.notFound('Món ăn chưa có trong bảng giá');
      if (current.version !== expectedVersion) {
        throw ApiError.conflict('Giá món đã được cập nhật ở cửa sổ khác. Vui lòng tải lại dòng này.');
      }

      const updated = await tx.priceListItem.update({
        where: { id: current.id },
        data: { salePrice, version: { increment: 1 } },
        include: { menuItem: { select: { id: true, sku: true, name: true } } }
      });
      await tx.menuItem.update({ where: { id: menuItemId }, data: { basePrice: salePrice } });
      return { current, updated };
    });

    await AuditService.log({
      action: 'PRICE_LIST_ITEM_UPDATED',
      targetType: 'PriceListItem',
      targetId: result.updated.id,
      actorId,
      actorName,
      metadata: {
        priceListId,
        menuItemId,
        sku: result.updated.menuItem.sku,
        oldSalePrice: result.current.salePrice,
        newSalePrice: result.updated.salePrice,
        oldVersion: result.current.version,
        newVersion: result.updated.version,
        source: 'manual'
      }
    });
    emitToAll('priceList:itemChanged', {
      priceListId,
      menuItemId,
      salePrice: result.updated.salePrice,
      version: result.updated.version,
      updatedAt: result.updated.updatedAt.toISOString()
    });

    return { item: result.updated };
  }

  static async exportPriceList(priceListId: number, format: 'csv' | 'xlsx' = 'csv'): Promise<Buffer> {
    if (format !== 'csv') {
      throw ApiError.badRequest('Định dạng export chưa được hỗ trợ');
    }

    const rows = await prisma.priceListItem.findMany({
      where: { priceListId },
      orderBy: { menuItem: { displayOrder: 'asc' } },
      include: {
        menuItem: {
          include: {
            category: { select: { name: true } },
            menuItemIngredients: {
              include: { ingredient: { select: { costPerUnit: true } } }
            }
          }
        }
      }
    });
    if (rows.length === 0) throw ApiError.notFound('Bảng giá không có món để xuất');

    return serializePriceListCsv(rows.map(row => {
      const costPrice = Math.round(row.menuItem.menuItemIngredients.reduce(
        (sum, recipe) => sum + recipe.quantityRequired * recipe.ingredient.costPerUnit,
        0
      ));
      return {
        sku: row.menuItem.sku,
        name: row.menuItem.name,
        categoryName: row.menuItem.category.name,
        costPrice: costPrice > 0 ? costPrice : null,
        salePrice: row.salePrice
      };
    }));
  }

  static async bulkUpdateGeneralPrices(
    priceListId: number,
    menuItemIds: number[],
    operation: BulkPriceOperation,
    actorId?: number,
    actorName?: string
  ) {
    const uniqueMenuItemIds = Array.from(new Set(menuItemIds));
    const result = await prisma.$transaction(async tx => {
      const priceList = await tx.priceList.findFirst({
        where: { id: priceListId, code: 'GENERAL', scopeType: PriceListScopeType.GLOBAL, isActive: true },
        select: { id: true }
      });
      if (!priceList) throw ApiError.notFound('Bảng giá không tồn tại hoặc không hoạt động');

      const currentItems = await tx.priceListItem.findMany({
        where: { priceListId, menuItemId: { in: uniqueMenuItemIds } },
        select: { id: true, menuItemId: true, salePrice: true, version: true }
      });
      if (currentItems.length !== uniqueMenuItemIds.length) {
        throw ApiError.badRequest('Một hoặc nhiều món chưa có trong bảng giá');
      }

      const updatedIds: number[] = [];
      for (const item of currentItems) {
        const rawPrice = operation.mode === 'fixed'
          ? operation.value
          : operation.mode === 'amount'
            ? item.salePrice + operation.value
            : item.salePrice * (1 + operation.value / 100);
        const salePrice = operation.rounding
          ? Math.round(rawPrice / operation.rounding) * operation.rounding
          : Math.round(rawPrice);
        if (!Number.isInteger(salePrice) || salePrice <= 0) {
          throw ApiError.badRequest('Phép tính tạo ra giá bán không hợp lệ');
        }
        await tx.priceListItem.update({
          where: { id: item.id },
          data: { salePrice, version: { increment: 1 } }
        });
        await tx.menuItem.update({ where: { id: item.menuItemId }, data: { basePrice: salePrice } });
        updatedIds.push(item.menuItemId);
      }
      return { updatedCount: updatedIds.length, menuItemIds: updatedIds };
    });

    await AuditService.log({
      action: 'PRICE_LIST_ITEMS_BULK_UPDATED',
      targetType: 'PriceList',
      targetId: priceListId,
      actorId,
      actorName,
      metadata: { priceListId, menuItemIds: result.menuItemIds, operation }
    });
    emitToAll('priceList:bulkChanged', { priceListId, menuItemIds: result.menuItemIds, updatedAt: new Date().toISOString() });
    return result;
  }

  static async previewPriceImport(priceListId: number, buffer: Buffer, fileName: string) {
    const priceList = await this.requireGeneralPriceList();
    if (priceList.id !== priceListId) throw ApiError.badRequest('Chỉ hỗ trợ nhập cho Bảng giá chung');
    const parsedRows = parsePriceImportBuffer(buffer);
    const existingItems = await prisma.priceListItem.findMany({
      where: { priceListId },
      include: { menuItem: { select: { id: true, sku: true, name: true } } }
    });
    const bySku = new Map(existingItems.map(item => [item.menuItem.sku.toLowerCase(), item]));
    const validRows: Array<{ rowNumber: number; sku: string; name: string; menuItemId: number; salePrice: number }> = [];
    const errorRows: Array<{ rowNumber: number; sku: string; message: string }> = [];
    for (const row of parsedRows) {
      const item = bySku.get(row.sku.toLowerCase());
      if (!item) {
        errorRows.push({ rowNumber: row.rowNumber, sku: row.sku, message: 'Không tìm thấy SKU trong bảng giá' });
      } else if (row.salePrice === null || row.salePrice <= 0 || !Number.isInteger(row.salePrice)) {
        errorRows.push({ rowNumber: row.rowNumber, sku: row.sku, message: 'Giá bán phải là số nguyên lớn hơn 0' });
      } else {
        validRows.push({ rowNumber: row.rowNumber, sku: item.menuItem.sku, name: item.menuItem.name, menuItemId: item.menuItemId, salePrice: row.salePrice });
      }
    }
    return { fileName, totalRows: parsedRows.length, validRows, errorRows, canCommit: validRows.length > 0 && errorRows.length === 0 };
  }

  static async commitPriceImport(
    priceListId: number,
    buffer: Buffer,
    fileName: string,
    actorId?: number,
    actorName?: string
  ) {
    const preview = await this.previewPriceImport(priceListId, buffer, fileName);
    if (!preview.canCommit) throw ApiError.badRequest('File nhập có dòng lỗi, vui lòng sửa trước khi áp dụng');
    await prisma.$transaction(async tx => {
      for (const row of preview.validRows) {
        const current = await tx.priceListItem.findUniqueOrThrow({ where: { priceListId_menuItemId: { priceListId, menuItemId: row.menuItemId } } });
        await tx.priceListItem.update({ where: { id: current.id }, data: { salePrice: row.salePrice, version: { increment: 1 } } });
        await tx.menuItem.update({ where: { id: row.menuItemId }, data: { basePrice: row.salePrice } });
      }
    });
    await AuditService.log({
      action: 'PRICE_LIST_ITEMS_IMPORTED',
      targetType: 'PriceList',
      targetId: priceListId,
      actorId,
      actorName,
      metadata: { priceListId, fileName, updatedCount: preview.validRows.length }
    });
    emitToAll('priceList:bulkChanged', {
      priceListId,
      menuItemIds: preview.validRows.map(row => row.menuItemId),
      updatedAt: new Date().toISOString()
    });
    return { updatedCount: preview.validRows.length, createdCount: 0 };
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
