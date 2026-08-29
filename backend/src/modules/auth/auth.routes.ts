import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticate } from '../../middlewares/authenticate';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', AuthController.login);

// GET /api/auth/me (Protected)
authRouter.get('/me', authenticate, AuthController.getMe);
