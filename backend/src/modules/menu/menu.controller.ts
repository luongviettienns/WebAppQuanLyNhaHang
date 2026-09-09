import { Request, Response, NextFunction } from 'express';
import { MenuService } from './menu.service';
import { updateSoldOutSchema, createMenuItemSchema, updateMenuItemSchema } from './menu.schemas';
import { ApiError } from '../../lib/api-error';

export class MenuController {
  static async getMenu(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await MenuService.getFullMenu();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async createMenuItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createMenuItemSchema.parse(req.body);
      const data = await MenuService.createMenuItem(validated);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateMenuItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const menuItemId = parseInt(req.params.id, 10);
      if (isNaN(menuItemId)) {
        throw ApiError.badRequest('ID món ăn không hợp lệ');
      }
      const validated = updateMenuItemSchema.parse(req.body);
      const data = await MenuService.updateMenuItem(menuItemId, validated);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateSoldOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const menuItemId = parseInt(req.params.id, 10);
      const { isAvailable } = updateSoldOutSchema.parse(req.body);

      const data = await MenuService.updateSoldOut(menuItemId, isAvailable);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
