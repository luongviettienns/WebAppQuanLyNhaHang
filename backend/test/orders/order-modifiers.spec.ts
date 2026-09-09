import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { prisma } from '../../src/config/prisma';
import { createOrderSchema } from '../../src/modules/orders/orders.schemas';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    order: { findFirst: vi.fn() },
    diningTable: { findUnique: vi.fn() },
    menuItem: { findMany: vi.fn() },
    $transaction: vi.fn()
  }
}));

vi.mock('../../src/lib/socket', () => ({
  emitToAll: vi.fn(),
  emitToRoom: vi.fn()
}));

const menuItem = {
  id: 1,
  name: 'Burger DB',
  basePrice: 50_000,
  isAvailable: true,
  modifierGroups: [
    {
      id: 10,
      menuItemId: 1,
      name: 'Sot DB',
      isRequired: true,
      minSelect: 1,
      maxSelect: 2,
      options: [
        { id: 100, modifierGroupId: 10, name: 'Pho mai DB', priceDelta: 5_000, isAvailable: true },
        { id: 101, modifierGroupId: 10, name: 'Het hang DB', priceDelta: 7_000, isAvailable: false },
        { id: 102, modifierGroupId: 10, name: 'Cay DB', priceDelta: 2_000, isAvailable: true },
        { id: 103, modifierGroupId: 10, name: 'Toi DB', priceDelta: 3_000, isAvailable: true }
      ]
    }
  ]
};

function modifier(modifierGroupId: number, optionId: number, priceDelta = -99_999) {
  return {
    modifierGroupId,
    groupName: 'Ten nhom gia mao',
    optionId,
    optionName: 'Ten option gia mao',
    priceDelta
  };
}

function orderInput(selectedModifiers: ReturnType<typeof modifier>[]) {
  return {
    orderType: 'TAKE_AWAY' as const,
    items: [{ menuItemId: 1, quantity: 2, selectedModifiers }]
  };
}

describe('OrdersService modifier validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.menuItem.findMany).mockResolvedValue([menuItem] as never);
    (prisma.$transaction as any).mockImplementation(async (callback: (client: any) => Promise<unknown>) => {
      const tx = {
        order: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 42, ...data })
        },
        diningTable: { update: vi.fn() }
      };
      return callback(tx);
    });
  });

  it('accepts modifier IDs without client-supplied price or names', () => {
    const parsed = createOrderSchema.parse({
      orderType: 'TAKE_AWAY',
      items: [{
        menuItemId: 1,
        quantity: 1,
        selectedModifiers: [{ modifierGroupId: 10, optionId: 100 }]
      }]
    });

    expect(parsed.items[0].selectedModifiers[0]).toEqual({ modifierGroupId: 10, optionId: 100 });
  });

  it('uses modifier price and names from DB instead of forged client values', async () => {
    const result = await OrdersService.createOrder(orderInput([modifier(10, 100)]));

    expect(result.order).toMatchObject({ totalAmount: 110_000, vatAmount: 8_800, finalAmount: 118_800 });
    expect((result.order as any).items.create[0]).toMatchObject({
      unitPrice: 55_000,
      subtotal: 110_000,
      selectedModifiersJson: [{
        modifierGroupId: 10,
        groupName: 'Sot DB',
        optionId: 100,
        optionName: 'Pho mai DB',
        priceDelta: 5_000
      }]
    });
  });

  it.each([
    ['a group outside the menu item', [modifier(999, 100)]],
    ['an option outside the selected group', [modifier(10, 999)]],
    ['an unavailable option', [modifier(10, 101)]],
    ['a duplicate option', [modifier(10, 100), modifier(10, 100)]],
    ['more options than maxSelect', [modifier(10, 100), modifier(10, 102), modifier(10, 103)]],
    ['fewer options than minSelect', []]
  ])('rejects %s', async (_caseName, selectedModifiers) => {
    await expect(OrdersService.createOrder(orderInput(selectedModifiers))).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR'
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
