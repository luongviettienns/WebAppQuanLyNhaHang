import type { CashbookPaymentMethod } from '../../api/cashbook';

export function isCashbookAccountSelectionSatisfied(activated: boolean, method: CashbookPaymentMethod, accountId: number | null): boolean {
  return !activated || (method === 'CASH' && !accountId) || accountId !== null;
}
