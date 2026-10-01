import { Router } from 'express';
import { ReservationsController } from './reservations.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const reservationsRouter = Router();
reservationsRouter.post('/', ReservationsController.createPublic);
reservationsRouter.get('/public/:accessToken', ReservationsController.getPublic);
reservationsRouter.post('/public/:accessToken/payment-declaration', ReservationsController.declarePayment);
reservationsRouter.post('/public/:accessToken/cancellation-request', ReservationsController.requestCancellation);
reservationsRouter.get('/', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.list);
reservationsRouter.get('/:id', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.getStaffDetail);
reservationsRouter.post('/:id/deposit/confirm', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.confirmDeposit);
reservationsRouter.post('/:id/deposit/reject', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.rejectDeposit);
reservationsRouter.post('/:id/deposit/refund', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.refundDeposit);
reservationsRouter.post('/:id/reschedule', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.reschedule);
reservationsRouter.post('/:id/no-show', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.markNoShow);
reservationsRouter.post('/:id/check-in', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.checkIn);
reservationsRouter.post('/:id/cancel', authenticate, authorize('CASHIER', 'ADMIN'), ReservationsController.cancelByRestaurant);
