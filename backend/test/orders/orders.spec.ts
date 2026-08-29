import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

describe('Dine-In Orders & Tables API (Task 9 - Smart Dine-In)', () => {
  let cashierToken: string;
  let adminToken: string;

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);

    cashierToken = jwt.sign(
      { sub: '2', username: 'cashier', name: 'Cashier', role: 'CASHIER' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    adminToken = jwt.sign(
      { sub: '1', username: 'admin', name: 'Admin', role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('GET /api/tables tra ve danh sach 12 ban an voi trang thai mac dinh AVAILABLE', async () => {
    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('tables');
    expect(Array.isArray(res.body.data.tables)).toBe(true);
    expect(res.body.data.tables.length).toBe(12);

    const table1 = res.body.data.tables[0];
    expect(table1).toHaveProperty('id');
    expect(table1).toHaveProperty('tableNumber', 1);
    expect(table1).toHaveProperty('qrCodeToken');
    expect(table1).toHaveProperty('status', 'AVAILABLE');
  });

  it('GET /api/tables/:id tra ve thong tin ban an theo ID', async () => {
    const table = await prismaTest.diningTable.findFirst({ where: { tableNumber: 4 } });
    expect(table).not.toBeNull();

    const res = await request(app).get(`/api/tables/${table!.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.table.tableNumber).toBe(4);
    expect(res.body.data.table.status).toBe('AVAILABLE');
  });

  it('POST /api/orders tao don hang An tai ban (Dine-in) thanh cong, tinh dung VAT 8% va chuyen ban sang OCCUPIED', async () => {
    const table = await prismaTest.diningTable.findFirst({ where: { tableNumber: 4 } });
    const item = await prismaTest.menuItem.findFirst({
      where: { isAvailable: true },
      include: { modifierGroups: { include: { options: true } } }
    });
    expect(table).not.toBeNull();
    expect(item).not.toBeNull();

    // Chon modifier option neu co
    const selectedMods: any[] = [];
    if (item!.modifierGroups.length > 0) {
      const group = item!.modifierGroups[0];
      const opt = group.options[0];
      selectedMods.push({
        modifierGroupId: group.id,
        groupName: group.name,
        optionId: opt.id,
        optionName: opt.name,
        priceDelta: opt.priceDelta
      });
    }

    const idempotencyKey = `test-idemp-key-dinein-${Date.now()}-${Math.random()}`;
    const orderPayload = {
      tableId: table!.id,
      orderType: 'DINE_IN',
      idempotencyKey,
      notes: 'Ít đá, không hành',
      items: [
        {
          menuItemId: item!.id,
          quantity: 2,
          selectedModifiers: selectedMods,
          notes: 'Chiên giòn'
        }
      ]
    };

    const res = await request(app)
      .post('/api/orders')
      .send(orderPayload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    const createdOrder = res.body.data.order;
    expect(createdOrder.tableId).toBe(table!.id);
    expect(createdOrder.status).toBe('PENDING');
    expect(createdOrder.paymentStatus).toBe('UNPAID'); // Khach an xong moi thanh toan
    expect(createdOrder.items.length).toBe(1);

    // Kiem tra gia tinh toan
    const expectedModDelta = selectedMods.reduce((s, m) => s + m.priceDelta, 0);
    const expectedUnitPrice = item!.basePrice + expectedModDelta;
    const expectedTotal = expectedUnitPrice * 2;
    const expectedVat = Math.round(expectedTotal * 0.08); // 8% VAT
    const expectedFinal = expectedTotal + expectedVat;

    expect(createdOrder.totalAmount).toBe(expectedTotal);
    expect(createdOrder.vatAmount).toBe(expectedVat);
    expect(createdOrder.finalAmount).toBe(expectedFinal);

    // Kiem tra Table 4 chuyen sang OCCUPIED trong DB
    const updatedTable = await prismaTest.diningTable.findUnique({ where: { id: table!.id } });
    expect(updatedTable?.status).toBe('OCCUPIED');
    expect(updatedTable?.currentOrderId).toBe(createdOrder.id);
  });

  it('POST /api/orders tu choi tao don neu chua chon modifier bat buoc (isRequired: true)', async () => {
    const table = await prismaTest.diningTable.findFirst({ where: { tableNumber: 5 } });
    // Tim mon co modifier bat buoc
    const itemWithReqMod = await prismaTest.menuItem.findFirst({
      where: {
        isAvailable: true,
        modifierGroups: { some: { isRequired: true } }
      },
      include: { modifierGroups: true }
    });

    if (itemWithReqMod) {
      const res = await request(app)
        .post('/api/orders')
        .send({
          tableId: table!.id,
          orderType: 'DINE_IN',
          items: [
            {
              menuItemId: itemWithReqMod.id,
              quantity: 1,
              selectedModifiers: [] // Khong truyen modifier bat buoc
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('POST /api/orders tu choi tao don neu mon an da bi bao het (86d)', async () => {
    const table = await prismaTest.diningTable.findFirst({ where: { tableNumber: 6 } });
    // Danh dau 1 mon het hang
    const item = await prismaTest.menuItem.findFirst();
    await prismaTest.menuItem.update({
      where: { id: item!.id },
      data: { isAvailable: false }
    });

    const res = await request(app)
      .post('/api/orders')
      .send({
        tableId: table!.id,
        orderType: 'DINE_IN',
        items: [
          {
            menuItemId: item!.id,
            quantity: 1
          }
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    // Restore lai trang thai
    await prismaTest.menuItem.update({
      where: { id: item!.id },
      data: { isAvailable: true }
    });
  });

  it('POST /api/orders giu nguyen tinh Idempotent khi gui lai cung idempotencyKey', async () => {
    const table = await prismaTest.diningTable.findFirst({ where: { tableNumber: 7 } });
    const item = await prismaTest.menuItem.findFirst({
      where: {
        isAvailable: true,
        modifierGroups: { none: { isRequired: true } }
      }
    });
    const idempKey = 'unique-idemp-key-repeat-test-999';

    const payload = {
      tableId: table!.id,
      orderType: 'DINE_IN',
      idempotencyKey: idempKey,
      items: [{ menuItemId: item!.id, quantity: 1 }]
    };

    // Lan 1
    const res1 = await request(app).post('/api/orders').send(payload);
    expect(res1.status).toBe(201);
    const orderId1 = res1.body.data.order.id;

    // Lan 2 voi cung idempotencyKey
    const res2 = await request(app).post('/api/orders').send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.data.order.id).toBe(orderId1);
  });

  it('POST /api/orders/:id/pay xu ly thanh toan don hang va tu dong reset ban ve AVAILABLE', async () => {
    const table = await prismaTest.diningTable.findFirst({ where: { tableNumber: 4 } });
    const activeOrder = await prismaTest.order.findFirst({
      where: { tableId: table!.id, paymentStatus: 'UNPAID' }
    });
    expect(activeOrder).not.toBeNull();

    const res = await request(app)
      .post(`/api/orders/${activeOrder!.id}/pay`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentMethod: 'CASH'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.order.paymentStatus).toBe('PAID');
    expect(res.body.data.order.paymentMethod).toBe('CASH');

    // Kiem tra Table 4 da duoc reset ve AVAILABLE
    const tableAfterPay = await prismaTest.diningTable.findUnique({ where: { id: table!.id } });
    expect(tableAfterPay?.status).toBe('AVAILABLE');
    expect(tableAfterPay?.currentOrderId).toBeNull();
  });
});
