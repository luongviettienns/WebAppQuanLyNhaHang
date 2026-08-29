import { Request, Response, NextFunction } from 'express';
import { OrdersService } from './orders.service';
import { createOrderSchema, payOrderSchema } from './orders.schemas';

export class OrdersController {
  static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createOrderSchema.parse(req.body);
      const createdByUserId = req.user?.id;

      const result = await OrdersService.createOrder(input, createdByUserId);

      res.status(result.isDuplicate ? 200 : 201).json({
        data: {
          order: result.order
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async payOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = parseInt(req.params.id, 10);
      const input = payOrderSchema.parse(req.body);

      const result = await OrdersService.payOrder(orderId, input);

      res.status(200).json({
        data: {
          order: result.order
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
