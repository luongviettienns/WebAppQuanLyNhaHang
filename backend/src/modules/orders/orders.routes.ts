import { Router } from 'express';
import { OrdersController } from './orders.controller';
import { authenticate, optionalAuthenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const ordersRouter = Router();

// GET /api/orders (Lay danh sach don KDS: Chi KITCHEN va ADMIN)
ordersRouter.get('/', authenticate, authorize('KITCHEN', 'ADMIN'), OrdersController.getOrders);

// POST /api/orders (Tao don hang: Khach tai ban qua QR hoac Nhan vien POS)
ordersRouter.post('/', optionalAuthenticate, OrdersController.createOrder);

// PATCH /api/orders/:id/status (Chuyen trang thai bep FSM: Chi KITCHEN va ADMIN)
ordersRouter.patch('/:id/status', authenticate, authorize('KITCHEN', 'ADMIN'), OrdersController.updateOrderStatus);

// POST /api/orders/:id/pay (Thanh toan don hang: Chi CASHIER va ADMIN duoc thu tien)
ordersRouter.post('/:id/pay', authenticate, authorize('CASHIER', 'ADMIN'), OrdersController.payOrder);

// PATCH /api/orders/:id/void (Huy don hang kiem toan: Chi ADMIN)
ordersRouter.patch('/:id/void', authenticate, authorize('ADMIN'), OrdersController.voidOrder);



