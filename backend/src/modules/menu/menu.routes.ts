import { Router } from 'express';
import { MenuController } from './menu.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

export const menuRouter = Router();

// GET /api/menu (Public hoac Authenticated)
menuRouter.get('/', MenuController.getMenu);

// Import/export menu (Chi ADMIN duoc phep)
menuRouter.get('/export', authenticate, authorize('ADMIN'), MenuController.exportMenu);
menuRouter.post('/import/preview', authenticate, authorize('ADMIN'), MenuController.previewMenuImport);
menuRouter.post('/import/commit', authenticate, authorize('ADMIN'), MenuController.commitMenuImport);

// Category administration (Chi ADMIN duoc phep quan ly nhom mon)
menuRouter.post('/categories', authenticate, authorize('ADMIN'), MenuController.createCategory);
menuRouter.patch('/categories/reorder', authenticate, authorize('ADMIN'), MenuController.reorderCategories);
menuRouter.patch('/categories/:id', authenticate, authorize('ADMIN'), MenuController.updateCategory);
menuRouter.delete('/categories/:id', authenticate, authorize('ADMIN'), MenuController.deleteCategory);

// POST /api/menu (Chi ADMIN duoc phep them mon moi)
menuRouter.post('/', authenticate, authorize('ADMIN'), MenuController.createMenuItem);

// POST /api/menu/upload-image (Chi ADMIN duoc phep tai anh mon tu may len)
menuRouter.post('/upload-image', authenticate, authorize('ADMIN'), MenuController.uploadImage);

// PATCH /api/menu/:id (Chi ADMIN duoc phep cap nhat thong tin mon)
menuRouter.patch('/:id', authenticate, authorize('ADMIN'), MenuController.updateMenuItem);

// PATCH /api/menu/:id/sold-out (Chi KITCHEN va ADMIN duoc phep bao het mon)
menuRouter.patch('/:id/sold-out', authenticate, authorize('KITCHEN', 'ADMIN'), MenuController.updateSoldOut);
