import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError } from '../../lib/api-error';

export const systemRouter = Router();

const sampleSchema = z.object({
  name: z.string().min(1, 'Tên không được để trống'),
  age: z.number().min(18, 'Tuổi phải từ 18 trở lên')
});

systemRouter.post('/test-validation', (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = sampleSchema.parse(req.body);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

systemRouter.get('/test-auth', (_req: Request, _res: Response, next: NextFunction) => {
  next(ApiError.unauthorized());
});

systemRouter.get('/test-forbidden', (req: Request, _res: Response, next: NextFunction) => {
  const role = req.headers['x-mock-role'];
  if (role !== 'ADMIN') {
    return next(ApiError.forbidden('Chỉ Admin mới có quyền truy cập'));
  }
  _res.status(200).json({ data: { message: 'Chào mừng Admin' } });
});

systemRouter.get('/test-server-error', () => {
  throw new Error('Database connection timed out or unexpected crash');
});
