import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseReceiptService } from '../../src/modules/inventory/purchase-receipt.service';
import { prismaTest, truncateAllTables } from '../helpers/database';
import * as socket from '../../src/lib/socket';

const inventoryEventSpy = vi.spyOn(socket, 'emitToAll');

describe('PurchaseReceiptService posting transaction', () => {
  let actor: { id: number; name: string };
  let supplierId: number;
  let ingredientId: number;
  let secondIngredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const user = await prismaTest.user.create({
      data: { username: 'receipt_service_admin', passwordHash: 'hash', name: 'Quản lý phiếu nhập', role: 'ADMIN' }
    });
    actor = { id: user.id, name: user.name };
  });

  beforeEach(async () => {
    await prismaTest.auditLog.deleteMany();
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.purchaseReceiptLine.deleteMany();
    await prismaTest.purchaseReceipt.deleteMany();
    await prismaTest.supplier.deleteMany();
    await prismaTest.ingredient.deleteMany();
    inventoryEventSpy.mockClear();

    const supplier = await prismaTest.supplier.create({ data: { code: 'NCC000100', name: 'Nhà cung cấp Service' } });
    const [ingredient, secondIngredient] = await Promise.all([
      prismaTest.ingredient.create({ data: { sku: 'NL-SVC-1', name: 'Nguyên liệu 1', unit: 'kg', currentStock: 10, costPerUnit: 100 } }),
      prismaTest.ingredient.create({ data: { sku: 'NL-SVC-2', name: 'Nguyên liệu 2', unit: 'lít', currentStock: 5, costPerUnit: 40 } })
    ]);
    supplierId = supplier.id;
    ingredientId = ingredient.id;
    secondIngredientId = secondIngredient.id;
  });

  async function createDraft(input?: {
    supplierId?: number | null;
    discountAmount?: number;
    paidAmount?: number;
    lines?: Array<{ ingredientId: number; quantity: number; unitCost: number; discountAmount?: number }>;
  }) {
    const lines = input?.lines ?? [{ ingredientId, quantity: 3, unitCost: 200, discountAmount: 60 }];
    const ingredients = await prismaTest.ingredient.findMany({ where: { id: { in: lines.map(line => line.ingredientId) } } });
    const byId = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
    return prismaTest.purchaseReceipt.create({
      data: {
        receiptCode: `PN-SVC-${Date.now()}-${Math.random()}`,
        supplierId: input?.supplierId === undefined ? supplierId : input.supplierId,
        receivedAt: new Date('2026-09-21T04:00:00.000Z'),
        discountAmount: input?.discountAmount ?? 50,
        paidAmount: input?.paidAmount ?? 200,
        lines: {
          create: lines.map(line => {
            const ingredient = byId.get(line.ingredientId)!;
            return {
              ingredientId: line.ingredientId,
              ingredientSku: ingredient.sku,
              ingredientName: ingredient.name,
              unit: ingredient.unit,
              quantity: line.quantity,
              unitCost: line.unitCost,
              discountAmount: line.discountAmount ?? 0
            };
          })
        }
      }
    });
  }

  it('posts all lines atomically, updates weighted costs and creates linked ledger entries', async () => {
    const draft = await createDraft({
      lines: [
        { ingredientId, quantity: 3, unitCost: 200, discountAmount: 60 },
        { ingredientId: secondIngredientId, quantity: 2, unitCost: 50 }
      ],
      discountAmount: 50,
      paidAmount: 200
    });

    const posted = await PurchaseReceiptService.postReceipt(draft.id, actor);

    expect(posted).toMatchObject({
      status: 'POSTED', subtotalAmount: 640, discountAmount: 50,
      payableAmount: 590, paidAmount: 200, outstandingAmount: 390,
      postedByUserId: actor.id
    });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 13, costPerUnit: 118 });
    await expect(prismaTest.ingredient.findUnique({ where: { id: secondIngredientId } }))
      .resolves.toMatchObject({ currentStock: 7, costPerUnit: 43 });

    const ledger = await prismaTest.inventoryTransaction.findMany({
      where: { purchaseReceiptId: draft.id }, orderBy: { ingredientId: 'asc' }
    });
    expect(ledger).toHaveLength(2);
    expect(ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredientId, type: 'STOCK_IN', quantity: 3, costAmount: 540, createdByUserId: actor.id }),
      expect.objectContaining({ ingredientId: secondIngredientId, type: 'STOCK_IN', quantity: 2, costAmount: 100, createdByUserId: actor.id })
    ]));
    expect(inventoryEventSpy).toHaveBeenCalledWith('inventory:changed', expect.objectContaining({
      sourceType: 'INGREDIENT',
      sourceIds: [ingredientId, secondIngredientId].sort((left, right) => left - right),
      reason: 'PURCHASE_RECEIPT_POSTED'
    }));
    await expect(prismaTest.auditLog.findFirst({
      where: { action: 'PURCHASE_RECEIPT_POSTED', targetId: draft.id }
    })).resolves.toMatchObject({ metadata: expect.objectContaining({ receiptCode: draft.receiptCode, lineCount: 2, payableAmount: 590 }) });
  });

  it('rejects a second post without increasing stock or duplicating ledger entries', async () => {
    const draft = await createDraft();
    await PurchaseReceiptService.postReceipt(draft.id, actor);

    await expect(PurchaseReceiptService.postReceipt(draft.id, actor))
      .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 13 });
    await expect(prismaTest.inventoryTransaction.count({ where: { purchaseReceiptId: draft.id } })).resolves.toBe(1);
  });

  it('allows only one of two concurrent post commands to change inventory', async () => {
    const draft = await createDraft();
    const results = await Promise.allSettled([
      PurchaseReceiptService.postReceipt(draft.id, actor),
      PurchaseReceiptService.postReceipt(draft.id, actor)
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: { statusCode: 409, code: 'CONFLICT' } });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 13 });
    await expect(prismaTest.inventoryTransaction.count({ where: { purchaseReceiptId: draft.id } })).resolves.toBe(1);
  });

  it('rolls back every stock and ledger change when any ingredient is inactive', async () => {
    const draft = await createDraft({
      lines: [
        { ingredientId, quantity: 3, unitCost: 200, discountAmount: 60 },
        { ingredientId: secondIngredientId, quantity: 2, unitCost: 50 }
      ]
    });
    await prismaTest.ingredient.update({ where: { id: secondIngredientId }, data: { isActive: false } });

    await expect(PurchaseReceiptService.postReceipt(draft.id, actor))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    await expect(prismaTest.purchaseReceipt.findUnique({ where: { id: draft.id } }))
      .resolves.toMatchObject({ status: 'DRAFT' });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 10, costPerUnit: 100 });
    await expect(prismaTest.ingredient.findUnique({ where: { id: secondIngredientId } }))
      .resolves.toMatchObject({ currentStock: 5, costPerUnit: 40 });
    await expect(prismaTest.inventoryTransaction.count({ where: { purchaseReceiptId: draft.id } })).resolves.toBe(0);
    expect(inventoryEventSpy).not.toHaveBeenCalledWith('inventory:changed', expect.anything());
  });

  it('requires an active supplier and at least one line before posting', async () => {
    const withoutSupplier = await createDraft({ supplierId: null });
    await expect(PurchaseReceiptService.postReceipt(withoutSupplier.id, actor))
      .rejects.toMatchObject({ statusCode: 400 });

    const withoutLines = await createDraft({ lines: [], discountAmount: 0, paidAmount: 0 });
    await expect(PurchaseReceiptService.postReceipt(withoutLines.id, actor))
      .rejects.toMatchObject({ statusCode: 400 });

    const inactiveSupplier = await createDraft();
    await prismaTest.supplier.update({ where: { id: supplierId }, data: { isActive: false } });
    await expect(PurchaseReceiptService.postReceipt(inactiveSupplier.id, actor))
      .rejects.toMatchObject({ statusCode: 400 });

    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
    expect(inventoryEventSpy).not.toHaveBeenCalledWith('inventory:changed', expect.anything());
  });

  it('does not let an in-flight draft update write after cancellation claims the receipt', async () => {
    const extraIngredients = Array.from({ length: 150 }, (_, index) => ({
      sku: `NL-RACE-${index.toString().padStart(3, '0')}`,
      name: `Nguyên liệu race ${index}`,
      unit: 'kg',
      currentStock: 0,
      costPerUnit: 0
    }));
    await prismaTest.ingredient.createMany({ data: extraIngredients });
    const ingredients = await prismaTest.ingredient.findMany({
      where: { sku: { startsWith: 'NL-RACE-' } }, orderBy: { id: 'asc' }
    });
    const draft = await createDraft({
      discountAmount: 0,
      paidAmount: 0,
      lines: ingredients.map(ingredient => ({ ingredientId: ingredient.id, quantity: 1, unitCost: 10 }))
    });

    const updatePromise = PurchaseReceiptService.update(draft.id, {
      note: 'Không được ghi sau khi hủy',
      lines: ingredients.map(ingredient => ({
        ingredientId: ingredient.id, quantity: 2, unitCost: 12, discountAmount: 0
      }))
    }, actor);
    await new Promise(resolve => setTimeout(resolve, 1));
    const [updateResult, cancelResult] = await Promise.allSettled([
      updatePromise,
      PurchaseReceiptService.cancel(draft.id, actor)
    ]);

    expect(cancelResult.status).toBe('fulfilled');
    if (updateResult.status === 'fulfilled') {
      expect(updateResult.value.status).toBe('DRAFT');
    } else {
      expect(updateResult.reason).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    }
    await expect(prismaTest.purchaseReceipt.findUnique({ where: { id: draft.id } }))
      .resolves.toMatchObject({ status: 'CANCELLED' });
  });

});
