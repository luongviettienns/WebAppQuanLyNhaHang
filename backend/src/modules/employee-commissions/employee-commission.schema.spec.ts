import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
const migrationPath = path.resolve(process.cwd(), 'prisma/migrations/20261001100000_employee_commissions/migration.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

function modelBody(name: string): string {
  return new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)?.[1] ?? '';
}

describe('employee commission persistence contract', () => {
  it('defines the approved plan, rule, issue, ledger and allocation enums', () => {
    expect(schema).toMatch(/enum CommissionPlanStatus\s*\{\s*DRAFT\s*ACTIVE\s*ARCHIVED\s*\}/);
    expect(schema).toMatch(/enum CommissionRuleType\s*\{\s*FIXED_PER_UNIT\s*PERCENT_NET_REVENUE\s*PERCENT_GROSS_PROFIT\s*\}/);
    expect(schema).toMatch(/enum CommissionEntryType\s*\{[\s\S]*EARNING[\s\S]*RETURN_REVERSAL[\s\S]*REASSIGNMENT_REVERSAL[\s\S]*REASSIGNMENT_EARNING[\s\S]*\}/);
    expect(schema).toMatch(/enum CommissionPayrollAllocationEventType\s*\{\s*RESERVED\s*FINALIZED\s*RELEASED\s*\}/);
  });

  it('adds nullable operational assignment without making it the financial source', () => {
    const orderItem = modelBody('OrderItem');
    expect(orderItem).toMatch(/commissionEmployeeId\s+Int\?/);
    expect(orderItem).toMatch(/commissionEmployee\s+Employee\?/);
    expect(orderItem).toMatch(/commissionSaleBasis\s+CommissionSaleBasis\?/);
    expect(orderItem).toMatch(/@@index\(\[commissionEmployeeId, orderId\]\)/);
  });

  it('keeps one immutable sale basis per order item with historical cost and rule candidates', () => {
    const basis = modelBody('CommissionSaleBasis');
    expect(basis).toMatch(/eventKey\s+String\s+@unique/);
    expect(basis).toMatch(/orderItemId\s+Int\s+@unique/);
    expect(basis).toMatch(/costStatus\s+CommissionCostStatus/);
    expect(basis).toMatch(/bomSnapshot\s+Json\?/);
    expect(basis).toMatch(/ruleCandidatesSnapshot\s+Json/);
    expect(basis).toMatch(/commissionEmployeeIdAtPayment\s+Int\?/);
    expect(modelBody('CommissionBasisResolution')).toMatch(/eventKey\s+String\s+@unique/);
  });

  it('models append-only ownership entries and one return reversal per return line', () => {
    const entry = modelBody('CommissionEntry');
    expect(entry).toMatch(/eventKey\s+String\s+@unique/);
    expect(entry).toMatch(/originalEntryId\s+Int\?/);
    expect(entry).toMatch(/sourceEntryId\s+Int\?/);
    expect(entry).toMatch(/quantityDelta\s+Int/);
    expect(entry).toMatch(/commissionAmountDelta\s+Int/);
    expect(entry).toMatch(/@@unique\(\[orderReturnLineId, type\]/);
  });

  it('stores operational issues and append-only payroll allocation events', () => {
    const issue = modelBody('CommissionRecognitionIssue');
    expect(issue).toMatch(/orderItemId\s+Int\s+@unique/);
    expect(issue).toMatch(/resolutionCode\s+String\?/);
    expect(issue).toMatch(/diagnostic\s+Json\?/);

    const allocation = modelBody('CommissionPayrollAllocation');
    expect(allocation).toMatch(/allocationKey\s+String/);
    expect(allocation).toMatch(/type\s+CommissionPayrollAllocationEventType/);
    expect(allocation).toMatch(/priorEventId\s+Int\?\s+@unique/);
    expect(allocation).toMatch(/allocatedAmount\s+Int/);
  });

  it('extends payroll snapshots without hiding deferred negative commission', () => {
    expect(modelBody('EmployeePayrollBatch')).toMatch(/totalCommissionAmount\s+Int\s+@default\(0\)/);
    expect(modelBody('EmployeePayrollBatch')).toMatch(/totalCommissionDeferredDebitAmount\s+Int\s+@default\(0\)/);
    expect(modelBody('EmployeePayrollLine')).toMatch(/commissionAmount\s+Int\s+@default\(0\)/);
    expect(modelBody('EmployeePayrollLine')).toMatch(/commissionDeferredDebitAmount\s+Int\s+@default\(0\)/);
  });

  it('ships an additive migration with the ledger uniqueness constraints', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';
    expect(sql).toMatch(/CREATE TABLE `CommissionSaleBasis`/);
    expect(sql).toMatch(/CREATE TABLE `CommissionEntry`/);
    expect(sql).toMatch(/CREATE TABLE `CommissionPayrollAllocation`/);
    expect(sql).toMatch(/CommissionEntry_orderReturnLineId_type_key/);
    expect(sql).toMatch(/CommissionPayrollAllocation_priorEventId_key/);
    expect(sql).not.toMatch(/\b(DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\b/i);
  });
});
