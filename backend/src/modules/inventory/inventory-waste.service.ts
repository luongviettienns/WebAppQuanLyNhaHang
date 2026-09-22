import { InventoryWasteStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { emitInventoryChanged } from './inventory.events';
import {
  calculateInventoryWasteLine,
  summarizeInventoryWaste
} from './inventory-waste.math';
import {
  InventoryWasteExportRow,
  parseInventoryWasteExcelBuffer,
  serializeInventoryWasteCsv,
  serializeInventoryWasteWorkbook
} from './inventory-waste.export';
import type {
  CreateInventoryWasteInput,
  InventoryWasteListQuery,
  UpdateInventoryWasteInput
} from './inventory-waste.schemas';
import type {
  InventoryWasteActor,
  InventoryWasteDto,
  InventoryWasteImportPreviewDto,
  InventoryWasteListDataDto
} from './inventory-waste.types';

const WASTE_CODE_RETRY_LIMIT = 2;
const wasteInclude = { lines: { orderBy: { id: 'asc' as const } } } satisfies Prisma.InventoryWasteInclude;
type WasteRecord = Prisma.InventoryWasteGetPayload<{ include: typeof wasteInclude }>;
type TransactionClient = Prisma.TransactionClient;

function formatWasteCode(sequence: number): string {
  return 'XH' + sequence.toString().padStart(6, '0');
}

async function generateNextWasteCode(tx: TransactionClient): Promise<string> {
  const rows = await tx.$queryRawUnsafe<Array<{ nextCodeNumber: bigint | number | string | null }>>(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(wasteCode, 3) AS UNSIGNED)), 0) + 1 AS nextCodeNumber FROM InventoryWaste WHERE wasteCode REGEXP '^XH[0-9]+$'"
  );
  const sequence = Number(rows[0]?.nextCodeNumber ?? 1);
  return formatWasteCode(Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1);
}

function isWasteCodeConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some(value => typeof value === 'string' && value.toLowerCase().includes('wastecode'));
}

function wasteWhere(query: InventoryWasteListQuery): Prisma.InventoryWasteWhereInput {
  const where: Prisma.InventoryWasteWhereInput = {};
  if (query.statuses?.length) where.status = { in: query.statuses };
  if (query.from || query.to) {
    const wastedAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      const from = new Date(query.from);
      from.setHours(0, 0, 0, 0);
      wastedAt.gte = from;
    }
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      wastedAt.lte = to;
    }
    where.wastedAt = wastedAt;
  }
  if (query.search) where.wasteCode = { contains: query.search.trim() };
  return where;
}

function summaryForLines(lines: Array<{ quantity: number; costPerUnit: number }>) {
  return summarizeInventoryWaste(lines.map(line => ({
    quantity: line.quantity,
    costPerUnit: line.costPerUnit
  })));
}

function toDto(waste: WasteRecord, recentWastes?: InventoryWasteDto[]): InventoryWasteDto {
  const summary = summaryForLines(waste.lines);
  return {
    id: waste.id,
    wasteCode: waste.wasteCode,
    status: waste.status,
    wastedAt: waste.wastedAt,
    completedAt: waste.completedAt,
    note: waste.note,
    totalValue: waste.totalValue,
    totalQuantity: summary.totalQuantity,
    createdByUserId: waste.createdByUserId,
    completedByUserId: waste.completedByUserId,
    cancelledByUserId: waste.cancelledByUserId,
    cancelledAt: waste.cancelledAt,
    createdAt: waste.createdAt,
    updatedAt: waste.updatedAt,
    lines: waste.lines.map(line => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientSku: line.ingredientSku,
      ingredientName: line.ingredientName,
      unit: line.unit,
      systemQuantity: line.systemQuantity,
      quantity: line.quantity,
      costPerUnit: line.costPerUnit,
      lineValue: line.lineValue
    })),
    ...(recentWastes ? { recentWastes } : {})
  };
}

function toExportRow(waste: WasteRecord): InventoryWasteExportRow {
  return {
    wasteCode: waste.wasteCode,
    wastedAt: waste.wastedAt,
    creatorName: waste.createdByUserId === null ? '' : 'Người dùng #' + waste.createdByUserId,
    totalValue: waste.totalValue,
    note: waste.note ?? '',
    status: waste.status
  };
}

