import { Router } from 'express';
import { OrdersController } from './orders.controller';
import { authenticate, optionalAuthenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const ordersRouter = Router();

// POST /api/orders (Tao don hang: Khach tai ban qua QR hoac Nhan vien POS)
ordersRouter.post('/', optionalAuthenticate, OrdersController.createOrder);

// POST /api/orders/:id/pay (Thanh toan don hang: Chi CASHIER va ADMIN duoc thu tien)
ordersRouter.post('/:id/pay', authenticate, authorize('CASHIER', 'ADMIN'), OrdersController.payOrder);

