import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../lib/api-error';
import { createSupplierSchema, supplierListQuerySchema, updateSupplierSchema } from './supplier.schemas';
import { SupplierService } from './supplier.service';

export class SupplierController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ data: await SupplierService.list(supplierListQuerySchema.parse(req.query)) });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await SupplierService.create(createSupplierSchema.parse(req.body), req.user?.id, req.user?.name);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('ID nhà cung cấp không hợp lệ');
      const data = await SupplierService.update(id, updateSupplierSchema.parse(req.body), req.user?.id, req.user?.name);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
