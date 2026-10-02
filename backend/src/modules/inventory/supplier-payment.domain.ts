export function calculateSupplierOutstanding(input: {
  receiptsPayable: number;
  successfulPayments: number;
  returnsPayable: number;
  supplierRefunds: number;
}): number {
  const values = Object.values(input);
  if (!values.every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error('Số liệu công nợ nhà cung cấp không hợp lệ');
  }
  const debtReductionFromReturns = input.returnsPayable - input.supplierRefunds;
  return Math.max(0, input.receiptsPayable - input.successfulPayments - debtReductionFromReturns);
}
