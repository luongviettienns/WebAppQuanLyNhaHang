import { Request, Response, NextFunction } from 'express';
import { MenuService } from './menu.service';
import { updateSoldOutSchema } from './menu.schemas';

export class MenuController {
  static async getMenu(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await MenuService.getFullMenu();
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
