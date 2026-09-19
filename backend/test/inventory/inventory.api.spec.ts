import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, truncateAllTables } from '../helpers/database';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import * as XLSX from 'xlsx';

describe('Inventory & BOM API Endpoints & Auto-Deduct (Integration Test)', () => {
  let adminToken: string;
  let cashierToken: string;
  let testMenuItemId: number;
  let testTableId: number;

  beforeAll(async () => {
    await truncateAllTables();

    // Tao user admin & cashier
    const admin = await prismaTest.user.create({
      data: {
        username: 'admin_inv_test',
        passwordHash: 'hash',
        name: 'Quản Lý Kho',
        role: 'ADMIN'
      }
    });

    const cashier = await prismaTest.user.create({
      data: {
        username: 'cashier_inv_test',
        passwordHash: 'hash',
        name: 'Thu Ngân',
        role: 'CASHIER'
      }
    });

    adminToken = jwt.sign(
      { sub: String(admin.id), username: admin.username, name: admin.name, role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    cashierToken = jwt.sign(
      { sub: String(cashier.id), username: cashier.username, name: cashier.name, role: 'CASHIER' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    const cat = await prismaTest.category.create({
      data: { name: 'Món Test Kho' }
    });

    const menuItem = await prismaTest.menuItem.create({
      data: {
        categoryId: cat.id,
        sku: 'SP_INV_01',
        name: 'Gà Rán Đặc Biệt',
        basePrice: 60000
      }
    });
    testMenuItemId = menuItem.id;

    const table = await prismaTest.diningTable.create({
      data: {
        tableNumber: 88,
        qrCodeToken: 'qr_test_inv_88',
        status: 'AVAILABLE'
      }
    });
    testTableId = table.id;
  });

  beforeEach(async () => {
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.menuItemIngredient.deleteMany();
    await prismaTest.ingredient.deleteMany();
  });

  it('chan truy cap neu khong co token (401) hoac khong phai ADMIN (403)', async () => {
    // Khong co token
    const resNoAuth = await request(app).get('/api/inventory/ingredients');
    expect(resNoAuth.status).toBe(401);

    // Quyen CASHIER
    const resCashier = await request(app)
      .get('/api/inventory/ingredients')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(resCashier.status).toBe(403);
  });

  it('ADMIN tao nguyen lieu, cap nhat va lay danh sach thanh cong', async () => {
    // Tao moi
    const resCreate = await request(app)
      .post('/api/inventory/ingredients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'ING-TEST-01',
        name: 'Thịt đùi gà',
        unit: 'gram',
        currentStock: 15000,
        minThreshold: 3000,
        costPerUnit: 80
      });

    expect(resCreate.status).toBe(201);
    expect(resCreate.body.data.sku).toBe('ING-TEST-01');
    const ingId = resCreate.body.data.id;

    // Lay danh sach
    const resList = await request(app)
      .get('/api/inventory/ingredients')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resList.status).toBe(200);
    expect(resList.body.data).toHaveLength(1);
    expect(resList.body.data[0].totalValue).toBe(15000 * 80);

    // Cap nhat
    const resUpdate = await request(app)
      .patch(`/api/inventory/ingredients/${ingId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Thịt đùi gà rút xương',
        costPerUnit: 85
      });
    expect(resUpdate.status).toBe(200);
    expect(resUpdate.body.data.name).toBe('Thịt đùi gà rút xương');
  });

  it('nhap kho thu cong POST /api/inventory/stock-in', async () => {
    const ing = await prismaTest.ingredient.create({
      data: {
        sku: 'ING-TEST-02',
        name: 'Dầu ăn',
        unit: 'ml',
        currentStock: 10000,
        costPerUnit: 40
      }
    });

    const res = await request(app)
      .post('/api/inventory/stock-in')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ingredientId: ing.id,
        quantity: 5000,
        costPerUnit: 46,
        note: 'Mua can 5L'
      });

    expect(res.status).toBe(200);
    // (10.000 * 40 + 5.000 * 46) / 15.000 = (400k + 230k) / 15k = 630k / 15k = 42
    expect(res.body.data.currentStock).toBe(15000);
    expect(res.body.data.costPerUnit).toBe(42);
  });

  it('tai file mau Excel template va xuat ton kho ra Excel', async () => {
    // Download template
    const resTemplate = await request(app)
      .get('/api/inventory/excel/template')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resTemplate.status).toBe(200);
    expect(resTemplate.headers['content-type']).toContain('spreadsheetml');

    // Export stock
    const resExport = await request(app)
      .get('/api/inventory/excel/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resExport.status).toBe(200);
    expect(resExport.headers['content-type']).toContain('spreadsheetml');
  });

  it('preview va commit nhap hang loat tu Excel', async () => {
    await prismaTest.ingredient.create({
      data: {
        sku: 'ING-EXCEL-01',
        name: 'Khoai tây',
        unit: 'gram',
        currentStock: 5000,
        costPerUnit: 30
      }
    });

    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Mã nguyên liệu', 'Tên nguyên liệu', 'Đơn vị tính', 'Số lượng nhập', 'Đơn giá nhập (VND)', 'Ghi chú'],
      ['ING-EXCEL-01', 'Khoai tây', 'gram', 5000, 40, 'Lô mới']
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fileBase64 = buffer.toString('base64');

    // Preview
    const resPreview = await request(app)
      .post('/api/inventory/excel/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fileBase64, fileName: 'nhap_kho.xlsx' });

    expect(resPreview.status).toBe(200);
    expect(resPreview.body.data.validRows).toHaveLength(1);
    expect(resPreview.body.data.errorRows).toHaveLength(0);

    // Commit
    const resCommit = await request(app)
      .post('/api/inventory/excel/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            sku: 'ING-EXCEL-01',
            quantity: 5000,
            costPerUnit: 40,
            note: 'Duyệt nhập'
          }
        ],
        sourceFileName: 'nhap_kho.xlsx'
      });

    expect(resCommit.status).toBe(200);
    expect(resCommit.body.data.importedCount).toBe(1);

    const ingUpdated = await prismaTest.ingredient.findUnique({
      where: { sku: 'ING-EXCEL-01' }
    });
    expect(ingUpdated?.currentStock).toBe(10000);
    expect(ingUpdated?.costPerUnit).toBe(35);
  });

  it('cai dat BOM va tu dong tru kho khi thanh toan don hang (Auto-Deduct)', async () => {
    // 1. Tao nguyen lieu
    const ingGa = await prismaTest.ingredient.create({
      data: {
        sku: 'ING-AUTO-GA',
        name: 'Thịt gà tự động',
        unit: 'gram',
        currentStock: 10000, // 10kg
        costPerUnit: 80
      }
    });

    const ingDau = await prismaTest.ingredient.create({
      data: {
        sku: 'ING-AUTO-DAU',
        name: 'Dầu ăn tự động',
        unit: 'ml',
        currentStock: 5000, // 5L
        costPerUnit: 40
      }
    });

    // 2. Cai dat BOM cho testMenuItemId: 1 phan = 200g ga + 30ml dau
    const resRecipe = await request(app)
      .put(`/api/inventory/recipes/${testMenuItemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ingredients: [
          { ingredientId: ingGa.id, quantityRequired: 200 },
          { ingredientId: ingDau.id, quantityRequired: 30 }
        ]
      });

    expect(resRecipe.status).toBe(200);
    expect(resRecipe.body.data.totalCost).toBe(200 * 80 + 30 * 40); // 16.000 + 1.200 = 17.200d

    // 3. Tao 1 don hang goi 2 phan mon nay (Tong tieu hao: 400g ga, 60ml dau)
    const order = await prismaTest.order.create({
      data: {
        code: `CRISPY-TEST-${Date.now()}`,
        tableId: testTableId,
        orderType: 'DINE_IN',
        status: 'READY',
        paymentStatus: 'UNPAID',
        totalAmount: 120000,
        vatAmount: 9600,
        finalAmount: 129600,
        items: {
          create: [
            {
              menuItemId: testMenuItemId,
              quantity: 2,
              unitPrice: 60000,
              subtotal: 120000
            }
          ]
        }
      }
    });

    // 4. Thanh toan don hang qua API POS Thu Ngan
    const resPay = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentMethod: 'CASH',
        cashReceived: 150000
      });

    expect(resPay.status).toBe(200);
    expect(resPay.body.data.order.paymentStatus).toBe('PAID');

    // 5. Kiem tra ton kho da bi tru tu dong chua!
    const updatedGa = await prismaTest.ingredient.findUnique({
      where: { id: ingGa.id }
    });
    // 10.000 - 400 = 9.600
    expect(updatedGa?.currentStock).toBe(9600);

    const updatedDau = await prismaTest.ingredient.findUnique({
      where: { id: ingDau.id }
    });
    // 5.000 - 60 = 4.940
    expect(updatedDau?.currentStock).toBe(4940);

    // 6. Kiem tra InventoryTransaction loai AUTO_DEDUCT da duoc tao
    const txGa = await prismaTest.inventoryTransaction.findFirst({
      where: {
        ingredientId: ingGa.id,
        orderId: order.id,
        type: 'AUTO_DEDUCT'
      }
    });
    expect(txGa).toBeDefined();
    expect(txGa?.quantity).toBe(-400);
    expect(txGa?.costAmount).toBe(400 * 80); // 32.000d
  });

  it('REGRESSION: cho phep tai file mau Excel /excel/template ma khong can Bearer Token', async () => {
    const res = await request(app).get('/api/inventory/excel/template');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('crispy_bite_stock_in_template.xlsx');
    expect(res.body).toBeDefined();
  });

  it('REGRESSION: cho phep xuat ton kho /excel/export bang token truyen qua query param ?token=', async () => {
    // 1. Khong co token -> 401
    const resNoToken = await request(app).get('/api/inventory/excel/export');
    expect(resNoToken.status).toBe(401);

    // 2. Co token qua query param -> 200 OK
    const resWithQueryToken = await request(app).get(`/api/inventory/excel/export?token=${adminToken}`);
    expect(resWithQueryToken.status).toBe(200);
    expect(resWithQueryToken.headers['content-disposition']).toContain('crispy_bite_inventory_');
  });

  it('tu dong tru kho nguyen tu (atomic decrement) khi don hang gom nhieu mon dung chung nguyen lieu', async () => {
    // 1. Tao 2 nguyen lieu
    const ingChicken = await prismaTest.ingredient.create({
      data: {
        sku: 'ING-MULTI-CHICKEN',
        name: 'Gà tươi chia sẻ',
        unit: 'gram',
        currentStock: 1000,
        costPerUnit: 100
      }
    });

    const ingOil = await prismaTest.ingredient.create({
      data: {
        sku: 'ING-MULTI-OIL',
        name: 'Dầu chiên chia sẻ',
        unit: 'ml',
        currentStock: 1000,
        costPerUnit: 50
      }
    });

    // 2. Tao 2 mon an
    const cat = await prismaTest.category.findFirst();
    const dishA = await prismaTest.menuItem.create({
      data: {
        categoryId: cat!.id,
        sku: 'SP-DISH-A',
        name: 'Món Gà A',
        basePrice: 50000
      }
    });
    const dishB = await prismaTest.menuItem.create({
      data: {
        categoryId: cat!.id,
        sku: 'SP-DISH-B',
        name: 'Món Combo B',
        basePrice: 80000
      }
    });

    // 3. Map BOM
    // Dish A: 200g ga, 20ml dau
    await prismaTest.menuItemIngredient.createMany({
      data: [
        { menuItemId: dishA.id, ingredientId: ingChicken.id, quantityRequired: 200 },
        { menuItemId: dishA.id, ingredientId: ingOil.id, quantityRequired: 20 }
      ]
    });
    // Dish B: 300g ga, 30ml dau
    await prismaTest.menuItemIngredient.createMany({
      data: [
        { menuItemId: dishB.id, ingredientId: ingChicken.id, quantityRequired: 300 },
        { menuItemId: dishB.id, ingredientId: ingOil.id, quantityRequired: 30 }
      ]
    });

    // 4. Tao don hang: 2 phan Dish A + 1 phan Dish B
    // Tong tieu hao ga: 2 * 200 + 1 * 300 = 700g -> con 1000 - 700 = 300g
    // Tong tieu hao dau: 2 * 20 + 1 * 30 = 70ml -> con 1000 - 70 = 930ml
    const order = await prismaTest.order.create({
      data: {
        code: `CRISPY-SHARED-${Date.now()}`,
        tableId: testTableId,
        orderType: 'DINE_IN',
        status: 'READY',
        paymentStatus: 'UNPAID',
        totalAmount: 180000,
        vatAmount: 14400,
        finalAmount: 194400,
        items: {
          create: [
            { menuItemId: dishA.id, quantity: 2, unitPrice: 50000, subtotal: 100000 },
            { menuItemId: dishB.id, quantity: 1, unitPrice: 80000, subtotal: 80000 }
          ]
        }
      }
    });

    // 5. Thanh toan
    const resPay = await request(app)
      .post(`/api/orders/${order.id}/pay`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentMethod: 'CASH', cashReceived: 200000 });

    expect(resPay.status).toBe(200);

    // 6. Kiem tra ton kho cap nhat chinh xac
    const finalChicken = await prismaTest.ingredient.findUnique({ where: { id: ingChicken.id } });
    expect(finalChicken?.currentStock).toBe(300);

    const finalOil = await prismaTest.ingredient.findUnique({ where: { id: ingOil.id } });
    expect(finalOil?.currentStock).toBe(930);

    // 7. Kiem tra cac ban ghi giao dich kho
    const chickenTxs = await prismaTest.inventoryTransaction.findMany({
      where: { ingredientId: ingChicken.id, orderId: order.id }
    });
    expect(chickenTxs).toHaveLength(2);
    const totalChickenDeducted = chickenTxs.reduce((sum, tx) => sum + tx.quantity, 0);
    expect(totalChickenDeducted).toBe(-700);
  });
});
