export type CommissionRuleType = 'FIXED_PER_UNIT' | 'PERCENT_NET_REVENUE' | 'PERCENT_GROSS_PROFIT';

export interface DiscountLine {
  orderItemId: number;
  grossRevenue: number;
}

export interface CommissionCalculationInput {
  type: CommissionRuleType;
  quantity: number;
  grossRevenue: number;
  allocatedDiscount: number;
  unitCost: number | null;
  fixedAmount?: number;
  rateBps?: number;
}

export interface CommissionCalculationResult {
  ok: boolean;
  issue?: 'COST_MISSING';
  netRevenue?: number;
  costAmount?: number;
  grossProfit?: number;
  commissionAmount?: number;
}

export interface OwnershipEntry {
  id: number;
  type: 'EARNING' | 'RETURN_REVERSAL' | 'REASSIGNMENT_REVERSAL' | 'REASSIGNMENT_EARNING';
  employeeId: number;
  quantityDelta: number;
  sourceEntryId: number | null;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
}

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function allocateDiscountLargestRemainder(lines: DiscountLine[], discount: number): Map<number, number> {
  assertNonNegativeInteger(discount, 'discount');
  const ordered = [...lines].sort((left, right) => left.orderItemId - right.orderItemId);
  for (const line of ordered) assertNonNegativeInteger(line.grossRevenue, 'grossRevenue');
  const totalGross = ordered.reduce((sum, line) => sum + line.grossRevenue, 0);
  if (totalGross === 0) return new Map(ordered.map(line => [line.orderItemId, 0]));

  const effectiveDiscount = Math.min(discount, totalGross);
  const shares = ordered.map(line => {
    const numerator = effectiveDiscount * line.grossRevenue;
    return {
      orderItemId: line.orderItemId,
      amount: Math.floor(numerator / totalGross),
      remainder: numerator % totalGross
    };
  });
  let undistributed = effectiveDiscount - shares.reduce((sum, share) => sum + share.amount, 0);
  const remainderOrder = [...shares].sort((left, right) =>
    right.remainder - left.remainder || left.orderItemId - right.orderItemId
  );
  for (let index = 0; index < remainderOrder.length && undistributed > 0; index += 1, undistributed -= 1) {
    remainderOrder[index].amount += 1;
  }
  return new Map(shares.map(share => [share.orderItemId, share.amount]));
}

export function calculateCommissionSnapshot(input: CommissionCalculationInput): CommissionCalculationResult {
  assertNonNegativeInteger(input.quantity, 'quantity');
  assertNonNegativeInteger(input.grossRevenue, 'grossRevenue');
  assertNonNegativeInteger(input.allocatedDiscount, 'allocatedDiscount');
  const netRevenue = Math.max(0, input.grossRevenue - input.allocatedDiscount);

  if (input.type === 'FIXED_PER_UNIT') {
    assertNonNegativeInteger(input.fixedAmount ?? -1, 'fixedAmount');
    return {
      ok: true,
      netRevenue,
      costAmount: input.unitCost === null ? 0 : input.unitCost * input.quantity,
      grossProfit: input.unitCost === null ? 0 : Math.max(0, netRevenue - input.unitCost * input.quantity),
      commissionAmount: (input.fixedAmount ?? 0) * input.quantity
    };
  }

  assertNonNegativeInteger(input.rateBps ?? -1, 'rateBps');
  const rateBps = input.rateBps ?? 0;
  if (rateBps > 10_000) throw new Error('rateBps must not exceed 10000');
  if (input.type === 'PERCENT_NET_REVENUE') {
    return {
      ok: true,
      netRevenue,
      costAmount: input.unitCost === null ? 0 : input.unitCost * input.quantity,
      grossProfit: input.unitCost === null ? 0 : Math.max(0, netRevenue - input.unitCost * input.quantity),
      commissionAmount: roundHalfUp(netRevenue * rateBps, 10_000)
    };
  }

  if (input.unitCost === null) return { ok: false, issue: 'COST_MISSING' };
  assertNonNegativeInteger(input.unitCost, 'unitCost');
  const costAmount = input.unitCost * input.quantity;
  const grossProfit = Math.max(0, netRevenue - costAmount);
  return {
    ok: true,
    netRevenue,
    costAmount,
    grossProfit,
    commissionAmount: roundHalfUp(grossProfit * rateBps, 10_000)
  };
}

export function prorateSnapshot(
  total: number,
  quantity: number,
  totalQuantity: number,
  alreadyConsumedQuantity: number,
  alreadyConsumedAmount: number
): number {
  assertNonNegativeInteger(total, 'total');
  assertNonNegativeInteger(quantity, 'quantity');
  assertNonNegativeInteger(totalQuantity, 'totalQuantity');
  assertNonNegativeInteger(alreadyConsumedQuantity, 'alreadyConsumedQuantity');
  assertNonNegativeInteger(alreadyConsumedAmount, 'alreadyConsumedAmount');
  if (totalQuantity === 0 || quantity === 0) return 0;
  if (alreadyConsumedQuantity + quantity > totalQuantity || alreadyConsumedAmount > total) {
    throw new Error('proration exceeds snapshot remainder');
  }
  if (alreadyConsumedQuantity + quantity === totalQuantity) return total - alreadyConsumedAmount;
  return Math.min(total - alreadyConsumedAmount, roundHalfUp(total * quantity, totalQuantity));
}

export function resolveCurrentOwner(entries: OwnershipEntry[]):
  | { ok: true; entryId: number; employeeId: number; remainingQuantity: number }
  | { ok: false; issue: 'LEDGER_CONFLICT' } {
  const directNegativeQuantity = new Map<number, number>();
  for (const entry of entries) {
    if (entry.quantityDelta >= 0 || entry.sourceEntryId === null) continue;
    directNegativeQuantity.set(
      entry.sourceEntryId,
      (directNegativeQuantity.get(entry.sourceEntryId) ?? 0) + entry.quantityDelta
    );
  }
  const candidates = entries
    .filter(entry => entry.type === 'EARNING' || entry.type === 'REASSIGNMENT_EARNING')
    .map(entry => ({
      entryId: entry.id,
      employeeId: entry.employeeId,
      remainingQuantity: entry.quantityDelta + (directNegativeQuantity.get(entry.id) ?? 0)
    }))
    .filter(entry => entry.remainingQuantity > 0);
  return candidates.length === 1 ? { ok: true, ...candidates[0] } : { ok: false, issue: 'LEDGER_CONFLICT' };
}
