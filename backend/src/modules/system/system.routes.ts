import { Router, Request, Response, NextFunction } from 'express';
import os from 'os';
import { z } from 'zod';
import { ApiError } from '../../lib/api-error';

export const systemRouter = Router();

/**
 * Tra ve danh sach dia chi IP cua may chu trong mang LAN / Wi-Fi
 * Giup cac thiet bi khac (dien thoai, tablet) trong cung Wi-Fi ket noi de dang.
 */
systemRouter.get('/network-info', (_req: Request, res: Response) => {
  const interfaces = os.networkInterfaces();
  const addresses: Array<{ name: string; ip: string; webUrl: string; apiUrl: string }> = [];

  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;
    for (const net of netList) {
      // Chi lay IPv4 va bo qua Loopback 127.0.0.1
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({
          name,
          ip: net.address,
          webUrl: `http://${net.address}:8081`,
          apiUrl: `http://${net.address}:4000`
        });
      }
    }
  }

  res.status(200).json({
    data: {
      addresses,
      hostname: os.hostname(),
      defaultPort: {
        backend: 4000,
        frontend: 8081
      }
    }
  });
});

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
