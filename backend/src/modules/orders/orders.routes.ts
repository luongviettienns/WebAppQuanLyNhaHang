import { Router } from 'express';
import { OrdersController } from './orders.controller';
import { authenticate, optionalAuthenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';
import { OrderInvoiceController } from './order-invoice.controller';
import { SalesReturnController } from './sales-return.controller';
import { DeliveryPartnerController } from './delivery-partner.controller';

export const ordersRouter = Router();

// Delivery partners and their derived delivery KPIs are managed by cashier/admin only.
ordersRouter.get('/delivery-partner-groups', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.groups);
ordersRouter.post('/delivery-partner-groups', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.saveGroup);
ordersRouter.patch('/delivery-partner-groups/:id', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.saveGroup);
ordersRouter.get('/delivery-partners/export', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.export);
ordersRouter.get('/delivery-partners/import/template', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.template);
ordersRouter.post('/delivery-partners/import/preview', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.preview);
ordersRouter.post('/delivery-partners/import/commit', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.commit);
ordersRouter.get('/delivery-partners/selectable', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.selectable);
ordersRouter.get('/delivery-partners', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.list);
ordersRouter.post('/delivery-partners', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.create);
ordersRouter.get('/delivery-partners/:id', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.detail);
ordersRouter.patch('/delivery-partners/:id', authenticate, authorize('CASHIER', 'ADMIN'), DeliveryPartnerController.update);

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

// Manual bank-transfer declarations are reconciled by cashier/admin; the guest access token is never returned.
ordersRouter.get('/payment-confirmations', authenticate, authorize('CASHIER', 'ADMIN'), OrdersController.getReservationPaymentConfirmations);

// GET /api/orders (Lay danh sach don KDS: Chi KITCHEN va ADMIN)
ordersRouter.get('/', authenticate, authorize('KITCHEN', 'ADMIN'), OrdersController.getOrders);

// POST /api/orders (Tao don hang: Khach tai ban qua QR hoac Nhan vien POS)
ordersRouter.post('/:id/payment-declaration', OrdersController.declareReservationOrderPayment);
ordersRouter.post('/:id/payment/confirm', authenticate, authorize('CASHIER', 'ADMIN'), OrdersController.confirmReservationOrderPayment);
ordersRouter.post('/:id/payment/reject', authenticate, authorize('CASHIER', 'ADMIN'), OrdersController.rejectReservationOrderPayment);
ordersRouter.post('/:id/pay-later', authenticate, authorize('CASHIER', 'ADMIN'), OrdersController.authorizeReservationOrderPayLater);
ordersRouter.post('/', optionalAuthenticate, OrdersController.createOrder);

// PATCH /api/orders/:id/status (Chuyen trang thai bep FSM: Chi KITCHEN va ADMIN)
ordersRouter.patch('/:id/status', authenticate, authorize('KITCHEN', 'ADMIN'), OrdersController.updateOrderStatus);

// POST /api/orders/:id/pay (Thanh toan don hang: Chi CASHIER va ADMIN duoc thu tien)
ordersRouter.post('/:id/pay', authenticate, authorize('CASHIER', 'ADMIN'), OrdersController.payOrder);

// PATCH /api/orders/:id/void (Huy don hang kiem toan: Chi ADMIN)
ordersRouter.patch('/:id/void', authenticate, authorize('ADMIN'), OrdersController.voidOrder);

// POST /api/orders/auto-cancel-expired (Quet tu dong huy don PENDING qua han: Chi ADMIN hoac he thong)
ordersRouter.post('/auto-cancel-expired', authenticate, authorize('ADMIN'), OrdersController.autoCancelExpired);



