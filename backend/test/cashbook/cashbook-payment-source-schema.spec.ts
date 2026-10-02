import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
const migrationPath = resolve(__dirname, '../../prisma/migrations/20261003120000_cashbook_payment_sources/migration.sql');
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
const supplierMigrationPath = resolve(__dirname, '../../prisma/migrations/20261005120000_cashbook_supplier_payments/migration.sql');
const supplierMigration = existsSync(supplierMigrationPath) ? readFileSync(supplierMigrationPath, 'utf8') : '';
const payrollMigrationPath = resolve(__dirname, '../../prisma/migrations/20261006120000_cashbook_payroll_links/migration.sql');
const payrollMigration = existsSync(payrollMigrationPath) ? readFileSync(payrollMigrationPath, 'utf8') : '';

describe('cashbook payment source persistence', () => {
  it('stores the receiving account on each immutable successful payment event', () => {
    for (const modelName of ['ReservationDepositTransaction', 'OrderPaymentTransaction']) {
      const model = Prisma.dmmf.datamodel.models.find(model => model.name === modelName);
      expect(model?.fields.find(field => field.name === 'financialAccountId')?.type).toBe('Int');
      expect(model?.fields.find(field => field.name === 'financialAccount')?.type).toBe('FinancialAccount');
      expect(schema).toMatch(new RegExp(`model ${modelName}[\\s\\S]*?financialAccountId\\s+Int\\?`));
    }
  });

  it('adds nullable account references and indexes without deleting existing reservation/order data', () => {
    for (const table of ['ReservationDepositTransaction', 'OrderPaymentTransaction']) {
      expect(migration).toContain(`ALTER TABLE \`${table}\` ADD COLUMN \`financialAccountId\` INTEGER NULL`);
      expect(migration).toContain(`${table}_financialAccountId_fkey`);
    }
    expect(migration).not.toMatch(/\b(DROP TABLE|TRUNCATE TABLE|DELETE FROM)\b/i);
  });

  it('stores immutable supplier settlement transactions and migrates the old receipt-paid snapshot', () => {
    const payment = Prisma.dmmf.datamodel.models.find(model => model.name === 'SupplierPayment');
    expect(payment?.fields.map(field => field.name)).toEqual(expect.arrayContaining([
      'supplierId', 'purchaseReceiptId', 'financialAccountId', 'amount', 'paymentMethod', 'status', 'idempotencyKey'
    ]));
    expect(supplierMigration).toContain('CREATE TABLE `SupplierPayment`');
    expect(supplierMigration).toContain('FROM `PurchaseReceipt`');
    expect(supplierMigration).toContain("`status` = 'POSTED' AND `supplierId` IS NOT NULL AND `paidAmount` > 0");
    expect(supplierMigration).not.toMatch(/\b(DROP TABLE|TRUNCATE TABLE|DELETE FROM)\b/i);
  });

  it('links payroll payments to a financial account and adds its system payment category', () => {
    const payment = Prisma.dmmf.datamodel.models.find(model => model.name === 'EmployeePayrollPayment');
    expect(payment?.fields.find(field => field.name === 'financialAccountId')?.type).toBe('Int');
    expect(payrollMigration).toContain('ALTER TABLE `EmployeePayrollPayment`');
    expect(payrollMigration).toContain("'PAYROLL_PAYMENT', 'Chi trả lương', 'PAYMENT'");
    expect(payrollMigration).not.toMatch(/\b(DROP TABLE|TRUNCATE TABLE|DELETE FROM)\b/i);
  });
});
