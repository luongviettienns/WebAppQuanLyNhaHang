import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prismaTest, validateTestEnvironment } from '../helpers/database';
import { TablesService } from '../../src/modules/tables/tables.service';

describe('Table session isolation regression', () => {
  let tableId: number | null = null;
  let currentOrderId: number;
  let returnedIds: number[];
  afterAll(async () => {
    if (tableId !== null) {
      await prismaTest.order.deleteMany({ where: { tableId } });
      await prismaTest.diningTable.delete({ where: { id: tableId } });
    }
    await prismaTest.$disconnect();
  });

  beforeAll(async () => {
    validateTestEnvironment();
    const marker = randomUUID();
    const oldSessionId = randomUUID();
    const newSessionId = randomUUID();
    const table = await prismaTest.diningTable.create({ data: {
      tableNumber: 900000 + Math.floor(Math.random() * 90000), qrCodeToken: `session-audit-${marker}`,
      displayName: 'Session isolation audit', status: 'NEED_CLEANING', capacity: 4, currentSessionId: oldSessionId
    } });
    tableId = table.id;
    const now = new Date();
    await prismaTest.order.create({ data: {
      code: `OLD-${marker}`, tableId, tableSessionId: oldSessionId, orderType: 'DINE_IN', status: 'COMPLETED', paymentStatus: 'PAID',
      totalAmount: 100000, vatAmount: 7407, finalAmount: 100000,
      createdAt: new Date(now.getTime() - 2 * 3600000),
      paidAt: new Date(now.getTime() - 70 * 60000), completedAt: new Date(now.getTime() - 60 * 60000)
    } });
    await TablesService.updateTableStatus(tableId, 'AVAILABLE');
    const cleaned = await TablesService.getTableByTableNumber(table.tableNumber);
    expect(cleaned.table.orders).toHaveLength(0);
    const current = await prismaTest.order.create({ data: {
      code: `NEW-${marker}`, tableId, tableSessionId: newSessionId, orderType: 'DINE_IN', status: 'PREPARING', paymentStatus: 'PAID',
      totalAmount: 200000, vatAmount: 14815, finalAmount: 200000, createdAt: now, paidAt: now, preparingAt: now
    } });
    await prismaTest.diningTable.update({ where: { id: tableId }, data: { status: 'OCCUPIED', currentOrderId: current.id, currentSessionId: newSessionId } });
    const result = await TablesService.getTableByTableNumber(table.tableNumber);
    currentOrderId = current.id;
    returnedIds = result.table.orders.map((order: { id: number }) => order.id);
  });

  it('excludes the previous paid and served order after cleaning and starting the next visit', () => {
    expect(returnedIds).toEqual([currentOrderId]);
  });
});
