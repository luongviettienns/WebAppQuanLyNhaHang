import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll, emitToRoom } from '../../lib/socket';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CreateTableInput, TableManageQuery, UpdateTableInput } from './tables.schemas';

function managementDto(table: any) {
  return { ...table, displayName: table.displayName || `Bàn ${table.tableNumber}`, seatCount: table.capacity, area: table.area ?? null };
}

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
  static async manage(query: TableManageQuery) {
    const where: Prisma.DiningTableWhereInput = {
      ...(query.areaId ? { areaId: query.areaId } : {}),
      ...(query.isActive === 'all' ? {} : { isActive: query.isActive === 'true' }),
      ...(query.search ? { OR: [{ displayName: { contains: query.search } }, ...(Number.isInteger(Number(query.search)) ? [{ tableNumber: Number(query.search) }, { capacity: Number(query.search) }] : [])] } : {})
    };
    const [totalRows, tables] = await Promise.all([
      prisma.diningTable.count({ where }),
      prisma.diningTable.findMany({ where, include: { area: { select: { id: true, name: true } } }, orderBy: [{ displayOrder: 'asc' }, { tableNumber: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize })
    ]);
    return { items: tables.map(managementDto), pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.ceil(totalRows / query.pageSize) } };
  }

  static async create(input: CreateTableInput, actorId?: number, actorName?: string) {
    try {
      const created = await prisma.$transaction(async tx => {
        const table = await this.createInTransaction(tx, input);
        await AuditService.logInTransaction(tx, { action: 'TABLE_CREATED', targetType: 'DiningTable', targetId: table.id, actorId, actorName, metadata: { tableNumber: table.tableNumber, displayName: table.displayName } });
        return table;
      });
      this.notify([created.id]); return managementDto(created);
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Số bàn đã tồn tại'); throw error; }
  }

  static async createInTransaction(tx: Prisma.TransactionClient, input: CreateTableInput) {
    await this.requireArea(input.areaId, tx);
    const last = input.tableNumber === undefined ? await tx.$queryRaw<Array<{ tableNumber: number }>>`SELECT tableNumber FROM DiningTable ORDER BY tableNumber DESC LIMIT 1 FOR UPDATE` : [];
    const tableNumber = input.tableNumber ?? (last[0] ? Number(last[0].tableNumber) + 1 : 1);
    return tx.diningTable.create({ data: { tableNumber, displayName: input.displayName, areaId: input.areaId, capacity: input.seatCount ?? 4, displayOrder: input.displayOrder ?? tableNumber, note: input.note, qrCodeToken: randomUUID() }, include: { area: { select: { id: true, name: true } } } });
  }

  static async update(id: number, input: UpdateTableInput, actorId?: number, actorName?: string) {
    const updated = await prisma.$transaction(async tx => {
      await this.requireArea(input.areaId, tx);
      await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.diningTable.findUnique({ where: { id } });
      if (!existing) throw ApiError.notFound('Phòng/bàn không tồn tại');
      if (input.isActive === false && (existing.status === 'OCCUPIED' || existing.currentOrderId !== null)) throw ApiError.conflict('Không thể ngừng hoạt động phòng/bàn đang phục vụ');
      const { seatCount, ...profile } = input;
      const table = await tx.diningTable.update({ where: { id }, data: { ...profile, ...(seatCount === undefined ? {} : { capacity: seatCount }) }, include: { area: { select: { id: true, name: true } } } });
      await AuditService.logInTransaction(tx, { action: 'TABLE_UPDATED', targetType: 'DiningTable', targetId: id, actorId, actorName, metadata: { updatedFields: Object.keys(input) } });
      return table;
    });
    this.notify([id]); return managementDto(updated);
  }

  static async areas() { return prisma.tableArea.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] }); }
  static async saveArea(id: number | null, input: { name: string; displayOrder?: number; isActive?: boolean }, actorId?: number, actorName?: string) {
    try {
      const area = await prisma.$transaction(async tx => { const saved = id === null ? await tx.tableArea.create({ data: input }) : await tx.tableArea.update({ where: { id }, data: input }); await AuditService.logInTransaction(tx, { action: id === null ? 'TABLE_AREA_CREATED' : 'TABLE_AREA_UPDATED', targetType: 'TableArea', targetId: saved.id, actorId, actorName }); return saved; });
      this.notify([]); return area;
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw ApiError.conflict('Tên khu vực đã tồn tại'); throw error; }
  }

  private static async requireArea(areaId?: number | null, client: Pick<typeof prisma, 'tableArea'> = prisma) { if (areaId && !await client.tableArea.findFirst({ where: { id: areaId, isActive: true } })) throw ApiError.badRequest('Khu vực không tồn tại hoặc đã ngừng hoạt động'); }
  static notify(ids: number[]) { emitToAll('tables:changed', { ids, updatedAt: new Date().toISOString() }); }

  static async getAllTables() {
    const tables = await prisma.diningTable.findMany({
      where: { isActive: true },
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

  static async getTableByQrToken(qrCodeToken: string) {
    let tableNumberToMatch: number | null = null;
    if (!isNaN(Number(qrCodeToken))) {
      tableNumberToMatch = Number(qrCodeToken);
    } else {
      const match = qrCodeToken.match(/(?:qr_table_|table_|QR-TABLE-)(\d+)/i);
      if (match && match[1]) {
        tableNumberToMatch = Number(match[1]);
      }
    }

    const table = await prisma.diningTable.findFirst({
      where: {
        isActive: true,
        OR: [
          { qrCodeToken },
          ...(tableNumberToMatch !== null ? [{ tableNumber: tableNumberToMatch }] : [])
        ]
      },
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
      throw ApiError.notFound('Mã QR bàn không hợp lệ hoặc đã hết hạn');
    }

    const safeTable = deriveTableState(table) as Record<string, unknown>;
    delete safeTable.qrCodeToken;
    return { table: safeTable };
  }

  static async getTableByTableNumber(tableNumber: number) {
    const table = await prisma.diningTable.findUnique({
      where: { tableNumber, isActive: true },
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
      throw ApiError.notFound(`Bàn số ${tableNumber} không tồn tại`);
    }

    const { qrCodeToken, ...safeTable } = deriveTableState(table);
    return { table: safeTable, qrCodeToken };
  }

  static async getPublicTables() {
    const tables = await prisma.diningTable.findMany({
      where: { isActive: true },
      orderBy: { tableNumber: 'asc' },
      select: {
        id: true,
        tableNumber: true,
        capacity: true,
        status: true,
        qrCodeToken: true
      }
    });
    return { tables };
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

  static async transferTable(
    fromTableId: number,
    toTableId: number,
    actor: { id: number; name?: string | null }
  ) {
    if (fromTableId === toTableId) {
      throw ApiError.badRequest('Bàn nguồn và bàn đích không được trùng nhau');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Khoa ca 2 ban bang SELECT ... FOR UPDATE de tranh race condition
      await tx.$queryRaw`SELECT id FROM DiningTable WHERE id IN (${fromTableId}, ${toTableId}) FOR UPDATE`;

      const fromTable = await tx.diningTable.findUnique({
        where: { id: fromTableId },
        include: {
          orders: {
            where: {
              paymentStatus: 'UNPAID',
              status: { notIn: ['COMPLETED', 'CANCELLED'] }
            }
          }
        }
      });

      if (!fromTable) {
        throw ApiError.notFound(`Bàn nguồn ID ${fromTableId} không tồn tại`);
      }

      if (fromTable.orders.length === 0) {
        throw ApiError.orderStateInvalid(`Bàn ${fromTable.tableNumber} không có đơn hàng nào đang hoạt động để chuyển`);
      }

      const toTable = await tx.diningTable.findUnique({
        where: { id: toTableId },
        include: {
          orders: {
            where: {
              paymentStatus: 'UNPAID',
              status: { notIn: ['COMPLETED', 'CANCELLED'] }
            }
          }
        }
      });

      if (!toTable) {
        throw ApiError.notFound(`Bàn đích ID ${toTableId} không tồn tại`);
      }

      if (toTable.status === 'DIRTY' || toTable.status === 'NEED_CLEANING') {
        throw ApiError.conflict(`Bàn đích (Bàn ${toTable.tableNumber}) đang chờ dọn dẹp, vui lòng dọn bàn trước khi chuyển`);
      }

      if (toTable.orders.length > 0 || toTable.status === 'OCCUPIED') {
        throw ApiError.conflict(`Bàn đích (Bàn ${toTable.tableNumber}) đang có khách phục vụ, không thể chuyển sang`);
      }

      const activeOrderIds = fromTable.orders.map((o) => o.id);
      const primaryOrderId = fromTable.orders[0]?.id ?? null;

      // Chuyển toàn bộ đơn hàng sang bàn đích
      await tx.order.updateMany({
        where: { id: { in: activeOrderIds } },
        data: { tableId: toTableId }
      });

      // Cập nhật trạng thái 2 bàn
      const updatedFromTable = await tx.diningTable.update({
        where: { id: fromTableId },
        data: {
          status: 'AVAILABLE',
          currentOrderId: null
        },
        include: {
          orders: {
            where: {
              paymentStatus: 'UNPAID',
              status: { notIn: ['COMPLETED', 'CANCELLED'] }
            },
            include: { items: true }
          }
        }
      });

      const updatedToTable = await tx.diningTable.update({
        where: { id: toTableId },
        data: {
          status: 'OCCUPIED',
          currentOrderId: primaryOrderId
        },
        include: {
          orders: {
            where: {
              paymentStatus: 'UNPAID',
              status: { notIn: ['COMPLETED', 'CANCELLED'] }
            },
            include: { items: true }
          }
        }
      });

      return {
        fromTable: updatedFromTable,
        toTable: updatedToTable,
        transferredOrdersCount: activeOrderIds.length,
        transferredOrderCodes: fromTable.orders.map((o) => o.code),
        fromTableNumber: fromTable.tableNumber,
        toTableNumber: toTable.tableNumber,
        activeOrderIds
      };
    });

    const derivedFrom = deriveTableState(result.fromTable);
    const derivedTo = deriveTableState(result.toTable);

    // Phát socket đồng bộ trạng thái bàn cho toàn hệ thống
    emitToAll('table:statusChanged', {
      tableId: derivedFrom.id,
      tableNumber: derivedFrom.tableNumber,
      status: derivedFrom.status as any,
      currentOrderId: derivedFrom.currentOrderId
    });

    emitToAll('table:statusChanged', {
      tableId: derivedTo.id,
      tableNumber: derivedTo.tableNumber,
      status: derivedTo.status as any,
      currentOrderId: derivedTo.currentOrderId
    });

    // Phát sự kiện chuyển bàn cho KDS Bếp
    emitToRoom('restaurant:kds', 'order:tableTransferred', {
      orderIds: result.activeOrderIds,
      fromTableNumber: result.fromTableNumber,
      toTableNumber: result.toTableNumber
    });

    // Ghi nhận Audit Log
    await AuditService.log({
      action: 'TABLE_TRANSFERRED',
      targetType: 'DiningTable',
      targetId: toTableId,
      actorId: actor.id,
      actorName: actor.name,
      metadata: {
        fromTableNumber: result.fromTableNumber,
        toTableNumber: result.toTableNumber,
        orderCodes: result.transferredOrderCodes,
        ordersCount: result.transferredOrdersCount
      }
    });

    return {
      fromTable: derivedFrom,
      toTable: derivedTo,
      transferredOrdersCount: result.transferredOrdersCount
    };
  }
}
