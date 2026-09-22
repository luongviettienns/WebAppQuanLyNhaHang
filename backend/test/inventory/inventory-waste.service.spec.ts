import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryWasteService } from '../../src/modules/inventory/inventory-waste.service';
import { prismaTest, truncateAllTables } from '../helpers/database';
import * as socket from '../../src/lib/socket';

const inventoryEventSpy = vi.spyOn(socket, 'emitToAll');

describe('InventoryWasteService', () => {
  let actor: { id: number; name: string };
  let ingredientId: number;
  let secondIngredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const user = await prismaTest.user.create({
      data: { username: 'waste_service_admin', passwordHash: 'hash', name: 'Quản lý xuất hủy', role: 'ADMIN' }
    });
    actor = { id: user.id, name: user.name };
  });

  beforeEach(async () => {
    await prismaTest.auditLog.deleteMany();
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.inventoryWasteLine.deleteMany();
    await prismaTest.inventoryWaste.deleteMany();
    await prismaTest.ingredient.deleteMany();
    inventoryEventSpy.mockClear();

    const [ingredient, secondIngredient] = await Promise.all([
      prismaTest.ingredient.create({
        data: { sku: 'NL-WASTE-SVC-1', name: 'Nguyên liệu hủy 1', unit: 'kg', currentStock: 10, costPerUnit: 12000 }
      }),
      prismaTest.ingredient.create({
        data: { sku: 'NL-WASTE-SVC-2', name: 'Nguyên liệu hủy 2', unit: 'lít', currentStock: 5, costPerUnit: 4000 }
      })
    ]);
    ingredientId = ingredient.id;
    secondIngredientId = secondIngredient.id;
  });

  it('completes a noted draft by reducing stock and creating one negative waste ledger row', async () => {
    const draft = await InventoryWasteService.create({
      note: 'Hàng hỏng trong kho',
      lines: [{ ingredientId, quantity: 2 }]
    }, actor);

    const completed = await InventoryWasteService.complete(draft.id, actor);

    expect(draft).toMatchObject({
      wasteCode: 'XH000001',
      status: 'DRAFT',
      lines: [{
        ingredientId,
        systemQuantity: 10,
        quantity: 2,
        costPerUnit: 12000,
        lineValue: 24000
      }]
    });
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      totalValue: 24000,
      totalQuantity: 2,
      completedByUserId: actor.id
    });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 8 });
    await expect(prismaTest.inventoryTransaction.findFirst({ where: { inventoryWasteId: draft.id } }))
      .resolves.toMatchObject({
        ingredientId,
        type: 'KITCHEN_WASTE',
        quantity: -2,
        costAmount: -24000,
        createdByUserId: actor.id
      });
    expect(inventoryEventSpy).toHaveBeenCalledWith('inventory:changed', expect.objectContaining({
      reason: 'KITCHEN_WASTE',
      sourceIds: [ingredientId]
    }));
    await expect(prismaTest.auditLog.findFirst({ where: { action: 'INVENTORY_WASTE_COMPLETED', targetId: draft.id } }))
      .resolves.toMatchObject({ actorId: actor.id, metadata: expect.objectContaining({ wasteCode: 'XH000001', totalValue: 24000 }) });
  });

  it('requires a note and at least one line before a draft can complete', async () => {
    const missingNote = await InventoryWasteService.create({
      lines: [{ ingredientId, quantity: 1 }]
    }, actor);
    const empty = await InventoryWasteService.create({
      note: 'Không còn dùng được',
      lines: []
    }, actor);

    await expect(InventoryWasteService.complete(missingNote.id, actor))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(InventoryWasteService.complete(empty.id, actor))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
  });

  it('rolls back every line when any wasted quantity exceeds current stock', async () => {
    const draft = await InventoryWasteService.create({
      note: 'Hàng hỏng',
      lines: [
        { ingredientId, quantity: 2 },
        { ingredientId: secondIngredientId, quantity: 6 }
      ]
    }, actor);

    await expect(InventoryWasteService.complete(draft.id, actor))
      .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 10 });
    await expect(prismaTest.ingredient.findUnique({ where: { id: secondIngredientId } }))
      .resolves.toMatchObject({ currentStock: 5 });
    await expect(prismaTest.inventoryTransaction.count({ where: { inventoryWasteId: draft.id } })).resolves.toBe(0);
    await expect(prismaTest.inventoryWaste.findUnique({ where: { id: draft.id } }))
      .resolves.toMatchObject({ status: 'DRAFT', totalValue: 0 });
  });

  it('uses current stock and cost snapshots at completion', async () => {
    const draft = await InventoryWasteService.create({
      note: 'Hàng hết hạn',
      lines: [{ ingredientId, quantity: 2 }]
    }, actor);
    await prismaTest.ingredient.update({
      where: { id: ingredientId },
      data: { currentStock: 9, costPerUnit: 15000 }
    });

    const completed = await InventoryWasteService.complete(draft.id, actor);

    expect(completed).toMatchObject({
      totalValue: 30000,
      lines: [{
        ingredientId,
        systemQuantity: 9,
        quantity: 2,
        costPerUnit: 15000,
        lineValue: 30000
      }]
    });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 7 });
  });

  it('keeps a completed voucher immutable and cancels a draft without ledger rows', async () => {
    const completedDraft = await InventoryWasteService.create({
      note: 'Hàng vỡ',
      lines: [{ ingredientId, quantity: 1 }]
    }, actor);
    await InventoryWasteService.complete(completedDraft.id, actor);

    await expect(InventoryWasteService.update(completedDraft.id, { note: 'Sửa trái phép' }, actor))
      .rejects.toMatchObject({ statusCode: 409 });
    await expect(InventoryWasteService.complete(completedDraft.id, actor))
      .rejects.toMatchObject({ statusCode: 409 });
    await expect(InventoryWasteService.cancel(completedDraft.id, actor))
      .rejects.toMatchObject({ statusCode: 409 });

    const cancelled = await InventoryWasteService.create({
      note: 'Không cần xuất nữa',
      lines: [{ ingredientId, quantity: 1 }]
    }, actor);
    await expect(InventoryWasteService.cancel(cancelled.id, actor))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(prismaTest.inventoryTransaction.count({ where: { inventoryWasteId: cancelled.id } })).resolves.toBe(0);
    await expect(prismaTest.auditLog.findFirst({ where: { action: 'INVENTORY_WASTE_CANCELLED', targetId: cancelled.id } }))
      .resolves.toMatchObject({ actorId: actor.id });
  });
});
