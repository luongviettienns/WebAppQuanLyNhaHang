import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { TablesService } from '../../src/modules/tables/tables.service';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    diningTable: { findMany: vi.fn(), findUnique: vi.fn() },
    order: { findFirst: vi.fn(), findUnique: vi.fn() },
    menuItem: { findMany: vi.fn() },
    $transaction: vi.fn()
  }
}));

vi.mock('../../src/lib/socket', () => ({
  emitToAll: vi.fn(),
  emitToRoom: vi.fn()
}));

const unpaidOrder = (id: number) => ({
  id,
  code: `ORDER-${id}`,
  tableId: 1,
  paymentStatus: 'UNPAID',
  status: 'PENDING',
  table: { id: 1, tableNumber: 1 },
  items: []
});

describe('multiple unpaid orders on one table', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns every unpaid order and derives occupied state from them', async () => {
    (prisma.diningTable.findMany as any).mockImplementation(async (query: any) => {
      const orders = [unpaidOrder(2), unpaidOrder(1)];
      return [{
        id: 1,
        tableNumber: 1,
        status: 'AVAILABLE',
        currentOrderId: null,
        orders: query.include.orders.take ? orders.slice(0, query.include.orders.take) : orders
      }] as never;
    });

    const { tables } = await TablesService.getAllTables();

    expect(tables[0]).toMatchObject({ status: 'OCCUPIED', currentOrderId: 2 });
    expect(tables[0].orders.map((order) => order.id)).toEqual([2, 1]);
  });

  it('returns every unpaid order from the table detail endpoint', async () => {
    (prisma.diningTable.findUnique as any).mockImplementation(async (query: any) => {
      const orders = [unpaidOrder(2), unpaidOrder(1)];
      return {
        id: 1,
        tableNumber: 1,
        status: 'OCCUPIED',
        currentOrderId: 2,
        orders: query.include.orders.take ? orders.slice(0, query.include.orders.take) : orders
      } as never;
    });

    const { table } = await TablesService.getTableById(1);

    expect(table.orders.map((order) => order.id)).toEqual([2, 1]);
  });

  it('does not report an occupied table when it has no unpaid orders', async () => {
    vi.mocked(prisma.diningTable.findMany).mockResolvedValue([{
      id: 1,
      tableNumber: 1,
      status: 'OCCUPIED',
      currentOrderId: 99,
      orders: []
    }] as never);

    const { tables } = await TablesService.getAllTables();

    expect(tables[0]).toMatchObject({ status: 'AVAILABLE', currentOrderId: null });
  });

  it('keeps the table occupied and points at another unpaid order after payment', async () => {
    const transactionEvents: string[] = [];
    const tableUpdates: Array<Record<string, unknown>> = [];
    const orderUpdate = vi.fn().mockResolvedValue({ ...unpaidOrder(1), paymentStatus: 'PAID' });
    vi.mocked(prisma.order.findUnique).mockResolvedValue(unpaidOrder(1) as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: vi.fn(() => transactionEvents.push('lock-table')),
        order: {
          findUnique: vi.fn(async () => {
            transactionEvents.push('read-order');
            return unpaidOrder(1);
          }),
          update: vi.fn(async (...args) => {
            transactionEvents.push('pay-order');
            return orderUpdate(...args);
          }),
          findFirst: vi.fn().mockResolvedValue(unpaidOrder(2))
        },
        diningTable: {
          update: vi.fn(async ({ data }) => {
            tableUpdates.push(data);
            return { id: 1, tableNumber: 1, ...data };
          })
        }
      };
      return callback(tx);
    });

    await OrdersService.payOrder(1, { paymentMethod: 'CASH' });

    expect(transactionEvents[0]).toBe('lock-table');
    expect(tableUpdates.at(-1)).toEqual({ status: 'OCCUPIED', currentOrderId: 2 });
  });

  it('locks a dine-in table before creating another order on it', async () => {
    const transactionEvents: string[] = [];
    vi.mocked(prisma.diningTable.findUnique).mockResolvedValue({ id: 1, tableNumber: 1 } as never);
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([{
      id: 10,
      name: 'Ga ran',
      basePrice: 50_000,
      isAvailable: true,
      modifierGroups: []
    }] as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: vi.fn(() => transactionEvents.push('lock-table')),
        order: {
          create: vi.fn(async ({ data }) => {
            transactionEvents.push('create-order');
            return { id: 3, ...data, items: [] };
          })
        },
        diningTable: {
          update: vi.fn(async () => transactionEvents.push('update-table'))
        }
      };
      return callback(tx);
    });

    await OrdersService.createOrder({
      orderType: 'DINE_IN',
      tableId: 1,
      items: [{ menuItemId: 10, quantity: 1, selectedModifiers: [] }]
    });

    expect(transactionEvents).toEqual(['lock-table', 'create-order', 'update-table']);
  });

  it('releases the table only after its last unpaid order is paid', async () => {
    const tableUpdates: Array<Record<string, unknown>> = [];
    vi.mocked(prisma.order.findUnique).mockResolvedValue(unpaidOrder(1) as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: vi.fn(),
        order: {
          findUnique: vi.fn().mockResolvedValue(unpaidOrder(1)),
          update: vi.fn().mockResolvedValue({ ...unpaidOrder(1), paymentStatus: 'PAID' }),
          findFirst: vi.fn().mockResolvedValue(null)
        },
        diningTable: {
          update: vi.fn(async ({ data }) => {
            tableUpdates.push(data);
            return { id: 1, tableNumber: 1, ...data };
          })
        }
      };
      return callback(tx);
    });

    await OrdersService.payOrder(1, { paymentMethod: 'CASH' });

    expect(tableUpdates.at(-1)).toEqual({ status: 'AVAILABLE', currentOrderId: null });
  });

  it('rejects double-pay with 409 CONFLICT without rewriting payment timestamps', async () => {
    const paidOrder = { ...unpaidOrder(1), paymentStatus: 'PAID', paidAt: new Date('2026-08-29T05:00:00Z') };
    const orderUpdate = vi.fn();
    vi.mocked(prisma.order.findUnique).mockResolvedValue(paidOrder as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: vi.fn(),
        order: {
          findUnique: vi.fn().mockResolvedValue(paidOrder),
          update: orderUpdate,
          findFirst: vi.fn().mockResolvedValue(null)
        },
        diningTable: { update: vi.fn().mockResolvedValue({ id: 1, tableNumber: 1, status: 'AVAILABLE' }) }
      };
      return callback(tx);
    });

    await expect(OrdersService.payOrder(1, { paymentMethod: 'CASH' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT'
    });

    expect(orderUpdate).not.toHaveBeenCalled();
  });
});