async function snapshotLines(tx: TransactionClient, lines: CreateInventoryWasteInput['lines']) {
  if (lines.length === 0) return [];
  const ingredients = await tx.ingredient.findMany({
    where: { id: { in: lines.map(line => line.ingredientId) }, isActive: true }
  });
  const byId = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
  return lines.map(line => {
    const ingredient = byId.get(line.ingredientId);
    if (!ingredient) throw ApiError.badRequest('Nguyên liệu ID ' + line.ingredientId + ' không tồn tại hoặc đã ngừng hoạt động');
    const calculated = calculateInventoryWasteLine({ quantity: line.quantity, costPerUnit: ingredient.costPerUnit });
    return {
      ingredientId: ingredient.id,
      ingredientSku: ingredient.sku,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      systemQuantity: ingredient.currentStock,
      quantity: calculated.quantity,
      costPerUnit: calculated.costPerUnit,
      lineValue: calculated.lineValue
    };
  });
}

async function requireDraft(id: number): Promise<never> {
  const waste = await prisma.inventoryWaste.findUnique({ where: { id }, select: { status: true } });
  if (!waste) throw ApiError.notFound('Phiếu xuất hủy không tồn tại');
  throw ApiError.conflict('Chỉ phiếu tạm mới có thể thực hiện thao tác này');
}

