import express, { Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { systemRouter } from './modules/system/system.routes';
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

// System routes (ho tro test contracts va status)
app.use('/api/system', systemRouter);

// 404 Handler cho cac endpoint khong hop le
app.use(notFoundHandler);

// Global Error Handler chuan hoa format { error: { code, message, details? } }
app.use(errorHandler);
