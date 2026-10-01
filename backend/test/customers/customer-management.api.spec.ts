import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('customer management API', () => {
  let adminToken: string;
  let cashierToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    await truncateAllTables();
    const [admin, cashier] = await Promise.all([
      prismaTest.user.create({ data: { username: `customer-admin-${Date.now()}`, passwordHash: 'hash', name: 'Quản lý', role: 'ADMIN' } }),
      prismaTest.user.create({ data: { username: `customer-cashier-${Date.now()}`, passwordHash: 'hash', name: 'Thu ngân', role: 'CASHIER' } })
    ]);
    const sign = (user: typeof admin) => jwt.sign({ sub: String(user.id), username: user.username, name: user.name, role: user.role }, env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
    });
    adminToken = sign(admin);
    cashierToken = sign(cashier);
  });

  it('creates a grouped customer with generated code and exposes it to staff selection', async () => {
    const group = await request(app).post('/api/customers/groups').set(auth(adminToken)).send({ code: 'VIP', name: 'Khách VIP' });
    expect(group.status).toBe(201);

    const created = await request(app).post('/api/customers').set(auth(adminToken)).send({
      name: 'Nguyễn Văn A', phone: '0903 000 280', type: 'INDIVIDUAL', groupId: group.body.data.id, province: 'Hồ Chí Minh'
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      code: expect.stringMatching(/^KH\d{6,}$/), name: 'Nguyễn Văn A', phone: '0903000280', group: { name: 'Khách VIP' }, isActive: true,
      totalSales: 0, netSales: 0, outstandingDebt: 0
    });

    const list = await request(app).get('/api/customers?search=0903000').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);

    const selectable = await request(app).get('/api/customers/selectable?search=Nguyễn').set(auth(cashierToken));
    expect(selectable.status).toBe(200);
    expect(selectable.body.data).toEqual([expect.objectContaining({ id: created.body.data.id, code: created.body.data.code })]);
  });

  it('does not allow a cashier to alter customer master data', async () => {
    expect((await request(app).post('/api/customers/groups').set(auth(cashierToken)).send({ code: 'NO', name: 'Không quyền' })).status).toBe(403);
    expect((await request(app).post('/api/customers').set(auth(cashierToken)).send({ name: 'Không quyền' })).status).toBe(403);
  });

  it('returns customer groups and derives sales and unpaid balance from linked orders before applying amount filters', async () => {
    const group = await request(app).post('/api/customers/groups').set(auth(adminToken)).send({ code: 'RETURNING', name: 'Khách thân thiết' });
    const customer = await request(app).post('/api/customers').set(auth(adminToken)).send({ name: 'Trần Minh Anh', phone: '0911111000', groupId: group.body.data.id, birthDate: '1990-04-20' });
    const customerId = customer.body.data.id;
    const paidAt = new Date('2026-09-10T12:00:00.000Z');
    const paidOrder = await prismaTest.order.create({ data: {
      code: 'CUSTOMER-PAID-0001', orderType: 'TAKE_AWAY', status: 'COMPLETED', customerId,
      totalAmount: 100000, vatAmount: 8000, finalAmount: 108000, paymentStatus: 'PAID', paymentMethod: 'CASH', paidAt
    } });
    await prismaTest.orderReturn.create({ data: {
      returnCode: 'CUSTOMER-RETURN-0001', orderId: paidOrder.id, status: 'COMPLETED',
      totalRefundDue: 20000, refundedAmount: 20000, refundMethod: 'CASH', completedAt: paidAt
    } });
    await prismaTest.order.create({ data: {
      code: 'CUSTOMER-DEBT-0001', orderType: 'TAKE_AWAY', status: 'PENDING', customerId,
      totalAmount: 50000, vatAmount: 4000, finalAmount: 54000, paymentStatus: 'UNPAID'
    } });

    const groups = await request(app).get('/api/customers/groups').set(auth(adminToken));
    const list = await request(app).get('/api/customers?minSales=100000&maxSales=110000&minDebt=50000&maxDebt=60000&birthDateFrom=1990-04-01&birthDateTo=1990-04-30').set(auth(adminToken));

    expect(groups.status).toBe(200);
    expect(groups.body.data).toContainEqual(expect.objectContaining({ id: group.body.data.id, name: 'Khách thân thiết' }));
    expect(list.body.data.items).toContainEqual(expect.objectContaining({
      id: customerId, birthDate: '1990-04-20T00:00:00.000Z', totalSales: 108000, netSales: 88000, outstandingDebt: 54000, lastTransactionAt: paidAt.toISOString()
    }));
    expect(list.body.data.summary).toMatchObject({ totalSales: 108000, netSales: 88000, outstandingDebt: 54000 });
  });
});
