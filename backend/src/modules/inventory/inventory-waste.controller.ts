import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import {
  createInventoryWasteSchema,
  inventoryWasteImportPreviewSchema,
  inventoryWasteListQuerySchema,
  updateInventoryWasteSchema
} from './inventory-waste.schemas';
import { InventoryWasteService } from './inventory-waste.service';

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('ID phiếu xuất hủy không hợp lệ');
  return id;
}

function actorFrom(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, name: req.user.name };
}

export class InventoryWasteController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await InventoryWasteService.list(inventoryWasteListQuerySchema.parse(req.query)) });
    } catch (error) { next(error); }
  }

  static async export(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const format = req.query.format === undefined ? 'xlsx' : String(req.query.format);
      if (format !== 'csv' && format !== 'xlsx') {
        throw ApiError.badRequest('Định dạng export không hợp lệ', { format: 'Chọn csv hoặc xlsx' });
      }
      const buffer = await InventoryWasteService.export(inventoryWasteListQuerySchema.parse(req.query), format);
      res.setHeader('Content-Type', format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory_wastes_' + Date.now() + '.' + format + '"');
      res.send(buffer);
    } catch (error) { next(error); }
  }

  static async previewImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = inventoryWasteImportPreviewSchema.parse(req.body);
      res.status(200).json({ data: await InventoryWasteService.previewImport(input.fileBase64, input.fileName) });
    } catch (error) { next(error); }
  }

  static async detail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await InventoryWasteService.getById(parseId(req.params.id)) });
    } catch (error) { next(error); }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ data: await InventoryWasteService.create(createInventoryWasteSchema.parse(req.body), actorFrom(req)) });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await InventoryWasteService.update(parseId(req.params.id), updateInventoryWasteSchema.parse(req.body), actorFrom(req)) });
    } catch (error) { next(error); }
  }

  static async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await InventoryWasteService.complete(parseId(req.params.id), actorFrom(req)) });
    } catch (error) { next(error); }
  }

  static async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await InventoryWasteService.cancel(parseId(req.params.id), actorFrom(req)) });
    } catch (error) { next(error); }
  }
}
