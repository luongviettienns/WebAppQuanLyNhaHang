import { OrderStatus, Prisma } from '@prisma/client';

type VoidOrderSnapshot = {
  id: number;
  status: OrderStatus;
  items: Array<{
    id: number;
    menuItemId: number;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    menuItem: { sku: string; name: string };
  }>;
};

type VoidCancellationContext = {
  reason: string;
  cancelledAt: Date;
  cancelledByUserId: number | null;
  restoredMenuItemIds: number[];
};

/** Append-only facts: retrying an ORDER_VOID source never changes its original snapshot. */
export async function recordOrderVoidCancellations(
  tx: Prisma.TransactionClient,
  order: VoidOrderSnapshot,
  context: VoidCancellationContext
): Promise<void> {
  const restored = new Set(context.restoredMenuItemIds);
  const preparationState = order.status === 'PENDING' ? 'NOT_STARTED'
    : order.status === 'PREPARING' ? 'PREPARING'
      : order.status === 'READY' ? 'READY' : 'UNKNOWN';

  // Stable insertion order also keeps concurrent retries from taking source-key locks in opposite orders.
  for (const item of [...order.items].sort((left, right) => left.id - right.id)) {
    const sourceKey = `ORDER_VOID:${order.id}:${item.id}`;
    try {
      await tx.orderItemCancellation.create({ data: {
        orderId: order.id,
        orderItemId: item.id,
        menuItemId: item.menuItemId,
        menuItemSku: item.menuItem.sku,
        menuItemName: item.menuItem.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineAmount: item.subtotal,
        reason: context.reason,
        cancelledAt: context.cancelledAt,
        cancelledByUserId: context.cancelledByUserId,
        orderStatusSnapshot: order.status,
        preparationStateSnapshot: preparationState,
        inventoryEffect: restored.has(item.menuItemId) ? 'RESTORED' : 'NONE',
        inventoryWasteId: null,
        source: 'ORDER_VOID',
        sourceKey
      } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      // A current read sees a concurrent winner even if this transaction established an older MVCC snapshot.
      // Only the exact source conflict is a safe retry; other persistence failures must abort the whole void.
      const existing = await tx.$queryRaw<Array<{ sourceKey: string }>>`
        SELECT sourceKey FROM OrderItemCancellation WHERE sourceKey = ${sourceKey} FOR UPDATE
      `;
      if (existing.length === 0) throw error;
    }
  }
}
