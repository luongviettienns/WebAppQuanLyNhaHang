import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import {
  createPurchaseReceiptSchema,
  purchaseReceiptListQuerySchema,
  updatePurchaseReceiptSchema
} from './purchase-receipt.schemas';
import { PurchaseReceiptService } from './purchase-receipt.service';

function parseReceiptId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('ID phiếu nhập không hợp lệ');
  return id;
}

function actorFrom(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, name: req.user.name };
}

export class PurchaseReceiptController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await PurchaseReceiptService.list(purchaseReceiptListQuerySchema.parse(req.query)) });
    } catch (error) {
      next(error);
    }
  }

  static async detail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await PurchaseReceiptService.getById(parseReceiptId(req.params.id)) });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await PurchaseReceiptService.create(createPurchaseReceiptSchema.parse(req.body), actorFrom(req));
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await PurchaseReceiptService.update(
        parseReceiptId(req.params.id), updatePurchaseReceiptSchema.parse(req.body), actorFrom(req)
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async post(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await PurchaseReceiptService.postReceipt(parseReceiptId(req.params.id), actorFrom(req));
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await PurchaseReceiptService.cancel(parseReceiptId(req.params.id), actorFrom(req));
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
