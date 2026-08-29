import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { CreateOrderInput, PayOrderInput } from './orders.schemas';
import { PaymentMethod } from '@prisma/client';

export class OrdersService {
  /**
   * Tao don hang moi (Dat tai ban qua QR hoac POS)
   */
  static async createOrder(input: CreateOrderInput, createdByUserId?: number) {
    // 1. Idempotency Key check - phong chong gui trung don
    if (input.idempotencyKey) {
      const existing = await prisma.order.findFirst({
        where: { idempotencyKey: input.idempotencyKey },
        include: { items: true }
      });
      if (existing) {
        return { order: existing, isDuplicate: true };
      }
    }

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

      // Kiem tra modifier bat buoc (isRequired: true)
      const selectedMods = itemInput.selectedModifiers || [];
      for (const group of dbItem.modifierGroups) {
        if (group.isRequired) {
          const selectedInGroup = selectedMods.filter((m) => m.modifierGroupId === group.id);
          if (selectedInGroup.length < group.minSelect) {
            throw ApiError.badRequest(
              `Món "${dbItem.name}" bắt buộc phải chọn nhóm "${group.name}" (Tối thiểu ${group.minSelect} lựa chọn)`
            );
          }
        }
      }

      // Tinh gia tien chinh xac tu DB
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
    const createdOrder = await prisma.$transaction(async (tx) => {
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

      return order;
    });

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

    return { order: createdOrder, isDuplicate: false };
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

    const updatedOrder = await prisma.$transaction(async (tx) => {
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

      // Neu don hang co gan voi ban -> reset ban ve AVAILABLE
      if (order.tableId) {
        await tx.diningTable.update({
          where: { id: order.tableId },
          data: {
            status: 'AVAILABLE',
            currentOrderId: null
          }
        });
      }

      return order;
    });

    // Phat su kien WebSocket realtime
    emitToAll('order:statusChanged', {
      orderId: updatedOrder.id,
      code: updatedOrder.code,
      status: 'COMPLETED',
      completedAt: updatedOrder.completedAt?.toISOString()
    });

    if (updatedOrder.tableId) {
      const table = await prisma.diningTable.findUnique({
        where: { id: updatedOrder.tableId }
      });
      if (table) {
        emitToAll('table:statusChanged', {
          tableId: table.id,
          tableNumber: table.tableNumber,
          status: 'AVAILABLE',
          currentOrderId: null
        });
      }
    }

    return { order: updatedOrder };
  }
}
