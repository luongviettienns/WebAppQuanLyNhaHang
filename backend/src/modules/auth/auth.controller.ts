import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { loginSchema } from './auth.schemas';

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = loginSchema.parse(req.body);
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const result = await AuthService.login(input, clientIp);

      res.status(200).json({
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  static getMe(req: Request, res: Response): void {
    res.status(200).json({
      data: {
        user: req.user
      }
    });
  }
}
