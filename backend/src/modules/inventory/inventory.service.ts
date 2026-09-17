import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/prisma';
import { ApiError } from '../../lib/api-error';
import { AuditService } from '../audit/audit.service';
import {
  createIngredientSchema,
  CreateIngredientDto,
  UpdateIngredientDto,
  StockInDto,
  ExcelCommitDto
} from './inventory.schemas';
import {
  calculateNewWeightedAverageCost,
  calculateRecipeCost
} from './inventory.math';
import {
  parseExcelBuffer,
  generateTemplateWorkbook,
  exportInventoryWorkbook
} from './inventory.excel';

export interface IngredientFilter {
  search?: string;
  lowStockOnly?: boolean;
  negativeStockOnly?: boolean;
}

export interface ExcelPreviewRow {
  rowNumber: number;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  costPerUnit: number;
  projectedStock: number;
  projectedCost: number;
  note?: string;
}

export interface ExcelErrorRow {
  rowNumber: number;
  sku: string;
  name?: string;
  unit?: string;
  quantity: number;
  costPerUnit: number;
  error: string;
}

export interface ExcelPreviewResult {
  fileName: string;
  totalRows: number;
  validRows: ExcelPreviewRow[];
  errorRows: ExcelErrorRow[];
}

export class InventoryService {
  /**
   * Lay danh sach nguyen vat lieu kem bo loc va trang thai canh bao
   */
  static async getIngredients(filter?: IngredientFilter, db: PrismaClient = defaultPrisma) {
    const where: Prisma.IngredientWhereInput = {
      isActive: true
    };

    if (filter?.search) {
      const s = filter.search.trim();
      where.OR = [
        { sku: { contains: s } },
        { name: { contains: s } }
      ];
    }

    const items = await db.ingredient.findMany({
      where,
      orderBy: { sku: 'asc' }
    });

    // Tinh toan metadata & badges
    const processed = items.map((ing) => {
      const isNegative = ing.currentStock < 0;
      const isLowStock = !isNegative && ing.currentStock <= ing.minThreshold;
      const totalValue = Math.round(ing.currentStock * ing.costPerUnit);

      return {
        ...ing,
        isNegative,
        isLowStock,
        totalValue
      };
    });

    if (filter?.negativeStockOnly) {
      return processed.filter(i => i.isNegative);
    }
    if (filter?.lowStockOnly) {
      return processed.filter(i => i.isLowStock || i.isNegative);
    }

    return processed;
  }

  /**
   * Chi tiet 1 nguyen lieu kem lich su giao dich gan nhat
   */
  static async getIngredientById(id: number, db: PrismaClient = defaultPrisma) {
    const ing = await db.ingredient.findUnique({
      where: { id },
      include: {
        inventoryTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 30
        }
      }
    });

    if (!ing) {
      throw ApiError.notFound('Nguyên liệu không tồn tại');
    }

