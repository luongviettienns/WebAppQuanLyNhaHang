import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../lib/api-error';

export function unfinishedVisitWhere(tableId: number, tableSessionId: string | null): Prisma.OrderWhereInput {
  return {
    tableId, tableSessionId, status: { not: 'CANCELLED' },
    OR: [{ paymentStatus: { in: ['UNPAID', 'WAITING_CONFIRMATION'] } }, { status: { in: ['PENDING', 'PREPARING', 'READY'] } }]
  };
}

export async function ensureTableVisit(tx: Prisma.TransactionClient, tableId: number): Promise<string> {
  await tx.$queryRaw`SELECT id FROM DiningTable WHERE id = ${tableId} FOR UPDATE`;
  const table = await tx.diningTable.findUniqueOrThrow({ where: { id: tableId } });
  if (table.status === 'DIRTY' || table.status === 'NEED_CLEANING') {
    throw ApiError.conflict('Bàn đang chờ dọn. Cần xác nhận đã dọn trước khi bắt đầu lượt phục vụ mới.');
  }
  if (table.currentSessionId) return table.currentSessionId;
  const currentSessionId = randomUUID();
  await tx.diningTable.update({ where: { id: tableId }, data: { currentSessionId } });
  return currentSessionId;
}

export async function assertOrderVisit(tx: Pick<Prisma.TransactionClient, 'diningTable'>, order: { tableId: number | null; tableSessionId: string | null }) {
  if (!order.tableId) return;
  const table = await tx.diningTable.findUniqueOrThrow({ where: { id: order.tableId }, select: { currentSessionId: true } });
  // Both-null supports legacy/import fixtures only; a marked current visit can
  // never be affected by a historical unassigned order or a different marker.
  if (table.currentSessionId !== order.tableSessionId) throw ApiError.conflict('Đơn không thuộc lượt phục vụ hiện tại của bàn');
}

export async function closeTableVisit(tx: Prisma.TransactionClient, tableId: number, currentSessionId: string | null) {
  if (currentSessionId) {
    await tx.reservation.updateMany({ where: { tableId, tableSessionId: currentSessionId, status: 'CHECKED_IN' }, data: { status: 'COMPLETED' } });
  }
  await tx.diningTable.update({ where: { id: tableId }, data: { currentSessionId: null, currentOrderId: null } });
}
