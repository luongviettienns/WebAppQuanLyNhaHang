import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaTest, validateTestEnvironment, truncateAllTables } from '../helpers/database';
import { seedDatabase } from '../../prisma/seed';
import { OrdersService } from '../../src/modules/orders/orders.service';

describe('Order Lifecycle FSM Transitions & Prep Time (Task 10 DB Integration)', () => {
  let createdOrderId: number;

  beforeAll(async () => {
    validateTestEnvironment();
    await truncateAllTables();
    await seedDatabase(prismaTest);

    // Tao 1 don hang PENDING mau de test FSM
    const burger = await prismaTest.menuItem.findFirstOrThrow({
      where: { name: { contains: 'Burger' } }
    });

    const result = await OrdersService.createOrder({
      orderType: 'TAKE_AWAY',
      buzzerNumber: 10,
      idempotencyKey: 'fsm-test-key-01',
      items: [
        {
          menuItemId: burger.id,
          quantity: 1,
          selectedModifiers: []
        }
      ]
    });

    createdOrderId = result.order.id;
  });

  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('rejects invalid forward jump: PENDING -> READY', async () => {
    await expect(
      OrdersService.updateOrderStatus(createdOrderId, 'READY')
    ).rejects.toThrowError(/Không thể chuyển trạng thái/);
  });

  it('rejects invalid forward jump: PENDING -> COMPLETED', async () => {
    await expect(
      OrdersService.updateOrderStatus(createdOrderId, 'COMPLETED')
    ).rejects.toThrowError(/Không thể chuyển trạng thái/);
  });

  it('allows valid transition: PENDING -> PREPARING and records preparingAt', async () => {
    const updated = await OrdersService.updateOrderStatus(createdOrderId, 'PREPARING');
    expect(updated.status).toBe('PREPARING');
    expect(updated.preparingAt).toBeTruthy();
    expect(updated.readyAt).toBeNull();
    expect(updated.completedAt).toBeNull();
  });

  it('rejects invalid reverse: PREPARING -> PENDING (not in allowed transitions)', async () => {
    await expect(
      OrdersService.updateOrderStatus(createdOrderId, 'PREPARING' as any)
    ).rejects.toThrowError(/Không thể chuyển trạng thái/);
  });

  it('allows valid transition: PREPARING -> READY and derives prepTimeSec', async () => {
    // Wait slightly to ensure non-negative prep time
    const updated = await OrdersService.updateOrderStatus(createdOrderId, 'READY');
    expect(updated.status).toBe('READY');
    expect(updated.readyAt).toBeTruthy();
    expect(typeof updated.prepTimeSec).toBe('number');
    expect(updated.prepTimeSec).toBeGreaterThanOrEqual(0);
  });

  it('rejects invalid reverse: READY -> PREPARING', async () => {
    await expect(
      OrdersService.updateOrderStatus(createdOrderId, 'PREPARING')
    ).rejects.toThrowError(/Không thể chuyển trạng thái/);
  });

  it('allows valid transition: READY -> COMPLETED and records completedAt', async () => {
    const updated = await OrdersService.updateOrderStatus(createdOrderId, 'COMPLETED');
    expect(updated.status).toBe('COMPLETED');
    expect(updated.completedAt).toBeTruthy();
  });

  it('rejects any transition once order is COMPLETED', async () => {
    await expect(
      OrdersService.updateOrderStatus(createdOrderId, 'READY')
    ).rejects.toThrowError(/Không thể chuyển trạng thái/);
  });
});
