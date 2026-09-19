import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { prismaTest, truncateAllTables } from '../helpers/database';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import * as XLSX from 'xlsx';

describe('InventoryService Integration Tests (TDD)', () => {
  let testMenuItemId: number;

  beforeAll(async () => {
    await truncateAllTables();
    // Tao category & menu item mau de test BOM
    const cat = await prismaTest.category.create({
      data: { name: 'Món Gà Rán' }
    });

    const item = await prismaTest.menuItem.create({
      data: {
        categoryId: cat.id,
        sku: 'SP000001',
        name: 'Gà Rán Test',
        basePrice: 50000
      }
    });
    testMenuItemId = item.id;
  });

  beforeEach(async () => {
    // Xoa sach bang kho truoc moi test
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.menuItemIngredient.deleteMany();
    await prismaTest.ingredient.deleteMany();
  });

  it('tao nguyen lieu moi va tu dong ghi log STOCK_IN ban dau neu ton > 0', async () => {
    const ing = await InventoryService.createIngredient({
      sku: 'ING-GA-01',
      name: 'Thịt gà tươi',
      unit: 'gram',
      currentStock: 10000,
      minThreshold: 2000,
      costPerUnit: 80
    }, prismaTest);

    expect(ing.id).toBeDefined();
    expect(ing.currentStock).toBe(10000);

    const tx = await prismaTest.inventoryTransaction.findFirst({
      where: { ingredientId: ing.id }
    });
    expect(tx).toBeDefined();
    expect(tx?.type).toBe('STOCK_IN');
    expect(tx?.quantity).toBe(10000);
    expect(tx?.costAmount).toBe(800000);
  });

  it('chan tao trung ma SKU nguyen lieu', async () => {
    await InventoryService.createIngredient({
      sku: 'ING-GA-01',
      name: 'Thịt gà 1',
      unit: 'gram'
    }, prismaTest);

    await expect(
      InventoryService.createIngredient({
        sku: 'ING-GA-01',
        name: 'Thịt gà 2',
        unit: 'gram'
      }, prismaTest)
    ).rejects.toThrow();
  });

  it('nhap kho thu cong (stockIn) cap nhat dung so ton va gia binh quan gia quyen', async () => {
    const ing = await InventoryService.createIngredient({
      sku: 'ING-KHOAI-01',
      name: 'Khoai tây',
      unit: 'gram',
      currentStock: 10000, // 10kg
      costPerUnit: 30       // 30d/g
    }, prismaTest);

    // Nhap them 10kg gia 40d/g -> tong 20kg gia 35d/g
    const updated = await InventoryService.stockIn({
      ingredientId: ing.id,
      quantity: 10000,
      costPerUnit: 40,
      note: 'Nhập lô hàng chiều'
    }, undefined, undefined, prismaTest);

    expect(updated.currentStock).toBe(20000);
    expect(updated.costPerUnit).toBe(35);

    const txList = await prismaTest.inventoryTransaction.findMany({
      where: { ingredientId: ing.id },
      orderBy: { id: 'desc' }
    });
    expect(txList[0].note).toBe('Nhập lô hàng chiều');
    expect(txList[0].quantity).toBe(10000);
  });

  it('nhap kho khi dang ton am: bu tru am va tinh gia moi tren lo moi (Q3 Rule)', async () => {
    // Tao nguyen lieu dang ton am (vi du -2000g do ban am)
    const ing = await prismaTest.ingredient.create({
      data: {
        sku: 'ING-DAU-01',
        name: 'Dầu chiên',
        unit: 'ml',
        currentStock: -2000,
        costPerUnit: 35
      }
    });

    // Nhap 5000ml gia 45d/ml
    const updated = await InventoryService.stockIn({
      ingredientId: ing.id,
      quantity: 5000,
      costPerUnit: 45,
      note: 'Nhập bù hàng âm'
    }, undefined, undefined, prismaTest);

    // Ton moi = -2000 + 5000 = 3000
    expect(updated.currentStock).toBe(3000);
    // Gia von moi phai la 45d (lay theo lo moi, khong meo boi so am)
    expect(updated.costPerUnit).toBe(45);
  });

  it('cau hinh va lay cong thuc dinh luong BOM cho mon an', async () => {
    const ing1 = await InventoryService.createIngredient({
      sku: 'ING-BOM-GA',
      name: 'Gà',
      unit: 'gram',
      currentStock: 10000,
      costPerUnit: 80
    }, prismaTest);

    const ing2 = await InventoryService.createIngredient({
      sku: 'ING-BOM-DAU',
      name: 'Dầu',
      unit: 'ml',
      currentStock: 5000,
      costPerUnit: 40
    }, prismaTest);

    // Cai dat BOM: 150g ga + 20ml dau
    await InventoryService.updateRecipe(testMenuItemId, [
      { ingredientId: ing1.id, quantityRequired: 150 },
      { ingredientId: ing2.id, quantityRequired: 20 }
    ], undefined, undefined, prismaTest);

    const recipe = await InventoryService.getRecipe(testMenuItemId, prismaTest);
    expect(recipe.ingredients).toHaveLength(2);
    // Gia von = 150*80 + 20*40 = 12.000 + 800 = 12.800d
    expect(recipe.totalCost).toBe(12800);
  });

  it('preview file Excel nhap kho: phan loai ro dong hop le va dong loi', async () => {
    await InventoryService.createIngredient({
      sku: 'ING-VALID-01',
      name: 'Thịt bò',
      unit: 'miếng',
      currentStock: 50,
      costPerUnit: 20000
    }, prismaTest);

    // Tao file Excel gom 1 dong hop le va 1 dong sai SKU
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Mã nguyên liệu', 'Tên nguyên liệu', 'Đơn vị tính', 'Số lượng nhập', 'Đơn giá nhập (VND)', 'Ghi chú'],
      ['ING-VALID-01', 'Thịt bò', 'miếng', 20, 22000, 'Lô sáng'],
      ['ING-KHONG-TON-TAI', 'Rau thơm', 'kg', 5, 10000, 'Sai mã']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fileBase64 = buffer.toString('base64');

    const preview = await InventoryService.previewExcelStockIn(fileBase64, 'test.xlsx', prismaTest);
    expect(preview.validRows).toHaveLength(1);
    expect(preview.validRows[0].sku).toBe('ING-VALID-01');
    expect(preview.validRows[0].projectedStock).toBe(70);

    expect(preview.errorRows).toHaveLength(1);
    expect(preview.errorRows[0].sku).toBe('ING-KHONG-TON-TAI');
    expect(preview.errorRows[0].error).toContain('không tồn tại');
  });

  it('commitExcelStockIn nhap hang loat thanh cong va ghi batch log', async () => {
    const ing = await InventoryService.createIngredient({
      sku: 'ING-BATCH-01',
      name: 'Vỏ bánh',
      unit: 'cái',
      currentStock: 100,
      costPerUnit: 5000
    }, prismaTest);

    await InventoryService.commitExcelStockIn({
      items: [
        {
          sku: 'ING-BATCH-01',
          quantity: 50,
          costPerUnit: 6000,
          note: 'Giao sáng'
        }
      ],
      sourceFileName: 'batch_01.xlsx'
    }, undefined, undefined, prismaTest);

    const updated = await prismaTest.ingredient.findUniqueOrThrow({
      where: { id: ing.id }
    });
    expect(updated.currentStock).toBe(150);

    const tx = await prismaTest.inventoryTransaction.findFirst({
      where: { ingredientId: ing.id, note: { contains: 'batch_01.xlsx' } }
    });
    expect(tx).toBeDefined();
    expect(tx?.quantity).toBe(50);
  });
});
