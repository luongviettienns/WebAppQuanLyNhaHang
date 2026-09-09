import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/config/prisma';
import { OrdersService } from '../../src/modules/orders/orders.service';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    diningTable: { findUnique: vi.fn() },
    menuItem: { findMany: vi.fn() },
    order: { findUnique: vi.fn() },
    $transaction: vi.fn()
  }
}));

vi.mock('../../src/lib/socket', () => ({ emitToAll: vi.fn() }));

const input = {
  orderType: 'TAKE_AWAY' as const,
  idempotencyKey: 'retry-key',
  notes: 'Khong cay',
  items: [{ menuItemId: 1, quantity: 1, selectedModifiers: [] }]
};

const menuItem = {
  id: 1,
  name: 'Ga ran',
  basePrice: 50_000,
  isAvailable: true,
  modifierGroups: []
};

describe('atomic order idempotency', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([menuItem] as never);
  });

  it.each([
    ['guest', undefined, 'guest'],
    ['staff', 7, 'user:7']
  ])('stores a non-null scope and request hash for %s orders', async (_name, userId, expectedScope) => {
    let createData: any;
    (prisma.$transaction as any).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
      order: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }) => {
          createData = data;
          return { id: 10, ...data, items: [] };
        })
      },
      diningTable: { update: vi.fn() }
    }));

    await OrdersService.createOrder(input, userId);

    expect(createData).toMatchObject({
      idempotencyScope: expectedScope,
      idempotencyKey: 'retry-key',
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  it('returns the existing order when the same scoped key and payload are retried', async () => {
    let createData: any;
    (prisma.$transaction as any)
      .mockImplementationOnce(async (callback: (tx: any) => Promise<unknown>) => callback({
        order: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn(async ({ data }) => {
            createData = data;
            return { id: 10, ...data, items: [] };
          })
        },
        diningTable: { update: vi.fn() }
      }))
      .mockImplementationOnce(async (callback: (tx: any) => Promise<unknown>) => callback({
        order: {
          findUnique: vi.fn().mockResolvedValue({ id: 10, ...createData, items: [] }),
          create: vi.fn()
        },
        diningTable: { update: vi.fn() }
      }));

    await OrdersService.createOrder(input);
    const retry = await OrdersService.createOrder(input);

    expect(retry).toMatchObject({ isDuplicate: true, order: { id: 10 } });
  });

  it('rejects a different payload that reuses the same scoped key', async () => {
    (prisma.$transaction as any).mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
      order: {
        findUnique: vi.fn().mockResolvedValue({ id: 10, requestHash: 'different-hash', items: [] }),
        create: vi.fn()
      },
      diningTable: { update: vi.fn() }
    }));

    await expect(OrdersService.createOrder(input)).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('recovers from a concurrent unique conflict by returning the winning order', async () => {
    const winningOrder = { id: 11, requestHash: null, items: [] };
    (prisma.$transaction as any).mockRejectedValue({ code: 'P2002' });
    vi.mocked(prisma.order.findUnique).mockResolvedValue(winningOrder as never);

    const result = await OrdersService.createOrder(input);

    expect(result).toEqual({ order: winningOrder, isDuplicate: true });
    expect(prisma.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyScope_idempotencyKey: { idempotencyScope: 'guest', idempotencyKey: 'retry-key' } }
    }));
  });
});
