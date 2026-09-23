import { Request, Response, NextFunction } from 'express';
import { TablesService } from './tables.service';
import { createTableSchema, tableAreaSchema, tableImportFileSchema, tableImportRowsSchema, tableManageQuerySchema, updateTableSchema, updateTableStatusSchema } from './tables.schemas';
import { ApiError } from '../../lib/api-error';
import { TableTransferService } from './table-transfer.service';

function parseId(value: string) { const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw ApiError.badRequest('ID không hợp lệ'); return id; }

export class TablesController {
  static async manage(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await TablesService.manage(tableManageQuerySchema.parse(req.query)) }); } catch (error) { next(error); } }
  static async create(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await TablesService.create(createTableSchema.parse(req.body), req.user?.id, req.user?.name) }); } catch (error) { next(error); } }
  static async update(req: Request, res: Response, next: NextFunction) { try { res.json({ data: await TablesService.update(parseId(req.params.id), updateTableSchema.parse(req.body), req.user?.id, req.user?.name) }); } catch (error) { next(error); } }
  static async areas(_req: Request, res: Response, next: NextFunction) { try { res.json({ data: await TablesService.areas() }); } catch (error) { next(error); } }
  static async saveArea(req: Request, res: Response, next: NextFunction) { try { const id = req.params.id ? parseId(req.params.id) : null; res.status(id === null ? 201 : 200).json({ data: await TablesService.saveArea(id, tableAreaSchema.parse(req.body), req.user?.id, req.user?.name) }); } catch (error) { next(error); } }
  static async export(req: Request, res: Response, next: NextFunction) { try { const format = req.query.format === 'csv' ? 'csv' : 'xlsx'; const buffer = await TableTransferService.export(tableManageQuerySchema.parse(req.query), format); res.type(format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`Phong_ban.${format}`).send(buffer); } catch (error) { next(error); } }
  static async importTemplate(_req: Request, res: Response, next: NextFunction) { try { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('Mau_phong_ban.xlsx').send(TableTransferService.template()); } catch (error) { next(error); } }
  static async previewImport(req: Request, res: Response, next: NextFunction) { try { const input = tableImportFileSchema.parse(req.body); res.json({ data: await TableTransferService.preview(input.fileName, input.fileBase64) }); } catch (error) { next(error); } }
  static async commitImport(req: Request, res: Response, next: NextFunction) { try { res.status(201).json({ data: await TableTransferService.commit(tableImportRowsSchema.parse(req.body).rows, req.user?.id, req.user?.name) }); } catch (error) { next(error); } }
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
}
