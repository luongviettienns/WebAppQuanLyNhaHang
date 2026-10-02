import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveTestDatabaseTarget } from '../../scripts/test-database-guard';

const models = Prisma.dmmf.datamodel.models;
const model = (name: string) => {
  const result = models.find((entry) => entry.name === name);
  expect(result, `Generated Prisma model ${name}`).toBeDefined();
  return result!;
};

describe('end-of-day report schema contract', () => {
  it('keeps the receiver nullable without a default and protects its employee history', () => {
    const order = model('Order');
    expect(order.fields.find((field) => field.name === 'receivedByEmployeeId')).toMatchObject({
      type: 'Int', isRequired: false, hasDefaultValue: false
    });
    expect(order.fields.find((field) => field.name === 'receivedByEmployee')).toMatchObject({
      type: 'Employee', relationName: 'OrderReceiver', relationFromFields: ['receivedByEmployeeId'],
      relationToFields: ['id'], relationOnDelete: 'Restrict'
    });
    expect(model('Employee').fields.find((field) => field.name === 'receivedOrders')).toMatchObject({
      type: 'Order', isList: true, relationName: 'OrderReceiver'
    });
  });

  it('retains immutable cancellation snapshots with a unique source key', () => {
    const cancellation = model('OrderItemCancellation');
    for (const name of ['orderId', 'orderItemId', 'menuItemId', 'quantity', 'unitPrice', 'lineAmount']) {
      expect(cancellation.fields.find((field) => field.name === name)).toMatchObject({ type: 'Int', isRequired: true });
    }
    for (const name of ['menuItemSku', 'menuItemName', 'reason']) {
      expect(cancellation.fields.find((field) => field.name === name)).toMatchObject({ type: 'String', isRequired: true });
    }
    expect(cancellation.fields.find((field) => field.name === 'cancelledByUserId')).toMatchObject({ type: 'Int', isRequired: false });
    expect(cancellation.fields.find((field) => field.name === 'cancelledAt')).toMatchObject({ type: 'DateTime', isRequired: true });
    expect(cancellation.fields.find((field) => field.name === 'createdAt')).toMatchObject({ type: 'DateTime', hasDefaultValue: true });
    expect(cancellation.fields.find((field) => field.name === 'sourceKey')).toMatchObject({ type: 'String', isRequired: true, isUnique: true });
    expect(cancellation.fields.some((field) => field.isUpdatedAt || field.name === 'updatedAt')).toBe(false);
    for (const [name, type, from] of [
      ['order', 'Order', 'orderId'], ['orderItem', 'OrderItem', 'orderItemId'],
      ['menuItem', 'MenuItem', 'menuItemId'], ['cancelledByUser', 'User', 'cancelledByUserId'],
      ['inventoryWaste', 'InventoryWaste', 'inventoryWasteId']
    ]) {
      expect(cancellation.fields.find((field) => field.name === name)).toMatchObject({
        type, relationFromFields: [from], relationOnDelete: 'Restrict'
      });
    }
  });

  it('exposes cancellation provenance and preparation and inventory snapshot enums', () => {
    const expectedEnums = {
      OrderItemCancellationSource: ['ORDER_VOID', 'ITEM_CANCEL'],
      CancellationPreparationState: ['NOT_STARTED', 'PREPARING', 'READY', 'UNKNOWN'],
      CancellationInventoryEffect: ['NONE', 'RESTORED', 'WASTE_RECORDED']
    };
    for (const [name, values] of Object.entries(expectedEnums)) {
      expect(Prisma.dmmf.datamodel.enums.find((entry) => entry.name === name)?.values.map((value) => value.name)).toEqual(values);
    }
    const cancellation = model('OrderItemCancellation');
    for (const [name, type] of [
      ['source', 'OrderItemCancellationSource'], ['orderStatusSnapshot', 'OrderStatus'],
      ['preparationStateSnapshot', 'CancellationPreparationState'], ['inventoryEffect', 'CancellationInventoryEffect']
    ]) {
      expect(cancellation.fields.find((field) => field.name === name)).toMatchObject({ type, kind: 'enum', isRequired: true });
    }
  });

  it('ships additive SQL without backfilling or overwriting existing history', () => {
    const sql = readFileSync(path.resolve('prisma/migrations/20261008120000_end_of_day_report_foundation/migration.sql'), 'utf8');
    const statements = sql.replace(/--[^\n]*/g, '').split(';').map((statement) => statement.trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(statement).toMatch(/^(?:CREATE (?:TABLE|(?:UNIQUE )?INDEX)|ALTER TABLE)/i);
      const ddl = statement.replace(/ON (?:DELETE|UPDATE) (?:RESTRICT|CASCADE)/gi, '');
      expect(ddl).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE|UPDATE|RENAME|MODIFY|CHANGE|REPLACE)\b/i);
    }
  });
});

