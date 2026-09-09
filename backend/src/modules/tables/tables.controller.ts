import { Request, Response, NextFunction } from 'express';
import { TablesService } from './tables.service';
import { updateTableStatusSchema } from './tables.schemas';

export class TablesController {
  static async getTables(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await TablesService.getAllTables();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getTableById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const data = await TablesService.getTableById(id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateTableStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const input = updateTableStatusSchema.parse(req.body);
      const data = await TablesService.updateTableStatus(id, input.status);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
