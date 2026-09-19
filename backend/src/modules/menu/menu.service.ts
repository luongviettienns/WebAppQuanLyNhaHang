import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { emitToAll } from '../../lib/socket';
import { AuditService } from '../audit/audit.service';
import {
  CreateCategoryInput,
  CreateMenuItemInput,
  DeleteCategoryInput,
  MenuExportFormat,
  MenuImportCommitInput,
  MenuImportRowInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
  UpdateMenuItemInput
} from './menu.schemas';
import {
  MenuExportRow,
  MenuImportErrorRow,
  MenuImportRow,
  parseMenuImportBuffer,
  serializeMenuCsv,
  serializeMenuWorkbook
} from './menu.import';

const MENU_SKU_PREFIX = 'SP';
const MENU_SKU_MAX_RETRIES = 3;

type MenuSkuClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

function formatMenuSku(sequence: number) {
  return `${MENU_SKU_PREFIX}${sequence.toString().padStart(6, '0')}`;
}

async function generateNextMenuSku(client: MenuSkuClient) {
  const rows = await client.$queryRaw<Array<{ nextSkuNumber: bigint | number | string | null }>>`
    SELECT COALESCE(MAX(CAST(SUBSTRING(sku, 3) AS UNSIGNED)), 0) + 1 AS nextSkuNumber
    FROM MenuItem
    WHERE sku REGEXP '^SP[0-9]+$'
  `;
  const nextSkuNumber = Number(rows[0]?.nextSkuNumber ?? 1);
  return formatMenuSku(Number.isFinite(nextSkuNumber) && nextSkuNumber > 0 ? nextSkuNumber : 1);
}

function isSkuUniqueConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes('sku') : target === 'sku';
}