export class InventoryWasteService {
  static async list(query: InventoryWasteListQuery): Promise<InventoryWasteListDataDto> {
    if (query.from && query.to && query.from > query.to) throw ApiError.badRequest('Khoảng thời gian lọc không hợp lệ');
    const where = wasteWhere(query);
    const skip = (query.page - 1) * query.pageSize;
    const [totalRows, wastes, allWastes] = await Promise.all([
      prisma.inventoryWaste.count({ where }),
      prisma.inventoryWaste.findMany({ where, skip, take: query.pageSize, include: wasteInclude, orderBy: [{ wastedAt: 'desc' }, { id: 'desc' }] }),
      prisma.inventoryWaste.findMany({ where, include: wasteInclude, orderBy: [{ wastedAt: 'desc' }, { id: 'desc' }] })
    ]);
    return {
      items: wastes.map(waste => toDto(waste)),
      pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)) },
      totalValue: allWastes.reduce((sum, waste) => sum + waste.totalValue, 0)
    };
  }

  static async getById(id: number): Promise<InventoryWasteDto> {
    const waste = await prisma.inventoryWaste.findUnique({ where: { id }, include: wasteInclude });
    if (!waste) throw ApiError.notFound('Phiếu xuất hủy không tồn tại');
    const recent = await prisma.inventoryWaste.findMany({
      where: { id: { not: id } },
      include: wasteInclude,
      orderBy: [{ wastedAt: 'desc' }, { id: 'desc' }],
      take: 5
    });
    return toDto(waste, recent.map(item => toDto(item)));
  }

  static async export(query: InventoryWasteListQuery, format: 'csv' | 'xlsx'): Promise<Buffer> {
    if (query.from && query.to && query.from > query.to) throw ApiError.badRequest('Khoảng thời gian lọc không hợp lệ');
    const wastes = await prisma.inventoryWaste.findMany({
      where: wasteWhere(query),
      include: wasteInclude,
      orderBy: [{ wastedAt: 'desc' }, { id: 'desc' }]
    });
    const rows = wastes.map(toExportRow);
    return format === 'csv' ? serializeInventoryWasteCsv(rows) : serializeInventoryWasteWorkbook(rows);
  }

  static async create(input: CreateInventoryWasteInput, actor: InventoryWasteActor): Promise<InventoryWasteDto> {
    let lastError: unknown;
    for (let attempt = 0; attempt < WASTE_CODE_RETRY_LIMIT; attempt += 1) {
      try {
        const waste = await prisma.$transaction(async tx => {
          const lines = await snapshotLines(tx, input.lines);
          const wasteCode = await generateNextWasteCode(tx);
          return tx.inventoryWaste.create({
            data: { wasteCode, note: input.note ?? null, createdByUserId: actor.id, lines: { create: lines } },
            include: wasteInclude
          });
        });
        const dto = toDto(waste);
        await AuditService.log({
          action: 'INVENTORY_WASTE_CREATED',
          targetType: 'InventoryWaste',
          targetId: dto.id,
          actorId: actor.id,
          actorName: actor.name,
          metadata: { wasteCode: dto.wasteCode, lineCount: dto.lines.length }
        });
        return dto;
      } catch (error) {
        if (!isWasteCodeConflict(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw ApiError.conflict('Không thể tạo mã phiếu xuất hủy tự động, vui lòng thử lại');
    throw ApiError.internal();
  }

  static async update(id: number, input: UpdateInventoryWasteInput, actor: InventoryWasteActor): Promise<InventoryWasteDto> {
    const waste = await prisma.$transaction(async tx => {
      const current = await tx.inventoryWaste.findUnique({ where: { id }, include: wasteInclude });
      if (!current) throw ApiError.notFound('Phiếu xuất hủy không tồn tại');
      if (current.status !== InventoryWasteStatus.DRAFT) throw ApiError.conflict('Chỉ phiếu tạm mới có thể cập nhật');
      const lines = input.lines === undefined
        ? current.lines.map(line => ({
          ingredientId: line.ingredientId,
          ingredientSku: line.ingredientSku,
          ingredientName: line.ingredientName,
          unit: line.unit,
          systemQuantity: line.systemQuantity,
          quantity: line.quantity,
          costPerUnit: line.costPerUnit,
          lineValue: line.lineValue
        }))
        : await snapshotLines(tx, input.lines);
      await tx.inventoryWaste.update({
        where: { id },
        data: {
          note: input.note,
          lines: input.lines === undefined ? undefined : { deleteMany: {}, create: lines }
        }
      });
      const updated = await tx.inventoryWaste.findUnique({ where: { id }, include: wasteInclude });
      if (!updated) throw ApiError.notFound('Phiếu xuất hủy không tồn tại');
      return updated;
    });
    const dto = toDto(waste);
    await AuditService.log({
      action: 'INVENTORY_WASTE_UPDATED',
      targetType: 'InventoryWaste',
      targetId: dto.id,
      actorId: actor.id,
      actorName: actor.name,
      metadata: { wasteCode: dto.wasteCode, updatedFields: Object.keys(input) }
    });
    return dto;
  }

  static async complete(id: number, actor: InventoryWasteActor): Promise<InventoryWasteDto> {
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM InventoryWaste WHERE id = ? FOR UPDATE', id);
      const current = await tx.inventoryWaste.findUnique({ where: { id }, include: wasteInclude });
      if (!current) throw ApiError.notFound('Phiếu xuất hủy không tồn tại');
      if (current.status !== InventoryWasteStatus.DRAFT) throw ApiError.conflict('Chỉ phiếu tạm mới có thể hoàn thành');
      if (current.lines.length === 0) throw ApiError.badRequest('Phiếu xuất hủy cần ít nhất một dòng hàng');
      if (!current.note?.trim()) throw ApiError.badRequest('Cần nhập ghi chú hoặc lý do xuất hủy trước khi hoàn thành');

      const ingredientIds = [...new Set(current.lines.map(line => line.ingredientId))].sort((left, right) => left - right);
      const placeholders = ingredientIds.map(() => '?').join(',');
      await tx.$queryRawUnsafe('SELECT id FROM Ingredient WHERE id IN (' + placeholders + ') ORDER BY id FOR UPDATE', ...ingredientIds);
      const ingredients = await tx.ingredient.findMany({ where: { id: { in: ingredientIds }, isActive: true } });
      const byId = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));

      for (const line of current.lines) {
        const ingredient = byId.get(line.ingredientId);
        if (!ingredient) throw ApiError.badRequest('Nguyên liệu ' + line.ingredientName + ' không còn tồn tại hoặc đã ngừng hoạt động');
        if (line.quantity > ingredient.currentStock) {
          throw ApiError.conflict('Số lượng hủy của ' + line.ingredientName + ' vượt tồn kho hiện tại');
        }
      }

      let totalValue = 0;
      for (const line of current.lines) {
        const ingredient = byId.get(line.ingredientId);
        if (!ingredient) throw ApiError.badRequest('Nguyên liệu không còn tồn tại');
        const calculated = calculateInventoryWasteLine({ quantity: line.quantity, costPerUnit: ingredient.costPerUnit });
        totalValue += calculated.lineValue;
        await tx.inventoryWasteLine.update({
          where: { id: line.id },
          data: {
            systemQuantity: ingredient.currentStock,
            costPerUnit: calculated.costPerUnit,
            lineValue: calculated.lineValue
          }
        });
        await tx.ingredient.update({
          where: { id: line.ingredientId },
          data: { currentStock: { decrement: calculated.quantity } }
        });
        await tx.inventoryTransaction.create({
          data: {
            ingredientId: line.ingredientId,
            inventoryWasteId: id,
            type: 'KITCHEN_WASTE',
            quantity: -calculated.quantity,
            costAmount: -calculated.lineValue,
            note: 'Xuất hủy ' + current.wasteCode,
            createdByUserId: actor.id
          }
        });
      }
      const claimed = await tx.inventoryWaste.updateMany({
        where: { id, status: InventoryWasteStatus.DRAFT },
        data: {
          status: InventoryWasteStatus.COMPLETED,
          totalValue,
          completedAt: new Date(),
          completedByUserId: actor.id
        }
      });
      if (claimed.count !== 1) throw ApiError.conflict('Phiếu xuất hủy đã được xử lý bởi người khác');
      const completed = await tx.inventoryWaste.findUnique({ where: { id }, include: wasteInclude });
      if (!completed) throw ApiError.notFound('Phiếu xuất hủy không tồn tại');
      return { waste: completed, ingredientIds };
    });
    const dto = toDto(outcome.waste);
    await AuditService.log({
      action: 'INVENTORY_WASTE_COMPLETED',
      targetType: 'InventoryWaste',
      targetId: dto.id,
      actorId: actor.id,
      actorName: actor.name,
      metadata: { wasteCode: dto.wasteCode, totalValue: dto.totalValue, lineCount: dto.lines.length }
    });
    emitInventoryChanged({
      sourceType: 'INGREDIENT',
      sourceIds: outcome.ingredientIds,
      reason: 'KITCHEN_WASTE',
      updatedAt: dto.updatedAt.toISOString()
    });
    return dto;
  }

  static async cancel(id: number, actor: InventoryWasteActor): Promise<InventoryWasteDto> {
    const updated = await prisma.inventoryWaste.updateMany({
      where: { id, status: InventoryWasteStatus.DRAFT },
      data: { status: InventoryWasteStatus.CANCELLED, cancelledByUserId: actor.id, cancelledAt: new Date() }
    });
    if (updated.count !== 1) return requireDraft(id);
    const dto = await this.getById(id);
    await AuditService.log({
      action: 'INVENTORY_WASTE_CANCELLED',
      targetType: 'InventoryWaste',
      targetId: dto.id,
      actorId: actor.id,
      actorName: actor.name,
      metadata: { wasteCode: dto.wasteCode, lineCount: dto.lines.length }
    });
    return dto;
  }

  static async previewImport(fileBase64: string, fileName: string): Promise<InventoryWasteImportPreviewDto> {
    let parsedRows;
    try {
      parsedRows = parseInventoryWasteExcelBuffer(Buffer.from(fileBase64, 'base64'));
    } catch (error) {
      throw ApiError.badRequest(error instanceof Error ? error.message : 'File Excel không hợp lệ');
    }
    if (parsedRows.length === 0) throw ApiError.badRequest('File Excel không có dữ liệu hợp lệ để nhập');

    const ingredients = await prisma.ingredient.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, name: true, unit: true, currentStock: true }
    });
    const bySku = new Map(ingredients.map(ingredient => [ingredient.sku.toUpperCase(), ingredient]));
    const validRows: InventoryWasteImportPreviewDto['validRows'] = [];
    const errorRows: InventoryWasteImportPreviewDto['errorRows'] = [];
    const seenSkus = new Set<string>();

    for (const row of parsedRows) {
      const normalizedSku = row.sku.toUpperCase();
      const ingredient = bySku.get(normalizedSku);
      const common = { rowNumber: row.rowNumber, sku: row.sku, name: row.name, unit: row.unit, quantity: row.quantity, note: row.note };
      if (seenSkus.has(normalizedSku)) {
        errorRows.push({ ...common, error: 'Mã nguyên liệu chỉ được xuất hiện một lần trong file' });
        continue;
      }
      seenSkus.add(normalizedSku);
      if (!ingredient) {
        errorRows.push({ ...common, error: 'Mã nguyên liệu ' + row.sku + ' không tồn tại hoặc đã ngừng hoạt động' });
        continue;
      }
      if (row.unit && row.unit.toLowerCase() !== ingredient.unit.toLowerCase()) {
        errorRows.push({ ...common, error: 'Đơn vị tính ' + row.unit + ' không khớp với hệ thống (' + ingredient.unit + ')' });
        continue;
      }
      if (!Number.isFinite(row.quantity) || row.quantity <= 0) {
        errorRows.push({ ...common, error: 'Số lượng hủy phải là số lớn hơn 0' });
        continue;
      }
      if (row.quantity > ingredient.currentStock) {
        errorRows.push({ ...common, error: 'Số lượng hủy vượt tồn kho hiện tại' });
        continue;
      }
      validRows.push({
        rowNumber: row.rowNumber,
        ingredientId: ingredient.id,
        ingredientSku: ingredient.sku,
        ingredientName: ingredient.name,
        unit: ingredient.unit,
        quantity: row.quantity,
        systemQuantity: ingredient.currentStock,
        note: row.note
      });
    }
    return { fileName, totalRows: parsedRows.length, validRows, errorRows };
  }
}
