import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/prisma';
import { calculateRecipeCostOrNull } from './inventory.math';
import {
  InventoryCatalogDataDto,
  InventoryCatalogRowDto,
  InventoryCatalogSummaryDto,
  InventoryStockStatus
} from './inventory-catalog.types';
import { InventoryCatalogFilter } from './inventory.schemas';

type IngredientCatalogRecord = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  currentStock: number;
  minThreshold: number;
  costPerUnit: number;
  isActive: boolean;
  updatedAt: Date;
};

type MenuCatalogRecord = {
  id: number;
  sku: string;
  name: string;
  categoryId: number;
  menuType: 'FOOD' | 'DRINK' | 'SERVICE' | 'OTHER';
  trackStock: boolean;
  stockQuantity: number;
  isAvailable: boolean;
  position: string | null;
  updatedAt: Date;
  category: { name: string };
  menuItemIngredients: Array<{
    quantityRequired: number;
    ingredient: { costPerUnit: number };
  }>;
};

function inventoryStatus(
  stockQuantity: number | null,
  minStock: number | null,
  trackStock: boolean
): InventoryStockStatus {
  if (!trackStock || stockQuantity === null) return 'NOT_TRACKED';
  if (stockQuantity < 0) return 'NEGATIVE';
  if (minStock !== null && stockQuantity <= minStock) return 'LOW';
  return 'NORMAL';
}

function compareNullable(left: number | string | null, right: number | string | null, sortOrder: 'asc' | 'desc') {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const direction = sortOrder === 'asc' ? 1 : -1;
  if (typeof left === 'number' && typeof right === 'number') {
    return (left - right) * direction;
  }
  return String(left).localeCompare(String(right), 'vi') * direction;
}

export class InventoryCatalogService {
  private static async loadRows(
    filter: InventoryCatalogFilter,
    db: PrismaClient
  ): Promise<InventoryCatalogRowDto[]> {
    const search = filter.search?.trim();
    const isActive = filter.isActive ?? 'true';
    const includeIngredients = !filter.managementGroup || filter.managementGroup === 'MATERIAL';
    const includeMenuItems = !filter.managementGroup || filter.managementGroup === 'SELLABLE';

    const ingredientWhere: Prisma.IngredientWhereInput = {};
    const menuWhere: Prisma.MenuItemWhereInput = {};

    if (isActive !== 'all') {
      ingredientWhere.isActive = isActive === 'true';
      menuWhere.isAvailable = isActive === 'true';
    }

    if (search) {
      ingredientWhere.OR = [
        { sku: { contains: search } },
        { name: { contains: search } }
      ];
      menuWhere.OR = [
        { sku: { contains: search } },
        { name: { contains: search } }
      ];
    }

    if (filter.categoryId !== undefined) menuWhere.categoryId = filter.categoryId;
    if (filter.menuType !== undefined) menuWhere.menuType = filter.menuType;
    if (filter.position) menuWhere.position = { contains: filter.position };

    const [ingredients, menuItems] = await Promise.all([
      includeIngredients
        ? db.ingredient.findMany({
            where: ingredientWhere,
            select: {
              id: true,
              sku: true,
              name: true,
              unit: true,
              currentStock: true,
              minThreshold: true,
              costPerUnit: true,
              isActive: true,
              updatedAt: true
            }
          }) as Promise<IngredientCatalogRecord[]>
        : Promise.resolve([]),
      includeMenuItems
        ? db.menuItem.findMany({
            where: menuWhere,
            include: {
              category: { select: { name: true } },
              menuItemIngredients: {
                select: {
                  quantityRequired: true,
                  ingredient: { select: { costPerUnit: true } }
                }
              }
            }
          }) as Promise<MenuCatalogRecord[]>
        : Promise.resolve([])
    ]);

    const materialRows: InventoryCatalogRowDto[] = ingredients.map((ingredient) => ({
      sourceType: 'INGREDIENT',
      sourceId: ingredient.id,
      sku: ingredient.sku,
      name: ingredient.name,
      managementGroup: 'MATERIAL',
      categoryId: null,
      categoryName: null,
      menuType: null,
      unit: ingredient.unit,
      costPrice: ingredient.costPerUnit,
      stockQuantity: ingredient.currentStock,
      minStock: ingredient.minThreshold,
      maxStock: null,
      stockStatus: inventoryStatus(ingredient.currentStock, ingredient.minThreshold, true),
      trackStock: true,
      isActive: ingredient.isActive,
      position: null,
      brand: null,
      attributes: null,
      updatedAt: ingredient.updatedAt.toISOString()
    }));

    const sellableRows: InventoryCatalogRowDto[] = menuItems.map((item) => {
      const costPrice = calculateRecipeCostOrNull(item.menuItemIngredients.map((recipe) => ({
        quantityRequired: recipe.quantityRequired,
        costPerUnit: recipe.ingredient.costPerUnit
      })));
      const stockQuantity = item.trackStock ? item.stockQuantity : null;
      const minStock = item.trackStock ? 0 : null;

      return {
        sourceType: 'MENU_ITEM',
        sourceId: item.id,
        sku: item.sku,
        name: item.name,
        managementGroup: 'SELLABLE',
        categoryId: item.categoryId,
        categoryName: item.category.name,
        menuType: item.menuType,
        unit: 'món',
        costPrice,
        stockQuantity,
        minStock,
        maxStock: null,
        stockStatus: inventoryStatus(stockQuantity, minStock, item.trackStock),
        trackStock: item.trackStock,
        isActive: item.isAvailable,
        position: item.position,
        brand: null,
        attributes: null,
        updatedAt: item.updatedAt.toISOString()
      };
    });

    return [...materialRows, ...sellableRows].filter((row) => {
      if (filter.stockStatus && filter.stockStatus !== 'ALL' && row.stockStatus !== filter.stockStatus) {
        return false;
      }
      if (filter.position && !row.position?.toLocaleLowerCase().includes(filter.position.toLocaleLowerCase())) {
        return false;
      }
      return true;
    });
  }