export class MenuService {
  static async exportMenu(format: MenuExportFormat): Promise<Buffer> {
    const categories = await prisma.category.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        menuItems: {
          orderBy: { displayOrder: 'asc' }
        }
      }
    });

    const rows: MenuExportRow[] = categories.flatMap(category =>
      category.menuItems.map(item => ({
        sku: item.sku,
        name: item.name,
        categoryName: category.name,
        basePrice: item.basePrice,
        menuType: item.menuType,
        itemType: item.itemType,
        isAvailable: item.isAvailable,
        trackStock: item.trackStock,
        stockQuantity: item.stockQuantity,
        position: item.position,
        description: item.description,
        imageUrl: item.imageUrl
      }))
    );

    return format === 'csv' ? serializeMenuCsv(rows) : serializeMenuWorkbook(rows);
  }

  static async previewMenuImport(buffer: Buffer, fileName: string, createMissingCategories: boolean) {
    const parsed = parseMenuImportBuffer(buffer, fileName);
    const categories = await prisma.category.findMany({ select: { name: true } });
    const categoryNames = new Set(categories.map(category => category.name.trim().toLocaleLowerCase()));
    const errorRows: MenuImportErrorRow[] = [...parsed.errors];
    const validRows: MenuImportRow[] = [];

    parsed.rows.forEach(row => {
      const categoryKey = row.categoryName.trim().toLocaleLowerCase();
      if (!createMissingCategories && !categoryNames.has(categoryKey)) {
        errorRows.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          name: row.name,
          categoryName: row.categoryName,
          error: `Danh mục "${row.categoryName}" không tồn tại`
        });
        return;
      }
      validRows.push(row);
    });

    errorRows.sort((a, b) => a.rowNumber - b.rowNumber);
    return {
      fileName,
      totalRows: parsed.totalRows,
      validRows,
      errorRows,
      canCommit: validRows.length > 0 && errorRows.length === 0
    };
  }

  static async commitMenuImport(input: MenuImportCommitInput, actorId?: number, actorName?: string) {
    const rows: MenuImportRowInput[] = input.rows.map(row => ({
      ...row,
      sku: row.sku?.trim() || undefined,
      name: row.name.trim(),
      categoryName: row.categoryName.trim(),
      position: row.position?.trim() || null,
      description: row.description?.trim() || null,
      imageUrl: row.imageUrl?.trim() || null
    }));
    const details: Record<string, string> = {};
    const skuRows = new Map<string, number[]>();

    rows.forEach(row => {
      if (!row.sku) return;
      const rowNumbers = skuRows.get(row.sku) ?? [];
      rowNumbers.push(row.rowNumber);
      skuRows.set(row.sku, rowNumbers);
    });

    skuRows.forEach((rowNumbers, sku) => {
      if (rowNumbers.length > 1) {
        details[`sku_${sku}`] = `SKU ${sku} bị trùng ở dòng ${rowNumbers.join(', ')}`;
      }
    });

    const categories = await prisma.category.findMany({ select: { id: true, name: true, displayOrder: true } });
    const categoryByName = new Map(categories.map(category => [category.name.trim().toLocaleLowerCase(), category]));
    const missingCategoryNames = new Map<string, string>();
    rows.forEach(row => {
      const categoryKey = row.categoryName.toLocaleLowerCase();
      if (!categoryByName.has(categoryKey)) missingCategoryNames.set(categoryKey, row.categoryName);
    });

    if (missingCategoryNames.size > 0 && !input.createMissingCategories) {
      missingCategoryNames.forEach((categoryName, categoryKey) => {
        details[`category_${categoryKey}`] = `categoryName "${categoryName}" không tồn tại`;
      });
    }

    if (Object.keys(details).length > 0) {
      throw ApiError.badRequest('Dữ liệu import không hợp lệ', details);
    }

    const requestedSkus = rows.flatMap(row => row.sku ? [row.sku] : []);
    const existingItems = requestedSkus.length > 0
      ? await prisma.menuItem.findMany({ where: { sku: { in: requestedSkus } }, select: { id: true, sku: true } })
      : [];
    const existingBySku = new Map(existingItems.map(item => [item.sku, item]));
    rows.forEach(row => {
      if (row.sku && !existingBySku.has(row.sku)) {
        details[`sku_${row.sku}`] = `SKU "${row.sku}" không tồn tại để cập nhật`;
      }
    });

    if (Object.keys(details).length > 0) {
      throw ApiError.badRequest('Dữ liệu import không hợp lệ', details);
    }

    const result = await prisma.$transaction(async tx => {
      const txCategoryByName = new Map(categoryByName);
      let categoryCreatedCount = 0;
      let nextDisplayOrder = categories.reduce((max, category) => Math.max(max, category.displayOrder), -1) + 1;

      if (input.createMissingCategories) {
        for (const [categoryKey, categoryName] of missingCategoryNames) {
          const createdCategory = await tx.category.create({
            data: { name: categoryName, displayOrder: nextDisplayOrder++ }
          });
          txCategoryByName.set(categoryKey, createdCategory);
          categoryCreatedCount += 1;
        }
      }

      let createdCount = 0;
      let updatedCount = 0;

      for (const row of rows) {
        const category = txCategoryByName.get(row.categoryName.toLocaleLowerCase());
        if (!category) {
          throw ApiError.badRequest(`categoryName "${row.categoryName}" không tồn tại`);
        }

        const data = {
          categoryId: category.id,
          name: row.name,
          description: row.description,
          basePrice: row.basePrice,
          imageUrl: row.imageUrl,
          isAvailable: row.isAvailable,
          menuType: row.menuType,
          itemType: row.itemType,
          trackStock: row.trackStock,
          stockQuantity: row.stockQuantity,
          position: row.position
        };

        if (row.sku) {
          const existing = existingBySku.get(row.sku);
          if (!existing) throw ApiError.badRequest(`SKU "${row.sku}" không tồn tại để cập nhật`);
          await tx.menuItem.update({ where: { id: existing.id }, data });
          updatedCount += 1;
        } else {
          const sku = await generateNextMenuSku(tx);
          await tx.menuItem.create({ data: { ...data, sku } });
          createdCount += 1;
        }
      }

      return { createdCount, updatedCount, categoryCreatedCount };
    });

    await AuditService.log({
      action: 'MENU_ITEMS_IMPORTED',
      targetType: 'MenuItem',
      targetId: null,
      actorId,
      actorName,
      metadata: { sourceFileName: input.sourceFileName, ...result }
    });
    emitToAll('menu:changed', { source: 'import', ...result });

    return result;
  }

  static async createCategory(input: CreateCategoryInput, actorId?: number, actorName?: string) {
    const name = input.name.trim();
    const duplicate = await prisma.category.findFirst({ where: { name } });
    if (duplicate) {
      throw ApiError.conflict(`Danh mục "${name}" đã tồn tại`);
    }

    const category = await prisma.category.create({
      data: {
        name,
        displayOrder: input.displayOrder ?? 0
      }
    });

    await AuditService.log({
      action: 'MENU_CATEGORY_CREATED',
      targetType: 'Category',
      targetId: category.id,
      actorId,
      actorName,
      metadata: { name: category.name, displayOrder: category.displayOrder }
    });

    return { category };
  }

  static async updateCategory(id: number, input: UpdateCategoryInput, actorId?: number, actorName?: string) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound(`Danh mục với ID ${id} không tồn tại`);
    }

    const name = input.name?.trim();
    if (name !== undefined) {
      const duplicate = await prisma.category.findFirst({
        where: { name, id: { not: id } }
      });
      if (duplicate) {
        throw ApiError.conflict(`Danh mục "${name}" đã tồn tại`);
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {})
      }
    });

    await AuditService.log({
      action: 'MENU_CATEGORY_UPDATED',
      targetType: 'Category',
      targetId: category.id,
      actorId,
      actorName,
      metadata: {
        name: category.name,
        previousName: existing.name,
        displayOrder: category.displayOrder
      }
    });

    return { category };
  }

  static async deleteCategory(id: number, input: DeleteCategoryInput, actorId?: number, actorName?: string) {
    const result = await prisma.$transaction(async tx => {
      const category = await tx.category.findUnique({
        where: { id },
        include: { menuItems: { select: { id: true } } }
      });
      if (!category) {
        throw ApiError.notFound(`Danh mục với ID ${id} không tồn tại`);
      }

      if (category.menuItems.length > 0 && input.moveToCategoryId === undefined) {
        throw ApiError.conflict('Không thể xóa danh mục đang có món. Hãy chọn danh mục đích để chuyển món trước.');
      }

      if (input.moveToCategoryId !== undefined) {
        if (input.moveToCategoryId === id) {
          throw ApiError.badRequest('Danh mục đích phải khác danh mục đang xóa');
        }

        const destination = await tx.category.findUnique({ where: { id: input.moveToCategoryId } });
        if (!destination) {
          throw ApiError.badRequest(`Danh mục đích với ID ${input.moveToCategoryId} không tồn tại`);
        }

        if (category.menuItems.length > 0) {
          await tx.menuItem.updateMany({
            where: { categoryId: id },
            data: { categoryId: input.moveToCategoryId }
          });
        }
      }

      await tx.category.delete({ where: { id } });
      return { deletedCategoryId: id, movedMenuItemCount: category.menuItems.length };
    });

    await AuditService.log({
      action: 'MENU_CATEGORY_DELETED',
      targetType: 'Category',
      targetId: id,
      actorId,
      actorName,
      metadata: { movedMenuItemCount: result.movedMenuItemCount, moveToCategoryId: input.moveToCategoryId }
    });

    return result;
  }

  static async reorderCategories(input: ReorderCategoriesInput, actorId?: number, actorName?: string) {
    const ids = input.ids;
    if (new Set(ids).size !== ids.length) {
      throw ApiError.badRequest('Danh sách category không được chứa ID trùng lặp');
    }

    const existing = await prisma.category.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map(category => category.id));
    if (existingIds.size !== ids.length || ids.some(id => !existingIds.has(id))) {
      throw ApiError.badRequest('Danh sách category phải chứa đầy đủ và chỉ gồm các ID hợp lệ');
    }

    const categories = await prisma.$transaction(async tx => {
      for (const [displayOrder, id] of ids.entries()) {
        await tx.category.update({ where: { id }, data: { displayOrder } });
      }

      return tx.category.findMany({
        orderBy: { displayOrder: 'asc' },
        include: { menuItems: { orderBy: { displayOrder: 'asc' } } }
      });
    });

    await AuditService.log({
      action: 'MENU_CATEGORY_REORDERED',
      targetType: 'Category',
      targetId: null,
      actorId,
      actorName,
      metadata: { ids }
    });

    return { categories };
  }

  /**
   * Lay toan bo danh muc mon an kem cac nhom Modifier va lua chon Option
   */
  static async getFullMenu() {
    const categories = await prisma.category.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        menuItems: {
          orderBy: { displayOrder: 'asc' },
          include: {
            modifierGroups: {
              include: {
                options: true
              }
            }
          }
        }
      }
    });

    return { categories };
  }

  /**
   * Admin tao mon an moi kem cac modifier groups va options
   */
  static async createMenuItem(input: CreateMenuItemInput, actorId?: number, actorName?: string) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId }
    });
    if (!category) {
      throw ApiError.badRequest(`Danh mục với ID ${input.categoryId} không tồn tại`);
    }

    for (let attempt = 1; attempt <= MENU_SKU_MAX_RETRIES; attempt += 1) {
      try {
        const menuItem = await prisma.$transaction(async (tx) => {
          const sku = await generateNextMenuSku(tx);
          const created = await tx.menuItem.create({
            data: {
              sku,
              categoryId: input.categoryId,
              name: input.name,
              description: input.description,
              basePrice: input.basePrice,
              imageUrl: input.imageUrl,
              isAvailable: input.isAvailable ?? true,
              displayOrder: input.displayOrder ?? 0,
              menuType: input.menuType,
              itemType: input.itemType,
              trackStock: input.trackStock,
              stockQuantity: input.stockQuantity,
              position: input.position,
              modifierGroups: input.modifierGroups && input.modifierGroups.length > 0 ? {
                create: input.modifierGroups.map(group => ({
                  name: group.name,
                  isRequired: group.isRequired ?? false,
                  minSelect: group.minSelect ?? 0,
                  maxSelect: group.maxSelect ?? 1,
                  options: {
                    create: group.options.map(opt => ({
                      name: opt.name,
                      priceDelta: opt.priceDelta ?? 0,
                      isAvailable: opt.isAvailable ?? true
                    }))
                  }
                }))
              } : undefined
            },
            include: {
              modifierGroups: {
                include: {
                  options: true
                }
              }
            }
          });
          return created;
        });

        await AuditService.log({
          action: 'MENU_ITEM_CREATED',
          targetType: 'MenuItem',
          targetId: menuItem.id,
          actorId,
          actorName,
          metadata: {
            name: menuItem.name,
            basePrice: menuItem.basePrice,
            categoryId: menuItem.categoryId,
            sku: menuItem.sku
          }
        });

        return { menuItem };
      } catch (error) {
        if (attempt < MENU_SKU_MAX_RETRIES && isSkuUniqueConstraintError(error)) {
          continue;
        }
        if (isSkuUniqueConstraintError(error)) {
          throw ApiError.conflict('Không thể tạo SKU duy nhất cho món mới. Vui lòng thử lại.');
        }
        throw error;
      }
    }

    throw ApiError.conflict('Không thể tạo SKU duy nhất cho món mới. Vui lòng thử lại.');
  }

  /**
   * Admin cap nhat thong tin mon an, gia, danh muc hoac modifier groups
   */
  static async updateMenuItem(id: number, input: UpdateMenuItemInput, actorId?: number, actorName?: string) {
    const existing = await prisma.menuItem.findUnique({
      where: { id }
    });
    if (!existing) {
      throw ApiError.notFound(`Món ăn với ID ${id} không tồn tại`);
    }

    if (input.categoryId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: input.categoryId }
      });
      if (!category) {
        throw ApiError.badRequest(`Danh mục với ID ${input.categoryId} không tồn tại`);
      }
    }

    const menuItem = await prisma.$transaction(async (tx) => {
      if (input.modifierGroups !== undefined) {
        // Xoa cac modifier group cu cua mon an (options duoc cascade delete)
        await tx.modifierGroup.deleteMany({
          where: { menuItemId: id }
        });
      }

      const updated = await tx.menuItem.update({
        where: { id },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.basePrice !== undefined ? { basePrice: input.basePrice } : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
          ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
          ...(input.menuType !== undefined ? { menuType: input.menuType } : {}),
          ...(input.itemType !== undefined ? { itemType: input.itemType } : {}),
          ...(input.trackStock !== undefined ? { trackStock: input.trackStock } : {}),
          ...(input.stockQuantity !== undefined ? { stockQuantity: input.stockQuantity } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.modifierGroups !== undefined ? {
            modifierGroups: {
              create: input.modifierGroups.map(group => ({
                name: group.name,
                isRequired: group.isRequired ?? false,
                minSelect: group.minSelect ?? 0,
                maxSelect: group.maxSelect ?? 1,
                options: {
                  create: group.options.map(opt => ({
                    name: opt.name,
                    priceDelta: opt.priceDelta ?? 0,
                    isAvailable: opt.isAvailable ?? true
                  }))
                }
              }))
            }
          } : {})
        },
        include: {
          modifierGroups: {
            include: {
              options: true
            }
          }
        }
      });

      return updated;
    });

    if (input.isAvailable !== undefined && input.isAvailable !== existing.isAvailable) {
      emitToAll('menu:itemSoldOutChanged', {
        menuItemId: menuItem.id,
        isAvailable: menuItem.isAvailable
      });
    }

    await AuditService.log({
      action: 'MENU_ITEM_UPDATED',
      targetType: 'MenuItem',
      targetId: menuItem.id,
      actorId,
      actorName,
      metadata: {
        name: menuItem.name,
        basePrice: menuItem.basePrice,
        previousName: existing.name,
        previousBasePrice: existing.basePrice,
        isAvailable: menuItem.isAvailable
      }
    });

    return { menuItem };
  }

  /**
   * Cap nhat trang thai con hang / het hang (86d) cua mon an
   */
  static async updateSoldOut(menuItemId: number, isAvailable: boolean, actorId?: number, actorName?: string) {
    const existing = await prisma.menuItem.findUnique({
      where: { id: menuItemId }
    });

    if (!existing) {
      throw ApiError.notFound(`Món ăn với ID ${menuItemId} không tồn tại`);
    }

    const updated = await prisma.menuItem.update({
      where: { id: menuItemId },
      data: { isAvailable },
      include: {
        modifierGroups: {
          include: {
            options: true
          }
        }
      }
    });

    // Phat su kien real-time xuong toan bo may POS va KDS
    emitToAll('menu:itemSoldOutChanged', {
      menuItemId: updated.id,
      isAvailable: updated.isAvailable
    });

    await AuditService.log({
      action: 'MENU_ITEM_AVAILABILITY_CHANGED',
      targetType: 'MenuItem',
      targetId: menuItemId,
      actorId,
      actorName,
      metadata: {
        name: updated.name,
        isAvailable,
        previousIsAvailable: existing.isAvailable
      }
    });

    return { menuItem: updated };
  }
}
