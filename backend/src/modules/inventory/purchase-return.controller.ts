import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../lib/api-error';
import { createPurchaseReturnSchema, purchaseReturnImportSchema, purchaseReturnQuerySchema, returnVersionSchema, updatePurchaseReturnSchema } from './purchase-return.schemas';
import { PurchaseReturnService } from './purchase-return.service';

export const returnId = (value: string) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw ApiError.badRequest('ID phiếu không hợp lệ');
  return id;
};
export class PurchaseReturnController {
  static async previewImport(req: Request, res: Response, next: NextFunction) {
    try { const input = purchaseReturnImportSchema.parse(req.body); res.json({ data: await PurchaseReturnService.previewImport(input.fileBase64, input.fileName) }); } catch (error) { next(error); }
  }
  static async export(req: Request, res: Response, next: NextFunction) {
    try { const format = req.query.format === 'csv' ? 'csv' : 'xlsx'; const buffer = await PurchaseReturnService.export(purchaseReturnQuerySchema.parse(req.query), format); res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', 'attachment; filename="phieu-tra-hang-nhap.' + format + '"'); res.send(buffer); } catch (error) { next(error); }
  }
  static async list(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await PurchaseReturnService.list(purchaseReturnQuerySchema.parse(req.query)) }); } catch (error) { next(error); }
  }
  static async detail(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await PurchaseReturnService.detail(returnId(req.params.id)) }); } catch (error) { next(error); }
  }
  static async create(req: Request, res: Response, next: NextFunction) {
    try { res.status(201).json({ data: await PurchaseReturnService.create(createPurchaseReturnSchema.parse(req.body), req.user!) }); } catch (error) { next(error); }
  }
  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { expectedVersion, ...input } = updatePurchaseReturnSchema.parse(req.body);
      res.json({ data: await PurchaseReturnService.update(returnId(req.params.id), input, expectedVersion, req.user!) });
    } catch (error) { next(error); }
  }
  static async complete(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await PurchaseReturnService.complete(returnId(req.params.id), returnVersionSchema.parse(req.body).expectedVersion, req.user!) }); } catch (error) { next(error); }
  }
  static async cancel(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await PurchaseReturnService.cancel(returnId(req.params.id), returnVersionSchema.parse(req.body).expectedVersion, req.user!) }); } catch (error) { next(error); }
  }
}
