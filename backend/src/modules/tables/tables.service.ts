import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';

function deriveTableState<T extends { status: string; orders: Array<{ id: number }> }>(table: T) {
  const currentOrder = table.orders[0];
  return {
    ...table,
    status: currentOrder ? 'OCCUPIED' : table.status === 'OCCUPIED' ? 'AVAILABLE' : table.status,
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
}
