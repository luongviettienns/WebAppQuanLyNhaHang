import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prismaTest, validateTestEnvironment } from '../helpers/database';

// Verify the actual MySQL migration without truncating or keeping fixture data.
async function withRollback(check: (tx: Prisma.TransactionClient, suffix: string) => Promise<void>) {
  const rollback = new Error('rollback purchase receipt schema fixture');
  try {
    await prismaTest.$transaction(async tx => {
      await check(tx, randomUUID());
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe('Purchase receipt schema on MySQL', () => {
  beforeAll(() => validateTestEnvironment());
  afterAll(() => prismaTest.$disconnect());

  it('persists an empty draft with no supplier and zero amounts', () => withRollback(async (tx, suffix) => {
    const draft = await tx.purchaseReceipt.create({
      data: { receiptCode: `PN-${suffix}`, receivedAt: new Date(), note: 'a'.repeat(1000) },
      include: { lines: true }
    });
    expect(draft).toMatchObject({
      status: 'DRAFT', supplierId: null, subtotalAmount: 0, discountAmount: 0, paidAmount: 0,
      postedAt: null, cancelledAt: null, lines: []
    });
    expect(draft.note).toHaveLength(1000);
  }));

  it('enforces case-insensitive unique supplier codes and unique receipt codes', () => withRollback(async (tx, suffix) => {
    const supplier = await tx.supplier.create({
      data: { code: `NCC-${suffix}`, name: 'Nhà cung cấp thử', note: 'a'.repeat(1000), address: 'a'.repeat(255) }
    });
    expect(supplier.isActive).toBe(true);
    await expect(tx.supplier.create({ data: { code: supplier.code.toLowerCase(), name: 'Trùng' } }))
      .rejects.toMatchObject({ code: 'P2002' });
    const data = { receiptCode: `PN-${suffix}`, receivedAt: new Date(), supplierId: supplier.id };
    await tx.purchaseReceipt.create({ data });
    await expect(tx.purchaseReceipt.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    await expect(tx.supplier.delete({ where: { id: supplier.id } })).rejects.toMatchObject({ code: 'P2003' });
  }));

  it('retains ingredient snapshots and prevents duplicate ingredients within a receipt', () => withRollback(async (tx, suffix) => {
    const ingredient = await tx.ingredient.create({ data: { sku: `ING-${suffix}`, name: 'Gạo', unit: 'kg' } });
    const receipt = await tx.purchaseReceipt.create({ data: { receiptCode: `PN-${suffix}`, receivedAt: new Date() } });
    const data = {
      purchaseReceiptId: receipt.id, ingredientId: ingredient.id, ingredientSku: ingredient.sku,
      ingredientName: ingredient.name, unit: ingredient.unit, quantity: 0.5, unitCost: 10000
    };
    const line = await tx.purchaseReceiptLine.create({ data });
    await expect(tx.purchaseReceiptLine.create({ data })).rejects.toMatchObject({ code: 'P2002' });
    await tx.ingredient.update({ where: { id: ingredient.id }, data: { name: 'Gạo mới' } });
    expect(await tx.purchaseReceiptLine.findUnique({ where: { id: line.id } }))
      .toMatchObject({ ingredientName: 'Gạo', quantity: 0.5, discountAmount: 0 });
    await expect(tx.ingredient.delete({ where: { id: ingredient.id } })).rejects.toMatchObject({ code: 'P2003' });
    // Removing a draft at DB level must not leave orphaned lines. No delete API is introduced.
    await tx.purchaseReceipt.delete({ where: { id: receipt.id } });
    expect(await tx.purchaseReceiptLine.findUnique({ where: { id: line.id } })).toBeNull();
  }));

  it('keeps legacy transactions valid and protects receipts referenced by the ledger', () => withRollback(async (tx, suffix) => {
    const ingredient = await tx.ingredient.create({ data: { sku: `ING-${suffix}`, name: 'Gạo', unit: 'kg' } });
    const legacy = await tx.inventoryTransaction.create({ data: { ingredientId: ingredient.id, type: 'STOCK_IN', quantity: 1 } });
    expect(legacy.purchaseReceiptId).toBeNull();
    const receipt = await tx.purchaseReceipt.create({ data: { receiptCode: `PN-${suffix}`, receivedAt: new Date() } });
    await tx.inventoryTransaction.create({ data: {
      ingredientId: ingredient.id, type: 'STOCK_IN', quantity: 2, costAmount: 20000, purchaseReceiptId: receipt.id
    } });
    await expect(tx.purchaseReceipt.delete({ where: { id: receipt.id } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await tx.inventoryTransaction.findUnique({ where: { id: legacy.id } }))
      .toMatchObject({ purchaseReceiptId: null, quantity: 1 });
  }));
});
