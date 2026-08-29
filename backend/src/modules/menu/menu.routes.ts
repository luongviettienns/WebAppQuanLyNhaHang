import { Router } from 'express';
import { MenuController } from './menu.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const menuRouter = Router();

// GET /api/menu (Public hoac Authenticated)
menuRouter.get('/', MenuController.getMenu);

// PATCH /api/menu/:id/sold-out (Chi KITCHEN va ADMIN duoc phep bao het mon)
menuRouter.patch('/:id/sold-out', authenticate, authorize('KITCHEN', 'ADMIN'), MenuController.updateSoldOut);
