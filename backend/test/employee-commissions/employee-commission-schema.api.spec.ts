import { afterAll, describe, expect, it } from 'vitest';
import { prismaTest } from '../helpers/database';

type NamedRow = { name: string };

describe('employee commission persistence schema', () => {
  afterAll(async () => {
    await prismaTest.$disconnect();
  });

  it('creates every ledger table in the dedicated test database', async () => {
    const rows = await prismaTest.$queryRaw<NamedRow[]>`
      SELECT TABLE_NAME AS name
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'CommissionPlan',
          'CommissionPlanEmployee',
          'CommissionRule',
          'CommissionSaleBasis',
          'CommissionBasisResolution',
          'CommissionRecognitionIssue',
          'CommissionEntry',
          'CommissionPayrollAllocation'
        )
      ORDER BY TABLE_NAME
    `;

    expect(rows.map((row) => row.name.toLowerCase())).toEqual([
      'commissionbasisresolution',
      'commissionentry',
      'commissionpayrollallocation',
      'commissionplan',
      'commissionplanemployee',
      'commissionrecognitionissue',
      'commissionrule',
      'commissionsalebasis'
    ]);
  });

  it('enforces idempotency and return uniqueness in MySQL', async () => {
    const rows = await prismaTest.$queryRaw<NamedRow[]>`
      SELECT DISTINCT INDEX_NAME AS name
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (
          (TABLE_NAME = 'CommissionEntry' AND INDEX_NAME IN (
            'CommissionEntry_eventKey_key',
            'CommissionEntry_orderReturnLineId_type_key'
          ))
          OR
          (TABLE_NAME = 'CommissionPayrollAllocation' AND INDEX_NAME = 'CommissionPayrollAllocation_priorEventId_key')
        )
      ORDER BY INDEX_NAME
    `;

    expect(rows.map((row) => row.name)).toEqual([
      'CommissionEntry_eventKey_key',
      'CommissionEntry_orderReturnLineId_type_key',
      'CommissionPayrollAllocation_priorEventId_key'
    ]);
  });
});
