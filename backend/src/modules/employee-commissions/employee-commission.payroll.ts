import { Prisma } from '@prisma/client';

export interface CommissionAmountCandidate { id: number; amount: number; accountingDate: string }
export interface AllocationEventLike {
  id: number;
  allocationKey: string;
  type: 'RESERVED' | 'FINALIZED' | 'RELEASED';
  priorEventId: number | null;
  allocatedAmount: number;
}

export function deriveActiveAllocationEvents<T extends AllocationEventLike>(events: T[]): T[] {
  const latest = new Map<string, T>();
  for (const event of [...events].sort((left, right) => left.id - right.id)) latest.set(event.allocationKey, event);
  return [...latest.values()].filter(event => event.type !== 'RELEASED');
}

export function allocateCommissionAmounts(entries: CommissionAmountCandidate[], basePayable: number) {
  const ordered = [...entries].sort((left, right) => left.accountingDate.localeCompare(right.accountingDate) || left.id - right.id);
  const positives = ordered.filter(entry => entry.amount > 0);
  const negatives = ordered.filter(entry => entry.amount < 0);
  const reservations = positives.map(entry => ({ entryId: entry.id, amount: entry.amount }));
  const positiveAmount = positives.reduce((sum, entry) => sum + entry.amount, 0);
  let available = Math.max(0, basePayable + positiveAmount);
  let deferredDebitAmount = 0;
  for (const entry of negatives) {
    const debit = Math.abs(entry.amount);
    const applied = Math.min(debit, available);
    if (applied > 0) reservations.push({ entryId: entry.id, amount: -applied });
    available -= applied;
    deferredDebitAmount += debit - applied;
  }
  return {
    reservations,
    commissionAmount: reservations.reduce((sum, item) => sum + item.amount, 0),
    deferredDebitAmount
  };
}

interface PayrollBatchAllocationInput { id: number; periodEnd: Date; version: number }
interface PayrollLineAllocationInput {
  id: number; employeeId: number; grossAmount: number; bonusAmount: number; deductionAmount: number;
  paidAmount: number; sourceSnapshot: Prisma.JsonValue;
}

