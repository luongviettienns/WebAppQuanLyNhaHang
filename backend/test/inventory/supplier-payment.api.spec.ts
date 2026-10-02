import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';
import { prismaTest, truncateAllTables } from '../helpers/database';

describe('supplier debt payment API', () => {
  let token = '';
  let supplierId = 0;
  let accountId = 0;

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `supplier-payment-admin-${Date.now()}`, passwordHash: 'hash', name: 'Quản lý', role: 'ADMIN' }
    });
    token = jwt.sign({ sub: String(admin.id), username: admin.username, name: admin.name, role: admin.role }, env.JWT_SECRET, {
      algorithm: 'HS256', expiresIn: '1h', issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE
    });
    const supplier = await prismaTest.supplier.create({ data: { code: `NCC-${Date.now()}`, name: 'Nhà cung cấp API' } });
    supplierId = supplier.id;
    const account = await prismaTest.financialAccount.findUniqueOrThrow({ where: { code: 'CASH' } });
    accountId = account.id;
    await prismaTest.financialAccount.update({ where: { id: accountId }, data: { openingBalance: 300_000 } });
    await prismaTest.cashbookSetting.update({ where: { id: 1 }, data: { activatedAt: account.openingAt, activatedByUserId: admin.id } });
    await prismaTest.purchaseReceipt.create({
      data: {
        receiptCode: `PN-${Date.now()}`, supplierId, status: 'POSTED', receivedAt: account.openingAt,
        subtotalAmount: 300_000, discountAmount: 0
      }
    });
  });

  afterAll(() => prismaTest.$disconnect());

  it('records a partial payment once, posts the selected account and safely replays the same request', async () => {
    const submit = () => request(app).post(`/api/inventory/suppliers/${supplierId}/payments`)
      .set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'supplier-pay-api-001')
      .send({ amount: 125_000, paymentMethod: 'CASH', financialAccountId: accountId, note: 'Thanh toán đợt 1' });

    const first = await submit();
    const replay = await submit();

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await prismaTest.supplierPayment.count({ where: { supplierId, status: 'SUCCESS' } })).toBe(1);
    const vouchers = await prismaTest.cashVoucher.findMany({ where: { sourceType: 'SUPPLIER_PAYMENT' } });
    expect(vouchers).toHaveLength(1);
    expect(vouchers[0]).toMatchObject({ direction: 'PAYMENT', amount: 125_000, accountId });
  });
});