    return {
      ...ing,
      isNegative: ing.currentStock < 0,
      isLowStock: ing.currentStock >= 0 && ing.currentStock <= ing.minThreshold,
      totalValue: Math.round(ing.currentStock * ing.costPerUnit)
    };
  }

  /**
   * Tao moi nguyen vat lieu
   */
  static async createIngredient(
    rawDto: CreateIngredientDto,
    db: PrismaClient = defaultPrisma,
    userId?: number,
    userName?: string
  ) {
    const dto = createIngredientSchema.parse(rawDto);
    const existing = await db.ingredient.findUnique({
      where: { sku: dto.sku }
    });

    if (existing) {
      throw ApiError.conflict(`Mã nguyên liệu SKU '${dto.sku}' đã tồn tại`);
    }

    const created = await db.ingredient.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        unit: dto.unit,
        currentStock: dto.currentStock,
        minThreshold: dto.minThreshold,
        costPerUnit: dto.costPerUnit,
        isActive: true
      }
    });

    // Neu co ton kho ban dau > 0, tao transaction STOCK_IN
    if (dto.currentStock > 0) {
      await db.inventoryTransaction.create({
        data: {
          ingredientId: created.id,
          type: 'STOCK_IN',
          quantity: dto.currentStock,
          costAmount: Math.round(dto.currentStock * dto.costPerUnit),
          note: 'Tồn kho ban đầu khi tạo nguyên liệu',
          createdByUserId: userId
        }
      });
    }

    AuditService.log({
      action: 'INGREDIENT_CREATED',
      targetType: 'Ingredient',
      targetId: created.id,
      actorId: userId,
      actorName: userName,
      metadata: { sku: created.sku, name: created.name, unit: created.unit, stock: created.currentStock }
    });

    return created;
  }

  /**
   * Cap nhat thong tin nguyen lieu
   */
  static async updateIngredient(
    id: number,
    dto: UpdateIngredientDto,
    userId?: number,
    userName?: string,
    db: PrismaClient = defaultPrisma
  ) {
    const existing = await db.ingredient.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound('Nguyên liệu không tồn tại');
    }

    const updated = await db.ingredient.update({
      where: { id },
      data: {
        name: dto.name,
        unit: dto.unit,
        minThreshold: dto.minThreshold,
        costPerUnit: dto.costPerUnit,
        isActive: dto.isActive
      }
    });

    AuditService.log({
      action: 'INGREDIENT_UPDATED',
      targetType: 'Ingredient',
      targetId: updated.id,
      actorId: userId,
      actorName: userName,
      metadata: { old: existing, updated: dto }
    });

    return updated;
  }

  /**
   * Nhap kho thu cong 1 nguyen lieu (Atomic Transaction)
   */
  static async stockIn(
    dto: StockInDto,
    userId?: number,
    userName?: string,
    db: PrismaClient = defaultPrisma
  ) {
    return await db.$transaction(async (tx) => {
      const ing = await tx.ingredient.findUnique({
        where: { id: dto.ingredientId }
      });

      if (!ing) {
        throw ApiError.notFound('Nguyên liệu không tồn tại');
      }

      // Tinh toan gia von binh quan & ton moi theo cong thuc dong bang Q1 & Q3
      const { newStock, newCost } = calculateNewWeightedAverageCost({
        currentStock: ing.currentStock,
        currentCost: ing.costPerUnit,
        incomingQty: dto.quantity,
        incomingCost: dto.costPerUnit
      });

      const updated = await tx.ingredient.update({
        where: { id: dto.ingredientId },
        data: {
          currentStock: newStock,
          costPerUnit: newCost
        }
      });

      const transactionCost = Math.round(dto.quantity * dto.costPerUnit);

      await tx.inventoryTransaction.create({
        data: {
          ingredientId: ing.id,
          type: 'STOCK_IN',
          quantity: dto.quantity,
          costAmount: transactionCost,
          note: dto.note || 'Nhập kho thủ công',
          createdByUserId: userId
        }
      });

      AuditService.log({
        action: 'INVENTORY_STOCK_IN',
        targetType: 'Ingredient',
        targetId: ing.id,
        actorId: userId,
        actorName: userName,
        metadata: {
          qty: dto.quantity,
          cost: dto.costPerUnit,
          oldStock: ing.currentStock,
          newStock,
          oldCost: ing.costPerUnit,
          newCost
        }
      });

      return updated;
    });
  }

  /**
   * Preview file Excel nhap hang: Parse & validate tung dong, khong block dong hop le
   */
  static async previewExcelStockIn(
    fileBase64: string,
    fileName: string,
    db: PrismaClient = defaultPrisma
  ): Promise<ExcelPreviewResult> {
    const buffer = Buffer.from(fileBase64, 'base64');
    const parsedRows = parseExcelBuffer(buffer);

    if (parsedRows.length === 0) {
      throw ApiError.badRequest('File Excel không có dữ liệu hợp lệ để nhập');
    }

    const allIngredients = await db.ingredient.findMany({
      where: { isActive: true }
    });
    const ingBySku = new Map(allIngredients.map(i => [i.sku.toUpperCase(), i]));

    const validRows: ExcelPreviewRow[] = [];
    const errorRows: ExcelErrorRow[] = [];

    for (const row of parsedRows) {
      const ing = ingBySku.get(row.sku.toUpperCase());

      if (!ing) {
        errorRows.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          quantity: row.quantity,
          costPerUnit: row.costPerUnit,
          error: `Mã nguyên liệu '${row.sku}' không tồn tại trong hệ thống`
        });
        continue;
      }

      if (row.unit && row.unit.toLowerCase() !== ing.unit.toLowerCase()) {
        errorRows.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          quantity: row.quantity,
          costPerUnit: row.costPerUnit,
          error: `Đơn vị tính '${row.unit}' không khớp với hệ thống ('${ing.unit}')`
        });
        continue;
      }

      if (row.quantity <= 0) {
        errorRows.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          quantity: row.quantity,
          costPerUnit: row.costPerUnit,
          error: 'Số lượng nhập phải lớn hơn 0'
        });
        continue;
      }

      if (row.costPerUnit < 0) {
        errorRows.push({
          rowNumber: row.rowNumber,
          sku: row.sku,
          name: row.name,
          unit: row.unit,
          quantity: row.quantity,
          costPerUnit: row.costPerUnit,
          error: 'Đơn giá không được nhỏ hơn 0'
        });
        continue;
      }

      // Tinh gia va ton du phong
      const { newStock, newCost } = calculateNewWeightedAverageCost({
        currentStock: ing.currentStock,
        currentCost: ing.costPerUnit,
        incomingQty: row.quantity,
        incomingCost: row.costPerUnit
      });

      validRows.push({
        rowNumber: row.rowNumber,
        sku: ing.sku,
        name: ing.name,
        unit: ing.unit,
        quantity: row.quantity,
        costPerUnit: row.costPerUnit,
        projectedStock: newStock,
        projectedCost: newCost,
        note: row.note
      });
    }

    return {
      fileName,
      totalRows: parsedRows.length,
      validRows,
      errorRows
    };
  }

  /**
   * Commit nhap kho hang loat tu file Excel
   */
  static async commitExcelStockIn(
    dto: ExcelCommitDto,
    userId?: number,
    userName?: string,
    db: PrismaClient = defaultPrisma
  ) {
    return await db.$transaction(async (tx) => {
      const results = [];
      const timestampStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

      for (const item of dto.items) {
        const ing = await tx.ingredient.findUnique({
          where: { sku: item.sku }
        });

        if (!ing) {
          throw ApiError.badRequest(`Mã nguyên liệu '${item.sku}' không tồn tại`);
        }

        const { newStock, newCost } = calculateNewWeightedAverageCost({
          currentStock: ing.currentStock,
          currentCost: ing.costPerUnit,
          incomingQty: item.quantity,
          incomingCost: item.costPerUnit
        });

        const updated = await tx.ingredient.update({
          where: { id: ing.id },
          data: {
            currentStock: newStock,
            costPerUnit: newCost
          }
        });

        const txCost = Math.round(item.quantity * item.costPerUnit);
        const batchNote = `Nhập qua Excel - ${dto.sourceFileName} - ${timestampStr}${item.note ? ` (${item.note})` : ''}`;

        await tx.inventoryTransaction.create({
          data: {
            ingredientId: ing.id,
            type: 'STOCK_IN',
            quantity: item.quantity,
            costAmount: txCost,
            note: batchNote,
            createdByUserId: userId
          }
        });

        results.push(updated);
      }

      AuditService.log({
        action: 'INVENTORY_EXCEL_IMPORT',
        targetType: 'Ingredient',
        actorId: userId,
        actorName: userName,
        metadata: {
          sourceFileName: dto.sourceFileName,
          importedCount: dto.items.length
        }
      });

      return {
        importedCount: results.length,
        items: results
      };
    });
  }

  /**
   * Lay cong thuc dinh luong BOM cua mot mon an
   */
  static async getRecipe(menuItemId: number, db: PrismaClient = defaultPrisma) {
    const menuItem = await db.menuItem.findUnique({
      where: { id: menuItemId }
    });

    if (!menuItem) {
      throw ApiError.notFound('Món ăn không tồn tại');
    }

    const items = await db.menuItemIngredient.findMany({
      where: { menuItemId },
      include: {
        ingredient: true
      },
      orderBy: { id: 'asc' }
    });

    const bomForCalculation = items.map(i => ({
      quantityRequired: i.quantityRequired,
      costPerUnit: i.ingredient.costPerUnit
    }));

    const totalCost = calculateRecipeCost(bomForCalculation);
    const profitMargin = menuItem.basePrice > 0
      ? Math.round(((menuItem.basePrice - totalCost) / menuItem.basePrice) * 1000) / 10
      : 0;

    return {
      menuItemId: menuItem.id,
      menuItemName: menuItem.name,
      basePrice: menuItem.basePrice,
      totalCost,
      profitMargin,
      ingredients: items.map(i => ({
        id: i.id,
        ingredientId: i.ingredientId,
        sku: i.ingredient.sku,
        name: i.ingredient.name,
        unit: i.ingredient.unit,
        quantityRequired: i.quantityRequired,
        costPerUnit: i.ingredient.costPerUnit,
        itemCost: Math.round(i.quantityRequired * i.ingredient.costPerUnit)
      }))
    };
  }

  /**
   * Cap nhat cong thuc dinh luong BOM cho mon an
   */
  static async updateRecipe(
    menuItemId: number,
    ingredients: Array<{ ingredientId: number; quantityRequired: number }>,
    userId?: number,
    userName?: string,
    db: PrismaClient = defaultPrisma
  ) {
    return await db.$transaction(async (tx) => {
      const menuItem = await tx.menuItem.findUnique({ where: { id: menuItemId } });
      if (!menuItem) {
        throw ApiError.notFound('Món ăn không tồn tại');
      }

      // Xoa BOM cu
      await tx.menuItemIngredient.deleteMany({
        where: { menuItemId }
      });

      // Tao BOM moi
      for (const item of ingredients) {
        if (item.quantityRequired <= 0) continue;

        await tx.menuItemIngredient.create({
          data: {
            menuItemId,
            ingredientId: item.ingredientId,
            quantityRequired: item.quantityRequired
          }
        });
      }

      AuditService.log({
        action: 'MENU_RECIPE_UPDATED',
        targetType: 'MenuItem',
        targetId: menuItemId,
        actorId: userId,
        actorName: userName,
        metadata: { ingredientsCount: ingredients.length }
      });

      return await InventoryService.getRecipe(menuItemId, tx as any);
    });
  }

  /**
   * Xuat file Excel template mau
   */
  static getTemplateBuffer(): Buffer {
    return generateTemplateWorkbook();
  }

  /**
   * Xuat file Excel toan bo ton kho
   */
  static async getExportBuffer(db: PrismaClient = defaultPrisma): Promise<Buffer> {
    const ingredients = await db.ingredient.findMany({
      where: { isActive: true },
      orderBy: { sku: 'asc' }
    });

    return exportInventoryWorkbook(ingredients);
  }

  /**
   * Tu dong tru kho khi don hang thanh toan thanh cong (Atomic Order Payment Integration)
   */
  static async deductInventoryForOrder(
    tx: Prisma.TransactionClient,
    orderId: number,
    orderItems: Array<{ menuItemId: number; quantity: number }>
  ): Promise<number> {
    let totalOrderCogs = 0;

    for (const orderItem of orderItems) {
      const boms = await tx.menuItemIngredient.findMany({
        where: { menuItemId: orderItem.menuItemId },
        include: { ingredient: true }
      });

      for (const bom of boms) {
        const qtyNeeded = bom.quantityRequired * orderItem.quantity;
        const ing = bom.ingredient;

        // Cho phep ban am (Q3 Rule) bang thao tac nguyen tu decrement
        const itemCogs = Math.round(qtyNeeded * ing.costPerUnit);
        totalOrderCogs += itemCogs;

        await tx.ingredient.update({
          where: { id: ing.id },
          data: {
            currentStock: {
              decrement: qtyNeeded
            }
          }
        });

        await tx.inventoryTransaction.create({
          data: {
            ingredientId: ing.id,
            type: 'AUTO_DEDUCT',
            quantity: -qtyNeeded,
            costAmount: itemCogs,
            orderId: orderId,
            note: `Tự động trừ kho cho Đơn #${orderId}`
          }
        });
      }
    }

    return totalOrderCogs;
  }
}
