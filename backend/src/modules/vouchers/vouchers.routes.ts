import { Router } from 'express';
import { VouchersController } from './vouchers.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const vouchersRouter = Router();

// Public / Customer / Staff endpoints (no admin auth required)
vouchersRouter.post('/validate', VouchersController.validateVoucher);
vouchersRouter.get('/active', VouchersController.getActiveVouchers);

// Protected Admin endpoints
vouchersRouter.use(authenticate, authorize('ADMIN'));

vouchersRouter.get('/', VouchersController.listVouchers);
vouchersRouter.get('/:id', VouchersController.getVoucherById);
vouchersRouter.post('/', VouchersController.createVoucher);
vouchersRouter.patch('/:id', VouchersController.updateVoucher);
vouchersRouter.delete('/:id', VouchersController.deleteVoucher);