// Metadata tests always run. DB acceptance requires the explicitly provisioned
// isolated target; this file never loads .env or falls back to DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)('isolated migrated schema', () => {
  let prisma: PrismaClient;
  let databaseName: string;
  beforeAll(() => {
    const target = resolveTestDatabaseTarget(process.env);
    databaseName = target.databaseName;
    prisma = new PrismaClient({ datasources: { db: { url: target.url } } });
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  it('creates a nullable receiver column without a default', async () => {
    const columns = await prisma.$queryRaw<Array<{ IS_NULLABLE: string; COLUMN_DEFAULT: string | null }>>`
      SELECT IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ${databaseName} AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'receivedByEmployeeId'`;
    expect(columns).toEqual([{ IS_NULLABLE: 'YES', COLUMN_DEFAULT: null }]);
  });

  it('installs restrict foreign keys for receiver and all cancellation history references', async () => {
    const keys = await prisma.$queryRaw<Array<{ TABLE_NAME: string; COLUMN_NAME: string; REFERENCED_TABLE_NAME: string; DELETE_RULE: string }>>`
      SELECT k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, r.DELETE_RULE
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
      ON k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME = r.CONSTRAINT_NAME
      WHERE k.TABLE_SCHEMA = ${databaseName} AND
        (k.TABLE_NAME = 'OrderItemCancellation' OR (k.TABLE_NAME = 'Order' AND k.COLUMN_NAME = 'receivedByEmployeeId'))`;
    const normalizedKeys = keys.map((key) => ({ ...key, TABLE_NAME: key.TABLE_NAME.toLowerCase(), REFERENCED_TABLE_NAME: key.REFERENCED_TABLE_NAME.toLowerCase() }));
    expect(normalizedKeys).toHaveLength(6);
    expect(normalizedKeys).toEqual(expect.arrayContaining([
      { TABLE_NAME: 'Order', COLUMN_NAME: 'receivedByEmployeeId', REFERENCED_TABLE_NAME: 'Employee', DELETE_RULE: 'RESTRICT' },
      ...[['orderId', 'Order'], ['orderItemId', 'OrderItem'], ['menuItemId', 'MenuItem'], ['cancelledByUserId', 'User'], ['inventoryWasteId', 'InventoryWaste']].map(([COLUMN_NAME, REFERENCED_TABLE_NAME]) => ({
        TABLE_NAME: 'OrderItemCancellation', COLUMN_NAME, REFERENCED_TABLE_NAME, DELETE_RULE: 'RESTRICT'
      }))
    ].map((key) => ({ ...key, TABLE_NAME: key.TABLE_NAME.toLowerCase(), REFERENCED_TABLE_NAME: key.REFERENCED_TABLE_NAME.toLowerCase() }))));
  });

  it('installs report indexes and a unique cancellation source key', async () => {
    const indexes = await prisma.$queryRaw<Array<{ TABLE_NAME: string; INDEX_NAME: string; NON_UNIQUE: bigint; columns: string }>>`
      SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ${databaseName} AND TABLE_NAME IN ('Order', 'OrderItemCancellation')
      GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`;
    const normalizedIndexes = indexes.map((index) => ({ ...index, TABLE_NAME: index.TABLE_NAME.toLowerCase() }));
    for (const [TABLE_NAME, columns] of [
      ['Order', 'status,completedAt'], ['Order', 'receivedByEmployeeId,completedAt'],
      ['OrderItemCancellation', 'cancelledAt,orderId'], ['OrderItemCancellation', 'cancelledByUserId,cancelledAt'],
      ['OrderItemCancellation', 'source,orderId']
    ]) expect(normalizedIndexes).toEqual(expect.arrayContaining([expect.objectContaining({ TABLE_NAME: TABLE_NAME.toLowerCase(), columns })]));
    expect(normalizedIndexes.filter((index) => index.TABLE_NAME === 'orderitemcancellation' && index.columns === 'sourceKey'))
      .toEqual([expect.objectContaining({ NON_UNIQUE: 0n })]);
  });
});
