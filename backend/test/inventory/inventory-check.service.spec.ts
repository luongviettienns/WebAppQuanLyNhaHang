import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryCheckService } from '../../src/modules/inventory/inventory-check.service';
import { prismaTest, truncateAllTables } from '../helpers/database';
import * as socket from '../../src/lib/socket';

const inventoryEventSpy = vi.spyOn(socket, 'emitToAll');

describe('InventoryCheckService', () => {
  let actor: { id: number; name: string };
  let ingredientId: number;
  let secondIngredientId: number;

  beforeAll(async () => {
    await truncateAllTables();
    const user = await prismaTest.user.create({
      data: { username: 'stocktake_service_admin', passwordHash: 'hash', name: 'Quản lý kiểm kho', role: 'ADMIN' }
    });
    actor = { id: user.id, name: user.name };
  });

  beforeEach(async () => {
    await prismaTest.auditLog.deleteMany();
    await prismaTest.inventoryTransaction.deleteMany();
    await prismaTest.inventoryCheckLine.deleteMany();
    await prismaTest.inventoryCheck.deleteMany();
    await prismaTest.ingredient.deleteMany();
    inventoryEventSpy.mockClear();

    const [ingredient, secondIngredient] = await Promise.all([
      prismaTest.ingredient.create({ data: { sku: 'NL-CHECK-1', name: 'Nguyên liệu kiểm 1', unit: 'kg', currentStock: 10, costPerUnit: 12000 } }),
      prismaTest.ingredient.create({ data: { sku: 'NL-CHECK-2', name: 'Nguyên liệu kiểm 2', unit: 'lít', currentStock: 5, costPerUnit: 4000 } })
    ]);
    ingredientId = ingredient.id;
    secondIngredientId = secondIngredient.id;
  });

  async function createDraft(actualQuantity: number | null = null) {
    return InventoryCheckService.create({
      note: 'Kiểm kho test',
      lines: [{ ingredientId, actualQuantity }]
    }, actor);
  }

  it('creates a draft with ingredient snapshots without changing stock or ledger', async () => {
    const draft = await createDraft();

    expect(draft).toMatchObject({ checkCode: 'KK000001', status: 'DRAFT', note: 'Kiểm kho test' });
    expect(draft.lines[0]).toMatchObject({
      ingredientId,
      ingredientSku: 'NL-CHECK-1',
      ingredientName: 'Nguyên liệu kiểm 1',
      unit: 'kg',
      systemQuantity: 10,
      actualQuantity: null,
      costPerUnit: 12000
    });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 10, costPerUnit: 12000 });
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
  });

  it('balances signed differences atomically and emits one inventory event after commit', async () => {
    const draft = await createDraft(7.5);

    const balanced = await InventoryCheckService.balance(draft.id, actor);

    expect(balanced.status).toBe('BALANCED');
    expect(balanced.lines[0]).toMatchObject({ varianceQuantity: -2.5, varianceValue: -30000 });
    await expect(prismaTest.ingredient.findUnique({ where: { id: ingredientId } }))
      .resolves.toMatchObject({ currentStock: 7.5 });
    await expect(prismaTest.inventoryTransaction.findFirst({ where: { inventoryCheckId: draft.id } }))
      .resolves.toMatchObject({ ingredientId, type: 'MANUAL_ADJUST', quantity: -2.5, costAmount: -30000 });
    expect(inventoryEventSpy).toHaveBeenCalledWith('inventory:changed', expect.objectContaining({
      reason: 'MANUAL_ADJUST',
      sourceIds: [ingredientId]
    }));
    await expect(prismaTest.auditLog.findFirst({ where: { action: 'INVENTORY_CHECK_BALANCED' } }))
      .resolves.toMatchObject({ targetId: draft.id, actorId: actor.id });
  });

  it('treats zero as checked and does not create a zero adjustment ledger row', async () => {
    const draft = await createDraft(0);
    const balanced = await InventoryCheckService.balance(draft.id, actor);

    expect(balanced.status).toBe('BALANCED');
    expect(balanced.lines[0]).toMatchObject({ actualQuantity: 0, varianceQuantity: -10, varianceValue: -120000 });
    await expect(prismaTest.inventoryTransaction.count({ where: { inventoryCheckId: draft.id } })).resolves.toBe(1);
  });

  it('rejects an unchecked line and leaves the draft unchanged', async () => {
    const draft = await createDraft(null);

    await expect(InventoryCheckService.balance(draft.id, actor)).rejects.toMatchObject({ statusCode: 400 });
    await expect(prismaTest.inventoryCheck.findUnique({ where: { id: draft.id } }))
      .resolves.toMatchObject({ status: 'DRAFT' });
    await expect(prismaTest.inventoryTransaction.count()).resolves.toBe(0);
  });

  it('rejects stale stock and rolls back all lines without creating ledger rows', async () => {
    const draft = await InventoryCheckService.create({
      lines: [
        { ingredientId, actualQuantity: 9 },
        { ingredientId: secondIngredientId, actualQuantity: 4 }
      ]
    }, actor);
    await prismaTest.ingredient.update({ where: { id: ingredientId }, data: { currentStock: 11 } });

    await expect(InventoryCheckService.balance(draft.id, actor)).rejects.toMatchObject({ statusCode: 409 });
    await expect(prismaTest.inventoryCheck.findUnique({ where: { id: draft.id } }))
      .resolves.toMatchObject({ status: 'DRAFT' });
    await expect(prismaTest.inventoryTransaction.count({ where: { inventoryCheckId: draft.id } })).resolves.toBe(0);
    await expect(prismaTest.ingredient.findUnique({ where: { id: secondIngredientId } }))
      .resolves.toMatchObject({ currentStock: 5 });
  });

  it('does not apply a second balance to a terminal draft', async () => {
    const draft = await createDraft(9);
    await InventoryCheckService.balance(draft.id, actor);

    await expect(InventoryCheckService.balance(draft.id, actor)).rejects.toMatchObject({ statusCode: 409 });
    await expect(prismaTest.inventoryTransaction.count({ where: { inventoryCheckId: draft.id } })).resolves.toBe(1);
  });
});
