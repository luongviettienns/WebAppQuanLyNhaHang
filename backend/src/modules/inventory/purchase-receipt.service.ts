import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { emitInventoryChanged } from './inventory.events';
import { calculateNewWeightedAverageCost } from './inventory.math';
import { calculatePurchaseReceiptTotals } from './purchase-receipt.math';
import {
  CreatePurchaseReceiptInput,
  PurchaseReceiptLineInput,
  PurchaseReceiptListQuery,
  UpdatePurchaseReceiptInput
} from './purchase-receipt.schemas';
import {
  PurchaseReceiptActor,
  PurchaseReceiptDto,
  PurchaseReceiptListDataDto
} from './purchase-receipt.types';

const RECEIPT_CODE_PREFIX = 'PN';
const RECEIPT_CODE_RETRY_LIMIT = 2;

const receiptInclude = {
  supplier: { select: { id: true, code: true, name: true, isActive: true } },
  lines: { orderBy: { id: 'asc' as const } }
} satisfies Prisma.PurchaseReceiptInclude;

type ReceiptRecord = Prisma.PurchaseReceiptGetPayload<{ include: typeof receiptInclude }>;
type TransactionClient = Prisma.TransactionClient;

function formatReceiptCode(sequence: number): string {
  return `${RECEIPT_CODE_PREFIX}${sequence.toString().padStart(6, '0')}`;
}

