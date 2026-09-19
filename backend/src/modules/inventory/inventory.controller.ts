import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service';
import {
  createIngredientSchema,
  updateIngredientSchema,
  stockInSchema,
  updateRecipeSchema,
  excelPreviewSchema,
  excelCommitSchema,
  kitchenWasteSchema
} from './inventory.schemas';
import { ApiError } from '../../lib/api-error';

export class InventoryController {
  static async getIngredients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { search, lowStock, negativeStock } = req.query;
      const data = await InventoryService.getIngredients({
        search: typeof search === 'string' ? search : undefined,
        lowStockOnly: lowStock === 'true',
        negativeStockOnly: negativeStock === 'true'
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getIngredientById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw ApiError.badRequest('ID nguyên liệu không hợp lệ');

      const data = await InventoryService.getIngredientById(id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async createIngredient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createIngredientSchema.parse(req.body);
      const data = await InventoryService.createIngredient(
        validated,
        undefined,
        req.user?.id,
        req.user?.name
      );
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateIngredient(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw ApiError.badRequest('ID nguyên liệu không hợp lệ');

      const validated = updateIngredientSchema.parse(req.body);
      const data = await InventoryService.updateIngredient(
        id,
        validated,
        req.user?.id,
        req.user?.name
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async stockIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = stockInSchema.parse(req.body);
      const data = await InventoryService.stockIn(
        validated,
        req.user?.id,
        req.user?.name
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async previewExcel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileBase64, fileName } = excelPreviewSchema.parse(req.body);
      const data = await InventoryService.previewExcelStockIn(fileBase64, fileName);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async commitExcel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = excelCommitSchema.parse(req.body);
      const data = await InventoryService.commitExcelStockIn(
        validated,
        req.user?.id,
        req.user?.name
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async downloadTemplate(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const buffer = InventoryService.getTemplateBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="crispy_bite_stock_in_template.xlsx"'
      );
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  static async exportStock(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const buffer = await InventoryService.getExportBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="crispy_bite_inventory_${Date.now()}.xlsx"`
      );
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  static async getRecipe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const menuItemId = parseInt(req.params.menuItemId, 10);
      if (isNaN(menuItemId)) throw ApiError.badRequest('ID món ăn không hợp lệ');

      const data = await InventoryService.getRecipe(menuItemId);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateRecipe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const menuItemId = parseInt(req.params.menuItemId, 10);
      if (isNaN(menuItemId)) throw ApiError.badRequest('ID món ăn không hợp lệ');

      const { ingredients } = updateRecipeSchema.parse(req.body);
      const data = await InventoryService.updateRecipe(
        menuItemId,
        ingredients,
        req.user?.id,
        req.user?.name
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async recordKitchenWaste(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = kitchenWasteSchema.parse(req.body);
      const actor = req.user ? { id: req.user.id, name: req.user.name } : { id: 0, name: 'System' };
      const data = await InventoryService.recordKitchenWaste(validated, actor);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getLowStockAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await InventoryService.getLowStockAlerts();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
