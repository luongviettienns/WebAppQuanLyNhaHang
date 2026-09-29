import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
const migrationPath = path.resolve(process.cwd(), 'prisma/migrations/20260930100000_employee_payroll/migration.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

function modelBody(name: string): string {
  const match = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema);
  return match?.[1] ?? '';
}

describe('employee payroll persistence contract', () => {
  it('defines the approved payroll lifecycle enums and immutable snapshot fields', () => {
    expect(schema).toMatch(/enum PayrollFrequency\s*\{\s*MONTHLY\s*\}/);
    expect(schema).toMatch(/enum PayrollBatchStatus\s*\{[\s\S]*DRAFT[\s\S]*CALCULATED[\s\S]*FINALIZED[\s\S]*CANCELLED[\s\S]*\}/);
    expect(schema).toMatch(/enum PayrollCalculationStatus\s*\{\s*READY\s*REVIEW_REQUIRED\s*\}/);
    expect(schema).toMatch(/enum PayrollAdjustmentType\s*\{\s*BONUS\s*DEDUCTION\s*\}/);
    expect(schema).toMatch(/enum PayrollPaymentStatus\s*\{\s*SUCCESS\s*REVERSED\s*\}/);

    const line = modelBody('EmployeePayrollLine');
    expect(line).toMatch(/warningCodes\s+Json/);
    expect(line).toMatch(/sourceSnapshot\s+Json/);
    expect(line).toMatch(/calculationStatus\s+PayrollCalculationStatus/);
    expect(line).toMatch(/@@unique\(\[payrollBatchId, employeeId\],\s*map:\s*"EmployeePayrollLine_batch_employee_key"/);
  });

  it('relates batches and ledgers to the real branch, users and employee profiles', () => {
    const batch = modelBody('EmployeePayrollBatch');
    expect(batch).toMatch(/branchId\s+Int\s+@default\(1\)/);
    expect(batch).toMatch(/branch\s+Branch\s+@relation/);
    expect(batch).toMatch(/createdBy\s+User\s+@relation\("EmployeePayrollBatchCreator"/);
    expect(batch).toMatch(/@@index\(\[branchId, periodStart, periodEnd, status\]/);

    const line = modelBody('EmployeePayrollLine');
    expect(line).toMatch(/employee\s+Employee\s+@relation/);
    expect(line).toMatch(/payrollBatch\s+EmployeePayrollBatch\s+@relation/);

    const payment = modelBody('EmployeePayrollPayment');
    expect(payment).toMatch(/payrollBatch\s+EmployeePayrollBatch\s+@relation/);
    expect(payment).toMatch(/payrollLine\s+EmployeePayrollLine\s+@relation/);
    expect(payment).toMatch(/employee\s+Employee\s+@relation/);
  });

  it('keeps adjustments, payments and idempotency append-only and indexed', () => {
    expect(modelBody('EmployeePayrollAdjustment')).toMatch(/reversedAt\s+DateTime\?/);
    expect(modelBody('EmployeePayrollAdjustment')).toMatch(/reverseReason\s+String\?/);
    expect(modelBody('EmployeePayrollPayment')).toMatch(/status\s+PayrollPaymentStatus\s+@default\(SUCCESS\)/);
    expect(modelBody('EmployeePayrollPayment')).toMatch(/@@index\(\[payrollLineId, status, paidAt\]/);
    expect(modelBody('EmployeePayrollIdempotency')).toMatch(/@@unique\(\[actorId, operation, idempotencyKey\],\s*map:\s*"EmployeePayrollIdempotency_actor_operation_key"/);
    expect(modelBody('EmployeePayrollIdempotency')).toMatch(/requestDigest\s+String\s+@db\.Char\(64\)/);
    expect(modelBody('EmployeePayrollIdempotency')).toMatch(/response\s+Json/);
  });

  it('ships one additive migration with restrictive payroll foreign keys and MAIN compatibility', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';
    expect(sql).toMatch(/CREATE TABLE `EmployeePayrollBatch`/);
    expect(sql).toMatch(/CREATE TABLE `EmployeePayrollLine`/);
    expect(sql).toMatch(/CREATE TABLE `EmployeePayrollAdjustment`/);
    expect(sql).toMatch(/CREATE TABLE `EmployeePayrollPayment`/);
    expect(sql).toMatch(/CREATE TABLE `EmployeePayrollIdempotency`/);
    expect(sql).toMatch(/`branchId` INTEGER NOT NULL DEFAULT 1/);
    expect(sql).toMatch(/EmployeePayrollLine_batch_employee_key/);
    expect(sql).toMatch(/EmployeePayrollIdempotency_actor_operation_key/);
    expect(sql).not.toMatch(/\b(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i);
    expect(sql).not.toMatch(/ON\s+DELETE\s+CASCADE/i);
  });
});
