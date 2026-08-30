import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { CreateOrderInput, PayOrderInput } from './orders.schemas';
import { PaymentMethod } from '@prisma/client';
import { createHash } from 'crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

function hashOrderRequest(input: CreateOrderInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ ...input, idempotencyKey: undefined })))
    .digest('hex');
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export class OrdersService {
  /**
   * Tao don hang moi (Dat tai ban qua QR hoac POS)
   */
  static async createOrder(input: CreateOrderInput, createdByUserId?: number) {
    const idempotencyScope = createdByUserId === undefined ? 'guest' : `user:${createdByUserId}`;
    const requestHash = hashOrderRequest(input);
    const assertMatchingRequest = (existingHash: string | null) => {
      if (existingHash && existingHash !== requestHash) {
        throw ApiError.conflict('Idempotency key đã được dùng cho một nội dung đơn hàng khác');
      }
    };
    const findExisting = (client: any) => client.order.findUnique({
      where: {
        idempotencyScope_idempotencyKey: {
          idempotencyScope,
          idempotencyKey: input.idempotencyKey
        }
      },
      include: { items: true }
    });

    // 2. Kiem tra tinh hop le cua ban an neu la DINE_IN
    let targetTable: { id: number; tableNumber: number } | null = null;
    if (input.orderType === 'DINE_IN' && input.tableId) {
      const table = await prisma.diningTable.findUnique({
        where: { id: input.tableId }
      });
      if (!table) {
        throw ApiError.badRequest(`Bàn ăn ID ${input.tableId} không tồn tại`);
      }
      targetTable = { id: table.id, tableNumber: table.tableNumber };
    }

    // 3. Re-read menu items tu DB de kiem tra gia thuc, trang thai 86d va bat buoc modifier
    const itemIds = input.items.map((i) => i.menuItemId);
    const dbMenuItems = await prisma.menuItem.findMany({
      where: { id: { in: itemIds } },
      include: {
        modifierGroups: {
          include: { options: true }
        }
      }
    });

    const dbItemMap = new Map(dbMenuItems.map((item) => [item.id, item]));

    // 4. Validate tung mon an va tinh toan chi tiet gia tien
    let totalAmount = 0;
    const orderItemsData: any[] = [];

    for (const itemInput of input.items) {
      const dbItem = dbItemMap.get(itemInput.menuItemId);
      if (!dbItem) {
        throw ApiError.notFound(`Món ăn ID ${itemInput.menuItemId} không tồn tại trong thực đơn`);
      }

      // Kiem tra het hang (86d)
      if (!dbItem.isAvailable) {
        throw ApiError.badRequest(`Món ăn "${dbItem.name}" hiện đã hết hàng (86'd)`);
      }

      // Xac thuc modifier va tao snapshot hoan toan tu du lieu DB.
      const requestedMods = itemInput.selectedModifiers || [];
      const groupMap = new Map(dbItem.modifierGroups.map((group) => [group.id, group]));
      const selectedOptionIds = new Set<number>();
      const selectedMods = requestedMods.map((requestedMod) => {
        const group = groupMap.get(requestedMod.modifierGroupId);
        if (!group) {
          throw ApiError.badRequest(
            `Nhóm modifier ID ${requestedMod.modifierGroupId} không thuộc món "${dbItem.name}"`
          );
        }

        const option = group.options.find((candidate) => candidate.id === requestedMod.optionId);
        if (!option) {
          throw ApiError.badRequest(
            `Lựa chọn modifier ID ${requestedMod.optionId} không thuộc nhóm "${group.name}"`
          );
        }

        if (!option.isAvailable) {
          throw ApiError.badRequest(`Lựa chọn "${option.name}" hiện không còn bán`);
        }

        if (selectedOptionIds.has(option.id)) {
          throw ApiError.badRequest(`Lựa chọn "${option.name}" bị chọn trùng`);
        }
        selectedOptionIds.add(option.id);

        return {
          modifierGroupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta
        };
      });

      for (const group of dbItem.modifierGroups) {
        const selectedCount = selectedMods.filter((mod) => mod.modifierGroupId === group.id).length;
        if (selectedCount < group.minSelect) {
          throw ApiError.badRequest(
            `Món "${dbItem.name}" phải chọn tối thiểu ${group.minSelect} lựa chọn trong nhóm "${group.name}"`
          );
        }
        if (selectedCount > group.maxSelect) {
          throw ApiError.badRequest(
            `Món "${dbItem.name}" chỉ được chọn tối đa ${group.maxSelect} lựa chọn trong nhóm "${group.name}"`
          );
        }
      }

      // Tinh gia tien chinh xac tu snapshot da xac thuc voi DB
      const modifierDelta = selectedMods.reduce((sum, mod) => sum + mod.priceDelta, 0);
      const unitPrice = dbItem.basePrice + modifierDelta;
      const subtotal = unitPrice * itemInput.quantity;
      totalAmount += subtotal;

      orderItemsData.push({
        menuItemId: dbItem.id,
        quantity: itemInput.quantity,
        unitPrice,
        subtotal,
        selectedModifiersJson: selectedMods.length > 0 ? selectedMods : null,
        notes: itemInput.notes
      });
    }

    // 5. Tinh toan thue VAT 8% (800 BPS)
    const vatAmount = Math.round(totalAmount * 0.08);
    const finalAmount = totalAmount + vatAmount;

    // 6. Tao ma don hang duy nhat CRISPY-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const code = `CRISPY-${dateStr}-${randomSuffix}`;

    // 7. Thuc hien Transaction tao Order va cap nhat Table
    let transactionResult: { order: any; isDuplicate: boolean };
    try {
      transactionResult = await prisma.$transaction(async (tx) => {
        if (input.orderType === 'DINE_IN' && input.tableId) {
          await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${input.tableId} FOR UPDATE`;
        }

        if (input.idempotencyKey) {
          const existing = await findExisting(tx);
          if (existing) {
            assertMatchingRequest(existing.requestHash);
            return { order: existing, isDuplicate: true };
          }
        }

        const order = await tx.order.create({
        data: {
          code,
          orderType: input.orderType,
          status: 'PENDING',
          tableId: input.tableId,
          totalAmount,
          vatAmount,
          finalAmount,
          paymentStatus: 'UNPAID', // Mac dinh chua thanh toan (Post-Paid)
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          idempotencyScope,
          requestHash,
          createdByUserId,
          items: {
            create: orderItemsData
          }
        },
        include: {
          items: {
            include: {
              menuItem: true
            }
          }
        }
      });

        // Neu la don an tai ban -> cap nhat trang thai ban sang OCCUPIED
        if (input.orderType === 'DINE_IN' && input.tableId) {
          await tx.diningTable.update({
            where: { id: input.tableId },
            data: {
              status: 'OCCUPIED',
              currentOrderId: order.id
            }
          });
        }

        return { order, isDuplicate: false };
      });
    } catch (error) {
      if (!input.idempotencyKey || !isUniqueConstraintError(error)) throw error;
      const existing = await findExisting(prisma);
      if (!existing) throw error;
      assertMatchingRequest(existing.requestHash);
      transactionResult = { order: existing, isDuplicate: true };
    }

    if (transactionResult.isDuplicate) return transactionResult;
    const createdOrder = transactionResult.order;

    // 8. Phat su kien WebSocket realtime xuong KDS va POS
    emitToAll('order:new', { order: createdOrder });

    if (targetTable) {
      emitToAll('table:statusChanged', {
        tableId: targetTable.id,
        tableNumber: targetTable.tableNumber,
        status: 'OCCUPIED',
        currentOrderId: createdOrder.id
      });
    }

    return transactionResult;
  }

  /**
   * Thanh toan don hang va tu dong reset ban an ve AVAILABLE
   */
  static async payOrder(orderId: number, input: PayOrderInput) {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!existingOrder) {
      throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
    }

    const { order: updatedOrder, tableState } = await prisma.$transaction(async (tx) => {
      if (existingOrder.tableId) {
        // Serialize create/pay operations on the same table before reading its unpaid orders.
        await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${existingOrder.tableId} FOR UPDATE`;
      }

      const lockedOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          table: { select: { id: true, tableNumber: true } }
        }
      });
      if (!lockedOrder) {
        throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
      }

      const order = lockedOrder.paymentStatus === 'PAID'
        ? lockedOrder
        : await tx.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'PAID',
              paymentMethod: input.paymentMethod as PaymentMethod,
              paidAt: new Date(),
              status: 'COMPLETED',
              completedAt: new Date()
            },
            include: { items: true }
          });

      let nextTableState: { tableId: number; tableNumber: number; status: 'AVAILABLE' | 'OCCUPIED'; currentOrderId: number | null } | null = null;
      if (order.tableId) {
        const remainingOrder = await tx.order.findFirst({
          where: {
            tableId: order.tableId,
            paymentStatus: 'UNPAID',
            status: { not: 'CANCELLED' }
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        });
        const status = remainingOrder ? 'OCCUPIED' as const : 'AVAILABLE' as const;
        const currentOrderId = remainingOrder?.id ?? null;
        await tx.diningTable.update({
          where: { id: order.tableId },
          data: {
            status,
            currentOrderId
          }
        });
        if (lockedOrder.table) {
          nextTableState = {
            tableId: lockedOrder.table.id,
            tableNumber: lockedOrder.table.tableNumber,
            status,
            currentOrderId
          };
        }
      }

      return { order, tableState: nextTableState };
    });

    // Phat su kien WebSocket realtime
    emitToAll('order:statusChanged', {
      orderId: updatedOrder.id,
      code: updatedOrder.code,
      status: 'COMPLETED',
      completedAt: updatedOrder.completedAt?.toISOString()
    });

    if (tableState) {
      emitToAll('table:statusChanged', tableState);
    }

    return { order: updatedOrder };
  }
}
