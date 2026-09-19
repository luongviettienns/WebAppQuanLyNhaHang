import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { OrdersService } from '../../src/modules/orders/orders.service';

describe('Table Transfer API (Phase 10 - Slice 10.1)', () => {
  let adminToken: string;
  let cashierToken: string;
  let kitchenToken: string;
  let table1: { id: number; tableNumber: number };
  let table2: { id: number; tableNumber: number };
  let table3: { id: number; tableNumber: number };
  let table4: { id: number; tableNumber: number };

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

    const tables = await prismaTest.diningTable.findMany({ orderBy: { tableNumber: 'asc' } });
    table1 = { id: tables[0].id, tableNumber: tables[0].tableNumber };
    table2 = { id: tables[1].id, tableNumber: tables[1].tableNumber };
    table3 = { id: tables[2].id, tableNumber: tables[2].tableNumber };
    table4 = { id: tables[3].id, tableNumber: tables[3].tableNumber };
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
    const res = await request(app)
      .post('/api/tables/transfer')
      .send({ fromTableId: table1.id, toTableId: table2.id });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects KITCHEN role with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/tables/transfer')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ fromTableId: table1.id, toTableId: table2.id });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects if fromTableId === toTableId with 400 VALIDATION_ERROR or CONFLICT', async () => {
    const res = await request(app)
      .post('/api/tables/transfer')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ fromTableId: table1.id, toTableId: table1.id });

    expect([400, 409]).toContain(res.status);
  });

  it('rejects if fromTable does not have any active unpaid orders', async () => {
    const res = await request(app)
      .post('/api/tables/transfer')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ fromTableId: table1.id, toTableId: table2.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_STATE_INVALID');
  });

  it('rejects if target toTable is not AVAILABLE (e.g. DIRTY or OCCUPIED)', async () => {
    const item = await prismaTest.menuItem.findFirstOrThrow({
      where: { modifierGroups: { none: { isRequired: true } } }
    });
    // Create order on table1
    await OrdersService.createOrder({
      orderType: 'DINE_IN',
      tableId: table1.id,
      items: [{ menuItemId: item.id, quantity: 1, selectedModifiers: [] }]
    }, 2);

    // Make table3 DIRTY
    await prismaTest.diningTable.update({
      where: { id: table3.id },
      data: { status: 'DIRTY' }
    });

    const res = await request(app)
      .post('/api/tables/transfer')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ fromTableId: table1.id, toTableId: table3.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('transfers active orders from table1 to table2 successfully for CASHIER', async () => {
    const res = await request(app)
      .post('/api/tables/transfer')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ fromTableId: table1.id, toTableId: table2.id });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.fromTable.status).toBe('AVAILABLE');
    expect(res.body.data.toTable.status).toBe('OCCUPIED');
    expect(res.body.data.transferredOrdersCount).toBeGreaterThanOrEqual(1);

    // Verify DB state
    const dbOrders = await prismaTest.order.findMany({
      where: { tableId: table2.id, paymentStatus: 'UNPAID' }
    });
    expect(dbOrders.length).toBeGreaterThanOrEqual(1);

    const oldTableOrders = await prismaTest.order.findMany({
      where: { tableId: table1.id, paymentStatus: 'UNPAID' }
    });
    expect(oldTableOrders.length).toBe(0);

    // Verify AuditLog
    const auditLog = await prismaTest.auditLog.findFirst({
      where: { action: 'TABLE_TRANSFERRED', actorId: 2 }
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.targetType).toBe('DiningTable');
  });

  it('transfers active orders from table2 to table4 successfully for ADMIN', async () => {
    const res = await request(app)
      .post('/api/tables/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fromTableId: table2.id, toTableId: table4.id });

    expect(res.status).toBe(200);
    expect(res.body.data.fromTable.status).toBe('AVAILABLE');
    expect(res.body.data.toTable.status).toBe('OCCUPIED');
  });
});
