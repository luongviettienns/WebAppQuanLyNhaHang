import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll, emitToRoom } from '../../lib/socket';
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
      targetTable = table;
    }

    // 3. Lay thong tin cac mon an tu Database de xac thuc gia va tinh toan
    const menuItemIds = input.items.map((i) => i.menuItemId);
    const dbMenuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: {
        modifierGroups: {
          include: {
            options: true
          }
        }
      }
    });

    const dbItemMap = new Map(dbMenuItems.map((item) => [item.id, item]));

    // 4. Validate tung mon an, tinh tien va tao orderItemsData
    let totalAmount = 0;
    const orderItemsData: any[] = [];

    for (const itemInput of input.items) {
      const dbItem = dbItemMap.get(itemInput.menuItemId);
      if (!dbItem) {
        throw ApiError.notFound(`Món ăn ID ${itemInput.menuItemId} không tồn tại trong thực đơn`);
      }

      // Kiem tra het hang (86'd)
      if (!dbItem.isAvailable) {
        throw ApiError.badRequest(`Món ăn "${dbItem.name}" hiện đã hết hàng (86'd)`);
      }

      // Xac thuc modifier va tao snapshot hoan toan tu du lieu DB
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
            buzzerNumber: input.buzzerNumber,
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

    // Phat su kien don hang moi chi vao phong KDS bep
    emitToRoom('restaurant:kds', 'order:new', { order: createdOrder });

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
   * Thanh toan don hang va tu dong reset ban an ve AVAILABLE khi het don UNPAID
   */
  static async payOrder(orderId: number, input: PayOrderInput) {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!existingOrder) {
      throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
    }

    // Double-pay guard (FSM check): Nếu đơn đã trả thì ném 409 CONFLICT
    if (existingOrder.paymentStatus === 'PAID') {
      throw ApiError.conflict(`Đơn hàng ID ${orderId} đã được thanh toán từ trước`);
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

      if (lockedOrder.paymentStatus === 'PAID') {
        throw ApiError.conflict(`Đơn hàng ID ${orderId} đã được thanh toán từ trước`);
      }

      const order = await tx.order.update({
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

  /**
   * Lay danh sach don hang cho man hinh bep KDS hoac quan ly
   */
  static async getOrders(filter?: { status?: string[] }) {
    const where: any = {};
    if (filter?.status && filter.status.length > 0) {
      where.status = { in: filter.status };
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        items: true,
        table: { select: { id: true, tableNumber: true } }
      }
    });

    return orders.map(formatOrderDto);
  }

  /**
   * Chuyen trang thai don hang theo Finite State Machine (FSM):
   * PENDING -> PREPARING -> READY -> COMPLETED
   */
  static async updateOrderStatus(orderId: number, nextStatus: 'PREPARING' | 'READY' | 'COMPLETED', userId?: number) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        table: { select: { id: true, tableNumber: true } }
      }
    });

    if (!order) {
      throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
    }

    // FSM State transitions: PENDING -> PREPARING -> READY -> COMPLETED
    const validTransitions: Record<string, string[]> = {
      PENDING: ['PREPARING'],
      PREPARING: ['READY'],
      READY: ['COMPLETED']
    };

    const allowed = validTransitions[order.status];
    if (!allowed || !allowed.includes(nextStatus)) {
      throw ApiError.orderStateInvalid(
        `Không thể chuyển trạng thái từ ${order.status} sang ${nextStatus}. Luồng trạng thái hợp lệ: PENDING -> PREPARING -> READY -> COMPLETED`
      );
    }

    const now = new Date();
    const data: any = { status: nextStatus };

    if (nextStatus === 'PREPARING') {
      if (!order.preparingAt) {
        data.preparingAt = now;
      }
    } else if (nextStatus === 'READY') {
      if (!order.readyAt) {
        data.readyAt = now;
      }
    } else if (nextStatus === 'COMPLETED') {
      if (!order.completedAt) {
        data.completedAt = now;
      }
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data,
      include: {
        items: true,
        table: { select: { id: true, tableNumber: true } }
      }
    });

    const orderDto = formatOrderDto(updatedOrder);

    // Phat su kien Socket toi room restaurant:kds va toan he thong
    const socketPayload = {
      orderId: updatedOrder.id,
      code: updatedOrder.code,
      status: updatedOrder.status,
      prepTimeSec: orderDto.prepTimeSec,
      preparingAt: orderDto.preparingAt,
      readyAt: orderDto.readyAt,
      completedAt: orderDto.completedAt
    };

    emitToRoom('restaurant:kds', 'order:statusChanged', socketPayload);
    emitToAll('order:statusChanged', socketPayload);

    return orderDto;
  }
}

function formatOrderDto(order: any) {
  let prepTimeSec: number | null = null;
  if (order.readyAt && order.preparingAt) {
    prepTimeSec = Math.max(0, Math.round((new Date(order.readyAt).getTime() - new Date(order.preparingAt).getTime()) / 1000));
  } else if (order.readyAt) {
    prepTimeSec = Math.max(0, Math.round((new Date(order.readyAt).getTime() - new Date(order.createdAt).getTime()) / 1000));
  }

  return {
    id: order.id,
    code: order.code,
    orderType: order.orderType,
    status: order.status,
    tableId: order.tableId,
    tableNumber: order.table?.tableNumber ?? null,
    buzzerNumber: order.buzzerNumber ?? null,
    totalAmount: order.totalAmount,
    vatAmount: order.vatAmount,
    finalAmount: order.finalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paidAt: order.paidAt?.toISOString() ?? null,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    preparingAt: order.preparingAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    prepTimeSec,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      orderId: item.orderId,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      selectedModifiersJson: item.selectedModifiersJson,
      notes: item.notes
    }))
  };
}