async function generateNextReceiptCode(tx: TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextCodeNumber: bigint | number | string | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING(receiptCode, 3) AS UNSIGNED)), 0) + 1 AS nextCodeNumber
    FROM PurchaseReceipt
    WHERE receiptCode REGEXP '^PN[0-9]+$'
  `;
  const sequence = Number(rows[0]?.nextCodeNumber ?? 1);
  return formatReceiptCode(Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1);
}

function isReceiptCodeConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some(value => typeof value === 'string' && value.toLowerCase().includes('receiptcode'));
}

function calculateTotals(lines: ReadonlyArray<{ quantity: number; unitCost: number; discountAmount: number }>, discountAmount: number, paidAmount: number) {
  try {
    return calculatePurchaseReceiptTotals({ lines, discountAmount, paidAmount });
  } catch (error) {
    throw ApiError.badRequest(error instanceof Error ? error.message : 'Giá trị phiếu nhập không hợp lệ');
  }
}

function calculateLineAmount(line: { quantity: number; unitCost: number; discountAmount: number }): number {
  return calculateTotals([line], 0, 0).subtotalAmount;
}

function toReceiptDto(receipt: ReceiptRecord): PurchaseReceiptDto {
  const totals = calculateTotals(receipt.lines, receipt.discountAmount, receipt.paidAmount);
  return {
    id: receipt.id,
    receiptCode: receipt.receiptCode,
    supplierId: receipt.supplierId,
    supplier: receipt.supplier,
    receivedAt: receipt.receivedAt,
    invoiceNumber: receipt.invoiceNumber,
    invoiceDate: receipt.invoiceDate,
    status: receipt.status,
    subtotalAmount: receipt.subtotalAmount,
    discountAmount: receipt.discountAmount,
    payableAmount: totals.payableAmount,
    paidAmount: receipt.paidAmount,
    outstandingAmount: totals.outstandingAmount,
    note: receipt.note,
    createdByUserId: receipt.createdByUserId,
    postedByUserId: receipt.postedByUserId,
    postedAt: receipt.postedAt,
    cancelledByUserId: receipt.cancelledByUserId,
    cancelledAt: receipt.cancelledAt,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    lines: receipt.lines.map(line => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientSku: line.ingredientSku,
      ingredientName: line.ingredientName,
      unit: line.unit,
      quantity: line.quantity,
      unitCost: line.unitCost,
      discountAmount: line.discountAmount,
      lineAmount: calculateLineAmount(line),
      note: line.note
    }))
  };
}

async function requireActiveSupplier(tx: TransactionClient, supplierId: number): Promise<void> {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, isActive: true }, select: { id: true } });
  if (!supplier) throw ApiError.badRequest('Nhà cung cấp không tồn tại hoặc đã ngừng hoạt động');
}

async function snapshotLines(tx: TransactionClient, lines: PurchaseReceiptLineInput[]) {
  if (lines.length === 0) return [];
  const ingredients = await tx.ingredient.findMany({
    where: { id: { in: lines.map(line => line.ingredientId) }, isActive: true }
  });
  const ingredientById = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
  return lines.map(line => {
    const ingredient = ingredientById.get(line.ingredientId);
    if (!ingredient) throw ApiError.badRequest(`Nguyên liệu ID ${line.ingredientId} không tồn tại hoặc đã ngừng hoạt động`);
    return {
      ingredientId: ingredient.id,
      ingredientSku: ingredient.sku,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      quantity: line.quantity,
      unitCost: line.unitCost,
      discountAmount: line.discountAmount,
      note: line.note ?? null
    };
  });
}

async function getTransitionFailure(id: number): Promise<never> {
  const receipt = await prisma.purchaseReceipt.findUnique({ where: { id }, select: { status: true } });
  if (!receipt) throw ApiError.notFound('Phiếu nhập không tồn tại');
  throw ApiError.conflict('Chỉ phiếu tạm mới có thể thực hiện thao tác này');
}

export class PurchaseReceiptService {
  static async list(query: PurchaseReceiptListQuery): Promise<PurchaseReceiptListDataDto> {
    const skip = (query.page - 1) * query.pageSize;
    const [totalRows, receipts, totals] = await Promise.all([
      prisma.purchaseReceipt.count(),
      prisma.purchaseReceipt.findMany({
        skip,
        take: query.pageSize,
        include: receiptInclude,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }]
      }),
      prisma.purchaseReceipt.aggregate({ _sum: { subtotalAmount: true, discountAmount: true } })
    ]);
    return {
      items: receipts.map(toReceiptDto),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalRows,
        totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize))
      },
      totalPayableAmount: (totals._sum.subtotalAmount ?? 0) - (totals._sum.discountAmount ?? 0)
    };
  }

  static async getById(id: number): Promise<PurchaseReceiptDto> {
    const receipt = await prisma.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
    if (!receipt) throw ApiError.notFound('Phiếu nhập không tồn tại');
    return toReceiptDto(receipt);
  }

  static async create(input: CreatePurchaseReceiptInput, actor: PurchaseReceiptActor): Promise<PurchaseReceiptDto> {
    let lastError: unknown;
    for (let attempt = 0; attempt < RECEIPT_CODE_RETRY_LIMIT; attempt += 1) {
      try {
        const receipt = await prisma.$transaction(async tx => {
          if (input.supplierId !== null) await requireActiveSupplier(tx, input.supplierId);
          const lines = await snapshotLines(tx, input.lines);
          const totals = calculateTotals(lines, input.discountAmount, input.paidAmount);
          const receiptCode = await generateNextReceiptCode(tx);
          return tx.purchaseReceipt.create({
            data: {
              receiptCode,
              supplierId: input.supplierId,
              receivedAt: input.receivedAt ?? new Date(),
              invoiceNumber: input.invoiceNumber ?? null,
              invoiceDate: input.invoiceDate ?? null,
              subtotalAmount: totals.subtotalAmount,
              discountAmount: input.discountAmount,
              paidAmount: input.paidAmount,
              note: input.note ?? null,
              createdByUserId: actor.id,
              lines: { create: lines }
            },
            include: receiptInclude
          });
        });
        const dto = toReceiptDto(receipt);
        await AuditService.log({
          action: 'PURCHASE_RECEIPT_CREATED', targetType: 'PurchaseReceipt', targetId: dto.id,
          actorId: actor.id, actorName: actor.name,
          metadata: { receiptCode: dto.receiptCode, supplierId: dto.supplierId, subtotalAmount: dto.subtotalAmount, lineCount: dto.lines.length }
        });
        return dto;
      } catch (error) {
        if (!isReceiptCodeConflict(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw ApiError.conflict('Không thể tạo mã phiếu nhập tự động, vui lòng thử lại');
    throw ApiError.internal();
  }

  static async update(id: number, input: UpdatePurchaseReceiptInput, actor: PurchaseReceiptActor): Promise<PurchaseReceiptDto> {
    const receipt = await prisma.$transaction(async tx => {
      const current = await tx.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
      if (!current) throw ApiError.notFound('Phiếu nhập không tồn tại');
      if (current.status !== 'DRAFT') throw ApiError.conflict('Chỉ phiếu tạm mới có thể cập nhật');

      if (input.supplierId !== undefined && input.supplierId !== null) {
        await requireActiveSupplier(tx, input.supplierId);
      }
      const lines = input.lines === undefined
        ? current.lines.map(line => ({
            ingredientId: line.ingredientId,
            ingredientSku: line.ingredientSku,
            ingredientName: line.ingredientName,
            unit: line.unit,
            quantity: line.quantity,
            unitCost: line.unitCost,
            discountAmount: line.discountAmount,
            note: line.note
          }))
        : await snapshotLines(tx, input.lines);
      const discountAmount = input.discountAmount ?? current.discountAmount;
      const paidAmount = input.paidAmount ?? current.paidAmount;
      const totals = calculateTotals(lines, discountAmount, paidAmount);

      const claimed = await tx.purchaseReceipt.updateMany({
        where: { id, status: 'DRAFT' },
        data: {
          supplierId: input.supplierId,
          receivedAt: input.receivedAt,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate,
          subtotalAmount: totals.subtotalAmount,
          discountAmount,
          paidAmount,
          note: input.note
        }
      });
      if (claimed.count !== 1) throw ApiError.conflict('Chỉ phiếu tạm mới có thể cập nhật');

      if (input.lines !== undefined) {
        await tx.purchaseReceiptLine.deleteMany({ where: { purchaseReceiptId: id } });
        if (lines.length > 0) {
          await tx.purchaseReceiptLine.createMany({
            data: lines.map(line => ({ ...line, purchaseReceiptId: id }))
          });
        }
      }
      const updated = await tx.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
      if (!updated) throw ApiError.notFound('Phiếu nhập không tồn tại');
      return updated;
    });
    const dto = toReceiptDto(receipt);
    await AuditService.log({
      action: 'PURCHASE_RECEIPT_UPDATED', targetType: 'PurchaseReceipt', targetId: dto.id,
      actorId: actor.id, actorName: actor.name,
      metadata: {
        receiptCode: dto.receiptCode, supplierId: dto.supplierId, subtotalAmount: dto.subtotalAmount,
        payableAmount: dto.payableAmount, lineCount: dto.lines.length, updatedFields: Object.keys(input)
      }
    });
    return dto;
  }

  static async cancel(id: number, actor: PurchaseReceiptActor): Promise<PurchaseReceiptDto> {
    const updated = await prisma.purchaseReceipt.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'CANCELLED', cancelledByUserId: actor.id, cancelledAt: new Date() }
    });
    if (updated.count !== 1) return getTransitionFailure(id);
    const dto = await this.getById(id);
    await AuditService.log({
      action: 'PURCHASE_RECEIPT_CANCELLED', targetType: 'PurchaseReceipt', targetId: dto.id,
      actorId: actor.id, actorName: actor.name,
      metadata: { receiptCode: dto.receiptCode, supplierId: dto.supplierId, subtotalAmount: dto.subtotalAmount, lineCount: dto.lines.length }
    });
    return dto;
  }

  static async postReceipt(id: number, actor: PurchaseReceiptActor): Promise<PurchaseReceiptDto> {
    let outcome: { receipt: ReceiptRecord; ingredientIds: number[] };
    try {
      outcome = await prisma.$transaction(async tx => {
        const claimed = await tx.purchaseReceipt.updateMany({
          where: { id, status: 'DRAFT' },
          data: { status: 'POSTED', postedByUserId: actor.id, postedAt: new Date() }
        });
        if (claimed.count !== 1) {
          const current = await tx.purchaseReceipt.findUnique({ where: { id }, select: { id: true } });
          if (!current) throw ApiError.notFound('Phiếu nhập không tồn tại');
          throw ApiError.conflict('Chỉ phiếu tạm mới có thể hoàn thành');
        }

        const receipt = await tx.purchaseReceipt.findUnique({ where: { id }, include: receiptInclude });
        if (!receipt) throw ApiError.notFound('Phiếu nhập không tồn tại');
        if (!receipt.supplierId || !receipt.supplier?.isActive) {
          throw ApiError.badRequest('Phiếu nhập cần một nhà cung cấp đang hoạt động');
        }
        if (receipt.lines.length === 0) {
          throw ApiError.badRequest('Phiếu nhập cần ít nhất một nguyên liệu');
        }
        const totals = calculateTotals(receipt.lines, receipt.discountAmount, receipt.paidAmount);
        const ingredientIds = [...new Set(receipt.lines.map(line => line.ingredientId))].sort((left, right) => left - right);

        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM Ingredient
          WHERE id IN (${Prisma.join(ingredientIds)})
          ORDER BY id
          FOR UPDATE
        `);
        const ingredients = await tx.ingredient.findMany({ where: { id: { in: ingredientIds } } });
        const ingredientById = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));

        for (const line of receipt.lines) {
          const ingredient = ingredientById.get(line.ingredientId);
          if (!ingredient) throw ApiError.badRequest(`Nguyên liệu '${line.ingredientName}' không còn tồn tại`);
          if (!ingredient.isActive) throw ApiError.badRequest(`Nguyên liệu '${line.ingredientName}' đã ngừng hoạt động`);
          const lineNetAmount = calculateLineAmount(line);
          const incomingCost = Math.round(lineNetAmount / line.quantity);
          const next = calculateNewWeightedAverageCost({
            currentStock: ingredient.currentStock,
            currentCost: ingredient.costPerUnit,
            incomingQty: line.quantity,
            incomingCost
          });
          await tx.ingredient.update({
            where: { id: ingredient.id },
            data: { currentStock: next.newStock, costPerUnit: next.newCost }
          });
          await tx.inventoryTransaction.create({
            data: {
              ingredientId: ingredient.id,
              purchaseReceiptId: receipt.id,
              type: 'STOCK_IN',
              quantity: line.quantity,
              costAmount: lineNetAmount,
              note: line.note ?? `Nhập theo phiếu ${receipt.receiptCode}`,
              createdByUserId: actor.id
            }
          });
        }

        const posted = await tx.purchaseReceipt.update({
          where: { id },
          data: { subtotalAmount: totals.subtotalAmount },
          include: receiptInclude
        });
        return { receipt: posted, ingredientIds };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        const current = await prisma.purchaseReceipt.findUnique({ where: { id }, select: { status: true } });
        if (current && current.status !== 'DRAFT') throw ApiError.conflict('Chỉ phiếu tạm mới có thể hoàn thành');
      }
      throw error;
    }

    const dto = toReceiptDto(outcome.receipt);
    await AuditService.log({
      action: 'PURCHASE_RECEIPT_POSTED', targetType: 'PurchaseReceipt', targetId: dto.id,
      actorId: actor.id, actorName: actor.name,
      metadata: {
        receiptCode: dto.receiptCode, supplierId: dto.supplierId, subtotalAmount: dto.subtotalAmount,
        payableAmount: dto.payableAmount, paidAmount: dto.paidAmount,
        outstandingAmount: dto.outstandingAmount, lineCount: dto.lines.length
      }
    });
    emitInventoryChanged({
      sourceType: 'INGREDIENT',
      sourceIds: outcome.ingredientIds,
      reason: 'PURCHASE_RECEIPT_POSTED',
      updatedAt: dto.updatedAt.toISOString()
    });
    return dto;
  }
}
