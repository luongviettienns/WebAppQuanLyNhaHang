import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Xu ly loi duoc dinh nghia ApiError
  if (err instanceof ApiError) {
    if (err.retryAfterSec) {
      res.setHeader('Retry-After', err.retryAfterSec.toString());
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details })
      }
    });
    return;
  }

  // 2. Xu ly loi Validation tu Zod
  if (err instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of err.issues) {
      const field = issue.path.join('.') || 'request';
      details[field] = issue.message;
    }

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Du lieu gui len khong hop le',
        details
      }
    });
    return;
  }

  // 3. Xu ly loi khong xac dinh / Internal Server Error (An stack trace)
  console.error('[UNHANDLED_ERROR]:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Da xay ra loi noi bo he thong. Vui long thu lai sau.'
    }
  });
}

// 4. Middleware bat 404 cho tat ca cac route khong khop
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Endpoint khong ton tai: ${req.method} ${req.originalUrl}`));
}
