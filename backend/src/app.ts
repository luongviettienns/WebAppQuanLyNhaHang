import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { systemRouter } from './modules/system/system.routes';
import { authRouter } from './modules/auth/auth.routes';
import { menuRouter } from './modules/menu/menu.routes';
import { tablesRouter } from './modules/tables/tables.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';

export const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(','),
    credentials: true
  })
);

app.use(express.json());

// Health Check Endpoint theo Foundation Contract
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    data: {
      status: 'ok'
    }
  });
});

// Authentication routes
app.use('/api/auth', authRouter);

// Menu & Modifiers routes
app.use('/api/menu', menuRouter);

// Dining Tables routes
app.use('/api/tables', tablesRouter);

// Orders & Checkout routes
app.use('/api/orders', ordersRouter);

// Daily Reports & KPI routes (Admin only)
app.use('/api/reports', reportsRouter);

// System routes (ho tro test contracts va status)
app.use('/api/system', systemRouter);

// Frontend static distribution (neu ton tai va khong phai moi truong test)
const possibleFrontendPaths = [
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(process.cwd(), '../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist')
];
const frontendDist = possibleFrontendPaths.find((p) => fs.existsSync(p));

if (process.env.NODE_ENV !== 'test' && frontendDist) {
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404 Handler cho cac endpoint khong hop le
app.use(notFoundHandler);

// Global Error Handler chuan hoa format { error: { code, message, details? } }
app.use(errorHandler);
