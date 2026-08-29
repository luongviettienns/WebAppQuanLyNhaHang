import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { ApiError } from '../../lib/api-error';
import { LoginInput } from './auth.schemas';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory rate limit store: ip -> RateLimitRecord
const rateLimitStore = new Map<string, RateLimitRecord>();

export class AuthService {
  /**
   * Kiem tra gioi han request dang nhap theo IP de phong chong Brute-Force (Toi da 5 req/phut)
   */
  static checkRateLimit(ip: string): void {
    const now = Date.now();
    const record = rateLimitStore.get(ip);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(ip, {
        count: 1,
        resetAt: now + 60 * 1000 // 1 phut
      });
      return;
    }

    if (record.count >= 5) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      throw ApiError.rateLimited('Bạn đã thử đăng nhập quá 5 lần. Vui lòng đợi 1 phút trước khi thử lại.', retryAfterSec);
    }

    record.count += 1;
  }

  /**
   * Dang nhap tai khoan va cap ma JWT
   */
  static async login(input: LoginInput, clientIp: string) {
    // 1. Kiem tra rate limit
    this.checkRateLimit(clientIp);

    // 2. Tim user trong database
    const user = await prisma.user.findUnique({
      where: { username: input.username }
    });

    if (!user) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    // 3. So khop mat khau bang bcrypt
    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    // 4. Tao ma JWT Token HS256
    const payload = {
      sub: user.id.toString(),
      username: user.username,
      name: user.name,
      role: user.role
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    };
  }
}
