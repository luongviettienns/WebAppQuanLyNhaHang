import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { seedDatabase } from '../../prisma/seed';
import { prismaTest, truncateAllTables, validateTestEnvironment } from '../helpers/database';

describe('reservation order authorization and prepayment gate', () => {
  let kitchenToken: string;

  beforeAll(() => {
    validateTestEnvironment();
    kitchenToken = jwt.sign(
      { sub: '3', username: 'kitchen', name: 'Bếp', role: 'KITCHEN' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  });

  beforeEach(async () => {
    await truncateAllTables();
    await seedDatabase(prismaTest);
  });

  async function reservationContext(groupId?: number) {
    const table = await prismaTest.diningTable.findFirstOrThrow({ where: { isActive: true } });
    const customer = await prismaTest.customer.create({ data: { code: `KH-ORDER-${Date.now()}`, name: 'Khách đặt bàn', phone: `090${String(Date.now()).slice(-7)}`, groupId } });
    const policy = await prismaTest.reservationPolicy.findFirstOrThrow({ where: { isActive: true } });
    const reservation = await prismaTest.reservation.create({ data: {
      code: `BK-ORDER-${Date.now()}`, accessToken: `reservation-order-token-${Date.now()}`,
      customerId: customer.id, policyId: policy.id, tableId: table.id,
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000), partySize: 2,
      contactName: customer.name, contactPhone: customer.phone!, status: 'CHECKED_IN', depositStatus: 'PAID',
      depositAmount: 300000, checkedInAt: new Date(), checkedInByUserId: 2
    } });
    await prismaTest.reservationDepositTransaction.create({ data: {
      reservationId: reservation.id, type: 'DEPOSIT', status: 'SUCCESS', amount: 300000,
      paymentMethod: 'BANK_TRANSFER', externalReference: `ORDER-BOOKING-DEPOSIT-${reservation.id}`
    } });
    return { table, customer, reservation };
  }

  async function eligibleItem() {
    const item = await prismaTest.menuItem.findFirstOrThrow({ where: { isAvailable: true, basePrice: { gt: 100000 }, modifierGroups: { none: { isRequired: true } } } });
    return prismaTest.menuItem.update({ where: { id: item.id }, data: { trackStock: true, stockQuantity: 10 } });
  }

  async function createGuestOrder() {
    const { table, reservation } = await reservationContext();
    const item = await eligibleItem();
    const created = await request(app).post('/api/orders').send({
      orderType: 'DINE_IN', qrCodeToken: table.qrCodeToken, reservationAccessToken: reservation.accessToken,
      items: [{ menuItemId: item.id, quantity: 3 }]
    });
    return { created, item };
  }

  async function cashierAuth() {
    const cashier = await prismaTest.user.findFirstOrThrow({ where: { role: 'CASHIER' } });
    return jwt.sign(
      { sub: String(cashier.id), username: cashier.username, name: cashier.name, role: cashier.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
  }

  it('allows a walk-in guest with valid table QR to create a dine-in order and immediately reserves stock', async () => {
    const table = await prismaTest.diningTable.findFirstOrThrow({ where: { isActive: true } });
    const item = await eligibleItem();
    const stockBefore = item.stockQuantity;

    const response = await request(app).post('/api/orders').send({
      orderType: 'DINE_IN', qrCodeToken: table.qrCodeToken,
      items: [{ menuItemId: item.id, quantity: 1 }]
    });

    expect(response.status).toBe(201);
    expect(response.body.data.order.tableId).toBe(table.id);
    expect(response.body.data.order.status).toBe('PENDING');
    expect(response.body.data.order.paymentStatus).toBe('UNPAID');
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).stockQuantity).toBe(stockBefore - 1);
  });

  it('rejects a walk-in guest order when table QR code is invalid', async () => {
    const item = await eligibleItem();
    const stockBefore = item.stockQuantity;

    const response = await request(app).post('/api/orders').send({
      orderType: 'DINE_IN', qrCodeToken: 'invalid-table-qr-token',
      items: [{ menuItemId: item.id, quantity: 1 }]
    });

    expect(response.status).toBe(404);
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).stockQuantity).toBe(stockBefore);
  });

  it('keeps a checked-in guest order out of the kitchen until payment is confirmed', async () => {
    const { created, item } = await createGuestOrder();
    const stockBefore = item.stockQuantity;
    const bypassPayment = await request(app).post(`/api/orders/${created.body.data.order.id}/pay`)
      .set('Authorization', `Bearer ${await cashierAuth()}`).send({ paymentMethod: 'BANK_TRANSFER' });
    const kitchen = await request(app).get('/api/orders').set('Authorization', `Bearer ${kitchenToken}`);

    expect(created.status).toBe(201);
    expect(bypassPayment.status).toBe(409);
    expect(created.body.data.order.paymentStatus).toBe('UNPAID');
    expect(kitchen.body.data).not.toContainEqual(expect.objectContaining({ id: created.body.data.order.id }));
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).stockQuantity).toBe(stockBefore);
  });

  it('shows declared reservation prepayments in a cashier-only confirmation queue without exposing guest tokens', async () => {
    const { created } = await createGuestOrder();
    const order = created.body.data.order;
    const reservation = await prismaTest.reservation.findUniqueOrThrow({ where: { id: order.reservationId } });
    await request(app).post(`/api/orders/${order.id}/payment-declaration`).send({ reservationAccessToken: reservation.accessToken });

    const cashierToken = await cashierAuth();
    const queue = await request(app).get('/api/orders/payment-confirmations').set('Authorization', `Bearer ${cashierToken}`);
    const kitchenQueue = await request(app).get('/api/orders/payment-confirmations').set('Authorization', `Bearer ${kitchenToken}`);

    expect(queue.status).toBe(200);
    expect(queue.body.data).toContainEqual(expect.objectContaining({
      id: order.id, paymentStatus: 'WAITING_CONFIRMATION', reservationId: reservation.id
    }));
    expect(JSON.stringify(queue.body.data)).not.toContain(reservation.accessToken);
    expect(kitchenQueue.status).toBe(403);
  });

  it('lets only cashier/admin explicitly authorize a checked-in guest order to pay later', async () => {
    const { created, item } = await createGuestOrder();
    const order = created.body.data.order;
    const beforeStock = (await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).stockQuantity;
    const cashierToken = await cashierAuth();
    const denied = await request(app).post(`/api/orders/${order.id}/pay-later`).set('Authorization', `Bearer ${kitchenToken}`).send({ reason: 'Khách thân thiết' });
    const approved = await request(app).post(`/api/orders/${order.id}/pay-later`).set('Authorization', `Bearer ${cashierToken}`).send({ reason: 'Khách thân thiết, thu ngân xác nhận trả sau' });
    const kitchen = await request(app).get('/api/orders').set('Authorization', `Bearer ${kitchenToken}`);

    expect(denied.status).toBe(403);
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ paymentStatus: 'UNPAID', payLaterAuthorized: true });
    expect(kitchen.body.data).toContainEqual(expect.objectContaining({ id: order.id }));
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).stockQuantity).toBe(beforeStock - 3);
    expect(await prismaTest.auditLog.count({ where: { targetType: 'Order', targetId: order.id, action: 'RESERVATION_ORDER_PAY_LATER_AUTHORIZED' } })).toBe(1);

    const settled = await request(app).post(`/api/orders/${order.id}/pay`).set('Authorization', `Bearer ${cashierToken}`).send({ paymentMethod: 'CASH' });
    expect(settled.status).toBe(200);
    expect(settled.body.data.order.paymentStatus).toBe('PAID');
    expect(await prismaTest.reservationDepositTransaction.count({ where: { reservationId: order.reservationId, orderId: order.id, type: 'APPLY_TO_BILL', status: 'SUCCESS', amount: 300000 } })).toBe(1);
  });

  it('releases a guest order to kitchen only after staff confirms the exact bank transfer', async () => {
    const { created, item } = await createGuestOrder();
    expect(created.status).toBe(201);
    const order = created.body.data.order;
    const cashier = await prismaTest.user.create({ data: { username: `order-cashier-${Date.now()}`, passwordHash: 'hash', name: 'Thu ngân', role: 'CASHIER' } });
    const cashierToken = jwt.sign(
      { sub: String(cashier.id), username: cashier.username, name: cashier.name, role: cashier.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
    );
    const reservation = await prismaTest.reservation.findUniqueOrThrow({ where: { id: order.reservationId } });
    const stockBefore = (await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).stockQuantity;

    const declaration = await request(app).post(`/api/orders/${order.id}/payment-declaration`).send({ reservationAccessToken: reservation.accessToken });
    const waitingOrders = await request(app).get('/api/orders').set('Authorization', `Bearer ${kitchenToken}`);
    const confirmation = await request(app)
      .post(`/api/orders/${order.id}/payment/confirm`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: order.finalAmount - 300000, externalReference: 'ORDER-BANK-RECEIPT-001' });
    const releasedOrders = await request(app).get('/api/orders').set('Authorization', `Bearer ${kitchenToken}`);

    expect(declaration.status).toBe(200);
    expect(declaration.body.data).toMatchObject({ paymentStatus: 'WAITING_CONFIRMATION', amountDue: order.finalAmount - 300000 });
    expect(waitingOrders.body.data).not.toContainEqual(expect.objectContaining({ id: order.id }));
    expect(confirmation.status).toBe(200);
    expect(confirmation.body.data.paymentStatus).toBe('PAID');
    expect(releasedOrders.body.data).toContainEqual(expect.objectContaining({ id: order.id }));
    expect((await prismaTest.menuItem.findUniqueOrThrow({ where: { id: item.id } })).stockQuantity).toBe(stockBefore - 3);
    expect(await prismaTest.reservationDepositTransaction.count({ where: { reservationId: order.reservationId, orderId: order.id, type: 'APPLY_TO_BILL', status: 'SUCCESS', amount: 300000 } })).toBe(1);
    expect(await prismaTest.orderPaymentTransaction.count({ where: { orderId: order.id, status: 'SUCCESS', externalReference: 'ORDER-BANK-RECEIPT-001' } })).toBe(1);

    const duplicate = await request(app)
      .post(`/api/orders/${order.id}/payment/confirm`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ amount: order.finalAmount - 300000, externalReference: 'ORDER-BANK-RECEIPT-001' });
    expect(duplicate.status).toBe(409);
    expect(await prismaTest.reservationDepositTransaction.count({ where: { reservationId: order.reservationId, orderId: order.id, type: 'APPLY_TO_BILL' } })).toBe(1);
  });

  it('requires an active customer for an explicit staff pay-later override', async () => {
    const table = await prismaTest.diningTable.findFirstOrThrow({ where: { isActive: true } });
    const item = await eligibleItem();
    const response = await request(app).post('/api/orders').set('Authorization', `Bearer ${await cashierAuth()}`).send({
      orderType: 'DINE_IN', tableId: table.id, payLaterOverride: true, payLaterReason: 'Khách thân thiết được trả sau', customerId: 999999,
      items: [{ menuItemId: item.id, quantity: 1 }]
    });

    expect(response.status).toBe(400);
    expect(await prismaTest.order.count()).toBe(0);
  });

  it('resolves customer-group prices on the server for staff pay-later orders', async () => {
    const group = await prismaTest.customerGroup.create({ data: { code: `VIP-${Date.now()}`, name: `Khách VIP ${Date.now()}` } });
    const { table, customer } = await reservationContext(group.id);
    const item = await eligibleItem();
    const priceList = await prismaTest.priceList.create({ data: {
      code: `GROUP-${group.id}`, name: `Bảng giá VIP ${group.id}`, type: 'CUSTOM', scopeType: 'CUSTOMER_GROUP', scopeKey: String(group.id), isActive: true
    } });
    await prismaTest.priceListItem.create({ data: { priceListId: priceList.id, menuItemId: item.id, salePrice: 50000 } });

    const response = await request(app).post('/api/orders').set('Authorization', `Bearer ${await cashierAuth()}`).send({
      orderType: 'DINE_IN', tableId: table.id, payLaterOverride: true, payLaterReason: 'Khách VIP được trả sau', customerId: customer.id,
      items: [{ menuItemId: item.id, quantity: 1 }]
    });

    expect(response.status).toBe(201);
    expect(response.body.data.order.customerId).toBe(customer.id);
    expect(response.body.data.order.priceListId).toBe(priceList.id);
    expect(response.body.data.order.items[0].unitPrice).toBe(50000);
  });
});
