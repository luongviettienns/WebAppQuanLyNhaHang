import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { TablesService } from '../../src/modules/tables/tables.service';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    diningTable: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
  finalAmount: 10_000,
  table: { id: 1, tableNumber: 1 },
  items: []
});

const cashbookDependencies = () => ({
  cashbookSetting: { findUnique: vi.fn().mockResolvedValue({ activatedAt: null }) },
  financialAccount: { findFirst: vi.fn().mockResolvedValue(null) },
  orderPaymentTransaction: { create: vi.fn().mockResolvedValue({ id: 1, amount: 10_000 }) },
  cashFlowCategory: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1 }) }
});

const mockRawQueries = (transactionEvents?: string[]) => vi.fn((strings: TemplateStringsArray) => {
  const sql = strings.join(' ');
  if (sql.includes('DiningTable')) {
    transactionEvents?.push('lock-table');
    return Promise.resolve([{ id: 1 }]);
  }
  if (sql.includes('CashbookSetting')) return Promise.resolve([{ activatedAt: null }]);
  return Promise.resolve([]);
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
        $queryRaw: mockRawQueries(transactionEvents),
        ...cashbookDependencies(),
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
    vi.mocked(prisma.diningTable.findUnique).mockResolvedValue({ id: 1, tableNumber: 1, isActive: true } as never);
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([{
      id: 10,
      name: 'Ga ran',
      basePrice: 50_000,
      isAvailable: true,
      modifierGroups: []
    }] as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: mockRawQueries(transactionEvents),
        priceList: { findFirst: vi.fn().mockResolvedValue(null) },
        priceListItem: { findMany: vi.fn().mockResolvedValue([]) },
        employee: { findUnique: vi.fn().mockResolvedValue(null) },
        menuItem: { findMany: vi.fn().mockResolvedValue([{ id: 10, basePrice: 50_000 }]) },
        order: {
          create: vi.fn(async ({ data }) => {
            transactionEvents.push('create-order');
            return { id: 3, ...data, items: [] };
          })
        },
        diningTable: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, isActive: true }),
          update: vi.fn(async () => transactionEvents.push('update-table'))
        }
      };
      return callback(tx);
    });

    await OrdersService.createOrder({
      orderType: 'DINE_IN',
      tableId: 1,
      items: [{ menuItemId: 10, quantity: 1, selectedModifiers: [] }]
    }, 2);

    expect(transactionEvents).toEqual(['lock-table', 'create-order', 'update-table']);
  });

  it('keeps the table OCCUPIED and preserves preparation status when paying an order still in progress', async () => {
    const tableUpdates: Array<Record<string, unknown>> = [];
    const preparingOrder = { ...unpaidOrder(1), status: 'PREPARING' as const };
    let updatedOrderData: any = null;

    vi.mocked(prisma.order.findUnique).mockResolvedValue(preparingOrder as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: mockRawQueries(),
        ...cashbookDependencies(),
        order: {
          findUnique: vi.fn().mockResolvedValue(preparingOrder),
          update: vi.fn(async ({ data }) => {
            updatedOrderData = data;
            return { ...preparingOrder, ...data };
          }),
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

    // Đơn hàng thanh toán sớm KHÔNG được tự ý ép sang COMPLETED
    expect(updatedOrderData.status).toBeUndefined(); // Hoặc giữ nguyên 'PREPARING'
    expect(updatedOrderData.paymentStatus).toBe('PAID');

    // Bàn ăn PHẢI TIẾP TỤC LÀ OCCUPIED vì món vẫn đang nấu
    expect(tableUpdates.at(-1)).toEqual({ status: 'OCCUPIED', currentOrderId: 1 });
  });

  it('releases the table to NEED_CLEANING when completing the last paid order in updateOrderStatus', async () => {
    const paidReadyOrder = {
      ...unpaidOrder(1),
      status: 'READY' as const,
      paymentStatus: 'PAID' as const,
      tableId: 1,
      table: { id: 1, tableNumber: 1 }
    };

    vi.mocked(prisma.order.findUnique).mockResolvedValue(paidReadyOrder as never);
    vi.mocked(prisma.order.update).mockResolvedValue({
      ...paidReadyOrder,
      status: 'COMPLETED' as const,
      completedAt: new Date()
    } as never);
    vi.mocked(prisma.order.findFirst).mockResolvedValue(null); // Không còn đơn nào khác đang chờ
    vi.mocked(prisma.diningTable.update).mockResolvedValue({
      id: 1,
      tableNumber: 1,
      status: 'NEED_CLEANING',
      currentOrderId: null
    } as never);

    await OrdersService.updateOrderStatus(1, 'COMPLETED');

    // Phải cập nhật bàn sang NEED_CLEANING
    expect(prisma.diningTable.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'NEED_CLEANING', currentOrderId: null }
    });
  });

  it('releases the table to NEED_CLEANING after its last unpaid order (already COMPLETED) is paid', async () => {
    const tableUpdates: Array<Record<string, unknown>> = [];
    const completedOrder = { ...unpaidOrder(1), status: 'COMPLETED' as const, completedAt: new Date() };
    vi.mocked(prisma.order.findUnique).mockResolvedValue(completedOrder as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: mockRawQueries(),
        ...cashbookDependencies(),
        order: {
          findUnique: vi.fn().mockResolvedValue(completedOrder),
          update: vi.fn().mockResolvedValue({ ...completedOrder, paymentStatus: 'PAID' }),
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

    expect(tableUpdates.at(-1)).toEqual({ status: 'NEED_CLEANING', currentOrderId: null });
  });

  it('rejects double-pay with 409 CONFLICT without rewriting payment timestamps', async () => {
    const paidOrder = { ...unpaidOrder(1), paymentStatus: 'PAID', paidAt: new Date('2026-08-29T05:00:00Z') };
    const orderUpdate = vi.fn();
    vi.mocked(prisma.order.findUnique).mockResolvedValue(paidOrder as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        $queryRaw: mockRawQueries(),
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
