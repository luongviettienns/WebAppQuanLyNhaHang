import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('Order invoices read model API', () => {
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;
  let firstOrderId: number;

  beforeAll(async () => {
    await truncateAllTables();

    const [admin, cashier, kitchen] = await Promise.all([
      prismaTest.user.create({ data: { username: 'invoice-admin', passwordHash: 'hash', name: 'Quản lý', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: 'invoice-cashier', passwordHash: 'hash', name: 'Thu ngân', role: 'CASHIER' } }),
      prismaTest.user.create({ data: { username: 'invoice-kitchen', passwordHash: 'hash', name: 'Bếp', role: 'KITCHEN' } })
    ]);

    const sign = (user: typeof admin) => jwt.sign(
      { sub: String(user.id), username: user.username, name: user.name, role: user.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    adminToken = sign(admin);
    cashierToken = sign(cashier);
    kitchenToken = sign(kitchen);

    const category = await prismaTest.category.create({ data: { name: 'Món hóa đơn' } });
    const menuItem = await prismaTest.menuItem.create({
      data: { categoryId: category.id, sku: 'INV-001', name: 'Bún bò đặc biệt', basePrice: 70000 }
    });
    const table = await prismaTest.diningTable.create({
      data: { tableNumber: 31, qrCodeToken: 'invoice-qr-31', status: 'AVAILABLE' }
    });

    const first = await prismaTest.order.create({
      data: {
        code: 'HD-20260923-0001', orderType: 'DINE_IN', status: 'COMPLETED', tableId: table.id,
        totalAmount: 140000, vatAmount: 11200, finalAmount: 151200, paymentMethod: 'CASH',
        paymentStatus: 'PAID', paidAt: new Date('2026-09-23T03:30:00.000Z'),
        createdAt: new Date('2026-09-23T03:00:00.000Z'), createdByUserId: cashier.id,
        items: { create: { menuItemId: menuItem.id, quantity: 2, unitPrice: 70000, subtotal: 140000, notes: 'Ít cay' } }
      }
    });
    firstOrderId = first.id;

    await prismaTest.order.create({
      data: {
        code: 'HD-20260922-0002', orderType: 'TAKE_AWAY', status: 'PENDING',
        totalAmount: 70000, vatAmount: 5600, finalAmount: 75600, paymentStatus: 'UNPAID',
        createdAt: new Date('2026-09-22T16:00:00.000Z'), createdByUserId: admin.id,
        items: { create: { menuItemId: menuItem.id, quantity: 1, unitPrice: 70000, subtotal: 70000 } }
      }
    });
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('lists invoices with Vietnam date filters, page summary, and snapshot line totals', async () => {
    const response = await request(app)
      .get('/api/orders/invoices?from=2026-09-23&to=2026-09-23&pageSize=1')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      id: firstOrderId,
      code: 'HD-20260923-0001',
      customerName: null,
      totalGoods: 140000,
      discountAmount: 0,
      totalAfterDiscount: 140000,
      paidAmount: 151200,
      itemCount: 1
    });
    expect(response.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, totalRows: 1, totalPages: 1 });
    expect(response.body.data.summary).toEqual({
      totalGoods: 140000, totalDiscount: 0, totalAfterDiscount: 140000,
      totalVat: 11200, totalFinal: 151200, totalPaid: 151200
    });
  });

  it('filters by status and returns invoice detail with menu snapshot', async () => {
    const list = await request(app)
      .get('/api/orders/invoices?statuses=PENDING&paymentStatuses=UNPAID')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].code).toBe('HD-20260922-0002');

    const detail = await request(app)
      .get(`/api/orders/invoices/${firstOrderId}`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.invoice.items[0]).toMatchObject({
      sku: 'INV-001', menuItemName: 'Bún bò đặc biệt', quantity: 2, unitPrice: 70000, subtotal: 140000
    });
    expect(detail.body.data.invoice.tableNumber).toBe(31);
  });

  it('enforces invoice read roles and validates query input', async () => {
    expect((await request(app).get('/api/orders/invoices')).status).toBe(401);
    expect((await request(app).get('/api/orders/invoices').set('Authorization', `Bearer ${kitchenToken}`)).status).toBe(403);
    const invalid = await request(app)
      .get('/api/orders/invoices?from=2026-09-24&to=2026-09-23&pageSize=101')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});
