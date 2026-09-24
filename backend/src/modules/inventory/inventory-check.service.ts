import { InventoryCheckStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import { emitInventoryChanged } from './inventory.events';
import {
  calculateInventoryCheckLine,
  summarizeInventoryCheck
} from './inventory-check.math';
import {
  CreateInventoryCheckInput,
  InventoryCheckListQuery,
  UpdateInventoryCheckInput
} from './inventory-check.schemas';
import {
  InventoryCheckExportRow,
  parseInventoryCheckExcelBuffer,
  serializeInventoryCheckCsv,
  serializeInventoryCheckWorkbook
} from './inventory-check.export';
import {
  InventoryCheckActor,
  InventoryCheckDto,
  InventoryCheckImportPreviewDto,
  InventoryCheckListDataDto
} from './inventory-check.types';

const CHECK_CODE_RETRY_LIMIT = 2;
const checkInclude = { lines: { orderBy: { id: 'asc' as const } } } satisfies Prisma.InventoryCheckInclude;
type CheckRecord = Prisma.InventoryCheckGetPayload<{ include: typeof checkInclude }>;
type TransactionClient = Prisma.TransactionClient;

function formatCheckCode(sequence: number): string {
  return `KK${sequence.toString().padStart(6, '0')}`;
}

async function generateNextCheckCode(tx: TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextCodeNumber: bigint | number | string | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING(checkCode, 3) AS UNSIGNED)), 0) + 1 AS nextCodeNumber
    FROM InventoryCheck
    WHERE checkCode REGEXP '^KK[0-9]+$'
  `;
  const sequence = Number(rows[0]?.nextCodeNumber ?? 1);
  return formatCheckCode(Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 1);
}

function isCheckCodeConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some(value => typeof value === 'string' && value.toLowerCase().includes('checkcode'));
}

function checkWhere(query: InventoryCheckListQuery): Prisma.InventoryCheckWhereInput {
  const where: Prisma.InventoryCheckWhereInput = {};
  if (query.statuses?.length) where.status = { in: query.statuses };
  if (query.from || query.to) {
    const countedAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      const from = new Date(query.from);
      from.setHours(0, 0, 0, 0);
      countedAt.gte = from;
    }
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      countedAt.lte = to;
    }
    where.countedAt = countedAt;
  }
  if (query.search) where.checkCode = { contains: query.search.trim() };
  return where;
}

function summaryForLines(lines: Array<{ systemQuantity: number; actualQuantity: number | null; costPerUnit: number; varianceQuantity?: number | null; varianceValue?: number | null }>) {
  return summarizeInventoryCheck(lines.map(line => ({
    systemQuantity: line.systemQuantity,
    actualQuantity: line.actualQuantity,
    costPerUnit: line.costPerUnit
  })));
}

function toDto(check: CheckRecord, recentChecks?: InventoryCheckDto[]): InventoryCheckDto {
  const summary = summaryForLines(check.lines);
  return {
    id: check.id,
    checkCode: check.checkCode,
    status: check.status,
    countedAt: check.countedAt,
    balancedAt: check.balancedAt,
    note: check.note,
    createdByUserId: check.createdByUserId,
    balancedByUserId: check.balancedByUserId,
    cancelledByUserId: check.cancelledByUserId,
    cancelledAt: check.cancelledAt,
    createdAt: check.createdAt,
    updatedAt: check.updatedAt,
    ...summary,
    lines: check.lines.map(line => ({
      id: line.id,
      ingredientId: line.ingredientId,
      ingredientSku: line.ingredientSku,
      ingredientName: line.ingredientName,
      unit: line.unit,
      systemQuantity: line.systemQuantity,
      actualQuantity: line.actualQuantity,
      varianceQuantity: line.varianceQuantity,
      costPerUnit: line.costPerUnit,
      varianceValue: line.varianceValue
    })),
    ...(recentChecks ? { recentChecks } : {})
  };
}

async function snapshotLines(tx: TransactionClient, input: CreateInventoryCheckInput['lines']) {
  if (input.length === 0) return [];
  const ingredients = await tx.ingredient.findMany({
    where: { id: { in: input.map(line => line.ingredientId) }, isActive: true }
  });
  const byId = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
  return input.map(line => {
    const ingredient = byId.get(line.ingredientId);
    if (!ingredient) throw ApiError.badRequest(`Nguyên liệu ID ${line.ingredientId} không tồn tại hoặc đã ngừng hoạt động`);
    return {
      ingredientId: ingredient.id,
      ingredientSku: ingredient.sku,
      ingredientName: ingredient.name,
      unit: ingredient.unit,
      systemQuantity: ingredient.currentStock,
      actualQuantity: line.actualQuantity ?? null,
      varianceQuantity: null,
      costPerUnit: ingredient.costPerUnit,
      varianceValue: null
    };
  });
}

async function requireDraft(id: number): Promise<never> {
  const check = await prisma.inventoryCheck.findUnique({ where: { id }, select: { status: true } });
  if (!check) throw ApiError.notFound('Phiếu kiểm kho không tồn tại');
  throw ApiError.conflict('Chỉ phiếu tạm mới có thể thực hiện thao tác này');
}

function toExportRow(check: CheckRecord): InventoryCheckExportRow {
  const summary = summaryForLines(check.lines);
  return {
    checkCode: check.checkCode,
    countedAt: check.countedAt,
    balancedAt: check.balancedAt,
    totalVarianceValue: summary.totalVarianceValue,
    increasedQuantity: summary.increasedQuantity,
    decreasedQuantity: summary.decreasedQuantity,
    note: check.note ?? '',
    status: check.status
  };
}

export class InventoryCheckService {
  static async list(query: InventoryCheckListQuery): Promise<InventoryCheckListDataDto> {
    if (query.from && query.to && query.from > query.to) throw ApiError.badRequest('Khoảng thời gian lọc không hợp lệ');
    const where = checkWhere(query);
    const skip = (query.page - 1) * query.pageSize;
    const [totalRows, checks, allChecks] = await Promise.all([
      prisma.inventoryCheck.count({ where }),
      prisma.inventoryCheck.findMany({ where, skip, take: query.pageSize, include: checkInclude, orderBy: [{ countedAt: 'desc' }, { id: 'desc' }] }),
      prisma.inventoryCheck.findMany({ where, include: checkInclude, orderBy: [{ countedAt: 'desc' }, { id: 'desc' }] })
    ]);
    const summaries = allChecks.map(check => summaryForLines(check.lines));
    return {
      items: checks.map(check => toDto(check)),
      pagination: { page: query.page, pageSize: query.pageSize, totalRows, totalPages: Math.max(1, Math.ceil(totalRows / query.pageSize)) },
      totalVarianceValue: summaries.reduce((sum, item) => sum + item.totalVarianceValue, 0),
      increasedQuantity: summaries.reduce((sum, item) => sum + item.increasedQuantity, 0),
      decreasedQuantity: summaries.reduce((sum, item) => sum + item.decreasedQuantity, 0)
    };
  }

  static async export(query: InventoryCheckListQuery, format: 'csv' | 'xlsx'): Promise<Buffer> {
    if (query.from && query.to && query.from > query.to) throw ApiError.badRequest('Khoảng thời gian lọc không hợp lệ');
    const checks = await prisma.inventoryCheck.findMany({ where: checkWhere(query), include: checkInclude, orderBy: [{ countedAt: 'desc' }, { id: 'desc' }] });
    const rows = checks.map(toExportRow);
    return format === 'csv' ? serializeInventoryCheckCsv(rows) : serializeInventoryCheckWorkbook(rows);
  }

  static async getById(id: number): Promise<InventoryCheckDto> {
    const check = await prisma.inventoryCheck.findUnique({ where: { id }, include: checkInclude });
    if (!check) throw ApiError.notFound('Phiếu kiểm kho không tồn tại');
    const recent = await prisma.inventoryCheck.findMany({
      where: { id: { not: id } }, include: checkInclude,
      orderBy: [{ countedAt: 'desc' }, { id: 'desc' }], take: 5
    });
    return toDto(check, recent.map(item => toDto(item)));
  }

  static async create(input: CreateInventoryCheckInput, actor: InventoryCheckActor): Promise<InventoryCheckDto> {
    let lastError: unknown;
    for (let attempt = 0; attempt < CHECK_CODE_RETRY_LIMIT; attempt += 1) {
      try {
        const check = await prisma.$transaction(async tx => {
          const lines = await snapshotLines(tx, input.lines);
          const checkCode = await generateNextCheckCode(tx);
          return tx.inventoryCheck.create({
            data: { checkCode, note: input.note ?? null, createdByUserId: actor.id, lines: { create: lines } },
            include: checkInclude
          });
        });
        const dto = toDto(check);
        await AuditService.log({ action: 'INVENTORY_CHECK_CREATED', targetType: 'InventoryCheck', targetId: dto.id, actorId: actor.id, actorName: actor.name, metadata: { checkCode: dto.checkCode, lineCount: dto.lines.length } });
        return dto;
      } catch (error) {
        if (!isCheckCodeConflict(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw ApiError.conflict('Không thể tạo mã phiếu kiểm kho tự động, vui lòng thử lại');
    throw ApiError.internal();
  }

  static async update(id: number, input: UpdateInventoryCheckInput, actor: InventoryCheckActor): Promise<InventoryCheckDto> {
    const check = await prisma.$transaction(async tx => {
      const current = await tx.inventoryCheck.findUnique({ where: { id }, include: checkInclude });
      if (!current) throw ApiError.notFound('Phiếu kiểm kho không tồn tại');
      if (current.status !== InventoryCheckStatus.DRAFT) throw ApiError.conflict('Chỉ phiếu tạm mới có thể cập nhật');
      const lines = input.lines === undefined
        ? current.lines.map(line => ({ ingredientId: line.ingredientId, ingredientSku: line.ingredientSku, ingredientName: line.ingredientName, unit: line.unit, systemQuantity: line.systemQuantity, actualQuantity: line.actualQuantity, varianceQuantity: line.varianceQuantity, costPerUnit: line.costPerUnit, varianceValue: line.varianceValue }))
        : await snapshotLines(tx, input.lines);
      await tx.inventoryCheck.update({ where: { id }, data: { note: input.note, lines: input.lines === undefined ? undefined : { deleteMany: {}, create: lines } } });
      const updated = await tx.inventoryCheck.findUnique({ where: { id }, include: checkInclude });
      if (!updated) throw ApiError.notFound('Phiếu kiểm kho không tồn tại');
      return updated;
    });
    const dto = toDto(check);
    await AuditService.log({ action: 'INVENTORY_CHECK_UPDATED', targetType: 'InventoryCheck', targetId: dto.id, actorId: actor.id, actorName: actor.name, metadata: { checkCode: dto.checkCode, updatedFields: Object.keys(input) } });
    return dto;
  }

  static async balance(id: number, actor: InventoryCheckActor): Promise<InventoryCheckDto> {
    const outcome: { check: CheckRecord; ingredientIds: number[] } = await prisma.$transaction(async tx => {
      const current = await tx.inventoryCheck.findUnique({ where: { id }, include: checkInclude });
      if (!current) throw ApiError.notFound('Phiếu kiểm kho không tồn tại');
      if (current.status !== InventoryCheckStatus.DRAFT) throw ApiError.conflict('Chỉ phiếu tạm mới có thể cân bằng kho');
      if (current.lines.some(line => line.actualQuantity === null)) throw ApiError.badRequest('Cần nhập đủ số lượng thực tế trước khi hoàn thành');
      if (current.lines.length === 0) throw ApiError.badRequest('Phiếu kiểm kho cần ít nhất một dòng hàng');

      const ingredientIds = [...new Set(current.lines.map(line => line.ingredientId))].sort((a, b) => a - b);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM Ingredient WHERE id IN (${Prisma.join(ingredientIds)}) ORDER BY id FOR UPDATE`);
      const ingredients = await tx.ingredient.findMany({ where: { id: { in: ingredientIds } } });
      const byId = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
      for (const line of current.lines) {
        const ingredient = byId.get(line.ingredientId);
        if (!ingredient) throw ApiError.badRequest(`Nguyên liệu '${line.ingredientName}' không còn tồn tại`);
        if (ingredient.currentStock !== line.systemQuantity) throw ApiError.conflict(`Tồn kho của '${line.ingredientName}' đã thay đổi, vui lòng tạo phiếu kiểm kho mới`);
      }

      const ingredientIdsChanged: number[] = [];
      for (const line of current.lines) {
        const actualQuantity = line.actualQuantity as number;
        const result = calculateInventoryCheckLine({ systemQuantity: line.systemQuantity, actualQuantity, costPerUnit: line.costPerUnit });
        await tx.inventoryCheckLine.update({ where: { id: line.id }, data: { varianceQuantity: result.varianceQuantity, varianceValue: result.varianceValue } });
        if (result.varianceQuantity !== 0) {
          ingredientIdsChanged.push(line.ingredientId);
          await tx.ingredient.update({ where: { id: line.ingredientId }, data: { currentStock: actualQuantity } });
          await tx.inventoryTransaction.create({ data: { ingredientId: line.ingredientId, inventoryCheckId: id, type: 'MANUAL_ADJUST', quantity: result.varianceQuantity, costAmount: result.varianceValue, note: `Kiểm kho ${current.checkCode}`, createdByUserId: actor.id } });
        }
      }
      const claimed = await tx.inventoryCheck.updateMany({ where: { id, status: InventoryCheckStatus.DRAFT }, data: { status: InventoryCheckStatus.BALANCED, balancedAt: new Date(), balancedByUserId: actor.id } });
      if (claimed.count !== 1) throw ApiError.conflict('Phiếu kiểm kho đã được xử lý bởi người khác');
      const balanced = await tx.inventoryCheck.findUnique({ where: { id }, include: checkInclude });
      if (!balanced) throw ApiError.notFound('Phiếu kiểm kho không tồn tại');
      return { check: balanced, ingredientIds: ingredientIdsChanged };
    });
    const dto = toDto(outcome.check);
    await AuditService.log({ action: 'INVENTORY_CHECK_BALANCED', targetType: 'InventoryCheck', targetId: dto.id, actorId: actor.id, actorName: actor.name, metadata: { checkCode: dto.checkCode, totalVarianceValue: dto.totalVarianceValue, lineCount: dto.lines.length } });
    emitInventoryChanged({ sourceType: 'INGREDIENT', sourceIds: outcome.ingredientIds, reason: 'MANUAL_ADJUST', updatedAt: dto.updatedAt.toISOString() });
    return dto;
  }

  static async cancel(id: number, actor: InventoryCheckActor): Promise<InventoryCheckDto> {
    const updated = await prisma.inventoryCheck.updateMany({ where: { id, status: InventoryCheckStatus.DRAFT }, data: { status: InventoryCheckStatus.CANCELLED, cancelledByUserId: actor.id, cancelledAt: new Date() } });
    if (updated.count !== 1) return requireDraft(id);
    const dto = await this.getById(id);
    await AuditService.log({ action: 'INVENTORY_CHECK_CANCELLED', targetType: 'InventoryCheck', targetId: dto.id, actorId: actor.id, actorName: actor.name, metadata: { checkCode: dto.checkCode, lineCount: dto.lines.length } });
    return dto;
  }

  static async previewImport(fileBase64: string, fileName: string): Promise<InventoryCheckImportPreviewDto> {
    let parsedRows;
    try {
      parsedRows = parseInventoryCheckExcelBuffer(Buffer.from(fileBase64, 'base64'));
    } catch (error) {
      throw ApiError.badRequest(error instanceof Error ? error.message : 'File Excel không hợp lệ');
    }
    if (parsedRows.length === 0) throw ApiError.badRequest('File Excel không có dữ liệu hợp lệ để nhập');
    const ingredients = await prisma.ingredient.findMany({ where: { isActive: true }, select: { id: true, sku: true, name: true, unit: true } });
    const bySku = new Map(ingredients.map(ingredient => [ingredient.sku.toUpperCase(), ingredient]));
    const validRows: InventoryCheckImportPreviewDto['validRows'] = [];
    const errorRows: InventoryCheckImportPreviewDto['errorRows'] = [];
    for (const row of parsedRows) {
      const ingredient = bySku.get(row.sku.toUpperCase());
      const common = { rowNumber: row.rowNumber, sku: row.sku, name: row.name, unit: row.unit, actualQuantity: row.actualQuantity };
      if (!ingredient) { errorRows.push({ ...common, error: `Mã nguyên liệu '${row.sku}' không tồn tại hoặc đã ngừng hoạt động` }); continue; }
      if (row.unit && row.unit.toLowerCase() !== ingredient.unit.toLowerCase()) { errorRows.push({ ...common, error: `Đơn vị tính '${row.unit}' không khớp với hệ thống ('${ingredient.unit}')` }); continue; }
      if (!Number.isFinite(row.actualQuantity) || row.actualQuantity < 0) { errorRows.push({ ...common, error: 'Số lượng thực tế phải là số không âm' }); continue; }
      validRows.push({ rowNumber: row.rowNumber, ingredientId: ingredient.id, ingredientSku: ingredient.sku, ingredientName: ingredient.name, unit: ingredient.unit, actualQuantity: row.actualQuantity });
    }
    return { fileName, totalRows: parsedRows.length, validRows, errorRows };
  }
}
