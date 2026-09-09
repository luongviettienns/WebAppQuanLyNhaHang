import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';

function deriveTableState<T extends { status: string; orders: Array<{ id: number }> }>(table: T) {
  const currentOrder = table.orders[0];
  let status = table.status;
  if (currentOrder) {
    status = 'OCCUPIED';
  } else if (table.status === 'OCCUPIED') {
    status = 'AVAILABLE';
  } else if (table.status === 'NEED_CLEANING') {
    status = 'DIRTY';
  }

  return {
    ...table,
    status,
    currentOrderId: currentOrder?.id ?? null
  };
}

export class TablesService {
  static async getAllTables() {
    const tables = await prisma.diningTable.findMany({
      orderBy: { tableNumber: 'asc' },
      include: {
        orders: {
          where: {
            paymentStatus: 'UNPAID',
            status: { not: 'CANCELLED' }
          },
          orderBy: { createdAt: 'desc' },
          include: {
            items: true
          }
        }
      }
    });

    return { tables: tables.map(deriveTableState) };
  }

  static async getTableById(id: number) {
    const table = await prisma.diningTable.findUnique({
      where: { id },
      include: {
        orders: {
          where: {
            paymentStatus: 'UNPAID',
            status: { not: 'CANCELLED' }
          },
          orderBy: { createdAt: 'desc' },
          include: {
            items: true
          }
        }
      }
    });

    if (!table) {
      throw ApiError.notFound(`Bàn ăn ID ${id} không tồn tại`);
    }

    return { table: deriveTableState(table) };
  }

  static async updateTableStatus(id: number, inputStatus: 'AVAILABLE' | 'DIRTY' | 'NEED_CLEANING') {
    const existingTable = await prisma.diningTable.findUnique({
      where: { id },
      include: {
        orders: {
          where: {
            paymentStatus: 'UNPAID',
            status: { not: 'CANCELLED' }
          }
        }
      }
    });

    if (!existingTable) {
      throw ApiError.notFound(`Bàn ăn ID ${id} không tồn tại`);
    }

    if (inputStatus === 'AVAILABLE') {
      if (existingTable.orders.length > 0) {
        throw ApiError.orderStateInvalid('Không thể chuyển bàn về AVAILABLE khi vẫn còn đơn hàng chưa thanh toán');
      }
    }

    const dbStatus = inputStatus === 'NEED_CLEANING' || inputStatus === 'DIRTY' ? 'DIRTY' : 'AVAILABLE';

    const updatedTable = await prisma.diningTable.update({
      where: { id },
      data: {
        status: dbStatus,
        currentOrderId: null
      },
      include: {
        orders: {
          where: {
            paymentStatus: 'UNPAID',
            status: { not: 'CANCELLED' }
          },
          include: { items: true }
        }
      }
    });

    const derived = deriveTableState(updatedTable);

    emitToAll('table:statusChanged', {
      tableId: derived.id,
      tableNumber: derived.tableNumber,
      status: derived.status as any,
      currentOrderId: derived.currentOrderId
    });

    return { table: derived };
  }
}
