import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20261001120000_cashbook_foundation/migration.sql'
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const reversalMigrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20261002120000_cashbook_reversal_categories/migration.sql'
);
const reversalMigration = existsSync(reversalMigrationPath) ? readFileSync(reversalMigrationPath, 'utf8') : '';
const models = Prisma.dmmf.datamodel.models;

function model(name: string) {
  const found = models.find(candidate => candidate.name === name);
  if (!found) throw new Error(`Missing Prisma model ${name}`);
  return found;
}

function field(modelName: string, fieldName: string) {
  return model(modelName).fields.find(candidate => candidate.name === fieldName);
}

describe('cashbook schema and forward migration contract', () => {
  it('defines the global ledger models without adding branch scope', () => {
    for (const name of ['FinancialAccount', 'CashFlowCategory', 'FinancialParty', 'CashbookSetting', 'CashVoucher']) {
      expect(model(name).fields.map(candidate => candidate.name)).not.toHaveLength(0);
    }
    expect(field('FinancialAccount', 'branchId')).toBeUndefined();
    expect(schema).not.toMatch(/model\s+(FinancialAccount|CashVoucher)[\s\S]*?branchId\s/);
  });

  it('keeps source, manual retry and reversal idempotency keys unique', () => {
    const voucher = model('CashVoucher');
    expect(field('CashVoucher', 'sourceKey')?.isUnique).toBe(true);
    expect(field('CashVoucher', 'reversalOfId')?.isUnique).toBe(true);
    expect(voucher.uniqueFields).toContainEqual(['createdByUserId', 'clientRequestId']);
    expect(field('CashVoucher', 'sourceTransactionId')?.type).toBe('Int');
  });

  it('maps voucher foreign keys to account, category, creator and optional source invoice', () => {
    expect(field('CashVoucher', 'account')).toMatchObject({
      kind: 'object', type: 'FinancialAccount', relationFromFields: ['accountId']
    });
    expect(field('CashVoucher', 'category')).toMatchObject({
      kind: 'object', type: 'CashFlowCategory', relationFromFields: ['categoryId']
    });
    expect(field('CashVoucher', 'createdBy')).toMatchObject({
      kind: 'object', type: 'User', relationFromFields: ['createdByUserId']
    });
    expect(migration).toContain('CashVoucher_accountId_fkey');
    expect(migration).toContain('CashVoucher_categoryId_fkey');
    expect(migration).toContain('CashVoucher_createdByUserId_fkey');
    expect(migration).toContain('CashVoucher_linkedPurchaseReceiptId_fkey');
    expect(migration).toContain('CashVoucher_reversalOfId_fkey');
  });

  it('supports all source event types and E_WALLET in each persisted payment field', () => {
    const sourceTypes = Prisma.dmmf.datamodel.enums.find(value => value.name === 'CashVoucherSourceType')?.values.map(value => value.name);
    expect(sourceTypes).toEqual(expect.arrayContaining([
      'MANUAL', 'RESERVATION_DEPOSIT', 'RESERVATION_REFUND', 'ORDER_PAYMENT', 'SALES_RETURN_REFUND',
      'PURCHASE_RECEIPT_PAYMENT', 'SUPPLIER_PAYMENT', 'PURCHASE_RETURN_REFUND', 'PAYROLL_PAYMENT', 'REVERSAL'
    ]));
    const paymentMethodValues = Prisma.dmmf.datamodel.enums.find(value => value.name === 'PaymentMethod')?.values.map(value => value.name);
    expect(paymentMethodValues).toContain('E_WALLET');
    expect(field('Order', 'paymentMethod')?.type).toBe('PaymentMethod');
    expect(field('OrderPaymentTransaction', 'paymentMethod')?.type).toBe('PaymentMethod');
    expect(field('ReservationDepositTransaction', 'paymentMethod')?.type).toBe('PaymentMethod');
    expect(field('OrderReturn', 'refundMethod')?.type).toBe('PaymentMethod');
    for (const [table, column] of [
      ['Order', 'paymentMethod'],
      ['OrderPaymentTransaction', 'paymentMethod'],
      ['ReservationDepositTransaction', 'paymentMethod'],
      ['OrderReturn', 'refundMethod']
    ]) {
      expect(migration).toContain(`ALTER TABLE \`${table}\``);
      expect(migration).toContain(`MODIFY \`${column}\` ENUM('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'E_WALLET')`);
    }
  });

  it('creates the default cash account, inactive cutover setting and protected categories additively', () => {
    expect(migration).toContain('CREATE TABLE `FinancialAccount`');
    expect(migration).toContain('CREATE TABLE `CashFlowCategory`');
    expect(migration).toContain('CREATE TABLE `CashbookSetting`');
    expect(migration).toContain('CREATE TABLE `CashVoucher`');
    expect(migration).toContain('CREATE TABLE `FinancialParty`');
    expect(migration).toContain('INSERT INTO `FinancialAccount`');
    expect(migration).toContain('Tiền mặt');
    expect(migration).toContain('INSERT INTO `CashFlowCategory`');
    expect(migration).toContain('activatedAt` DATETIME(3) NULL');
    expect(migration).toContain('UNIQUE INDEX `CashVoucher_sourceKey_key`');
    expect(migration).toContain('UNIQUE INDEX `CashVoucher_reversalOfId_key`');
    expect(migration).toContain('UNIQUE INDEX `CashVoucher_createdByUserId_clientRequestId_key`');
    expect(migration).not.toMatch(/`updatedAt` DATETIME\(3\) NOT NULL DEFAULT/i);
    expect(migration).not.toMatch(/\b(DROP TABLE|TRUNCATE TABLE|DELETE FROM)\b/i);
  });

  it('extends every current payment method column with E_WALLET in the forward migration', () => {
    const columns = [
      ['Order', 'paymentMethod'],
      ['OrderPaymentTransaction', 'paymentMethod'],
      ['ReservationDepositTransaction', 'paymentMethod'],
      ['OrderReturn', 'refundMethod']
    ];
    for (const [table, column] of columns) {
      const statement = migration.split(';').find(value =>
        value.includes(`ALTER TABLE \`${table}\``) && value.includes(`MODIFY \`${column}\``)
      );
      expect(statement).toContain("'E_WALLET'");
    }
  });

  it('seeds direction-correct system categories for visible reversal vouchers', () => {
    expect(reversalMigration).toContain("('REVERSAL_RECEIPT', 'Đảo phiếu chi', 'RECEIPT'");
    expect(reversalMigration).toContain("('REVERSAL_PAYMENT', 'Đảo phiếu thu', 'PAYMENT'");
  });
});
