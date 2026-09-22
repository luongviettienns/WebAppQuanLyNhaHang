import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import { InventoryCheckService } from './inventory-check.service';
import {
  createInventoryCheckSchema,
  inventoryCheckImportPreviewSchema,
  inventoryCheckListQuerySchema,
  updateInventoryCheckSchema
} from './inventory-check.schemas';

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('ID phiếu kiểm kho không hợp lệ');
  return id;
}

function actorFrom(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, name: req.user.name };
}

export class InventoryCheckController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> { try { res.status(200).json({ data: await InventoryCheckService.list(inventoryCheckListQuerySchema.parse(req.query)) }); } catch (error) { next(error); } }
  static async export(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const format = req.query.format === undefined ? 'xlsx' : String(req.query.format);
      if (format !== 'csv' && format !== 'xlsx') throw ApiError.badRequest('Định dạng export không hợp lệ', { format: 'Chọn csv hoặc xlsx' });
      const buffer = await InventoryCheckService.export(inventoryCheckListQuerySchema.parse(req.query), format);
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="inventory_checks_${Date.now()}.${format}"`);
      res.send(buffer);
    } catch (error) { next(error); }
  }
  static async previewImport(req: Request, res: Response, next: NextFunction): Promise<void> { try { const input = inventoryCheckImportPreviewSchema.parse(req.body); res.status(200).json({ data: await InventoryCheckService.previewImport(input.fileBase64, input.fileName) }); } catch (error) { next(error); } }
  static async detail(req: Request, res: Response, next: NextFunction): Promise<void> { try { res.status(200).json({ data: await InventoryCheckService.getById(parseId(req.params.id)) }); } catch (error) { next(error); } }
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> { try { res.status(201).json({ data: await InventoryCheckService.create(createInventoryCheckSchema.parse(req.body), actorFrom(req)) }); } catch (error) { next(error); } }
  static async update(req: Request, res: Response, next: NextFunction): Promise<void> { try { res.status(200).json({ data: await InventoryCheckService.update(parseId(req.params.id), updateInventoryCheckSchema.parse(req.body), actorFrom(req)) }); } catch (error) { next(error); } }
  static async balance(req: Request, res: Response, next: NextFunction): Promise<void> { try { res.status(200).json({ data: await InventoryCheckService.balance(parseId(req.params.id), actorFrom(req)) }); } catch (error) { next(error); } }
  static async cancel(req: Request, res: Response, next: NextFunction): Promise<void> { try { res.status(200).json({ data: await InventoryCheckService.cancel(parseId(req.params.id), actorFrom(req)) }); } catch (error) { next(error); } }
}
