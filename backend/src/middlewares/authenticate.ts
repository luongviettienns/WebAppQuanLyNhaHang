import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../lib/api-error';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Yêu cầu cung cấp Bearer Token hợp lệ'));
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    }) as {
      sub: string;
      username: string;
      name: string;
      role: Role;
    };

    req.user = {
      id: parseInt(decoded.sub, 10),
      username: decoded.username,
      name: decoded.name,
      role: decoded.role
    };

    next();
  } catch {
    return next(ApiError.unauthorized('Mã JWT Token không hợp lệ hoặc đã hết hạn'));
  }
}
