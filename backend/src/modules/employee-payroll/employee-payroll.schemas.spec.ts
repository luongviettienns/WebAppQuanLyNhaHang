import { describe, expect, it } from 'vitest';
import {
  parsePayrollAdjustmentInput,
  parsePayrollBatchId,
  parsePayrollCancelInput,
  parsePayrollCreateInput,
  parsePayrollExportQuery,
  parsePayrollFinalizeInput,
  parsePayrollIdempotencyKey,
  parsePayrollListQuery,
  parsePayrollPaymentInput,
  parsePayrollReasonInput,
  parsePayrollRecalculateInput
} from './employee-payroll.schemas';

describe('employee payroll API contracts', () => {
  it('accepts exact calendar months and normalizes custom employee scope', () => {
    expect(parsePayrollCreateInput({ month: '2028-02', scope: 'ALL' })).toEqual({
      branchId: 1,
      month: '2028-02',
      scope: 'ALL',
      employeeIds: []
    });
    expect(parsePayrollCreateInput({ month: '2026-09', scope: 'CUSTOM', employeeIds: [9, 2, 9] })).toEqual({
      branchId: 1,
      month: '2026-09',
      scope: 'CUSTOM',
      employeeIds: [2, 9]
    });
  });

  it.each(['2026-2', '2026-13', '2026-02-01', ''])('rejects invalid payroll month %j with a stable code', month => {
    expect(() => parsePayrollCreateInput({ month, scope: 'ALL' })).toThrowError(expect.objectContaining({
      statusCode: 400,
      code: 'PAYROLL_PERIOD_INVALID'
    }));
  });

  it('requires at least one employee for custom scope and rejects client totals', () => {
    expect(() => parsePayrollCreateInput({ month: '2026-09', scope: 'CUSTOM', employeeIds: [] })).toThrowError();
    expect(() => parsePayrollCreateInput({
      month: '2026-09', scope: 'ALL', totalGrossAmount: 999_999_999
    })).toThrowError();
  });

  it('parses list filters, route IDs and export format with bounded defaults', () => {
    expect(parsePayrollListQuery({ status: 'DRAFT,FINALIZED', page: '2', pageSize: '25', periodMonth: '2026-09' })).toEqual({
      branchId: 1,
      status: ['DRAFT', 'FINALIZED'],
      page: 2,
      pageSize: 25,
      periodMonth: '2026-09'
    });
    expect(parsePayrollBatchId('12')).toBe(12);
    expect(parsePayrollExportQuery({ format: 'xlsx' })).toEqual({ format: 'xlsx' });
    expect(() => parsePayrollBatchId('0')).toThrowError();
    expect(() => parsePayrollListQuery({ periodMonth: '2026-00' })).toThrowError(expect.objectContaining({ code: 'PAYROLL_PERIOD_INVALID' }));
  });

  it('accepts only empty recalculate/finalize bodies', () => {
    expect(parsePayrollRecalculateInput({})).toEqual({});
    expect(parsePayrollFinalizeInput({})).toEqual({});
    expect(() => parsePayrollFinalizeInput({ totalNetAmount: 1 })).toThrowError();
  });

  it('requires positive integer adjustment and payment amounts', () => {
    expect(parsePayrollAdjustmentInput({ type: 'BONUS', amount: 150_000, reason: 'Thưởng hiệu suất' })).toEqual({
      type: 'BONUS', amount: 150_000, reason: 'Thưởng hiệu suất'
    });
    expect(parsePayrollPaymentInput({ amount: 500_000, method: 'BANK_TRANSFER', externalReference: 'PAY-001' })).toEqual({
      amount: 500_000, method: 'BANK_TRANSFER', externalReference: 'PAY-001'
    });
    for (const amount of [0, -1, 1.5]) {
      expect(() => parsePayrollAdjustmentInput({ type: 'DEDUCTION', amount, reason: 'Điều chỉnh' })).toThrowError();
      expect(() => parsePayrollPaymentInput({ amount, method: 'CASH' })).toThrowError();
    }
  });

  it('requires auditable reasons for cancel and reversal operations', () => {
    expect(parsePayrollCancelInput({ reason: 'Tạo nhầm kỳ lương' })).toEqual({ reason: 'Tạo nhầm kỳ lương' });
    expect(parsePayrollReasonInput({ reason: 'Đảo giao dịch sai' })).toEqual({ reason: 'Đảo giao dịch sai' });
    expect(() => parsePayrollCancelInput({ reason: '  ' })).toThrowError();
    expect(() => parsePayrollReasonInput({})).toThrowError();
  });

  it('accepts retry identities up to 128 safe characters and rejects reuse-shaped garbage', () => {
    const maxKey = 'a'.repeat(128);
    expect(parsePayrollIdempotencyKey(maxKey)).toBe(maxKey);
    expect(() => parsePayrollIdempotencyKey('a'.repeat(129))).toThrowError();
    expect(() => parsePayrollIdempotencyKey('contains spaces')).toThrowError();
    expect(() => parsePayrollIdempotencyKey('short')).toThrowError();
  });
});
