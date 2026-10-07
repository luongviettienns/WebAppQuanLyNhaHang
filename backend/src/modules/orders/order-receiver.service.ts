import type { Prisma } from '@prisma/client';

export async function resolveEmployeeForUser(tx: Prisma.TransactionClient, userId?: number): Promise<number | null> {
  if (userId === undefined) return null;
  const employee = await tx.employee.findUnique({ where: { userId }, select: { id: true } });
  return employee?.id ?? null;
}

export async function claimInitialOrderReceiver(
  tx: Prisma.TransactionClient,
  orderId: number,
  userId?: number
): Promise<number | null> {
  const employeeId = await resolveEmployeeForUser(tx, userId);
  if (employeeId !== null) {
    await tx.order.updateMany({
      where: { id: orderId, receivedByEmployeeId: null },
      data: { receivedByEmployeeId: employeeId }
    });
  }

  // A losing claim must see the committed winner, even if earlier reads created
  // a REPEATABLE READ snapshot with a NULL receiver. FOR UPDATE is a current read.
  const rows = await tx.$queryRaw<Array<{ receivedByEmployeeId: number | null }>>`
    SELECT receivedByEmployeeId FROM \`Order\` WHERE id = ${orderId} FOR UPDATE
  `;
  return rows[0]?.receivedByEmployeeId ?? null;
}
