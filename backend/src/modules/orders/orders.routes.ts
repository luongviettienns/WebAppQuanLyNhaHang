import { Router } from 'express';
import { OrdersController } from './orders.controller';

export const ordersRouter = Router();

// POST /api/orders (Tao don hang: Khach tai ban hoac Thu ngan POS deu co the tao)
ordersRouter.post('/', OrdersController.createOrder);

// POST /api/orders/:id/pay (Thanh toan don hang: Khach tu tra VietQR hoac Thu ngan POS)
ordersRouter.post('/:id/pay', OrdersController.payOrder);
