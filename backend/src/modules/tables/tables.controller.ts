import { Request, Response, NextFunction } from 'express';
import { TablesService } from './tables.service';
import { updateTableStatusSchema, transferTableSchema } from './tables.schemas';

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

  static async getTableByQrToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.params.token;
      const data = await TablesService.getTableByQrToken(token);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getTableByNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tableNumber = parseInt(req.params.tableNumber, 10);
      const data = await TablesService.getTableByTableNumber(tableNumber);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getPublicTables(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await TablesService.getPublicTables();
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

  static async transferTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = transferTableSchema.parse(req.body);
      const actor = req.user ? { id: req.user.id, name: req.user.name } : { id: 0, name: 'System' };
      const data = await TablesService.transferTable(input.fromTableId, input.toTableId, actor);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