function inputJson(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

export async function reserveCommissionForPayroll(
  tx: Prisma.TransactionClient,
  batch: PayrollBatchAllocationInput,
  lines: PayrollLineAllocationInput[],
  actorId?: number
) {
  const employeeIds = lines.map(line => line.employeeId).sort((a, b) => a - b);
  const entries = await tx.commissionEntry.findMany({
    where: { employeeId: { in: employeeIds }, accountingDate: { lte: batch.periodEnd } },
    orderBy: [{ accountingDate: 'asc' }, { id: 'asc' }]
  });
  if (entries.length) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM CommissionEntry WHERE id IN (${Prisma.join(entries.map(entry => entry.id))}) ORDER BY id FOR UPDATE`);
  }
  const events = entries.length ? await tx.commissionPayrollAllocation.findMany({
    where: { commissionEntryId: { in: entries.map(entry => entry.id) } }, orderBy: { id: 'asc' }
  }) : [];
  const active = deriveActiveAllocationEvents(events);
  const activeByEntry = new Map<number, number>();
  for (const event of active) activeByEntry.set(event.commissionEntryId, (activeByEntry.get(event.commissionEntryId) ?? 0) + event.allocatedAmount);

  let totalCommissionAmount = 0;
  let totalDeferredDebitAmount = 0;
  const byEmployee = new Map<number, { commissionAmount: number; deferredDebitAmount: number; entryIds: number[]; allocationIds: number[] }>();
  for (const line of lines) {
    const candidates: CommissionAmountCandidate[] = [];
    for (const entry of entries.filter(item => item.employeeId === line.employeeId)) {
      const allocated = activeByEntry.get(entry.id) ?? 0;
      const remainder = entry.commissionAmountDelta > 0
        ? entry.commissionAmountDelta - Math.max(0, allocated)
        : -(Math.abs(entry.commissionAmountDelta) - Math.abs(Math.min(0, allocated)));
      if (remainder !== 0) candidates.push({ id: entry.id, amount: remainder, accountingDate: entry.accountingDate.toISOString().slice(0, 10) });
    }
    const planned = allocateCommissionAmounts(candidates, line.grossAmount + line.bonusAmount - line.deductionAmount);
    const allocationIds: number[] = [];
    for (const reservation of planned.reservations) {
      const created = await tx.commissionPayrollAllocation.create({ data: {
        allocationKey: `PAYROLL:${batch.id}:LINE:${line.id}:ENTRY:${reservation.entryId}:V${batch.version}`,
        type: 'RESERVED', commissionEntryId: reservation.entryId, payrollBatchId: batch.id, payrollLineId: line.id,
        allocatedAmount: reservation.amount, createdByUserId: actorId ?? null
      } });
      allocationIds.push(created.id);
    }
    const netAmount = line.grossAmount + planned.commissionAmount + line.bonusAmount - line.deductionAmount;
    if (netAmount < 0) throw new Error('commission allocator violated payroll payable floor');
    const remainingAmount = Math.max(0, netAmount - line.paidAmount);
    const source = line.sourceSnapshot && typeof line.sourceSnapshot === 'object' && !Array.isArray(line.sourceSnapshot)
      ? line.sourceSnapshot as Prisma.JsonObject : {};
    await tx.employeePayrollLine.update({ where: { id: line.id }, data: {
      commissionAmount: planned.commissionAmount,
      commissionDeferredDebitAmount: planned.deferredDebitAmount,
      netAmount, remainingAmount,
      sourceSnapshot: inputJson({ ...source, commission: {
        entryIds: planned.reservations.map(item => item.entryId), allocationIds,
        appliedAmount: planned.commissionAmount, deferredDebitAmount: planned.deferredDebitAmount
      } })
    } });
    totalCommissionAmount += planned.commissionAmount;
    totalDeferredDebitAmount += planned.deferredDebitAmount;
    byEmployee.set(line.employeeId, {
      commissionAmount: planned.commissionAmount, deferredDebitAmount: planned.deferredDebitAmount,
      entryIds: planned.reservations.map(item => item.entryId), allocationIds
    });
  }
  return { totalCommissionAmount, totalDeferredDebitAmount, byEmployee };
}

async function currentBatchAllocations(tx: Prisma.TransactionClient, batchId: number) {
  const events = await tx.commissionPayrollAllocation.findMany({ where: { payrollBatchId: batchId }, orderBy: { id: 'asc' } });
  return deriveActiveAllocationEvents(events);
}

export async function finalizeCommissionAllocations(tx: Prisma.TransactionClient, batchId: number, actorId?: number) {
  const active = await currentBatchAllocations(tx, batchId);
  const finalized = [];
  for (const event of active.filter(item => item.type === 'RESERVED')) finalized.push(await tx.commissionPayrollAllocation.create({ data: {
    allocationKey: event.allocationKey, type: 'FINALIZED', priorEventId: event.id,
    commissionEntryId: event.commissionEntryId, payrollBatchId: event.payrollBatchId, payrollLineId: event.payrollLineId,
    allocatedAmount: event.allocatedAmount, createdByUserId: actorId ?? null
  } }));
  return finalized;
}

export async function releaseCommissionAllocations(tx: Prisma.TransactionClient, batchId: number, actorId?: number, reason?: string) {
  const active = await currentBatchAllocations(tx, batchId);
  const released = [];
  for (const event of active) released.push(await tx.commissionPayrollAllocation.create({ data: {
    allocationKey: event.allocationKey, type: 'RELEASED', priorEventId: event.id,
    commissionEntryId: event.commissionEntryId, payrollBatchId: event.payrollBatchId, payrollLineId: event.payrollLineId,
    allocatedAmount: event.allocatedAmount, createdByUserId: actorId ?? null, reason: reason ?? null
  } }));
  return released;
}
