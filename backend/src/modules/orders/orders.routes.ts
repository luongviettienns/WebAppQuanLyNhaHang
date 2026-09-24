import { Router } from 'express';
import { OrdersController } from './orders.controller';
import { authenticate, optionalAuthenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { OrderInvoiceController } from './order-invoice.controller';
import { SalesReturnController } from './sales-return.controller';

export const ordersRouter = Router();

// GET /api/orders/invoices (Danh sach hoa don quan tri: CASHIER va ADMIN)
ordersRouter.get('/invoices', authenticate, authorize('CASHIER', 'ADMIN'), OrderInvoiceController.list);
ordersRouter.get('/invoices/export', authenticate, authorize('CASHIER', 'ADMIN'), OrderInvoiceController.export);
ordersRouter.get('/invoices/:id', authenticate, authorize('CASHIER', 'ADMIN'), OrderInvoiceController.detail);

// Sales returns: select a paid invoice, return item quantities and refund atomically.
ordersRouter.get('/returns/candidates', authenticate, authorize('CASHIER', 'ADMIN'), SalesReturnController.candidates);
ordersRouter.get('/returns', authenticate, authorize('CASHIER', 'ADMIN'), SalesReturnController.list);
ordersRouter.get('/returns/export', authenticate, authorize('CASHIER', 'ADMIN'), SalesReturnController.export);
ordersRouter.get('/returns/:id', authenticate, authorize('CASHIER', 'ADMIN'), SalesReturnController.detail);
ordersRouter.post('/returns', authenticate, authorize('CASHIER', 'ADMIN'), SalesReturnController.create);

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

// POST /api/orders/auto-cancel-expired (Quet tu dong huy don PENDING qua han: Chi ADMIN hoac he thong)
ordersRouter.post('/auto-cancel-expired', authenticate, authorize('ADMIN'), OrdersController.autoCancelExpired);



