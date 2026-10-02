import { sourceTransactionKey, type CashbookDirection } from './cashbook.domain';

export const cashbookSourceDirections = {
  RESERVATION_DEPOSIT: 'RECEIPT',
  RESERVATION_REFUND: 'PAYMENT',
  ORDER_PAYMENT: 'RECEIPT',
  SALES_RETURN_REFUND: 'PAYMENT',
  PURCHASE_RECEIPT_PAYMENT: 'PAYMENT',
  SUPPLIER_PAYMENT: 'PAYMENT',
  PURCHASE_RETURN_REFUND: 'RECEIPT',
  PAYROLL_PAYMENT: 'PAYMENT'
} as const satisfies Record<string, CashbookDirection>;

export type CashbookSourceType = keyof typeof cashbookSourceDirections;

export interface CashbookSourceEvent {
  sourceType: CashbookSourceType;
  sourceTransactionId: number;
  sourceKey: string;
  direction: CashbookDirection;
}

export function toCashbookSourceReference(input: {
  sourceType: CashbookSourceType;
  sourceTransactionId: number;
}): CashbookSourceEvent {
  return {
    ...input,
    sourceKey: sourceTransactionKey(input.sourceType, input.sourceTransactionId),
    direction: cashbookSourceDirections[input.sourceType]
  };
}
