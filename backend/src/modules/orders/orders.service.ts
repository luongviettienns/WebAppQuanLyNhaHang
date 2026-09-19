import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll, emitToRoom } from '../../lib/socket';
import { CreateOrderInput, PayOrderInput, VoidOrderInput } from './orders.schemas';
import { PaymentMethod } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import { VouchersService } from '../vouchers/vouchers.service';
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
    let resolvedTableId = input.tableId;
    if (input.orderType === 'DINE_IN') {
      if (createdByUserId === undefined) {
        if (!input.qrCodeToken) {
          throw ApiError.badRequest('Khách gọi món tại bàn cần có mã QR hợp lệ');
        }

        const table = await prisma.diningTable.findUnique({
          where: { qrCodeToken: input.qrCodeToken }
        });
        if (!table) {
          throw ApiError.notFound('Mã QR bàn không hợp lệ hoặc đã hết hạn');
        }
        if (input.tableId && input.tableId !== table.id) {
          throw ApiError.badRequest('Mã QR không khớp với bàn được chọn');
        }
        resolvedTableId = table.id;
        targetTable = table;
      } else {
        if (!input.tableId) {
          throw ApiError.badRequest('Vui lòng chọn bàn ăn cho đơn tại chỗ');
        }

        const table = await prisma.diningTable.findUnique({
          where: { id: input.tableId }
        });
        if (!table) {
          throw ApiError.badRequest(`Bàn ăn ID ${input.tableId} không tồn tại`);
        }
        targetTable = table;
      }
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

    // 5. Xu ly Voucher khuyen mai neu co
    let voucherDiscount = 0;
    let appliedVoucherId: number | null = null;
    let appliedVoucherCode: string | null = null;

    if (input.voucherCode) {
      const voucherCalc = await VouchersService.validateVoucher(input.voucherCode, totalAmount);
      voucherDiscount = voucherCalc.discountAmount;
      appliedVoucherId = voucherCalc.voucherId;
      appliedVoucherCode = voucherCalc.code;
    }

    // Tinh toan thue VAT 8% tren so tien sau khi tru khuyen mai (800 BPS)
    const taxableAmount = Math.max(0, totalAmount - voucherDiscount);
    const vatAmount = Math.round(taxableAmount * 0.08);
    const finalAmount = taxableAmount + vatAmount;

    // 6. Tao ma don hang duy nhat CRISPY-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const code = `CRISPY-${dateStr}-${randomSuffix}`;

    // 7. Thuc hien Transaction tao Order va cap nhat Table
    let transactionResult: { order: any; isDuplicate: boolean };
    try {
      transactionResult = await prisma.$transaction(async (tx) => {
        if (input.orderType === 'DINE_IN' && resolvedTableId) {
          await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${resolvedTableId} FOR UPDATE`;
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
            tableId: resolvedTableId,
            buzzerNumber: input.buzzerNumber,
            totalAmount,
            discountAmount: voucherDiscount,
            vatAmount,
            finalAmount,
            voucherId: appliedVoucherId,
            voucherCode: appliedVoucherCode,
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

        if (appliedVoucherId) {
          const voucher = await tx.voucher.findUnique({
            where: { id: appliedVoucherId }
          });

          if (!voucher || !voucher.isActive) {
            throw ApiError.badRequest('Mã khuyến mãi không tồn tại hoặc đã ngừng áp dụng');
          }

          if (voucher.usageLimit !== null) {
            // Cap nhat nguyen tu: UPDATE Voucher SET usedCount = usedCount + 1 WHERE id = ? AND usedCount < usageLimit
            const affectedRows = await tx.$executeRaw`
              UPDATE Voucher 
              SET usedCount = usedCount + 1 
              WHERE id = ${appliedVoucherId} 
                AND isActive = true 
                AND usedCount < usageLimit
            `;

            if (affectedRows === 0) {
              throw ApiError.conflict('Mã khuyến mãi đã hết lượt sử dụng do đơn hàng khác vừa áp dụng');
            }
          } else {
            await tx.voucher.update({
              where: { id: appliedVoucherId },
              data: { usedCount: { increment: 1 } }
            });
          }
        }

        // Neu la don an tai ban -> cap nhat trang thai ban sang OCCUPIED
        if (input.orderType === 'DINE_IN' && resolvedTableId) {
          await tx.diningTable.update({
            where: { id: resolvedTableId },
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
    const createdOrder = formatOrderDto(transactionResult.order);

    // Phat su kien don hang moi chi vao phong KDS bep va toan he thong
    emitToRoom('restaurant:kds', 'order:new', { order: createdOrder });
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

      // Tu dong tru kho nguyen lieu theo cong thuc dinh luong BOM (Atomic Transaction)
      await InventoryService.deductInventoryForOrder(tx, order.id, order.items);

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
      tableId: updatedOrder.tableId,
      tableNumber: tableState?.tableNumber,
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
  static async updateOrderStatus(orderId: number, nextStatus: 'PREPARING' | 'READY' | 'COMPLETED', _userId?: number) {
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
      tableId: updatedOrder.tableId ?? updatedOrder.table?.id,
      tableNumber: updatedOrder.table?.tableNumber,
      prepTimeSec: orderDto.prepTimeSec,
      preparingAt: orderDto.preparingAt,
      readyAt: orderDto.readyAt,
      completedAt: orderDto.completedAt
    };

    emitToRoom('restaurant:kds', 'order:statusChanged', socketPayload);
    emitToAll('order:statusChanged', socketPayload);

    return orderDto;
  }

  static async voidOrder(orderId: number, input: VoidOrderInput, voidedByUserId?: number, actorName?: string) {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: true
      }
    });

    if (!existingOrder) {
      throw ApiError.notFound(`Đơn hàng ID ${orderId} không tồn tại`);
    }

    if (existingOrder.status === 'CANCELLED') {
      throw ApiError.orderStateInvalid('Đơn hàng đã bị hủy trước đó');
    }

    if (existingOrder.status === 'COMPLETED') {
      throw ApiError.orderStateInvalid('Không thể hủy đơn hàng đã hoàn tất phục vụ');
    }

    const { order, tableState } = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'VOIDED',
          voidedByUserId: voidedByUserId ?? null,
          voidReason: input.reason,
          voidedAt: now,
          cancelledAt: now
        },
        include: {
          items: true,
          table: true
        }
      });

      let nextTableState: any = null;
      if (existingOrder.tableId) {
        const remainingOrder = await tx.order.findFirst({
          where: {
            tableId: existingOrder.tableId,
            paymentStatus: 'UNPAID',
            status: { not: 'CANCELLED' },
            id: { not: orderId }
          },
          select: { id: true }
        });

        const status = remainingOrder ? 'OCCUPIED' : 'AVAILABLE';
        const currentOrderId = remainingOrder?.id ?? null;

        await tx.diningTable.update({
          where: { id: existingOrder.tableId },
          data: {
            status,
            currentOrderId
          }
        });

        if (updatedOrder.table) {
          nextTableState = {
            tableId: updatedOrder.table.id,
            tableNumber: updatedOrder.table.tableNumber,
            status,
            currentOrderId
          };
        }
      }

      if (existingOrder.voucherId) {
        await tx.$executeRaw`
          UPDATE Voucher 
          SET usedCount = CASE WHEN usedCount > 0 THEN usedCount - 1 ELSE 0 END 
          WHERE id = ${existingOrder.voucherId}
        `;
      }

      return { order: updatedOrder, tableState: nextTableState };
    });

    const orderDto = formatOrderDto(order);

    const socketPayload = {
      orderId: orderDto.id,
      code: orderDto.code,
      status: orderDto.status,
      tableId: orderDto.tableId,
      tableNumber: orderDto.tableNumber,
      cancelledAt: orderDto.cancelledAt
    };

    emitToRoom('restaurant:kds', 'order:statusChanged', socketPayload);
    emitToAll('order:statusChanged', socketPayload);

    if (tableState) {
      emitToAll('table:statusChanged', tableState);
    }

    await AuditService.log({
      action: 'ORDER_VOIDED',
      targetType: 'Order',
      targetId: orderDto.id,
      actorId: voidedByUserId,
      actorName,
      metadata: {
        code: orderDto.code,
        reason: input.reason,
        totalAmount: orderDto.totalAmount,
        tableNumber: orderDto.tableNumber
      }
    });

    return { order: orderDto };
  }

  /**
   * Tu dong huy cac don hang PENDING qua timeoutMinutes (mac dinh 60 phut)
   * voi ly do qua gio, kem cap nhat giai phong ban va phat su kien Socket.io
   */
  static async autoCancelExpiredOrders(timeoutMinutes: number = 60) {
    const cutoffDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const expiredOrders = await prisma.order.findMany({
      where: {
        status: 'PENDING',
        paymentStatus: { not: 'PAID' },
        createdAt: { lte: cutoffDate }
      },
      include: {
        table: true
      }
    });

    if (expiredOrders.length === 0) {
      return {
        cancelledCount: 0,
        cancelledOrderIds: []
      };
    }

    const cancelledOrderIds: number[] = [];
    const now = new Date();
    const defaultReason = 'Quá thời gian: Hơn 1 giờ chưa cập nhật trạng thái';

    for (const expOrder of expiredOrders) {
      try {
        const { order, tableState } = await prisma.$transaction(async (tx) => {
          const updatedOrder = await tx.order.update({
            where: { id: expOrder.id },
            data: {
              status: 'CANCELLED',
              paymentStatus: 'VOIDED',
              voidReason: defaultReason,
              voidedAt: now,
              cancelledAt: now
            },
            include: {
              items: true,
              table: true
            }
          });

          let nextTableState: any = null;
          if (expOrder.tableId) {
            const remainingOrder = await tx.order.findFirst({
              where: {
                tableId: expOrder.tableId,
                paymentStatus: 'UNPAID',
                status: { not: 'CANCELLED' },
                id: { not: expOrder.id }
              },
              select: { id: true }
            });

            const status = remainingOrder ? 'OCCUPIED' : 'AVAILABLE';
            const currentOrderId = remainingOrder?.id ?? null;

            await tx.diningTable.update({
              where: { id: expOrder.tableId },
              data: {
                status,
                currentOrderId
              }
            });

            if (updatedOrder.table) {
              nextTableState = {
                tableId: updatedOrder.table.id,
                tableNumber: updatedOrder.table.tableNumber,
                status,
                currentOrderId
              };
            }
          }

          return { order: updatedOrder, tableState: nextTableState };
        });

        cancelledOrderIds.push(order.id);

        const orderDto = formatOrderDto(order);
        const socketPayload = {
          orderId: orderDto.id,
          code: orderDto.code,
          status: orderDto.status,
          tableId: orderDto.tableId,
          tableNumber: orderDto.tableNumber,
          cancelledAt: orderDto.cancelledAt,
          voidReason: defaultReason
        };

        emitToRoom('restaurant:kds', 'order:statusChanged', socketPayload);
        emitToAll('order:statusChanged', socketPayload);

        if (tableState) {
          emitToAll('table:statusChanged', tableState);
        }
      } catch (err) {
        console.error(`[AutoCancel] Loi khi tu dong huy don ID ${expOrder.id}:`, err);
      }
    }

    return {
      cancelledCount: cancelledOrderIds.length,
      cancelledOrderIds
    };
  }
}

function formatOrderDto(order: any) {
  const orderItems = Array.isArray(order.items) ? order.items : [];
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
    discountAmount: order.discountAmount ?? 0,
    voucherId: order.voucherId ?? null,
    voucherCode: order.voucherCode ?? null,
    vatAmount: order.vatAmount,
    finalAmount: order.finalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paidAt: order.paidAt ? (order.paidAt instanceof Date ? order.paidAt.toISOString() : order.paidAt) : null,
    notes: order.notes,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
    updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
    preparingAt: order.preparingAt ? (order.preparingAt instanceof Date ? order.preparingAt.toISOString() : order.preparingAt) : null,
    readyAt: order.readyAt ? (order.readyAt instanceof Date ? order.readyAt.toISOString() : order.readyAt) : null,
    completedAt: order.completedAt ? (order.completedAt instanceof Date ? order.completedAt.toISOString() : order.completedAt) : null,
    cancelledAt: order.cancelledAt ? (order.cancelledAt instanceof Date ? order.cancelledAt.toISOString() : order.cancelledAt) : null,
    prepTimeSec,
    voidedByUserId: order.voidedByUserId ?? null,
    voidReason: order.voidReason ?? null,
    voidedAt: order.voidedAt ? (order.voidedAt instanceof Date ? order.voidedAt.toISOString() : order.voidedAt) : null,
    items: orderItems.map((item: any) => ({
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
