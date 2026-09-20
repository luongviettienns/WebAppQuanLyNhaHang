import { beforeEach, describe, expect, it } from 'vitest';
import { prismaTest, truncateAllTables } from '../helpers/database';
import { InventoryCatalogService } from '../../src/modules/inventory/inventory-catalog.service';

describe('InventoryCatalogService', () => {
  let categoryAId: number;
  let categoryBId: number;
  let trackedId: number;
  let untrackedId: number;
  let noBomId: number;
  let ingredientId: number;

  beforeEach(async () => {
    await truncateAllTables();

    const [categoryA, categoryB] = await Promise.all([
      prismaTest.category.create({ data: { name: 'Đồ ăn', displayOrder: 1 } }),
      prismaTest.category.create({ data: { name: 'Đồ uống', displayOrder: 2 } })
    ]);
    categoryAId = categoryA.id;
    categoryBId = categoryB.id;

    const ingredient = await prismaTest.ingredient.create({
      data: {
        sku: 'ING-001',
        name: 'Bột mì',
        unit: 'gram',
        currentStock: 4,
        minThreshold: 5,
        costPerUnit: 100,
        isActive: true
      }
    });
    ingredientId = ingredient.id;

    const [tracked, untracked, noBom] = await Promise.all([
      prismaTest.menuItem.create({
        data: {
          categoryId: categoryAId,
          sku: 'SP-TRACKED',
          name: 'Bánh có theo dõi tồn',
          basePrice: 30000,
          menuType: 'FOOD',
          trackStock: true,
          stockQuantity: 7,
          position: 'Bar',
          isAvailable: true
        }
      }),
      prismaTest.menuItem.create({
        data: {
          categoryId: categoryAId,
          sku: 'SP-UNTRACKED',
          name: 'Nước không theo dõi tồn',
          basePrice: 20000,
          menuType: 'DRINK',
          trackStock: false,
          stockQuantity: 20,
          position: 'Kitchen',
          isAvailable: true
        }
      }),
      prismaTest.menuItem.create({
        data: {
          categoryId: categoryBId,
          sku: 'SP-NOBOM',
          name: 'Món chưa có BOM',
          basePrice: 25000,
          menuType: 'SERVICE',
          trackStock: true,
          stockQuantity: 0,
          position: 'Counter',
          isAvailable: true
        }
      })
    ]);
    trackedId = tracked.id;
    untrackedId = untracked.id;
    noBomId = noBom.id;

    await prismaTest.menuItemIngredient.create({
      data: {
        menuItemId: trackedId,
        ingredientId,
        quantityRequired: 2
      }
    });
  });

  it('maps ingredients, tracked menu items, untracked menu items and missing BOM rows', async () => {
    const data = await InventoryCatalogService.getCatalog({
      page: 1,
      pageSize: 50,
      sortBy: 'sku',
      sortOrder: 'asc'
    }, prismaTest);

    const material = data.rows.find((row) => row.sourceType === 'INGREDIENT' && row.sourceId === ingredientId);
    const tracked = data.rows.find((row) => row.sourceType === 'MENU_ITEM' && row.sourceId === trackedId);
    const untracked = data.rows.find((row) => row.sourceType === 'MENU_ITEM' && row.sourceId === untrackedId);
    const noBom = data.rows.find((row) => row.sourceType === 'MENU_ITEM' && row.sourceId === noBomId);

    expect(material?.managementGroup).toBe('MATERIAL');
    expect(material?.costPrice).toBe(100);
    expect(material?.stockQuantity).toBe(4);
    expect(material?.stockStatus).toBe('LOW');
    expect(tracked?.costPrice).toBe(200);
    expect(tracked?.stockQuantity).toBe(7);
    expect(untracked?.stockQuantity).toBeNull();
    expect(untracked?.stockStatus).toBe('NOT_TRACKED');
    expect(noBom?.costPrice).toBeNull();
    expect(data.pagination.totalRows).toBe(4);
    expect(data.summary.totalStockValue).toBe(400 + 1400);
  });

  it('sorts and paginates the merged sources deterministically', async () => {
    const firstPage = await InventoryCatalogService.getCatalog({
      page: 1,
      pageSize: 2,
      sortBy: 'sku',
      sortOrder: 'asc'
    }, prismaTest);
    const secondPage = await InventoryCatalogService.getCatalog({
      page: 2,
      pageSize: 2,
      sortBy: 'sku',
      sortOrder: 'asc'
    }, prismaTest);

    expect(firstPage.rows).toHaveLength(2);
    expect(secondPage.rows).toHaveLength(2);
    expect(firstPage.pagination.totalPages).toBe(2);
    expect([...firstPage.rows, ...secondPage.rows].map((row) => row.sku)).toEqual([
      'ING-001', 'SP-NOBOM', 'SP-TRACKED', 'SP-UNTRACKED'
    ]);
  });

  it('applies source, category, menu type, stock, position and search filters', async () => {
    await expect(InventoryCatalogService.getCatalog({
      managementGroup: 'MATERIAL', page: 1, pageSize: 50, sortBy: 'sku', sortOrder: 'asc'
    }, prismaTest)).resolves.toMatchObject({ summary: { totalRows: 1 } });

    await expect(InventoryCatalogService.getCatalog({
      managementGroup: 'SELLABLE', categoryId: categoryBId, menuType: 'SERVICE',
      page: 1, pageSize: 50, sortBy: 'sku', sortOrder: 'asc'
    }, prismaTest)).resolves.toMatchObject({
      rows: [expect.objectContaining({ sourceId: noBomId })]
    });

    await expect(InventoryCatalogService.getCatalog({
      stockStatus: 'NOT_TRACKED', page: 1, pageSize: 50, sortBy: 'sku', sortOrder: 'asc'
    }, prismaTest)).resolves.toMatchObject({
      rows: [expect.objectContaining({ sourceId: untrackedId })]
    });

    await expect(InventoryCatalogService.getCatalog({
      position: 'Bar', search: 'TRACKED', page: 1, pageSize: 50, sortBy: 'sku', sortOrder: 'asc'
    }, prismaTest)).resolves.toMatchObject({
      rows: [expect.objectContaining({ sourceId: trackedId })]
    });
  });

  it('supports the all-active filter without treating unavailable items as active', async () => {
    await prismaTest.menuItem.update({ where: { id: noBomId }, data: { isAvailable: false } });

    const active = await InventoryCatalogService.getCatalog({
      page: 1, pageSize: 50, sortBy: 'sku', sortOrder: 'asc'
    }, prismaTest);
    const all = await InventoryCatalogService.getCatalog({
      isActive: 'all', page: 1, pageSize: 50, sortBy: 'sku', sortOrder: 'asc'
    }, prismaTest);

    expect(active.pagination.totalRows).toBe(3);
    expect(all.pagination.totalRows).toBe(4);
    expect(all.rows.find((row) => row.sourceType === 'MENU_ITEM' && row.sourceId === noBomId)?.isActive).toBe(false);
  });
});
