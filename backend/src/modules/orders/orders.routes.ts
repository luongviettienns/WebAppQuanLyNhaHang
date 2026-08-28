import { Router } from 'express';
import { OrdersController } from './orders.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const ordersRouter = Router();

// POST /api/orders (Tao don hang: Khach tai ban hoac Thu ngan POS deu co the tao)
ordersRouter.post('/', OrdersController.createOrder);

// POST /api/orders/:id/pay (Chi CASHIER va ADMIN duoc xac nhan thanh toan)
ordersRouter.post('/:id/pay', authenticate, authorize('CASHIER', 'ADMIN'), OrdersController.payOrder);
