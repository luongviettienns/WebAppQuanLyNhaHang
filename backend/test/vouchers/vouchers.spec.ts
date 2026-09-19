import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { OrdersService } from '../../src/modules/orders/orders.service';

describe('Voucher & Coupon Engine (Phase 10 - Slice 10.2)', () => {
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;
  let testTable: { id: number; qrCodeToken: string };
  let testMenuItem: { id: number; basePrice: number };

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);

    adminToken = jwt.sign(
      { sub: '1', username: 'admin', name: 'Admin User', role: 'ADMIN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    cashierToken = jwt.sign(
      { sub: '2', username: 'cashier', name: 'Cashier Staff', role: 'CASHIER' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    kitchenToken = jwt.sign(
      { sub: '3', username: 'kitchen', name: 'Kitchen Chef', role: 'KITCHEN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );

    const table = await prismaTest.diningTable.findFirstOrThrow({ where: { tableNumber: 1 } });
    testTable = { id: table.id, qrCodeToken: table.qrCodeToken };

    const menuItem = await prismaTest.menuItem.findFirstOrThrow({
      where: { isAvailable: true, modifierGroups: { none: { isRequired: true } } }
    });
    testMenuItem = { id: menuItem.id, basePrice: menuItem.basePrice };
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('rejects unauthenticated request to create voucher with 401 UNAUTHENTICATED', async () => {
    const res = await request(app)
      .post('/api/vouchers')
      .send({
        code: 'SALE10',
        title: 'Giam 10%',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString()
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects non-admin roles (CASHIER, KITCHEN) with 403 FORBIDDEN', async () => {
    const resCashier = await request(app)
      .post('/api/vouchers')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        code: 'SALE10',
        title: 'Giam 10%',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString()
      });

    expect(resCashier.status).toBe(403);
    expect(resCashier.body.error.code).toBe('FORBIDDEN');
  });

  it('allows ADMIN to create a PERCENTAGE voucher with maxDiscount and minOrderValue', async () => {
    const res = await request(app)
      .post('/api/vouchers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TEST_PERC10',
        title: 'Giam 10% toi da 50K cho don tu 50K',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderValue: 50000,
        maxDiscount: 50000,
        usageLimit: 100,
        startDate: new Date(Date.now() - 3600000).toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000).toISOString()
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('TEST_PERC10');
    expect(res.body.data.discountType).toBe('PERCENTAGE');
    expect(res.body.data.discountValue).toBe(10);
    expect(res.body.data.usedCount).toBe(0);
  });

  it('allows ADMIN to create a FIXED_AMOUNT voucher', async () => {
    const res = await request(app)
      .post('/api/vouchers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'TEST_FIXED20K',
        title: 'Giam ngay 20.000d cho don tu 100K',
        discountType: 'FIXED_AMOUNT',
        discountValue: 20000,
        minOrderValue: 100000,
        usageLimit: 50,
        startDate: new Date(Date.now() - 3600000).toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000).toISOString()
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('TEST_FIXED20K');
    expect(res.body.data.discountType).toBe('FIXED_AMOUNT');
    expect(res.body.data.discountValue).toBe(20000);
  });

  it('rejects duplicate voucher code with 409 CONFLICT', async () => {
    const res = await request(app)
      .post('/api/vouchers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'CRISPY10',
        title: 'Trung ma code',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString()
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VOUCHER_ALREADY_EXISTS');
  });

  it('validates a PERCENTAGE voucher and returns exact discount and 8% VAT calculations', async () => {
    // Order amount = 200,000 VND
    // Discount 10% = 20,000 VND (<= maxDiscount 50,000 VND)
    // Taxable amount = 200,000 - 20,000 = 180,000 VND
    // VAT 8% = 180,000 * 0.08 = 14,400 VND
    // Final amount = 180,000 + 14,400 = 194,400 VND
    const res = await request(app)
      .post('/api/vouchers/validate')
      .send({
        code: 'crispy10', // test case-insensitivity
        orderAmount: 200000
      });

    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('CRISPY10');
    expect(res.body.data.discountAmount).toBe(20000);
    expect(res.body.data.taxableAmount).toBe(180000);
    expect(res.body.data.vatAmount).toBe(14400);
    expect(res.body.data.finalAmount).toBe(194400);
  });

  it('caps PERCENTAGE discount to maxDiscount when order amount is very high', async () => {
    // Order amount = 1,000,000 VND
    // 10% = 100,000 VND > maxDiscount (50,000 VND) -> discountAmount = 50,000 VND
    // Taxable = 950,000 VND
    // VAT 8% = 950,000 * 0.08 = 76,000 VND
    // Final = 950,000 + 76,000 = 1,026,000 VND
    const res = await request(app)
      .post('/api/vouchers/validate')
      .send({
        code: 'CRISPY10',
        orderAmount: 1000000
      });

    expect(res.status).toBe(200);
    expect(res.body.data.discountAmount).toBe(50000);
    expect(res.body.data.taxableAmount).toBe(950000);
    expect(res.body.data.vatAmount).toBe(76000);
    expect(res.body.data.finalAmount).toBe(1026000);
  });

  it('rejects validation when order amount does not meet minOrderValue', async () => {
    // CRISPY10 requires minOrderValue 50,000 VND
    const res = await request(app)
      .post('/api/vouchers/validate')
      .send({
        code: 'CRISPY10',
        orderAmount: 40000
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MIN_ORDER_VALUE_NOT_MET');
  });

  it('rejects validation when voucher is expired', async () => {
    // Create an expired voucher directly
    await prismaTest.voucher.create({
      data: {
        code: 'EXPIRED50',
        title: 'Voucher het han',
        discountType: 'PERCENTAGE',
        discountValue: 50,
        startDate: new Date(Date.now() - 10 * 86400000),
        endDate: new Date(Date.now() - 2 * 86400000),
        usageLimit: 10
      }
    });

    const res = await request(app)
      .post('/api/vouchers/validate')
      .send({
        code: 'EXPIRED50',
        orderAmount: 100000
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VOUCHER_EXPIRED');
  });

  it('rejects validation when voucher usageLimit is exhausted', async () => {
    // Create an exhausted voucher
    await prismaTest.voucher.create({
      data: {
        code: 'EXHAUSTED',
        title: 'Voucher het luot dung',
        discountType: 'FIXED_AMOUNT',
        discountValue: 10000,
        usageLimit: 5,
        usedCount: 5,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000)
      }
    });

    const res = await request(app)
      .post('/api/vouchers/validate')
      .send({
        code: 'EXHAUSTED',
        orderAmount: 100000
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VOUCHER_USAGE_EXHAUSTED');
  });

  it('allows public/client to GET /api/vouchers/active returning active valid vouchers', async () => {
    const res = await request(app)
      .get('/api/vouchers/active');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const codes = res.body.data.map((v: any) => v.code);
    expect(codes).toContain('CRISPY10');
    expect(codes).toContain('GIAM20K');
    expect(codes).not.toContain('EXPIRED50');
    expect(codes).not.toContain('EXHAUSTED');
  });

  it('creates order with voucherCode: deducts discount, recalculates VAT, and increments usedCount', async () => {
    // 1. Check initial usedCount of GIAM20K
    const initialVoucher = await prismaTest.voucher.findUniqueOrThrow({ where: { code: 'GIAM20K' } });
    const initialUsedCount = initialVoucher.usedCount;

    // 2. Create order using GIAM20K
    // Order: 3 items of testMenuItem (unitPrice = testMenuItem.basePrice)
    // Make sure subtotal >= 100,000 VND
    const quantity = Math.max(3, Math.ceil(100000 / testMenuItem.basePrice));
    const subtotal = testMenuItem.basePrice * quantity;

    const res = await request(app)
      .post('/api/orders')
      .send({
        orderType: 'DINE_IN',
        tableId: testTable.id,
        qrCodeToken: testTable.qrCodeToken,
        voucherCode: 'GIAM20K',
        items: [
          {
            menuItemId: testMenuItem.id,
            quantity
          }
        ]
      });

    expect(res.status).toBe(201);
    const createdOrder = res.body.data.order;
    expect(createdOrder.voucherCode).toBe('GIAM20K');
    expect(createdOrder.discountAmount).toBe(20000);
    expect(createdOrder.totalAmount).toBe(subtotal);

    const expectedTaxable = subtotal - 20000;
    const expectedVat = Math.round(expectedTaxable * 0.08);
    const expectedFinal = expectedTaxable + expectedVat;

    expect(createdOrder.vatAmount).toBe(expectedVat);
    expect(createdOrder.finalAmount).toBe(expectedFinal);

    // 3. Verify voucher usedCount incremented by 1
    const updatedVoucher = await prismaTest.voucher.findUniqueOrThrow({ where: { code: 'GIAM20K' } });
    expect(updatedVoucher.usedCount).toBe(initialUsedCount + 1);

    // 4. Voiding the order should restore voucher usedCount
    // Admin voids the order
    const voidRes = await request(app)
      .patch(`/api/orders/${createdOrder.id}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Khach doi y huy voucher' });

    expect(voidRes.status).toBe(200);

    // 5. Verify voucher usedCount decremented back
    const restoredVoucher = await prismaTest.voucher.findUniqueOrThrow({ where: { code: 'GIAM20K' } });
    expect(restoredVoucher.usedCount).toBe(initialUsedCount);
  });
});
