import { Router } from 'express';
import { VouchersController } from './vouchers.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

import { Request, Response, NextFunction } from 'express';

// Rate limiter chống dò mã voucher (tối đa 10 req/phút/IP)
const voucherRateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function resetVoucherRateLimit(): void {
  voucherRateLimitStore.clear();
}

export function checkVoucherValidationRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const record = voucherRateLimitStore.get(ip);

  if (!record || now > record.resetAt) {
    voucherRateLimitStore.set(ip, {
      count: 1,
      resetAt: now + 60 * 1000 // 1 phút
    });
    return next();
  }

  if (record.count >= 10) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    return res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Bạn đã thử kiểm tra mã voucher quá nhiều lần. Vui lòng đợi 1 phút trước khi thử lại.',
        details: { retryAfterSec }
      }
    });
  }

  record.count += 1;
  next();
}

export const vouchersRouter = Router();

// Public / Customer / Staff endpoints (no admin auth required)
vouchersRouter.post('/validate', checkVoucherValidationRateLimit, VouchersController.validateVoucher);
vouchersRouter.get('/active', VouchersController.getActiveVouchers);

// Protected Admin endpoints
vouchersRouter.use(authenticate, authorize('ADMIN'));

vouchersRouter.get('/', VouchersController.listVouchers);
vouchersRouter.get('/:id', VouchersController.getVoucherById);
vouchersRouter.post('/', VouchersController.createVoucher);
vouchersRouter.patch('/:id', VouchersController.updateVoucher);
vouchersRouter.delete('/:id', VouchersController.deleteVoucher);