  private static sortRows(rows: InventoryCatalogRowDto[], filter: InventoryCatalogFilter) {
    return rows.sort((left, right) => {
      const leftValue = left[filter.sortBy];
      const rightValue = right[filter.sortBy];
      const primary = compareNullable(
        typeof leftValue === 'boolean' ? String(leftValue) : leftValue as number | string | null | undefined ?? null,
        typeof rightValue === 'boolean' ? String(rightValue) : rightValue as number | string | null | undefined ?? null,
        filter.sortOrder
      );
      if (primary !== 0) return primary;

      const sourceCompare = left.sourceType.localeCompare(right.sourceType);
      return sourceCompare !== 0 ? sourceCompare : left.sourceId - right.sourceId;
    });
  }

  private static summarize(rows: InventoryCatalogRowDto[]): InventoryCatalogSummaryDto {
    return {
      totalRows: rows.length,
      trackedRows: rows.filter((row) => row.trackStock).length,
      lowStockRows: rows.filter((row) => row.stockStatus === 'LOW').length,
      negativeStockRows: rows.filter((row) => row.stockStatus === 'NEGATIVE').length,
      totalStockValue: rows.reduce((total, row) => (
        row.stockQuantity !== null && row.costPrice !== null
          ? total + Math.round(row.stockQuantity * row.costPrice)
          : total
      ), 0)
    };
  }

  static async getCatalog(
    filter: InventoryCatalogFilter,
    db: PrismaClient = defaultPrisma
  ): Promise<InventoryCatalogDataDto> {
    const rows = await this.loadRows(filter, db);
    this.sortRows(rows, filter);
    const summary = this.summarize(rows);
    const totalPages = Math.ceil(rows.length / filter.pageSize);
    const start = (filter.page - 1) * filter.pageSize;

    return {
      rows: rows.slice(start, start + filter.pageSize),
      summary,
      pagination: {
        page: filter.page,
        pageSize: filter.pageSize,
        totalRows: rows.length,
        totalPages
      }
    };
  }

  static async getCatalogSnapshot(
    filter: InventoryCatalogFilter,
    db: PrismaClient = defaultPrisma
  ): Promise<InventoryCatalogRowDto[]> {
    const rows = await this.loadRows(filter, db);
    return this.sortRows(rows, filter);
  }
}
