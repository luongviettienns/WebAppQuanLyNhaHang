import { Request, Response, NextFunction } from 'express';
import { VouchersService } from './vouchers.service';
import { createVoucherSchema, updateVoucherSchema, validateVoucherSchema } from './vouchers.schemas';

export class VouchersController {
  static async listVouchers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await VouchersService.listVouchers();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getActiveVouchers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await VouchersService.getActiveVouchers();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async getVoucherById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const data = await VouchersService.getVoucherById(id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async createVoucher(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createVoucherSchema.parse(req.body);
      const actorId = req.user?.id;
      const actorName = req.user?.name;
      const data = await VouchersService.createVoucher(input, actorId, actorName);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async updateVoucher(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const input = updateVoucherSchema.parse(req.body);
      const actorId = req.user?.id;
      const actorName = req.user?.name;
      const data = await VouchersService.updateVoucher(id, input, actorId, actorName);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async deleteVoucher(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      const actorId = req.user?.id;
      const actorName = req.user?.name;
      const data = await VouchersService.deleteVoucher(id, actorId, actorName);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  static async validateVoucher(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = validateVoucherSchema.parse(req.body);
      const data = await VouchersService.validateVoucher(input.code, input.orderAmount);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
}
