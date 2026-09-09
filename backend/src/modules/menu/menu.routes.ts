import { Router } from 'express';
import { MenuController } from './menu.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const menuRouter = Router();

// GET /api/menu (Public hoac Authenticated)
menuRouter.get('/', MenuController.getMenu);

// POST /api/menu (Chi ADMIN duoc phep them mon moi)
menuRouter.post('/', authenticate, authorize('ADMIN'), MenuController.createMenuItem);

// PATCH /api/menu/:id (Chi ADMIN duoc phep cap nhat thong tin mon)
menuRouter.patch('/:id', authenticate, authorize('ADMIN'), MenuController.updateMenuItem);

// PATCH /api/menu/:id/sold-out (Chi KITCHEN va ADMIN duoc phep bao het mon)
menuRouter.patch('/:id/sold-out', authenticate, authorize('KITCHEN', 'ADMIN'), MenuController.updateSoldOut);
